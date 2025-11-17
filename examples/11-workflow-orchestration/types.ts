// examples/11-workflow-orchestration/types.ts
// Domain types for GitHub PR workflow

/**
 * Pull Request input for opening a new PR
 */
export type OpenPRInput = {
  title: string;
  description: string;
  branch: string;
};

/**
 * Pull Request output after opening
 */
export type OpenPROutput = {
  prId: string;
  status: "open";
  title: string;
  description: string;
  branch: string;
  checksRequired: number;
};

/**
 * Pull Request review input
 */
export type ReviewPRInput = {
  prId: string;
  status: "open";
  approvals: number;
  checksRequired: number;
};

/**
 * Pull Request review output
 */
export type ReviewPROutput = {
  prId: string;
  status: "approved" | "rejected";
  approvals: number;
  allChecksPassed: boolean;
};

/**
 * Pull Request merge input
 */
export type MergePRInput = {
  prId: string;
  status: "approved";
  approvals: number;
  allChecksPassed: true;
};

/**
 * Pull Request merge output
 */
export type MergePROutput = {
  prId: string;
  status: "merged";
  mergedAt: number;
  commitSha: string;
};

/**
 * Workflow error for PR processing
 */
export type PRWorkflowError =
  | { type: "insufficient_approvals"; required: number; actual: number }
  | { type: "checks_failed"; failedChecks: string[] }
  | { type: "already_merged"; prId: string };

/**
 * PR state machine states
 */
export type PRState =
  | { type: "open"; prId: string; approvals: number }
  | { type: "reviewing"; prId: string; approvals: number; checksRequired: number }
  | { type: "approved"; prId: string; approvals: number; checksPassedAt: number }
  | { type: "merged"; prId: string; mergedAt: number; commitSha: string }
  | { type: "closed"; prId: string; reason: string };
