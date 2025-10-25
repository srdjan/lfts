// deno_example/src/main.ts
import { validate, serialize } from "../../packages/lfp-type-runtime/mod.ts";
import { User$ } from "./types.ts";

const u = { id: "u_1" as any, name: "Ada" };
console.log("validate", validate(User$, u));
console.log("serialize", serialize(User$, u));
