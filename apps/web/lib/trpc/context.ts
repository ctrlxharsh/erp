import "server-only";
import { type Context, createAccessStore, createNeonStorage } from "@erp/api";
import { cookies } from "next/headers";
import { createAuthAdmin } from "@/lib/auth/admin";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { createEmailSender } from "@/lib/email";

let storage: ReturnType<typeof createNeonStorage> | undefined;
function getStorage() {
  storage ??= createNeonStorage("uploads");
  return storage;
}

export const ACTIVE_SCHOOL_COOKIE = "erp_school";

/** Builds the API context for a request: the signed-in user (if any) and the chosen school. */
export async function createContext(): Promise<Context> {
  const [{ data: session }, cookieStore] = await Promise.all([auth.getSession(), cookies()]);
  const user = session?.user
    ? { id: session.user.id, email: session.user.email, name: session.user.name }
    : null;
  return {
    db: getDb(),
    storage: getStorage(),
    authAdmin: createAuthAdmin(),
    email: createEmailSender(),
    store: createAccessStore(getDb()),
    user,
    activeSchoolId: cookieStore.get(ACTIVE_SCHOOL_COOKIE)?.value ?? null,
  };
}
