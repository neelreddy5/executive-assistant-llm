import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";

// Exercise application code with network/SDK boundaries mocked; no paid calls.
function loadModule(path, dependencies, globals = {}) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
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
  assert.equal(cleanAssistantCaption("[checking] Checking [Board Review]."), "Checking [Board Review].");
});

function activityHarness() {
  let actions = [];
  let nextTimer = 0;
  const timers = new Map();
  const { createToolActivityTracker } = loadModule("../lib/tool-activity.ts", {}, {
    setTimeout: (fn, ms) => { timers.set(++nextTimer, { fn, ms }); return nextTimer; },
    clearTimeout: (id) => timers.delete(id),
  });
  const tracker = createToolActivityTracker((next) => { actions = next; });
  return { tracker, timers, get actions() { return actions; }, expire() { for (const { fn } of [...timers.values()]) fn(); timers.clear(); } };
}

const toolRequest = (id, tool_name = "google_calendar_update_event", response_timeout_secs = 20) => ({ tool_call_id: id, tool_name, response_timeout_secs });
const toolResponse = (id, tool_name = "google_calendar_update_event", extra = {}) => ({ ...toolRequest(id, tool_name), is_error: false, is_called: true, status: "success", ...extra });

test("moving label binds to mutation, ignores agent completion, and finishes on real result", () => {
  const h = activityHarness();
  h.tracker.upsert({ id: "calendar-update:one", label: "Moving Review to 11:30", state: "active" });
  h.tracker.upsert({ id: "calendar-update:one", label: "Moved Review", state: "complete" });
  assert.equal(h.actions[0].state, "active");
  h.tracker.request(toolRequest("one", undefined, 12));
  assert.equal(h.actions.length, 1);
  assert.equal(h.actions[0].workingLabel, "Updating calendar…");
  assert.equal([...h.timers.values()][0].ms, 17000);
  h.tracker.request(toolRequest("one"));
  assert.equal(h.timers.size, 1, "duplicate request does not restart timeout");
  h.tracker.upsert({ id: "calendar-update:one", label: "Moved Review", state: "complete" });
  assert.equal(h.actions[0].state, "active");
  h.tracker.response(toolResponse("one"));
  assert.equal(h.actions[0].state, "complete");
  assert.equal(h.actions[0].label, "Calendar event updated");
  assert.match(h.actions[0].detail, /Moving Review to 11:30/);
  assert.match(h.actions[0].detail, /Confirmed/);
  h.tracker.response(toolResponse("one", undefined, { full_tool_result: '{"id":"event"}' }));
  h.tracker.upsert({ id: "calendar-update:one", label: "Moving Review", state: "active" });
  assert.equal(h.actions[0].state, "complete");
  assert.equal(h.timers.size, 0);
});

test("availability does not claim a moving row; mutation can receive its label after starting", () => {
  const h = activityHarness();
  h.tracker.upsert({ label: "Moving Review to noon", state: "active" });
  h.tracker.request(toolRequest("check", "google_calendar_check_availability"));
  h.tracker.response(toolResponse("check", "google_calendar_check_availability"));
  assert.equal(h.actions[0].state, "active");
  h.tracker.request(toolRequest("move"));
  h.tracker.response(toolResponse("move"));
  assert.equal(h.actions[0].state, "complete");

  const late = activityHarness();
  late.tracker.request(toolRequest("move"));
  late.tracker.upsert({ id: "calendar-update:late", label: "Moving Review to noon", state: "active" });
  assert.equal(late.actions.length, 1);
  late.tracker.response(toolResponse("move"));
  assert.equal(late.actions[0].id, "calendar-update:late");
  assert.equal(late.actions[0].state, "complete");
});

test("legacy Moving followed by successful create resolves the original row accurately", () => {
  const h = activityHarness();
  h.tracker.upsert({ id: "calendar-update:strategy-1", label: "Moving Strategy Catch-Up to 10:30 a.m.", state: "active" });
  h.tracker.request(toolRequest("create", "google_calendar_create_event"));
  h.tracker.response(toolResponse("create", "google_calendar_create_event"));
  assert.equal(h.actions.length, 1);
  assert.equal(h.actions[0].id, "calendar-update:strategy-1");
  assert.equal(h.actions[0].state, "complete");
  assert.equal(h.actions[0].label, "Calendar event created");
  assert.match(h.actions[0].detail, /Strategy Catch-Up/);
  assert.match(h.actions[0].detail, /Moving the original event has not been confirmed/);
  assert.equal(h.timers.size, 0);
  h.expire();
  assert.equal(h.actions[0].state, "complete");
  h.tracker.response(toolResponse("create", "google_calendar_create_event", { full_tool_result: '{"id":"new-event"}' }));
  assert.equal(h.actions.length, 1);
});

test("explicit expected tool wins over wording and cannot bind to a different tool", () => {
  const h = activityHarness();
  h.tracker.upsert({ id: "calendar-update:one", label: "Moving Review", expectedToolName: "google_calendar_create_event", state: "active" });
  h.tracker.request(toolRequest("update"));
  h.tracker.response(toolResponse("update"));
  assert.equal(h.actions[0].state, "active");
  h.tracker.request(toolRequest("create", "google_calendar_create_event"));
  h.tracker.response(toolResponse("create", "google_calendar_create_event"));
  assert.equal(h.actions[0].state, "complete");
  assert.equal(h.actions[0].label, "Calendar event created");
  assert.throws(() => h.tracker.upsert({ label: "Test", state: "active", expectedToolName: "get_preferences" }));
});

test("cross-kind fallback is safe in either arrival order and refuses concurrent ambiguity", () => {
  const h = activityHarness();
  h.tracker.request(toolRequest("create", "google_calendar_create_event"));
  h.tracker.upsert({ label: "Moving Review", state: "active" });
  h.tracker.response(toolResponse("create", "google_calendar_create_event"));
  assert.equal(h.actions.length, 1);
  assert.equal(h.actions[0].label, "Calendar event created");

  const concurrent = activityHarness();
  concurrent.tracker.upsert({ label: "Moving Review", state: "active" });
  concurrent.tracker.upsert({ label: "Creating Workshop", state: "active" });
  concurrent.tracker.request(toolRequest("create", "google_calendar_create_event"));
  concurrent.tracker.response(toolResponse("create", "google_calendar_create_event"));
  assert.equal(concurrent.actions.length, 3);
  assert.equal(concurrent.actions[0].state, "active");
  assert.equal(concurrent.actions[1].state, "active");
  concurrent.expire();
  assert.ok(concurrent.actions.every((action) => action.state !== "active"));
});

test("replacement creation plus failed original deletion never claims the event was moved", () => {
  const h = activityHarness();
  h.tracker.upsert({ id: "calendar-create:replacement", label: "Creating replacement for Review", expectedToolName: "google_calendar_create_event", state: "active" });
  h.tracker.request(toolRequest("create", "google_calendar_create_event"));
  h.tracker.response(toolResponse("create", "google_calendar_create_event"));
  h.tracker.upsert({ id: "calendar-delete:original", label: "Removing original Review", expectedToolName: "google_calendar_delete_event", state: "active" });
  h.tracker.request(toolRequest("delete", "google_calendar_delete_event"));
  h.tracker.response(toolResponse("delete", "google_calendar_delete_event", { is_error: true }));
  assert.equal(h.actions[0].state, "complete");
  assert.equal(h.actions[1].state, "failed");
  assert.doesNotMatch(h.actions.map((action) => action.label).join(" "), /moved/i);
  assert.equal(h.timers.size, 0);
});

test("ambiguous concurrent labels are not matched to the wrong calendar event", () => {
  const h = activityHarness();
  for (const name of ["one", "two"]) h.tracker.upsert({ id: `calendar-update:${name}`, label: `Moving ${name}`, state: "active" });
  h.tracker.request(toolRequest("call"));
  h.tracker.response(toolResponse("call"));
  assert.equal(h.actions.length, 3);
  assert.equal(h.actions[0].state, "active");
  assert.equal(h.actions[1].state, "active");
  assert.equal(h.actions[2].state, "complete");
  h.expire();
  assert.equal(h.actions.filter((action) => action.state === "active").length, 0);
});

test("timeouts clear spinners without claiming a failed write; a current late result can recover", () => {
  const h = activityHarness();
  h.tracker.request(toolRequest("one"));
  h.expire();
  assert.equal(h.actions[0].state, "failed");
  assert.match(h.actions[0].detail, /not confirmed.*Check the calendar/);
  h.tracker.response(toolResponse("one"));
  assert.equal(h.actions[0].state, "complete");

  h.tracker.request(toolRequest("old"));
  h.expire();
  h.tracker.request(toolRequest("new"));
  h.tracker.response(toolResponse("old"));
  assert.equal(h.actions[1].state, "failed", "superseded late result retains uncertainty");
  assert.equal(h.actions[2].state, "active");
  h.tracker.response(toolResponse("new"));
  assert.equal(h.actions[2].state, "complete");
});

test("orphan agent activities time out even if no tool ever starts", () => {
  const h = activityHarness();
  h.tracker.upsert({ label: "Moving Review", state: "active" });
  h.tracker.upsert({ label: "Preparing a note", state: "pending" });
  h.expire();
  assert.ok(h.actions.every((action) => action.state === "failed"));
  assert.equal(h.timers.size, 0);
});

test("completed local preference and draft activities do not require a calendar tool", () => {
  const h = activityHarness();
  h.tracker.upsert({ id: "preferences", label: "Scheduling preferences saved", state: "complete" });
  h.tracker.upsert({ id: "email-draft", label: "Drafting a note to Jordan", state: "complete" });
  assert.equal(h.actions.length, 2);
  assert.ok(h.actions.every((action) => action.state === "complete"));
  assert.equal(h.timers.size, 0);
});

test("failure, blocking, skipped execution, and embedded API errors cannot show success", () => {
  for (const extra of [{ is_error: true }, { is_blocked: true }, { is_called: false }, { status: "failure" }, { full_tool_result: '{"error":{"message":"private detail"}}' }]) {
    const h = activityHarness();
    h.tracker.request(toolRequest("one"));
    h.tracker.response(toolResponse("one", undefined, extra));
    assert.equal(h.actions[0].state, "failed");
    assert.doesNotMatch(h.actions[0].detail, /private detail/);
    h.tracker.response(toolResponse("one"));
    assert.equal(h.actions[0].state, "failed");
    assert.equal(h.timers.size, 0);
  }
  const h = activityHarness();
  h.tracker.response(toolResponse("check", "google_calendar_check_availability"));
  h.tracker.response(toolResponse("check", "google_calendar_check_availability", { full_tool_result: '{"calendars":{"primary":{"errors":[{"reason":"notFound"}]}}}' }));
  assert.equal(h.actions[0].state, "failed", "payload can refine metadata success");
});

test("end, dispose, and new-session reset clean up timers and reject retired tool calls", () => {
  const h = activityHarness();
  h.tracker.request(toolRequest("old"));
  h.tracker.end();
  assert.equal(h.actions[0].state, "failed");
  assert.equal(h.timers.size, 0);
  h.tracker.response(toolResponse("old"));
  assert.equal(h.actions[0].state, "failed");
  h.tracker.reset();
  h.tracker.response(toolResponse("old"));
  assert.equal(h.actions.length, 0);
  h.tracker.request(toolRequest("new"));
  h.tracker.dispose();
  assert.equal(h.timers.size, 0);
});

test("availability working state is bounded and does not replace event cards or interrupt audio", () => {
  const h = hookHarness();
  h.callbacks.onConnect();
  h.callbacks.onAgentToolResponse(calendarResponse("agenda"));
  const agenda = h.render().agenda;
  h.callbacks.onAgentToolRequest(toolRequest("check", "google_calendar_check_availability"));
  assert.equal(h.render().status, "working");
  assert.equal(h.render().workingLabel, "Checking calendar…");
  assert.equal(h.render().agenda, agenda);
  h.conversation.isSpeaking = true;
  assert.equal(h.render().status, "speaking");
  h.conversation.isSpeaking = false;
  h.expire();
  assert.equal(h.render().status, "listening");
  assert.equal(h.render().connected, true);
  assert.equal(h.render().error, undefined);
  h.callbacks.onAgentToolResponse(toolResponse("check", "google_calendar_check_availability"));
  assert.equal(h.render().actions.at(-1).state, "complete");
  assert.equal(h.render().agenda, agenda);
});

test("working label is visible, while microphone mute keeps its status precedence", () => {
  const { AgentStatus } = loadModule("../components/assistant/AgentStatus.tsx", { "react/jsx-runtime": jsxRuntime });
  const props = { assistant: { name: "Cove" }, status: "working", workingLabel: "Updating calendar…" };
  assert.match(renderToStaticMarkup(createElement(AgentStatus, props)), /Updating calendar/);
  const muted = renderToStaticMarkup(createElement(AgentStatus, { ...props, muted: true }));
  assert.match(muted, /Microphone muted/);
  assert.doesNotMatch(muted, /Updating calendar/);
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

function hookHarness(response, options = {}) {
  const sessions = [];
  const states = [];
  const values = [];
  const volumes = [];
  const microphoneMutes = [];
  const refs = [];
  const timers = new Map();
  const schedule = (callback) => { timers.set(++timerId, callback); return timerId; };
  const unschedule = (id) => timers.delete(id);
  let refCursor = 0;
  let timerId = 0;
  let ends = 0;
  let cursor = 0;
  let callbacks;
  let stopped = false;
  const conversation = {
    status: "disconnected",
    startSession: (options) => { sessions.push(options); },
    endSession: () => { ends++; },
    setMuted: (muted) => microphoneMutes.push(muted),
    setVolume: ({ volume }) => volumes.push(volume),
  };
  const { useExecutiveAssistant } = loadModule("../hooks/useExecutiveAssistant.ts", {
    react: {
      useCallback: (callback) => callback,
      useMemo: (callback) => callback(),
      useEffect: () => {},
      useRef: (initial) => {
        const index = refCursor++;
        refs[index] ??= { current: initial };
        return refs[index];
      },
      useState: (initial) => {
        const index = cursor++;
        if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial;
        return [values[index], (value) => {
          values[index] = typeof value === "function" ? value(values[index]) : value;
          states.push(values[index]);
        }];
      },
    },
    "@/lib/calendar-events": loadModule("../lib/calendar-events.ts", {}),
    "@/lib/tool-activity": loadModule("../lib/tool-activity.ts", {}, { setTimeout: schedule, clearTimeout: unschedule }),
    "@elevenlabs/react": { useConversation: (options) => { callbacks = options; return conversation; } },
  }, {
    AbortController,
    setTimeout: schedule,
    clearTimeout: unschedule,
    fetch: options.fetch ?? (async () => response),
    navigator: { mediaDevices: { getUserMedia: options.getUserMedia ?? (async () => ({
      getTracks: () => [{ stop: () => { stopped = true; } }],
    })) } },
  });
  function render() {
    cursor = 0;
    refCursor = 0;
    // React primitives are mocked above to exercise session orchestration directly.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useExecutiveAssistant({ assistant: { agentId: "agent_test", name: "Cove" }, context: { profile: { timezone: "America/New_York" } } });
  }
  const hook = render();
  return { hook, render, conversation, microphoneMutes, volumes, sessions, states, timers, expire: () => { for (const callback of [...timers.values()]) callback(); }, get ends() { return ends; }, get callbacks() { return callbacks; }, get stopped() { return stopped; } };
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

const googleEvent = { id: "meeting", summary: "Product review", start: { dateTime: "2026-09-17T14:00:00Z" }, end: { dateTime: "2026-09-17T14:30:00Z" } };
const calendarRequest = (id) => ({ tool_name: "google_calendar_list_events", tool_call_id: id, tool_type: "webhook", event_id: 1 });
const calendarResponse = (id, result = { items: [googleEvent] }, extra = {}) => ({
  ...calendarRequest(id), is_error: false, full_tool_result: JSON.stringify(result), ...extra,
});

test("built-in calendar results render without a client tool or another fetch", () => {
  const harness = hookHarness(undefined, { fetch: () => { throw new Error("Unexpected fetch"); } });
  harness.callbacks.onAgentToolRequest(calendarRequest("one"));
  assert.equal(harness.render().calendarStatus.state, "loading");
  harness.callbacks.onAgentToolResponse({ ...calendarRequest("one"), is_error: false });
  assert.equal(harness.render().agenda, undefined, "metadata is not an empty result");
  harness.callbacks.onAgentToolResponse(calendarResponse("one", { items: [googleEvent], nextPageToken: "next" }));
  const result = harness.render();
  assert.equal(result.agenda.events[0].title, "Product review");
  assert.equal(result.agenda.timezone, "America/New_York");
  assert.equal(result.agenda.hasMore, true);
  assert.equal(result.calendarStatus.state, "complete");
  assert.equal(harness.timers.size, 0);
  harness.callbacks.onAgentToolResponse({ ...calendarRequest("one"), is_error: false });
  harness.callbacks.onAgentToolResponse(calendarResponse("one", { items: [] }));
  assert.equal(harness.render().agenda, result.agenda, "duplicate callbacks do not replace results");
});

test("calendar responses ignore other tools and superseded calls", () => {
  const harness = hookHarness();
  harness.callbacks.onAgentToolResponse({ ...calendarResponse("unrelated"), tool_name: "another_tool" });
  assert.equal(harness.render().calendarStatus, undefined);
  harness.callbacks.onAgentToolRequest(calendarRequest("old"));
  harness.callbacks.onAgentToolRequest(calendarRequest("new"));
  harness.callbacks.onAgentToolResponse(calendarResponse("old"));
  assert.equal(harness.render().agenda, undefined);
  harness.callbacks.onAgentToolResponse(calendarResponse("new", { items: [] }));
  assert.equal(harness.render().agenda.events.length, 0);
  harness.callbacks.onAgentToolRequest(calendarRequest("old"));
  harness.callbacks.onAgentToolResponse(calendarResponse("old"));
  assert.equal(harness.render().agenda.events.length, 0);
});

test("calendar failures, truncation, and unsupported payloads do not break audio", () => {
  for (const extra of [
    { is_error: true }, { is_blocked: true }, { truncated: true },
    { full_tool_result: "not json" }, { full_tool_result: JSON.stringify({ unexpected: [] }) },
    { full_tool_result: JSON.stringify({ error: { message: "secret" }, items: [] }) },
  ]) {
    const harness = hookHarness();
    harness.callbacks.onConnect();
    harness.callbacks.onAgentToolResponse(calendarResponse("one", undefined, extra));
    const result = harness.render();
    assert.equal(result.calendarStatus.state, "failed");
    assert.equal(result.agenda, undefined);
    assert.equal(result.error, undefined);
    assert.equal(result.connected, true);
    assert.doesNotMatch(result.calendarStatus.message, /secret|not json/);
    assert.equal(harness.timers.size, 0);
  }
});

test("missing calendar payloads time out and a new request can recover", () => {
  const harness = hookHarness();
  harness.callbacks.onAgentToolRequest(calendarRequest("one"));
  harness.callbacks.onAgentToolResponse({ ...calendarRequest("one"), is_error: false });
  harness.expire();
  assert.match(harness.render().calendarStatus.message, /not received/);
  harness.callbacks.onAgentToolResponse(calendarResponse("two"));
  assert.equal(harness.render().calendarStatus.state, "complete");
  harness.callbacks.onAgentToolRequest(calendarRequest("three"));
  assert.equal(harness.render().agenda, undefined, "previous cards do not masquerade as new results");
  harness.expire();
  assert.equal(harness.render().calendarStatus.state, "failed");
});

test("ending a session cancels calendar loading and ignores late results", async () => {
  const harness = hookHarness();
  harness.callbacks.onAgentToolRequest(calendarRequest("one"));
  await harness.render().stop();
  assert.equal(harness.timers.size, 0);
  assert.equal(harness.render().calendarStatus.state, "failed");
  harness.callbacks.onAgentToolResponse(calendarResponse("one"));
  assert.equal(harness.render().agenda, undefined);
});

test("Google calendar normalization handles recurrence, cancellation, timezones, and all-day spans", () => {
  const { parseGoogleCalendarResults, groupCalendarEvents, calendarEventTime } = loadModule("../lib/calendar-events.ts", {});
  const result = parseGoogleCalendarResults(JSON.stringify({ timeZone: "America/Los_Angeles", items: [
    googleEvent, googleEvent,
    { ...googleEvent, id: "recurrence_2", summary: "" },
    { id: "cancelled", status: "cancelled" },
    { id: "trip", summary: "Trip", start: { date: "2026-09-18" }, end: { date: "2026-09-21" } },
  ] }), "UTC");
  assert.equal(result.events.length, 3);
  assert.equal(result.events[1].title, "Untitled event");
  assert.match(calendarEventTime(result.events[0], result.timezone), /7:00 AM/);
  assert.match(calendarEventTime(result.events[2], result.timezone), /Sep 18.*Sep 20/);
  assert.equal(groupCalendarEvents(result).flatMap((day) => day.events).length, 3, "one card per event");
  for (const item of [
    { ...googleEvent, start: { dateTime: "2026-09-17T14:00:00" } },
    { ...googleEvent, end: googleEvent.start },
    { ...googleEvent, start: { date: "2026-02-30" } },
    { ...googleEvent, start: { date: "2026-09-17" } },
  ]) assert.throws(() => parseGoogleCalendarResults(JSON.stringify({ items: [item] }), "UTC"));
  assert.throws(() => parseGoogleCalendarResults('{"items":[],"timeZone":"invalid"}', "UTC"));
});

test("calendar cards show empty, partial, loading, and safe text states", () => {
  const calendar = loadModule("../lib/calendar-events.ts", {});
  const { CalendarEventsCard } = loadModule("../components/assistant/CalendarEventsCard.tsx", {
    "react/jsx-runtime": jsxRuntime, "lucide-react": icons, "@/lib/calendar-events": calendar,
  });
  const agenda = calendar.parseGoogleCalendarResults(JSON.stringify({ items: [{ ...googleEvent, summary: '<script>alert("x")</script>' }], nextPageToken: "next" }), "UTC");
  const html = renderToStaticMarkup(createElement(CalendarEventsCard, { agenda }));
  assert.match(html, /Calendar results/);
  assert.match(html, /More results are available/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(renderToStaticMarkup(createElement(CalendarEventsCard, { agenda: { ...agenda, events: [], hasMore: false } })), /No events returned/);
  const loading = renderToStaticMarkup(createElement(CalendarEventsCard, { status: { state: "loading", message: "Finding calendar events…" } }));
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /role="status"/);
  assert.doesNotMatch(loading, /No events returned/);
});

test("microphone mute blocks input without muting assistant playback and persists across reconnects", () => {
  const harness = hookHarness();
  harness.conversation.status = "connected";
  harness.callbacks.onConnect();
  harness.render().toggleMicrophoneMuted();
  assert.deepEqual(harness.microphoneMutes, [true]);
  assert.deepEqual(harness.volumes, []);
  assert.equal(harness.render().microphoneMuted, true);
  assert.equal(harness.callbacks.micMuted, true);
  assert.equal(harness.callbacks.volume, undefined);
  harness.conversation.status = "disconnected";
  harness.callbacks.onDisconnect({ reason: "user" });
  assert.equal(harness.render().microphoneMuted, true);
  harness.conversation.status = "connected";
  harness.callbacks.onConnect();
  assert.equal(harness.render().microphoneMuted, true);
  assert.equal(harness.callbacks.micMuted, true);
  harness.render().toggleMicrophoneMuted();
  assert.deepEqual(harness.microphoneMutes, [true, false]);
  assert.deepEqual(harness.volumes, []);
  assert.equal(harness.render().microphoneMuted, false);
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

test("a pending handshake times out and offers recovery rather than joining forever", async () => {
  const harness = hookHarness({ ok: true, json: async () => ({ signedUrl: "wss://example.test/session" }) });
  await harness.hook.start();
  assert.equal(harness.render().status, "connecting");
  await harness.render().start();
  assert.equal(harness.sessions.length, 1);
  harness.expire();
  assert.match(harness.render().error, /took too long/);
  assert.equal(harness.render().reconnectNeedsReload, true);
  assert.equal(harness.ends, 1);
  assert.equal(harness.timers.size, 0);
  harness.callbacks.onConnect();
  assert.equal(harness.ends, 2, "a late connection is ended after cancellation");
  assert.equal(harness.render().status, "error");
});

test("cancel during credential fetch prevents late credentials from starting a session", async () => {
  let resolveFetch;
  let markFetching;
  const fetching = new Promise((resolve) => { markFetching = resolve; });
  const harness = hookHarness(undefined, { fetch: () => new Promise((resolve) => { resolveFetch = resolve; markFetching(); }) });
  const starting = harness.hook.start();
  await fetching;
  await harness.render().stop();
  resolveFetch({ ok: true, json: async () => ({ signedUrl: "wss://example.test/session" }) });
  await starting;
  assert.equal(harness.sessions.length, 0);
  assert.equal(harness.render().status, "idle");
  assert.equal(harness.render().reconnectNeedsReload, false);
});

test("a late microphone permission result releases its stream after timeout", async () => {
  let resolveMic;
  let released = false;
  const harness = hookHarness(undefined, { getUserMedia: () => new Promise((resolve) => { resolveMic = resolve; }) });
  const starting = harness.hook.start();
  harness.expire();
  resolveMic({ getTracks: () => [{ stop: () => { released = true; } }] });
  await starting;
  assert.equal(released, true);
  assert.equal(harness.sessions.length, 0);
});

test("calendar tool errors do not turn a healthy voice session into a connection error", async () => {
  const harness = hookHarness();
  harness.conversation.status = "connected";
  harness.callbacks.onConnect();
  // Reproduce ConversationStatusProvider's behavior on a nonfatal tool error.
  harness.conversation.status = "error";
  harness.callbacks.onError("Client tool execution failed", { clientToolName: "show_calendar_events" });
  assert.equal(harness.render().error, undefined);
  assert.equal(harness.render().status, "listening");
  assert.equal(harness.render().actions.at(-1).state, "failed");
  assert.equal(harness.render().connected, true);
  await harness.render().start();
  assert.equal(harness.sessions.length, 0, "do not start a second session over the active transport");
  assert.equal(harness.render().status, "listening");
});

test("connect callback does not depend on input controls being ready", async () => {
  const harness = hookHarness({ ok: true, json: async () => ({ signedUrl: "wss://example.test/session" }) });
  await harness.hook.start();
  harness.conversation.setMuted = () => { throw new Error("No active conversation"); };
  harness.callbacks.onConnect();
  harness.conversation.status = "connected";
  assert.equal(harness.render().status, "listening");
  assert.equal(harness.timers.size, 0);
  assert.doesNotThrow(() => harness.render().toggleMicrophoneMuted());
  assert.equal(harness.render().microphoneMuted, true);
});

test("mute is visible before connecting and joining has a cancel control", () => {
  const { ConversationControls } = loadModule("../components/assistant/ConversationControls.tsx", {
    "react/jsx-runtime": jsxRuntime, "lucide-react": icons,
  });
  const props = { muted: false, onToggleMute: () => {}, onStop: () => {}, connected: false, connecting: false };
  const idle = renderToStaticMarkup(createElement(ConversationControls, props));
  assert.match(idle, /Mute microphone/);
  assert.doesNotMatch(idle, /End conversation/);
  const joining = renderToStaticMarkup(createElement(ConversationControls, { ...props, connecting: true, muted: true }));
  assert.match(joining, /Unmute microphone/);
  assert.match(joining, /Microphone will be muted/);
  assert.match(joining, /Cancel connection/);
  assert.match(joining, /aria-pressed="true"/);
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
