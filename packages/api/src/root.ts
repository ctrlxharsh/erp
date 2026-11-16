import { filesRouter } from "./routers/files";
import { schoolRouter } from "./routers/school";
import { sessionRouter } from "./routers/session";
import { createCallerFactory, router } from "./trpc";

export const appRouter = router({
  session: sessionRouter,
  files: filesRouter,
  school: schoolRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
