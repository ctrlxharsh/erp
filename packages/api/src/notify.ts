import { type Database, type SchoolScope, schema } from "@erp/db";
import { sql } from "drizzle-orm";
import type { EmailSender } from "./email";

export interface NotificationInput {
  userId: string;
  /** Dotted event name such as `attendance.absent`. */
  kind: string;
  title: string;
  body?: string;
  link?: string;
  /** Also email this person (if they have an address). */
  email?: boolean;
}

/** Saves in-app notifications inside the caller's transaction, so they commit with the change. */
export async function saveNotifications(scope: SchoolScope, inputs: readonly NotificationInput[]) {
  if (inputs.length === 0) return;
  for (let i = 0; i < inputs.length; i += 500) {
    await scope.tx.insert(schema.notifications).values(
      inputs.slice(i, i + 500).map((n) => ({
        schoolId: scope.schoolId,
        userId: n.userId,
        kind: n.kind,
        title: n.title,
        body: n.body ?? null,
        link: n.link ?? null,
      })),
    );
  }
}

/**
 * Emails the people marked `email`, after the transaction has committed. Failures are logged by
 * count only (never addresses or content) and never fail the request: the in-app notification
 * is already saved (CONSTITUTION §10).
 */
export async function sendNotificationEmails(
  db: Database,
  sender: EmailSender,
  inputs: readonly NotificationInput[],
) {
  const wanted = inputs.filter((n) => n.email);
  if (wanted.length === 0) return { sent: 0, failed: 0 };
  const ids = [...new Set(wanted.map((n) => n.userId))];
  const rows = await db.execute(
    sql`select id, email from neon_auth."user" where id in (${sql.join(
      ids.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})`,
  );
  const emailOf = new Map(
    (rows.rows as { id: string; email: string }[]).map((r) => [r.id, r.email]),
  );
  let sent = 0;
  let failed = 0;
  for (const n of wanted) {
    const to = emailOf.get(n.userId);
    if (!to) continue;
    try {
      await sender.send({
        to,
        subject: n.title,
        text: [n.body, n.link ? `Open: ${n.link}` : null].filter(Boolean).join("\n\n"),
      });
      sent++;
    } catch {
      failed++;
    }
  }
  if (failed > 0) console.warn(`[notify] ${failed} email(s) could not be sent`);
  return { sent, failed };
}
