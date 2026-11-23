/**
 * Why a reader reports someone. The ids must match REPORT_REASONS in the
 * site's src/lib/moderation/reportRules.ts and the reader_reports check
 * constraint; the labels are the app's own.
 */
export const REPORT_REASONS = [
  { id: "abuse", label: "Abusive or hateful" },
  { id: "harassment", label: "Harassment" },
  { id: "spam", label: "Spam or scam" },
  { id: "other", label: "Something else" },
] as const;

export type ReportReasonId = (typeof REPORT_REASONS)[number]["id"];

/** Longest "anything to add" the server keeps. */
export const MAX_REPORT_DETAILS = 1000;

/** What is being reported. The server looks up the evidence itself. */
export type ReportTarget =
  | { kind: "message"; messageId: string; roomSlug: string }
  | { kind: "person"; clerkId: string; roomSlug: string }
  | { kind: "profile"; username: string };

/** The request body for POST /api/reader/report. */
export function reportBody(
  target: ReportTarget,
  reason: ReportReasonId,
  details: string,
): Record<string, string> {
  const base = { reason, details: details.trim() };
  switch (target.kind) {
    case "message":
      return { ...base, messageId: target.messageId, roomSlug: target.roomSlug };
    case "person":
      return { ...base, reportedClerkId: target.clerkId, roomSlug: target.roomSlug };
    case "profile":
      return { ...base, reportedUsername: target.username };
  }
}
