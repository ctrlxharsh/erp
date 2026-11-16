import { healthResponseSchema } from "@erp/contracts";

export function GET() {
  return Response.json(healthResponseSchema.parse({ status: "ok" }));
}
