import "server-only";
import { createCaller } from "@erp/api";
import { createContext } from "./context";

/** Calls the API directly from Server Components (no HTTP hop). Permission checks still run. */
export async function getServerApi() {
  return createCaller(await createContext());
}
