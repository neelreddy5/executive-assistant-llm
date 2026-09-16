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

test("captions hide delivery cues while preserving meaningful bracketed content", () => {
  const { cleanAssistantCaption } = loadModule("../hooks/useExecutiveAssistant.ts", {
    react: {}, "@elevenlabs/react": {},
  });
  assert.equal(cleanAssistantCaption("[reassuring] Done. [short pause] Lunch is blocked."), "Done. Lunch is blocked.");
  assert.equal(cleanAssistantCaption("[REASSURING] Your [Board Review] is on [insert date]."), "Your [Board Review] is on [insert date].");
  assert.equal(cleanAssistantCaption("Done [sighs]."), "Done.");
  assert.equal(cleanAssistantCaption("[reassuring]"), "");
});

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
  const values = [];
  const volumes = [];
  let cursor = 0;
  let callbacks;
  let stopped = false;
  const conversation = { status: "disconnected", startSession: async (options) => sessions.push(options), setVolume: ({ volume }) => volumes.push(volume) };
  const { useExecutiveAssistant } = loadModule("../hooks/useExecutiveAssistant.ts", {
    react: {
      useCallback: (callback) => callback,
      useMemo: (callback) => callback(),
      useState: (initial) => {
        const index = cursor++;
        if (!(index in values)) values[index] = initial;
        return [values[index], (value) => {
          values[index] = typeof value === "function" ? value(values[index]) : value;
          states.push(values[index]);
        }];
      },
    },
    "@/lib/calendar-events": loadModule("../lib/calendar-events.ts", {}),
    "@elevenlabs/react": { useConversation: (options) => { callbacks = options; return conversation; } },
  }, {
    fetch: async () => response,
    navigator: { mediaDevices: { getUserMedia: async () => ({
      getTracks: () => [{ stop: () => { stopped = true; } }],
    }) } },
  });
  function render() {
    cursor = 0;
    // React primitives are mocked above to exercise session orchestration directly.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useExecutiveAssistant({ assistant: { agentId: "agent_test", name: "Cove" }, context: {} });
  }
  const hook = render();
  return { hook, render, conversation, volumes, sessions, states, get callbacks() { return callbacks; }, get stopped() { return stopped; } };
}

test("calendar tool updates the agenda, preserves it on invalid results, and accepts empty weeks", async () => {
  const harness = hookHarness();
  const input = { rangeStart: "2026-09-14", rangeEnd: "2026-09-21", timezone: "America/New_York", events: [
    { id: "meeting", title: "Review", start: "2026-09-14T09:00:00-04:00", end: "2026-09-14T10:00:00-04:00", allDay: false },
  ] };
  await harness.callbacks.clientTools.show_calendar_events(input);
  const previous = harness.render().agenda;
  assert.equal(previous.events[0].title, "Review");
  await assert.rejects(harness.callbacks.clientTools.show_calendar_events({ ...input, timezone: "Invalid/Zone" }));
  assert.equal(harness.render().agenda, previous);
  await harness.callbacks.clientTools.show_calendar_events({ ...input, events: [] });
  assert.equal(harness.render().agenda.events.length, 0);
});

test("assistant mute changes playback immediately and remains controlled across reconnects", () => {
  const harness = hookHarness();
  harness.conversation.status = "connected";
  harness.render().toggleAssistantMuted();
  assert.deepEqual(harness.volumes, [0]);
  assert.equal(harness.render().assistantMuted, true);
  assert.equal(harness.callbacks.volume, 0);
  assert.equal(harness.callbacks.micMuted, undefined);
  harness.conversation.status = "disconnected";
  assert.equal(harness.render().assistantMuted, true);
  harness.conversation.status = "connected";
  assert.equal(harness.render().assistantMuted, true);
  harness.callbacks.onConnect();
  assert.deepEqual(harness.volumes, [0, 0]);
  harness.render().toggleAssistantMuted();
  assert.deepEqual(harness.volumes, [0, 0, 1]);
  assert.equal(harness.render().assistantMuted, false);
});

test("calendar dates respect timezone, midnight endings, exclusive ranges, and recurrence IDs", () => {
  const { parseCalendarEvents, groupCalendarEvents, calendarEventTime } = loadModule("../lib/calendar-events.ts", {});
  const event = { id: "series_1", title: "Review", start: "2026-09-15T02:00:00Z", end: "2026-09-15T04:00:00Z", allDay: false };
  const result = parseCalendarEvents({ rangeStart: "2026-09-14", rangeEnd: "2026-09-21", timezone: "America/New_York", events: [
    event, event,
    { ...event, id: "series_2", start: "2026-09-16T09:00:00-04:00", end: "2026-09-16T10:00:00-04:00" },
    { id: "trip", title: "Trip", start: "2026-09-19", end: "2026-09-22", allDay: true },
  ] });
  assert.equal(result.events.length, 3);
  assert.equal(JSON.stringify(groupCalendarEvents(result).map(({ date }) => date)), JSON.stringify(["2026-09-14", "2026-09-16", "2026-09-19", "2026-09-20"]));
  assert.match(calendarEventTime(event, result.timezone), /10:00 PM/);
  const dst = { ...event, start: "2026-11-01T01:30:00-04:00", end: "2026-11-01T01:30:00-05:00" };
  assert.match(calendarEventTime(dst, result.timezone), /EDT.*EST/);
  for (const changes of [
    { rangeStart: "2026-02-30" }, { rangeEnd: "2026-09-14" },
    { events: [{ ...event, start: "2026-09-14T09:00:00" }] },
    { events: [{ ...event, end: event.start }] },
    { events: [{ ...event, allDay: true }] },
  ]) assert.throws(() => parseCalendarEvents({ ...result, ...changes }));
});

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
