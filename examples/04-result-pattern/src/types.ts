// examples/04-result-pattern/src/types.ts
// Result-style return values without generics, compatible with the current encoder.

export type Credentials = {
  readonly email: string;
  readonly password: string;
};

export type AuthSuccess = {
  readonly token: string;
};

export type AuthError =
  | { readonly type: "invalid_credentials"; readonly message: string }
  | { readonly type: "locked"; readonly message: string };

export type AuthResult =
  | { readonly ok: true; readonly value: AuthSuccess }
  | { readonly ok: false; readonly error: AuthError };
