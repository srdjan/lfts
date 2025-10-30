import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { asPipe, pipe, PipelineExecutionError, Result } from "./mod.ts";

Deno.test("pipeline composes synchronous stages", async () => {
  const upper = asPipe((s: string) => s.toUpperCase());
  const exclaim = asPipe((s: string, mark = "!") => s + mark);

  const greeting = pipe("hello");
  // @ts-expect-error bitwise pipeline shim
  greeting | upper | exclaim("!!!");

  const value = await greeting.run();
  assertEquals(value, "HELLO!!!");

  const snapshots = greeting.inspect();
  assertEquals(snapshots.length, 2);
  assertEquals(snapshots[0]?.status, "ok");
  assertEquals(snapshots[1]?.status, "ok");
});

Deno.test("pipeline short-circuits on Result.err and exposes snapshots", async () => {
  const identity = asPipe((n: number) => Result.ok(n), {
    expect: "result",
    label: "identity",
  });
  const ensureEven = asPipe(
    (n: number) => n % 2 === 0 ? Result.ok(n) : Result.err("expected even"),
    { expect: "result", label: "ensureEven" },
  );

  const numbers = pipe(Result.ok(3));
  // @ts-expect-error bitwise pipeline shim
  numbers | identity | ensureEven;

  const result = await numbers.runResult();
  assertEquals(result.ok, false);
  assertEquals(result.ok ? undefined : result.error, "expected even");

  const snapshots = numbers.inspect();
  assertEquals(snapshots.length, 2);
  assertEquals(snapshots[0]?.label, "identity");
  assertEquals(snapshots[0]?.status, "ok");
  assertEquals(snapshots[1]?.status, "err");
});

Deno.test("pipeline run throws PipelineExecutionError on Result.err", async () => {
  const fail = asPipe((_input: number) => Result.err("boom"), {
    expect: "result",
    label: "fail",
  });

  const computation = pipe(Result.ok(1));
  // @ts-expect-error bitwise pipeline shim
  computation | fail;

  await assertRejects(
    () => computation.run(),
    PipelineExecutionError,
    "Pipeline produced a Result.err",
  );

  const snapshots = computation.inspect();
  assertEquals(snapshots.length, 1);
  assertEquals(snapshots[0]?.status, "err");
});

Deno.test("pipeline supports nested pipelines from stages", async () => {
  const surround = asPipe((s: string, prefix: string, suffix: string) => {
    const nested = pipe(s);
    // @ts-expect-error bitwise pipeline shim
    nested | asPipe((x: string) => prefix + x + suffix);
    return nested;
  });

  const wrapAsync = asPipe(async (s: string) => {
    await Promise.resolve();
    return s.replace(/\s+/g, "-");
  });

  const phrase = pipe("Light FP");
  // @ts-expect-error bitwise pipeline shim
  phrase | surround("[", "]") | wrapAsync;

  const result = await phrase.run();
  assertEquals(result, "[Light-FP]");
});

Deno.test("pipeline lifts value pipelines into Result mode when a stage expects Result", async () => {
  const ensurePositive = asPipe(
    (n: number) => n > 0 ? Result.ok(n) : Result.err("negative"),
    {
      expect: "result",
      label: "ensurePositive",
    },
  );
  const toStringStage = asPipe((n: number) => Result.ok(String(n)), {
    expect: "result",
    label: "toString",
  });

  const token = pipe(5);
  // @ts-expect-error bitwise pipeline shim
  token | ensurePositive | toStringStage;

  const value = await token.run();
  const coerced = value as unknown as string;
  assertEquals(coerced, "5");

  const result = await token.runResult();
  assertEquals(result.ok, true);
  if (result.ok) {
    const resultValue = result.value as unknown as string;
    assertEquals(resultValue, "5");
  }

  const snapshots = token.inspect();
  assertEquals(snapshots.length, 2);
  assertEquals(snapshots[0]?.mode, "result");
  assertEquals(snapshots[1]?.status, "ok");
});

Deno.test("pipeline propagates thrown errors in value mode", async () => {
  const boom = asPipe((_value: string) => {
    throw new TypeError("invalid value");
  }, { label: "boom" });

  const valuePipeline = pipe("x");
  // @ts-expect-error bitwise pipeline shim
  valuePipeline | boom;

  await assertRejects(
    () => valuePipeline.run(),
    TypeError,
    "invalid value",
  );

  const snapshots = valuePipeline.inspect();
  assertEquals(snapshots.length, 1);
  assertEquals(snapshots[0]?.label, "boom");
  assertEquals(snapshots[0]?.status, "err");
});
