import { attendanceRouter } from "./routers/attendance";
import { calendarRouter } from "./routers/calendar";
import { classworkRouter } from "./routers/classwork";
import { filesRouter } from "./routers/files";
import { homeRouter } from "./routers/home";
import { noticesRouter } from "./routers/notices";
import { notificationsRouter } from "./routers/notifications";
import { peopleRouter } from "./routers/people";
import { platformRouter } from "./routers/platform";
import { schoolRouter } from "./routers/school";
import { sessionRouter } from "./routers/session";
import { setupRouter } from "./routers/setup";
import { timetableRouter } from "./routers/timetable";
import { createCallerFactory, router } from "./trpc";

export const appRouter = router({
  session: sessionRouter,
  attendance: attendanceRouter,
  calendar: calendarRouter,
  classwork: classworkRouter,
  files: filesRouter,
  home: homeRouter,
  notices: noticesRouter,
  notifications: notificationsRouter,
  people: peopleRouter,
  platform: platformRouter,
  school: schoolRouter,
  setup: setupRouter,
  timetable: timetableRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
