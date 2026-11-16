import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordPlatformAudit, recordSchoolAudit } from "./audit";
import { createDb } from "./client";
import { auditEvents, memberships, schools } from "./schema";
import { withSchool } from "./tenant";

/**
 * Tenant isolation against a real database (CONSTITUTION §2.2, §13). Runs on the Neon `test`
 * branch only; skipped when DATABASE_URL is not set.
 */
const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;

/** Drizzle wraps database errors; the Postgres message is on `cause`. */
async function failureOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const cause = (error as { cause?: { message?: string } }).cause;
    return `${(error as Error).message} ${cause?.message ?? ""}`;
  }
  return "";
}

const userA = "00000000-0000-7000-8000-00000000000a";
const userB = "00000000-0000-7000-8000-00000000000b";

run("tenant isolation (Postgres row-level security)", () => {
  const db = createDb(url ?? "postgres://unused");
  let schoolA = "";
  let schoolB = "";
  const tag = `isolation-test-${Date.now()}`;

  beforeAll(async () => {
    const [a, b] = await db
      .insert(schools)
      .values([{ name: `${tag}-A` }, { name: `${tag}-B` }])
      .returning({ id: schools.id });
    schoolA = a?.id ?? "";
    schoolB = b?.id ?? "";
    await db.insert(memberships).values([
      { userId: userA, schoolId: schoolA, roles: ["teacher"] },
      { userId: userB, schoolId: schoolB, roles: ["principal"] },
    ]);
  });

  afterAll(async () => {
    // Audit rows are append-only and stay.
    await db.delete(memberships).where(sql`${memberships.schoolId} in (${schoolA}, ${schoolB})`);
    // Schools that have audit events cannot be deleted (the log is append-only), so retire them.
    await db
      .update(schools)
      .set({ status: "deleted", deletedAt: new Date() })
      .where(sql`${schools.id} in (${schoolA}, ${schoolB})`);
  });

  it("a school sees only its own memberships", async () => {
    const rows = await withSchool(db, schoolA, (s) => s.tx.select().from(memberships));
    expect(rows.map((r) => r.userId)).toEqual([userA]);
  });

  it("filtering by another school's id still returns nothing", async () => {
    const rows = await withSchool(db, schoolA, (s) =>
      s.tx.select().from(memberships).where(sql`${memberships.schoolId} = ${schoolB}`),
    );
    expect(rows).toEqual([]);
  });

  it("a school sees only its own school row", async () => {
    const rows = await withSchool(db, schoolA, (s) => s.tx.select().from(schools));
    expect(rows.map((r) => r.id)).toEqual([schoolA]);
  });

  it("cannot insert a row for another school", async () => {
    await expect(
      withSchool(db, schoolA, (s) =>
        s.tx.insert(memberships).values({ userId: userB, schoolId: schoolB, roles: ["student"] }),
      ),
    ).rejects.toThrow();
  });

  it("cannot update or delete another school's rows", async () => {
    const updated = await withSchool(db, schoolA, (s) =>
      s.tx
        .update(memberships)
        .set({ roles: ["school_admin"] })
        .where(sql`${memberships.schoolId} = ${schoolB}`)
        .returning({ id: memberships.id }),
    );
    expect(updated).toEqual([]);
    const deleted = await withSchool(db, schoolA, (s) =>
      s.tx
        .delete(memberships)
        .where(sql`${memberships.schoolId} = ${schoolB}`)
        .returning({ id: memberships.id }),
    );
    expect(deleted).toEqual([]);
    const stillThere = await withSchool(db, schoolB, (s) => s.tx.select().from(memberships));
    expect(stillThere.map((r) => r.roles)).toEqual([["principal"]]);
  });

  it("school-scoped work cannot read platform users", async () => {
    await expect(
      withSchool(db, schoolA, (s) => s.tx.execute(sql`select * from platform_users`)),
    ).rejects.toThrow();
  });

  it("does not leak the school setting to the next transaction", async () => {
    await withSchool(db, schoolA, async () => undefined);
    const [row] = (await db.execute(sql`select current_setting('app.school_id', true) as v`)).rows;
    expect(row?.v ?? "").toBe("");
    const [role] = (await db.execute(sql`select current_user as u`)).rows;
    expect(role?.u).not.toBe("erp_app");
  });

  it("rejects an invalid school id before touching the database", async () => {
    await expect(withSchool(db, "not-a-uuid", async () => 1)).rejects.toThrow("valid school id");
    await expect(
      withSchool(db, `${schoolA}'; drop table schools; --`, async () => 1),
    ).rejects.toThrow("valid school id");
  });

  describe("audit log", () => {
    it("records school events and shows each school only its own", async () => {
      await withSchool(db, schoolA, (s) =>
        recordSchoolAudit(s, { actorUserId: userA, action: `${tag}.a_event` }),
      );
      await withSchool(db, schoolB, (s) =>
        recordSchoolAudit(s, { actorUserId: userB, action: `${tag}.b_event` }),
      );
      const seenByA = await withSchool(db, schoolA, (s) => s.tx.select().from(auditEvents));
      expect(seenByA.every((e) => e.schoolId === schoolA)).toBe(true);
      expect(seenByA.map((e) => e.action)).toContain(`${tag}.a_event`);
      expect(seenByA.map((e) => e.action)).not.toContain(`${tag}.b_event`);
    });

    it("cannot write an audit event for another school", async () => {
      await expect(
        withSchool(db, schoolA, (s) =>
          s.tx.insert(auditEvents).values({ schoolId: schoolB, action: `${tag}.forged` }),
        ),
      ).rejects.toThrow();
    });

    it("cannot be updated or deleted, even as the owner", async () => {
      await recordPlatformAudit(db, { actorUserId: userA, action: `${tag}.platform_event` });
      const like = `${tag}%`;
      expect(
        await failureOf(
          db.execute(sql`update audit_events set action = 'changed' where action like ${like}`),
        ),
      ).toMatch(/append-only/);
      expect(
        await failureOf(db.execute(sql`delete from audit_events where action like ${like}`)),
      ).toMatch(/append-only/);
      expect(await failureOf(db.execute(sql`truncate audit_events`))).toMatch(/append-only/);
    });

    it("school-scoped work cannot update or delete audit events", async () => {
      await expect(
        withSchool(db, schoolA, (s) => s.tx.execute(sql`delete from audit_events`)),
      ).rejects.toThrow();
    });
  });
});
