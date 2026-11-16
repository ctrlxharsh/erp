import { filesRouter } from "./routers/files";
import { platformRouter } from "./routers/platform";
import { schoolRouter } from "./routers/school";
import { sessionRouter } from "./routers/session";
import { createCallerFactory, router } from "./trpc";

export const appRouter = router({
  session: sessionRouter,
  files: filesRouter,
  platform: platformRouter,
  school: schoolRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
