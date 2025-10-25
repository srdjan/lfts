import { typeOf } from "../../../packages/lfp-type-runtime/mod.ts";

/** ADT of CLI commands (strict 'type' discriminant) */
export type Add = Readonly<{ type: "add"; name: string }>;
export type List = Readonly<{ type: "list" }>;
export type Complete = Readonly<{ type: "complete"; id: string & { readonly __brand: "TaskId" } }>;
export type Help = Readonly<{ type: "help" }>;

export type Command = Add | List | Complete | Help;

export const Command$ = typeOf<Command>();
