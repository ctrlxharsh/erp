import { filesRouter } from "./routers/files";
import { homeRouter } from "./routers/home";
import { peopleRouter } from "./routers/people";
import { platformRouter } from "./routers/platform";
import { schoolRouter } from "./routers/school";
import { sessionRouter } from "./routers/session";
import { setupRouter } from "./routers/setup";
import { createCallerFactory, router } from "./trpc";

export const appRouter = router({
  session: sessionRouter,
  files: filesRouter,
  home: homeRouter,
  people: peopleRouter,
  platform: platformRouter,
  school: schoolRouter,
  setup: setupRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
