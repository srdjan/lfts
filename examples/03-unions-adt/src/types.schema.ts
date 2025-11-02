// examples/03-unions-adt/src/types.schema.ts
// Schema roots for ADT validation.

import type { Scene, Shape } from "./types.ts";

export type ShapeSchema = Shape;
export type SceneSchema = Scene;
