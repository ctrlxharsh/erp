import { describe, expect, it } from "vitest";
import { formatPaise } from "./money";

describe("formatPaise", () => {
  it("uses Indian digit grouping", () => {
    expect(formatPaise(12_500_000)).toBe("₹1,25,000");
  });
  it("shows paise only when present", () => {
    expect(formatPaise(150)).toBe("₹1.50");
    expect(formatPaise(0)).toBe("₹0");
  });
  it("rejects non-integer paise", () => {
    expect(() => formatPaise(10.5)).toThrow(RangeError);
  });
});
