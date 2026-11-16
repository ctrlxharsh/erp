import { schoolRouter } from "./routers/school";
import { sessionRouter } from "./routers/session";
import { createCallerFactory, router } from "./trpc";

export const appRouter = router({
  session: sessionRouter,
  school: schoolRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
