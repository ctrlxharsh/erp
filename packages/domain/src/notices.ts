/** Notice workflow (ADR-013): Draft → Pending approval → Published / Rejected. */

export const noticeStatuses = ["draft", "pending_approval", "published", "rejected"] as const;
export type NoticeStatus = (typeof noticeStatuses)[number];
export const noticeAudiences = ["all", "teachers", "students_parents"] as const;
export type NoticeAudience = (typeof noticeAudiences)[number];

export type NoticeAction = "submit" | "approve" | "reject" | "edit" | "delete";

/**
 * What can be done to a notice in a given state, and what state follows.
 * `submit` by someone who may publish (the Principal) or in a school that does not require approval
 * publishes at once; otherwise it waits for the Principal.
 */
export function nextNoticeStatus(
  from: NoticeStatus,
  action: NoticeAction,
  options: { canPublish: boolean; approvalRequired: boolean },
): NoticeStatus | "deleted" | null {
  switch (action) {
    case "submit":
      if (from !== "draft" && from !== "rejected") return null;
      return options.canPublish || !options.approvalRequired ? "published" : "pending_approval";
    case "approve":
      return from === "pending_approval" && options.canPublish ? "published" : null;
    case "reject":
      return from === "pending_approval" && options.canPublish ? "rejected" : null;
    case "edit":
      return from === "draft" || from === "rejected" ? from : null;
    case "delete":
      return from === "draft" || from === "rejected" ? "deleted" : null;
  }
}

/** The reference number shown on a published notice, such as `NOT/2026-27/0007`. */
export function noticeRef(sessionName: string | null, number: number): string {
  return `NOT/${sessionName ?? "—"}/${String(number).padStart(4, "0")}`;
}
