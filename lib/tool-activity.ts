import type { ActionState, AssistantAction } from "./types";

export type ActionInput = { id?: string; label: string; detail?: string; state: ActionState; expectedToolName?: string };
type ToolEvent = {
  tool_name: string;
  tool_call_id: string;
  response_timeout_secs?: number;
  is_error?: boolean;
  is_blocked?: boolean;
  is_called?: boolean;
  status?: string;
  full_tool_result?: string;
};
type Kind = "list" | "availability" | "update" | "create" | "delete" | "calendar" | "preferences";
type Entry = {
  action: AssistantAction;
  kind?: Kind;
  timer?: ReturnType<typeof setTimeout>;
  callId?: string;
  generic?: boolean;
  expectedToolName?: string;
  requestLabel?: string;
  intendedKind?: Kind;
};
type Call = { entry: Entry; settled: boolean; toolName: string };

const presentations: Record<Kind, { label: string; working: string; complete: string }> = {
  list: { label: "Retrieving calendar events", working: "Checking calendar…", complete: "Calendar events retrieved" },
  availability: { label: "Checking calendar availability", working: "Checking calendar…", complete: "Calendar availability checked" },
  update: { label: "Updating calendar event", working: "Updating calendar…", complete: "Calendar event updated" },
  create: { label: "Creating calendar event", working: "Updating calendar…", complete: "Calendar event created" },
  delete: { label: "Deleting calendar event", working: "Updating calendar…", complete: "Calendar event deleted" },
  calendar: { label: "Checking calendar", working: "Checking calendar…", complete: "Calendar operation completed" },
  preferences: { label: "Checking scheduling preferences", working: "Checking preferences…", complete: "Scheduling preferences checked" },
};

function toolKind(name: string): Kind | undefined {
  if (name === "get_preferences") return "preferences";
  if (!name.startsWith("google_calendar_")) return;
  if (name === "google_calendar_list_events") return "list";
  if (name === "google_calendar_check_availability") return "availability";
  if (/(?:update|patch|move|reschedule)/.test(name)) return "update";
  if (/(?:create|insert)/.test(name)) return "create";
  if (/(?:delete|remove)/.test(name)) return "delete";
  return "calendar";
}

function mutation(kind?: Kind) {
  return kind === "update" || kind === "create" || kind === "delete";
}

function actionKind(input: ActionInput): Kind | undefined {
  // Stable prefixes are documented in the agent prompt. The label fallback
  // supports existing agents that already say "Moving [event] to [time]".
  const prefix = input.id?.match(/^calendar-(update|create|delete):/i)?.[1]?.toLowerCase();
  if (prefix) return prefix as Kind;
  if (input.state !== "active" && input.state !== "pending") return;
  if (/^(moving|rescheduling|updating)\b/i.test(input.label)) return "update";
  if (/^(creating|scheduling|booking)\b/i.test(input.label)) return "create";
  if (/^(deleting|removing|cancelling|canceling)\b/i.test(input.label)) return "delete";
}

function responseFailed(event: ToolEvent) {
  if (event.is_error || event.is_blocked || event.is_called === false || /^(failed|failure|error|blocked)$/.test(event.status ?? "")) return true;
  // A transport-level success can still contain an API-level error.
  if (event.full_tool_result) {
    try {
      const result = JSON.parse(event.full_tool_result);
      if (result?.error) return true;
      if (event.tool_name === "google_calendar_check_availability" && result?.calendars) {
        return Object.values(result.calendars).some((calendar) =>
          !!calendar && typeof calendar === "object" && "errors" in calendar && Array.isArray(calendar.errors) && calendar.errors.length > 0);
      }
    } catch { /* Execution metadata still establishes whether the tool succeeded. */ }
  }
  return false;
}

/** Session-scoped, synchronous tracking; never sends a tool call or retries a write. */
export function createToolActivityTracker(publish: (actions: AssistantAction[]) => void) {
  const entries = new Map<string, Entry>();
  const calls = new Map<string, Call>();
  const retiredCalls = new Set<string>();
  let closed = false;
  const emit = () => publish([...entries.values()].map((entry) => ({ ...entry.action })));
  const clearTimer = (entry: Entry) => {
    if (entry.timer !== undefined) clearTimeout(entry.timer);
    entry.timer = undefined;
  };
  const setState = (entry: Entry, state: ActionState, detail?: string) => {
    entry.action = { ...entry.action, state, detail, updatedAt: Date.now() };
  };
  const arm = (entry: Entry, timeoutSeconds = 20) => {
    clearTimer(entry);
    const seconds = Number.isFinite(timeoutSeconds) && timeoutSeconds > 0 ? timeoutSeconds : 20;
    entry.timer = setTimeout(() => {
      entry.timer = undefined;
      if (closed || entries.get(entry.action.id) !== entry) return;
      setState(entry, "failed", mutation(entry.kind)
        ? "Calendar update not confirmed. Check the calendar before trying again."
        : "This check timed out. Ask your assistant to try again.");
      emit();
    }, Math.min(seconds + 5, 300) * 1000);
  };

  return {
    upsert(input: ActionInput) {
      if (closed) return "The conversation has ended.";
      if (input.expectedToolName !== undefined &&
        (typeof input.expectedToolName !== "string" || !mutation(toolKind(input.expectedToolName)))) {
        throw new Error("expectedToolName must name a supported Google Calendar mutation tool.");
      }
      const id = input.id || input.label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      let entry = entries.get(id);
      // The real response owns bound activities. A later agent status cannot
      // reopen a completed spinner or claim an unconfirmed mutation succeeded.
      if (entry?.callId) return "This activity is controlled by the calendar tool result. Use a new ID for a new operation.";
      const kind = actionKind(input) ?? (input.expectedToolName ? toolKind(input.expectedToolName) : entry?.kind);
      if (mutation(kind) && (input.state === "complete" || input.state === "failed")) {
        return "Calendar activity completion is controlled by the actual tool result.";
      }
      if (!entry && mutation(kind)) {
        const active = [...entries.values()].filter((item) => mutation(item.kind) && item.action.state === "active");
        const candidates = active.filter((item) => item.generic && (input.expectedToolName
          ? calls.get(item.callId!)?.toolName === input.expectedToolName : active.length === 1));
        // Never guess between concurrent tool calls.
        if (candidates.length === 1) {
          entry = candidates[0];
          entries.delete(entry.action.id);
          entry.generic = false;
          entry.requestLabel = input.label;
          entry.intendedKind = kind;
          entry.expectedToolName = input.expectedToolName;
          entry.action = { ...entry.action, id, label: input.label, detail: input.detail };
          entries.set(id, entry);
          emit();
          return "The calendar activity label was updated.";
        }
      }
      if (!entry) {
        entry = { action: { ...input, id, updatedAt: Date.now() }, kind, expectedToolName: input.expectedToolName };
        entries.set(id, entry);
      } else {
        clearTimer(entry);
        entry.action = { ...input, id, updatedAt: Date.now() };
        entry.kind = kind;
        entry.expectedToolName = input.expectedToolName ?? entry.expectedToolName;
      }
      if (input.state === "active" || input.state === "pending") arm(entry);
      emit();
      return "The action display was updated.";
    },
    request(event: ToolEvent) {
      const kind = toolKind(event.tool_name);
      if (closed || !kind || retiredCalls.has(event.tool_call_id) || calls.has(event.tool_call_id)) return;
      const pending = mutation(kind) ? [...entries.values()].filter((entry) =>
        !entry.callId && mutation(entry.kind) && (entry.action.state === "active" || entry.action.state === "pending")) : [];
      const explicit = pending.filter((entry) => entry.expectedToolName === event.tool_name);
      const otherMutationRunning = [...entries.values()].some((entry) => entry.callId && mutation(entry.kind) && entry.action.state === "active");
      // Labels describe intent, not API method. Legacy matching is only safe
      // when one unpinned mutation is pending and no other mutation is running.
      const candidates = explicit.length ? explicit : pending.length === 1 && !pending[0].expectedToolName && !otherMutationRunning ? pending : [];
      let entry: Entry;
      if (candidates.length === 1) {
        entry = candidates[0];
        entry.requestLabel = entry.action.label;
        entry.intendedKind = entry.kind;
      }
      else {
        entry = { action: { id: `tool:${event.tool_call_id}`, label: presentations[kind].label, state: "active", updatedAt: Date.now() }, generic: true, kind };
        entries.set(entry.action.id, entry);
      }
      entry.callId = event.tool_call_id;
      entry.kind = kind;
      entry.action.workingLabel = presentations[kind].working;
      setState(entry, "active", entry.action.detail);
      calls.set(event.tool_call_id, { entry, settled: false, toolName: event.tool_name });
      arm(entry, event.response_timeout_secs);
      emit();
    },
    response(event: ToolEvent) {
      if (closed || !toolKind(event.tool_name)) return;
      // Request events may be disabled; still display a truthful final result.
      if (!calls.has(event.tool_call_id)) this.request(event);
      const call = calls.get(event.tool_call_id);
      if (!call || call.toolName !== event.tool_name || entries.get(call.entry.action.id) !== call.entry) return;
      if (!call.settled && call.entry.action.state === "failed") {
        const subsequent = [...calls.values()].slice([...calls.values()].indexOf(call) + 1);
        // After a timeout, a newer operation of the same kind may supersede it.
        // Retain uncertainty instead of presenting a late success as current.
        if (subsequent.some((item) => item.entry.kind === call.entry.kind)) return;
      }
      const failed = responseFailed(event);
      // Full payload errors can refine an earlier metadata success. Duplicate
      // successes cannot reverse a failure or reopen a completed activity.
      if (call.settled && (!failed || call.entry.action.state === "failed")) return;
      if (!failed && event.status && event.status !== "success") return;
      call.settled = true;
      const entry = call.entry;
      clearTimer(entry);
      entry.action.label = failed ? entry.requestLabel ?? presentations[entry.kind!].label : presentations[entry.kind!].complete;
      const context = entry.requestLabel ? `Requested: ${entry.requestLabel}. ` : "";
      const confirmation = entry.intendedKind === "update" && entry.kind !== "update"
        ? `${presentations[entry.kind!].complete}. Moving the original event has not been confirmed.`
        : "Confirmed by the calendar tool.";
      setState(entry, failed ? "failed" : "complete", failed
        ? mutation(entry.kind) ? "The calendar operation failed or was blocked. Verify the event before retrying." : "The check failed. Ask your assistant to try again."
        : mutation(entry.kind) ? context + confirmation : undefined);
      emit();
    },
    end() {
      closed = true;
      for (const entry of entries.values()) {
        clearTimer(entry);
        if (entry.action.state === "active" || entry.action.state === "pending") {
          setState(entry, "failed", mutation(entry.kind)
            ? "The conversation ended before this update was confirmed. Check the calendar before retrying."
            : "The conversation ended before this activity finished.");
        }
      }
      emit();
    },
    reset() {
      for (const entry of entries.values()) clearTimer(entry);
      for (const id of calls.keys()) retiredCalls.add(id);
      entries.clear();
      calls.clear();
      closed = false;
      emit();
    },
    dispose() {
      closed = true;
      for (const entry of entries.values()) clearTimer(entry);
    },
  };
}
