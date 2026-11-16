import "server-only";
import type { AuthAdmin } from "@erp/api";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

/**
 * Account administration on Neon Auth. Creating accounts uses the Neon management API, so it
 * needs NEON_API_KEY and NEON_PROJECT_ID (see .env.example). Sign-up is switched off on the
 * branch, so this is the only way new accounts appear.
 */
export function createAuthAdmin(): AuthAdmin {
  return {
    async findUserIdByEmail(email) {
      const result = await getDb().execute(
        sql`select id from neon_auth."user" where lower(email) = ${email.toLowerCase()} limit 1`,
      );
      const row = result.rows[0] as { id?: string } | undefined;
      return row?.id ?? null;
    },

    async createUser({ email, name }) {
      const response = await fetch(
        `https://console.neon.tech/api/v2/projects/${env("NEON_PROJECT_ID")}/branches/${env("NEON_BRANCH_ID")}/auth/users`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${env("NEON_API_KEY")}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ email, name }),
        },
      );
      if (!response.ok) throw new Error(`Could not create the account (${response.status})`);
      const body = (await response.json()) as { id: string };
      return { id: body.id };
    },

    async sendPasswordSetupEmail(email) {
      const appUrl = process.env.APP_URL ?? "http://localhost:3000";
      const response = await fetch(`${env("NEON_AUTH_BASE_URL")}/request-password-reset`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: appUrl },
        body: JSON.stringify({ email, redirectTo: `${appUrl}/auth/reset-password` }),
      });
      if (!response.ok) throw new Error(`Could not send the setup email (${response.status})`);
    },
  };
}
