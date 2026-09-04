import type { ExecutiveContext } from "./types";

const KEY = "alex-assistant-state-v1";

export type PersistedState = {
  selectedAssistantId?: string;
  context: ExecutiveContext;
};

export function loadState(): PersistedState | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return value ? (JSON.parse(value) as PersistedState) : null;
  } catch {
    return null;
  }
}

export function saveState(state: PersistedState) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearState() {
  try {
    window.localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}
