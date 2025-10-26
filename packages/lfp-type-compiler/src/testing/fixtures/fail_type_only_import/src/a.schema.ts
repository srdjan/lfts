// KNOWN LIMITATION: This test currently fails to trigger LFP1013
// The type-only-imports rule's isInTypePosition() helper doesn't correctly identify
// all type-position usages. See KNOWN_ISSUES.md for details
import { typeOf } from "../../../../packages/lfp-type-runtime/mod.ts";
import { A } from "./types.ts"; // A used only in type position - should be 'import type { A }' but LFP1013 doesn't catch it
export type U = A;
export const U$ = typeOf<U>();
