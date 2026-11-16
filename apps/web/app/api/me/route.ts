import { auth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** Returns the signed-in user, or 401. Proves server-side session checks work. */
export async function GET() {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, email, name } = session.user;
  return Response.json({ id, email, name });
}
