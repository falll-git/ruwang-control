import { reviewLabels } from "./review-ui.ts";

// Decision stored in Control, separate from bank application and public visibility.
// Keep this precedence in sync with reviewStatusSql (integration tested).
export function reviewDecisionBadge(review: {
  state: string;
  commandDecision: "approve" | "request_revision" | "reject" | null;
}): { label: string; tone: "pending" | "success" | "danger" | "neutral" } {
  const state = review.state === "SUPERSEDED" ? "SUPERSEDED" :
    review.commandDecision === "approve" ? "APPROVED" :
    review.commandDecision === "request_revision" ? "REVISION_REQUIRED" :
    review.commandDecision === "reject" ? "REJECTED" : review.state;
  return { label: reviewLabels[state] ?? "Status belum dikenali",
    tone: state === "APPROVED" ? "success" : state === "REJECTED" ? "danger" : state === "SUPERSEDED" ? "neutral" : "pending" };
}
