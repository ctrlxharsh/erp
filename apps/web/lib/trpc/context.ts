import "server-only";
import { type Context, createAccessStore } from "@erp/api";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db";

export const ACTIVE_SCHOOL_COOKIE = "erp_school";

/** Builds the API context for a request: the signed-in user (if any) and the chosen school. */
export async function createContext(): Promise<Context> {
  const [{ data: session }, cookieStore] = await Promise.all([auth.getSession(), cookies()]);
  const user = session?.user
    ? { id: session.user.id, email: session.user.email, name: session.user.name }
    : null;
  return {
    store: createAccessStore(getDb()),
    user,
    activeSchoolId: cookieStore.get(ACTIVE_SCHOOL_COOKIE)?.value ?? null,
  };
}
