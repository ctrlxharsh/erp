import { filesRouter } from "./routers/files";
import { peopleRouter } from "./routers/people";
import { platformRouter } from "./routers/platform";
import { schoolRouter } from "./routers/school";
import { sessionRouter } from "./routers/session";
import { setupRouter } from "./routers/setup";
import { createCallerFactory, router } from "./trpc";

export const appRouter = router({
  session: sessionRouter,
  files: filesRouter,
  people: peopleRouter,
  platform: platformRouter,
  school: schoolRouter,
  setup: setupRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
