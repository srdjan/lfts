// examples/07-async-result/src/types.ts

export type User = {
  readonly id: string;
  readonly email: string;
};

export type NetworkError = {
  readonly type: "network";
  readonly message: string;
};

export type ParseError = {
  readonly type: "parse";
  readonly message: string;
};

export type LoadUserResult =
  | { readonly ok: true; readonly value: User }
  | { readonly ok: false; readonly error: NetworkError | ParseError };
