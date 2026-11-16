import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export * from "./daily";
export * from "./files";
export * from "./people";
export * from "./platform";
export * from "./session";
export * from "./setup";
