import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Exercise application code with network/SDK boundaries mocked; no paid calls.
function loadModule(path, dependencies, globals = {}) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: (name) => dependencies[name], ...globals });
  return exports;
}

test("agent IDs tolerate literal dashboard quotes and surrounding whitespace", () => {
  const { normalizeAgentId, assistants } = loadModule("../lib/assistants.ts", {}, {
    process: { env: { NEXT_PUBLIC_COVE_AGENT_ID: "'agent_test'" } },
  });
  assert.equal(assistants[0].agentId, "agent_test");
  for (const input of ["agent_test", "  agent_test  ", " 'agent_test' ", '"agent_test"']) {
    assert.equal(normalizeAgentId(input), "agent_test");
  }
  assert.equal(normalizeAgentId(undefined), "");
  assert.equal(normalizeAgentId("''"), "");
});

function hookHarness(response) {
  const sessions = [];
  const states = [];
  let callbacks;
  let stopped = false;
  const conversation = { status: "disconnected", startSession: async (options) => sessions.push(options) };
  const { useExecutiveAssistant } = loadModule("../hooks/useExecutiveAssistant.ts", {
    react: {
      useCallback: (callback) => callback,
      useMemo: (callback) => callback(),
      useState: () => [undefined, (value) => states.push(value)],
    },
    "@elevenlabs/react": { useConversation: (options) => { callbacks = options; return conversation; } },
  }, {
    fetch: async () => response,
    navigator: { mediaDevices: { getUserMedia: async () => ({
      getTracks: () => [{ stop: () => { stopped = true; } }],
    }) } },
  });
  // React primitives are mocked above to exercise session orchestration directly.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const hook = useExecutiveAssistant({ assistant: { agentId: "agent_test", name: "Cove" }, context: {} });
  return { hook, sessions, states, get callbacks() { return callbacks; }, get stopped() { return stopped; } };
}

test("credential rejection is shown without attempting an unauthenticated session", async () => {
  const harness = hookHarness({ ok: false, status: 502, json: async () => ({ error: "Credentials rejected" }) });
  await harness.hook.start();
  assert.equal(harness.sessions.length, 0);
  assert.match(harness.states.at(-1), /Credentials rejected/);
  assert.equal(harness.stopped, true);
});

test("public agents still connect when no server API key is configured", async () => {
  const harness = hookHarness({ ok: false, status: 503, json: async () => ({ code: "PUBLIC_AGENT_ONLY" }) });
  await harness.hook.start();
  assert.equal(harness.sessions[0].agentId, "agent_test");
  assert.equal(harness.sessions[0].connectionType, "webrtc");
});

test("signed credentials use WebSocket and release the permission-check microphone", async () => {
  const harness = hookHarness({ ok: true, json: async () => ({ signedUrl: "wss://example.test/session" }) });
  await harness.hook.start();
  assert.equal(harness.sessions[0].connectionType, "websocket");
  assert.equal(harness.stopped, true);
});

test("SDK errors preserve diagnostics but redact signed connection URLs", () => {
  const harness = hookHarness();
  harness.callbacks.onError("Connection failed wss://example.test/?token=secret");
  assert.match(harness.states.at(-1), /Connection failed/);
  assert.doesNotMatch(harness.states.at(-1), /secret/);
  harness.callbacks.onDisconnect({ reason: "error", message: "Origin rejected" });
  assert.match(harness.states.at(-1), /Origin rejected/);
});

test("server reports upstream authentication failure without exposing secrets", async () => {
  const logs = [];
  const { GET } = loadModule("../app/api/elevenlabs/session/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => ({ body, ...options }) } },
  }, {
    process: { env: { ELEVENLABS_API_KEY: "test-secret" } },
    fetch: async () => ({ ok: false, status: 401 }),
    console: { error: (...args) => logs.push(args) },
  });
  const result = await GET({ nextUrl: new URL("https://example.test/api?agentId=agent_test") });
  assert.equal(result.status, 502);
  assert.match(result.body.error, /server credentials/);
  assert.doesNotMatch(JSON.stringify({ result, logs }), /test-secret/);
});
