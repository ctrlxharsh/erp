import { describe, expect, it } from "vitest";
import { nextNoticeStatus, noticeRef } from "./notices";

const principal = { canPublish: true, approvalRequired: true };
const admin = { canPublish: false, approvalRequired: true };
const adminNoApproval = { canPublish: false, approvalRequired: false };

describe("nextNoticeStatus", () => {
  it("the Principal's notices publish immediately", () => {
    expect(nextNoticeStatus("draft", "submit", principal)).toBe("published");
  });

  it("the School Admin's notices wait for approval when the school requires it", () => {
    expect(nextNoticeStatus("draft", "submit", admin)).toBe("pending_approval");
    expect(nextNoticeStatus("rejected", "submit", admin)).toBe("pending_approval");
  });

  it("publish at once when the school switched approval off", () => {
    expect(nextNoticeStatus("draft", "submit", adminNoApproval)).toBe("published");
  });

  it("only someone who may publish can approve or reject, and only pending notices", () => {
    expect(nextNoticeStatus("pending_approval", "approve", principal)).toBe("published");
    expect(nextNoticeStatus("pending_approval", "reject", principal)).toBe("rejected");
    expect(nextNoticeStatus("pending_approval", "approve", admin)).toBeNull();
    expect(nextNoticeStatus("draft", "approve", principal)).toBeNull();
    expect(nextNoticeStatus("published", "reject", principal)).toBeNull();
  });

  it("published and pending notices cannot be edited or deleted", () => {
    for (const status of ["published", "pending_approval"] as const) {
      expect(nextNoticeStatus(status, "edit", principal)).toBeNull();
      expect(nextNoticeStatus(status, "delete", principal)).toBeNull();
    }
    expect(nextNoticeStatus("draft", "edit", admin)).toBe("draft");
    expect(nextNoticeStatus("rejected", "delete", admin)).toBe("deleted");
  });

  it("a published notice cannot be submitted again", () => {
    expect(nextNoticeStatus("published", "submit", principal)).toBeNull();
  });
});

describe("noticeRef", () => {
  it("pads the number", () => {
    expect(noticeRef("2026-27", 7)).toBe("NOT/2026-27/0007");
    expect(noticeRef(null, 12)).toBe("NOT/—/0012");
  });
});
