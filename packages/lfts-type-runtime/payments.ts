// Optional 402 Payment Protocol helpers for LFTS
// Implements composable primitives (no classes) to handle payment-required HTTP flows.

import type { NetworkError } from "./distributed.ts";
import { withRetry } from "./distributed.ts";
import { AsyncResult, Result } from "./mod.ts";

// -----------------------------------------------------------------------------
// Payment Models and Core Types
// -----------------------------------------------------------------------------

export type PaymentModel = "per-request" | "per-token" | "subscription";

export type PaymentChallenge = {
  readonly model: PaymentModel;
  readonly currency: string;
  readonly amount?: bigint;
  readonly payTo: string;
  readonly resource: string;
  readonly headers: Record<string, string>;
};

export type PaymentRequest = {
  readonly model: PaymentModel;
  readonly currency: string;
  readonly amount?: bigint;
  readonly resource: string;
  readonly payTo?: string;
  readonly proof?: unknown;
  readonly meta?: Record<string, unknown>;
};

export type PaymentReceipt = {
  readonly model: PaymentModel;
  readonly resource: string;
  readonly currency: string;
  readonly amount: bigint;
  readonly paidAt: number;
  readonly expiresAt?: number;
  readonly providerRef?: string;
};

export type PaymentError =
  | { readonly type: "payment_required"; readonly challenge: PaymentChallenge }
  | { readonly type: "insufficient_funds"; readonly needed: bigint; readonly balance?: bigint }
  | { readonly type: "invalid_proof"; readonly reason?: string }
  | { readonly type: "verification_failed"; readonly reason?: string }
  | { readonly type: "provider_unavailable"; readonly retryInMs?: number }
  | { readonly type: "network_error"; readonly error: NetworkError }
  | { readonly type: "timeout"; readonly ms?: number }
  | { readonly type: "unknown"; readonly message: string };

export type PaymentPort = {
  readonly fulfill: (challenge: PaymentChallenge) => Promise<Result<PaymentRequest, PaymentError>>;
};

export type WalletPort = {
  readonly pay: (
    request: PaymentRequest,
    signal?: AbortSignal,
  ) => Promise<Result<PaymentReceipt, PaymentError>>;
};

export type PaymentVerificationPort = {
  readonly verify: (
    receipt: PaymentReceipt,
    resource: string,
  ) => Promise<Result<PaymentReceipt, PaymentError>>;
};

// -----------------------------------------------------------------------------
// Payment Handler Interface
// -----------------------------------------------------------------------------

export type PaymentHttpRequest = {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body?: unknown;
};

export type PaymentHandlerContext = {
  readonly response: Response;
  readonly retry: () => Promise<Result<Response, NetworkError>>;
  readonly request: PaymentHttpRequest;
};

export type PaymentHandler = {
  readonly onPaymentRequired: (
    ctx: PaymentHandlerContext,
  ) => Promise<Result<Response, PaymentError | NetworkError>>;
};

// -----------------------------------------------------------------------------
// Challenge Parsing Helpers
// -----------------------------------------------------------------------------

const KV_PAIR = /([\w-]+)\s*=\s*"?([^",]+)"?/;

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => { record[key.toLowerCase()] = value; });
  return record;
}

function parseAmount(raw: string | undefined): bigint | undefined {
  if (!raw) return undefined;
  const normalized = raw.replace(/[_\s]/g, "");
  if (!/^-?\d+$/.test(normalized)) return undefined;
  try {
    return BigInt(normalized);
  } catch {
    return undefined;
  }
}

function parseKeyValueHeader(header: string): Record<string, string> {
  return header
    .split(",")
    .map((part) => part.trim())
    .reduce<Record<string, string>>((acc, part) => {
      const match = part.match(KV_PAIR);
      if (match) {
        acc[match[1].toLowerCase()] = match[2];
      }
      return acc;
    }, {});
}

export function parsePaymentChallenge(
  response: Response,
  request: PaymentHttpRequest,
): Result<PaymentChallenge, PaymentError> {
  const header =
    response.headers.get("payment-required")
    ?? response.headers.get("www-authenticate")
    ?? response.headers.get("x-402-payment-required");

  if (!header) {
    return Result.err({
      type: "unknown",
      message: "402 response missing Payment-Required/WWW-Authenticate header",
    });
  }

  const kv = parseKeyValueHeader(header);
  const model = (kv.model ?? kv.type ?? "per-request") as PaymentModel;
  const currency = kv.currency ?? "UNKNOWN";
  const amount = parseAmount(kv.amount ?? kv.price);
  const payTo = kv.payto ?? kv.pay_to ?? kv.invoice ?? kv.url ?? "";
  const resource = kv.resource ?? request.url;

  const challenge: PaymentChallenge = {
    model,
    currency,
    amount,
    payTo,
    resource,
    headers: headersToRecord(response.headers),
  };

  return payTo
    ? Result.ok(challenge)
    : Result.err({ type: "payment_required", challenge });
}

// -----------------------------------------------------------------------------
// Default Payment Handler Orchestration
// -----------------------------------------------------------------------------

export type PaymentHandlerOptions = {
  readonly maxAttempts?: number; // includes initial attempt
  readonly backoffMs?: number;
};

export function createPaymentHandler(
  ports: {
    readonly payment: PaymentPort;
    readonly wallet: WalletPort;
    readonly verify?: PaymentVerificationPort;
  },
  options: PaymentHandlerOptions = {},
): PaymentHandler {
  const {
    maxAttempts = 1,
    backoffMs = 200,
  } = options;

  const shouldRetry = (error: PaymentError | NetworkError) => {
    if ("type" in error && typeof error.type === "string") {
      return error.type === "provider_unavailable" || error.type === "network_error";
    }
    return false;
  };

  return {
    onPaymentRequired: async (ctx) => {
      const flow = async (): Promise<Result<Response, PaymentError | NetworkError>> => {
        const parsed = parsePaymentChallenge(ctx.response, ctx.request);
        if (!parsed.ok) {
          return parsed;
        }

        const challenge = parsed.value;

        const paymentReq = await ports.payment.fulfill(challenge);
        if (!paymentReq.ok) return paymentReq;

        const receipt = await ports.wallet.pay(paymentReq.value);
        if (!receipt.ok) return receipt;

        if (ports.verify) {
          const verified = await ports.verify.verify(receipt.value, challenge.resource);
          if (!verified.ok) return verified;
        }

        const retried = await ctx.retry();
        if (!retried.ok) {
          return Result.err<never, PaymentError | NetworkError>({
            type: "network_error",
            error: retried.error,
          });
        }

        if (retried.value.status === 402) {
          return Result.err({
            type: "payment_required",
            challenge,
          });
        }

        return Result.ok(retried.value);
      };

      if (maxAttempts <= 1) {
        return flow();
      }

      return withRetry(flow, {
        maxAttempts,
        initialDelayMs: backoffMs,
        shouldRetry,
      });
    },
  };
}

// -----------------------------------------------------------------------------
// Streaming Meter Helper (per-token / chunk)
// -----------------------------------------------------------------------------

export type MeterOptions = {
  readonly batchBytes?: number;
};

export function meterResponseBody(
  response: Response,
  onBatch: (bytes: number) => Promise<Result<void, PaymentError>>,
  options: MeterOptions = {},
): Result<Response, PaymentError> {
  const batchBytes = options.batchBytes ?? 1024;
  if (!response.body) {
    return Result.ok(response);
  }

  const reader = response.body.getReader();
  let buffered = 0;

  const metered = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        if (buffered > 0) {
          const paid = await onBatch(buffered);
          if (!paid.ok) {
            controller.error(new Error("payment_failed"));
            return;
          }
        }
        controller.close();
        return;
      }

      const chunk = value ?? new Uint8Array();
      buffered += chunk.byteLength;
      if (buffered >= batchBytes) {
        const paid = await onBatch(buffered);
        if (!paid.ok) {
          controller.error(new Error("payment_failed"));
          return;
        }
        buffered = 0;
      }

      controller.enqueue(chunk);
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });

  const clonedHeaders = new Headers(response.headers);
  return Result.ok(
    new Response(metered, {
      status: response.status,
      statusText: response.statusText,
      headers: clonedHeaders,
    }),
  );
}

// -----------------------------------------------------------------------------
// Type Guards
// -----------------------------------------------------------------------------

export function isPaymentError(value: unknown): value is PaymentError {
  return Boolean(
    value &&
    typeof value === "object" &&
    "type" in (value as Record<string, unknown>) &&
    typeof (value as Record<string, unknown>).type === "string",
  );
}

