import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export * from "./attendance";
export * from "./classwork";
export * from "./daily";
export * from "./exams";
export * from "./files";
export * from "./notices";
export * from "./people";
export * from "./platform";
export * from "./session";
export * from "./setup";
export * from "./timetable";
