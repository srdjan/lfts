import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { Result, t } from "./mod.ts";
import {
  createStageCatalog,
  defineBackendFunctionStage,
  defineFullStackHtmxStage,
  isStageDefinition,
  registerHtmxStageRoutes,
  type HtmxRouteSpec,
  type FullStackStageUiMetadata,
} from "./stage-types.ts";

const Input$ = t.object({ value: t.string() }).bc;
const Output$ = t.object({ value: t.string() }).bc;

Deno.test("defineBackendFunctionStage tags metadata and catalog registration", () => {
  const normalizeStage = defineBackendFunctionStage({
    name: "NormalizeUser",
    inputSchema: Input$,
    outputSchema: Output$,
    description: "Trim incoming user supplied strings",
    ports: ["LoggerPort"],
    owners: ["core-platform"],
    tags: ["backend", "sanitizer"],
    execute: async (input: { value: string }) =>
      Result.ok({ value: input.value.trim() }),
  });

  assertEquals(isStageDefinition(normalizeStage), true);
  assertEquals(normalizeStage.metadata?.stageKind, "backend_function");
  assertEquals(normalizeStage.metadata?.ports, ["LoggerPort"]);

  const catalog = createStageCatalog();
  catalog.register(normalizeStage);
  const entry = catalog.get("NormalizeUser");
  assertEquals(entry?.name, normalizeStage.name);
  assertEquals(catalog.byKind("backend_function").length, 1);
  assertThrows(() => catalog.register(normalizeStage));
});

Deno.test("defineFullStackHtmxStage surfaces fragment + routes", () => {
  const routes: HtmxRouteSpec[] = [
    {
      method: "POST",
      path: "/pr/:id/approve",
      payloadSchema: Input$,
      handler: () => ({ status: 200, body: "ok" }),
    },
  ];

  const fullstackStage = defineFullStackHtmxStage({
    name: "ReviewPR",
    inputSchema: Input$,
    outputSchema: Output$,
    routes,
    fragment: (data: { value: string }) => `<div>${data.value}</div>`,
    execute: async (input: { value: string }) =>
      Result.ok({ value: input.value.toUpperCase() }),
  });

  assertEquals(fullstackStage.metadata?.stageKind, "fullstack_htmx");
  const ui = fullstackStage.metadata?.ui as FullStackStageUiMetadata;
  assertEquals(ui.routes.length, 1);

  const collected: HtmxRouteSpec[] = [];
  registerHtmxStageRoutes(fullstackStage, (route) => collected.push(route));
  assertEquals(collected, routes);
});

Deno.test(
  "registerHtmxStageRoutes fails for backend-only stages",
  () => {
    const backendStage = defineBackendFunctionStage({
      name: "BackendOnly",
      inputSchema: Input$,
      outputSchema: Output$,
      execute: async () => Result.ok({ value: "done" }),
    });

    assertThrows(() =>
      registerHtmxStageRoutes(backendStage, () => {}),
      Error,
      "fullstack_htmx",
    );
  },
);
