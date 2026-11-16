import { defaultLocale, messages } from "@erp/i18n";
import { getRequestConfig } from "next-intl/server";

// English only for now. Adding a language means adding a catalog in packages/i18n and resolving
// the locale here (user preference or school setting).
export default getRequestConfig(async () => ({
  locale: defaultLocale,
  messages: messages[defaultLocale],
  timeZone: "Asia/Kolkata",
}));
