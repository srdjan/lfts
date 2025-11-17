// examples/11-workflow-orchestration/schemas.ts
// Runtime schemas for PR workflow validation

import { t, withMetadata } from "../../packages/lfts-type-runtime/mod.ts";

/**
 * Schema for opening a new Pull Request
 */
export const OpenPRInput$ = withMetadata(
  t.object({
    title: t.string().minLength(10),
    description: t.string().minLength(20),
    branch: t.string().pattern("^feature/.*"),
  }).bc,
  {
    name: "OpenPRInput",
    description: "Initial PR creation data",
    stage: "open",
  }
);

/**
 * Schema for opened Pull Request
 */
export const OpenPROutput$ = withMetadata(
  t.object({
    prId: t.string().pattern("^pr_[0-9]+$"),
    status: t.literal("open"),
    title: t.string(),
    description: t.string(),
    branch: t.string(),
    checksRequired: t.number().min(1),
  }).bc,
  {
    name: "OpenPROutput",
    description: "Created PR with initial state",
    stage: "open",
  }
);

/**
 * Schema for PR review input
 */
export const ReviewPRInput$ = withMetadata(
  t.object({
    prId: t.string().pattern("^pr_[0-9]+$"),
    status: t.literal("open"),
    approvals: t.number().min(0),
    checksRequired: t.number(),
  }).bc,
  {
    name: "ReviewPRInput",
    description: "PR data for review process",
    stage: "review",
  }
);

/**
 * Schema for PR review output
 */
export const ReviewPROutput$ = withMetadata(
  t.object({
    prId: t.string(),
    status: t.union(t.literal("approved"), t.literal("rejected")),
    approvals: t.number(),
    allChecksPassed: t.boolean(),
  }).bc,
  {
    name: "ReviewPROutput",
    description: "Review result with approval status",
    stage: "review",
  }
);

/**
 * Schema for PR merge input
 */
export const MergePRInput$ = withMetadata(
  t.object({
    prId: t.string(),
    status: t.literal("approved"),
    approvals: t.number().min(2),
    allChecksPassed: t.literal(true),
  }).bc,
  {
    name: "MergePRInput",
    description: "PR ready for merge",
    stage: "merge",
  }
);

/**
 * Schema for PR merge output
 */
export const MergePROutput$ = withMetadata(
  t.object({
    prId: t.string(),
    status: t.literal("merged"),
    mergedAt: t.number(),
    commitSha: t.string().pattern("^[a-f0-9]{40}$"),
  }).bc,
  {
    name: "MergePROutput",
    description: "Successfully merged PR",
    stage: "merge",
  }
);
