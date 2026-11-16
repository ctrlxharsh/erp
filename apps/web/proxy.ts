import { auth } from "@/lib/auth/server";

// Signed-out visitors are sent to /auth/sign-in. /api/auth and the auth pages are public by
// default; the health check must stay public for uptime monitors and /api/trpc answers signed-out
// callers with a 401 instead of a redirect. Data access is still checked
// inside every API procedure: this redirect is only a convenience.
export default auth.middleware({
  loginUrl: "/auth/sign-in",
  publicRoutes: ["/api/health", "/api/trpc"],
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|logo-.*\\.webp).*)"],
};
