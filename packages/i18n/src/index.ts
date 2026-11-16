import en from "./en.json";

export const defaultLocale = "en" as const;
export const messages = { en } as const;
export type Messages = typeof en;
