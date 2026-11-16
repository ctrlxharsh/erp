import "server-only";
import { createNeonAuth } from "@neon/auth/next/server";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const auth = createNeonAuth({
  baseUrl: required("NEON_AUTH_BASE_URL"),
  cookies: { secret: required("NEON_AUTH_COOKIE_SECRET") },
});
