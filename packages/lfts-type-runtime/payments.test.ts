// packages/lfts-type-runtime/payments.test.ts

import { assertEquals, assertMatch } from "jsr:@std/assert";
import { httpGet, type NetworkError } from "./distributed.ts";
import {
  createPaymentHandler,
  meterResponseBody,
  parsePaymentChallenge,
  type PaymentError,
  type PaymentPort,
  type PaymentReceipt,
  type PaymentRequest,
  type PaymentVerificationPort,
  type WalletPort,
} from "./payments.ts";
import { Result } from "./mod.ts";
import { enc } from "../lfts-type-spec/src/mod.ts";

function startMockServer(
  port: number,
  handler: (req: Request) => Response | Promise<Response>,
) {
  const server = Deno.serve({ port, hostname: "localhost" }, handler);
  return server;
}

const OkSchema = enc.obj([{ name: "ok", type: enc.bool() }]);

Deno.test("parsePaymentChallenge extracts 402 headers", async () => {
  const response = new Response("payment needed", {
    status: 402,
    headers: {
      "Payment-Required":
        "model=\"per-request\", currency=\"SAT\", amount=\"25\", payto=\"lnurlp:abc123\", resource=\"/secure\"",
    },
  });

  const challenge = parsePaymentChallenge(response, {
    url: "http://localhost/secure",
    method: "GET",
    headers: {},
  });

  assertEquals(challenge.ok, true);
  if (challenge.ok) {
    assertEquals(challenge.value.model, "per-request");
    assertEquals(challenge.value.currency, "SAT");
    assertEquals(challenge.value.amount, 25n);
    assertEquals(challenge.value.payTo.startsWith("lnurlp:"), true);
    assertEquals(challenge.value.resource, "/secure");
  }
});

Deno.test("httpGet pays on 402 then retries", async () => {
  let paid = false;
  let hits = 0;

  const server = startMockServer(8101, () => {
    hits++;
    if (!paid) {
      return new Response("pay me", {
        status: 402,
        headers: {
          "Payment-Required":
            "model=\"per-request\", currency=\"SAT\", amount=\"10\", payto=\"ln:invoice123\", resource=\"/protected\"",
        },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  const paymentPort: PaymentPort = {
    fulfill: async (challenge) =>
      Promise.resolve(Result.ok<PaymentRequest, PaymentError>({
        model: challenge.model,
        currency: challenge.currency,
        amount: challenge.amount,
        resource: challenge.resource,
        payTo: challenge.payTo,
      })),
  };

  const walletPort: WalletPort = {
    pay: async (request) => {
      paid = true;
      const receipt: PaymentReceipt = {
        model: request.model,
        resource: request.resource,
        currency: request.currency,
        amount: request.amount ?? 0n,
        paidAt: Date.now(),
      };
      return Promise.resolve(Result.ok(receipt));
    },
  };

  const handler = createPaymentHandler({ payment: paymentPort, wallet: walletPort });

  try {
    const result = await httpGet<{ ok: boolean }>(
      "http://localhost:8101/protected",
      OkSchema,
      { paymentHandler: handler },
    );

    assertEquals(result.ok, true);
    if (result.ok) {
      assertEquals(result.value.ok, true);
    }
    assertEquals(hits, 2); // one for 402, one after payment
  } finally {
    await server.shutdown();
  }
});

Deno.test("httpGet surfaces payment failure", async () => {
  const server = startMockServer(8102, () =>
    new Response("pay me", {
      status: 402,
      headers: {
        "Payment-Required":
          "model=\"per-request\", currency=\"SAT\", amount=\"5\", payto=\"ln:invoice\"",
      },
    })
  );

  const paymentPort: PaymentPort = {
    fulfill: async (challenge) =>
      Promise.resolve(Result.ok<PaymentRequest, PaymentError>({
        model: challenge.model,
        currency: challenge.currency,
        amount: challenge.amount,
        resource: challenge.resource,
        payTo: challenge.payTo,
      })),
  };

  const walletPort: WalletPort = {
    pay: async () =>
      Promise.resolve(Result.err<PaymentReceipt, PaymentError>({
        type: "insufficient_funds",
        needed: 5n,
      })),
  };

  const verifier: PaymentVerificationPort = {
    verify: async () =>
      Promise.resolve(Result.err<PaymentReceipt, PaymentError>({
        type: "invalid_proof",
        reason: "should not reach verify when wallet fails",
      })),
  };

  const handler = createPaymentHandler({
    payment: paymentPort,
    wallet: walletPort,
    verify: verifier,
  });

  try {
    const result = await httpGet<{ ok: boolean }>(
      "http://localhost:8102/protected",
      OkSchema,
      { paymentHandler: handler },
    );

    assertEquals(result.ok, false);
    if (!result.ok) {
      const err = result.error as PaymentError | NetworkError;
      if ("type" in err) {
        assertEquals(err.type, "insufficient_funds");
      } else {
        throw new Error("expected payment error");
      }
    }
  } finally {
    await server.shutdown();
  }
});

Deno.test("meterResponseBody triggers batched payments", async () => {
  let batches: number[] = [];
  const body = new TextEncoder().encode("abcdefgh"); // 8 bytes
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(body.slice(0, 3)); // 3 bytes
      controller.enqueue(body.slice(3, 8)); // 5 bytes
      controller.close();
    },
  });

  const original = new Response(source);

  const metered = meterResponseBody(
    original,
    async (bytes) => {
      batches.push(bytes);
      return Result.ok<void, PaymentError>(undefined);
    },
    { batchBytes: 4 },
  );

  assertEquals(metered.ok, true);
  if (metered.ok) {
    const text = await metered.value.text();
    assertMatch(text, /abcdefgh/);
    assertEquals(batches, [8]); // aggregated batch (3+5) with threshold 4
  }
});
