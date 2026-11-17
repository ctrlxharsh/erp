/** Module colours from the logo (ADR-031). Always pair a tone with a text label, never colour alone. */
export type Tone = "navy" | "teal" | "saffron" | "coral" | "slate";

export const toneClasses: Record<Tone, string> = {
  navy: "bg-tone-navy text-tone-navy-foreground",
  teal: "bg-tone-teal text-tone-teal-foreground",
  saffron: "bg-tone-saffron text-tone-saffron-foreground",
  coral: "bg-tone-coral text-tone-coral-foreground",
  slate: "bg-tone-slate text-tone-slate-foreground",
};

/** Solid fill for bars and charts, one per tone. */
export const toneFill: Record<Tone, string> = {
  navy: "bg-primary",
  teal: "bg-brand-teal",
  saffron: "bg-brand-saffron",
  coral: "bg-brand-coral",
  slate: "bg-muted-foreground",
};
