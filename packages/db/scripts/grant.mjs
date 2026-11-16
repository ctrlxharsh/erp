// Bootstrap tool: give an existing Neon Auth user a platform role or a school membership.
//   pnpm db:grant <email> platform super_admin|platform_support
//   pnpm db:grant <email> school "<School name>" role[,role...]
// Creates the school if no school with that exact name exists. Uses DATABASE_URL (the branch in
// .env.local). Used to create the first Super Admin and to set up demo data on the test branch.
import { Pool } from "@neondatabase/serverless";

const [email, kind, ...rest] = process.argv.slice(2);
const platformRoles = ["super_admin", "platform_support"];
const schoolRoles = ["school_admin", "principal", "teacher", "student", "parent", "staff"];

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!email || !["platform", "school"].includes(kind))
  fail("Usage: see the comment at the top of this file.");
const url = process.env.DATABASE_URL;
if (!url) fail("DATABASE_URL is not set.");

const pool = new Pool({ connectionString: url });
try {
  const { rows } = await pool.query('select id from neon_auth."user" where email = $1', [email]);
  const userId = rows[0]?.id;
  if (!userId) fail(`No user with email ${email}. They must sign up first.`);

  if (kind === "platform") {
    const role = rest[0];
    if (!platformRoles.includes(role)) fail(`Role must be one of: ${platformRoles.join(", ")}`);
    await pool.query(
      "insert into platform_users (user_id, role) values ($1, $2) on conflict (user_id) do update set role = excluded.role",
      [userId, role],
    );
    console.log(`${email} is now ${role}`);
  } else {
    const [schoolName, roleList] = rest;
    const roles = (roleList ?? "").split(",").filter(Boolean);
    if (!schoolName || roles.length === 0 || roles.some((r) => !schoolRoles.includes(r))) {
      fail(`Give a school name and roles from: ${schoolRoles.join(", ")}`);
    }
    let school = (
      await pool.query("select id from schools where name = $1 and deleted_at is null limit 1", [
        schoolName,
      ])
    ).rows[0];
    if (!school)
      school = (
        await pool.query("insert into schools (name) values ($1) returning id", [schoolName])
      ).rows[0];
    await pool.query(
      `insert into memberships (user_id, school_id, roles) values ($1, $2, $3::school_role[])
       on conflict (user_id, school_id) do update set roles = excluded.roles, status = 'active'`,
      [userId, school.id, roles],
    );
    console.log(`${email} is now ${roles.join(", ")} at "${schoolName}"`);
  }
} finally {
  await pool.end();
}
