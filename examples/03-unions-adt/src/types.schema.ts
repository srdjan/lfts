// examples/03-unions-adt/src/types.schema.ts
// Schema roots for ADT validation.

import { typeOf } from "../../../packages/lfts-type-runtime/mod.ts";
import type { Scene, Shape } from "./types.ts";

export const Shape$ = typeOf<Shape>();
export const Scene$ = typeOf<Scene>();
