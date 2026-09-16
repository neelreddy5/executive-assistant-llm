"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import { parseCalendarEvents } from "@/lib/calendar-events";
import type {
  ActionState,
  AssistantAction,
  AssistantConfig,
  CalendarEvents,
  EmailDraft,
  ExecutiveContext,
  Preferences,
} from "@/lib/types";

type PreferenceInput = {
  defaultMeetingMinutes: number;
  bufferMinutes: number;
  focusTimeStart: string;
  focusTimeEnd: string;
  avoidAfter: string;
  protectFridayAfternoon: boolean;
};

type Params = {
  assistant: AssistantConfig;
  context: ExecutiveContext;
  onSavePreferences: (preferences: Preferences) => void;
};

// Filter delivery cues in captions only. Keep bracketed content such as
// [Board Review] and [insert date] intact; never rewrite the spoken audio.
export function cleanAssistantCaption(text: string): string {
  return text
    .replace(/\[(?:reassuring|warm|warmly|calm|calmly|confident|confidently|cheerful|excited|enthusiastic|empathetic|thoughtful|serious|professional|friendly|curious|sad|angry|sarcastic|sighs?|laughs?|laughing|chuckles?|whispers?|whispering|shouts?|shouting|pause|short pause|long pause)\]/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.!?;:])/g, "$1")
    .trim();
}

function voiceErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  // SDK errors can include connection URLs with short-lived credentials.
  const detail = message.replace(/(?:https?|wss?):\/\/\S+/gi, "[connection URL]").slice(0, 500);
  return detail ? `Could not connect to the voice service: ${detail}` : "Could not connect to the voice service. Please try again.";
}

export function useExecutiveAssistant({ assistant, context, onSavePreferences }: Params) {
  const [error, setError] = useState<string>();
  const [draft, setDraft] = useState<EmailDraft>();
  const [actions, setActions] = useState<AssistantAction[]>([]);
  const [lastMessage, setLastMessage] = useState("I’m ready when you are.");
  const [connecting, setConnecting] = useState(false);
  const [agenda, setAgenda] = useState<CalendarEvents>();
  const [microphoneMuted, setMicrophoneMuted] = useState(false);
  const [reconnectNeedsReload, setReconnectNeedsReload] = useState(false);
  // SDK status can become "error" after a nonfatal client-tool error while
  // the underlying audio session is still connected.
  const [transportConnected, setTransportConnected] = useState(false);
  const pending = useRef<{ controller: AbortController; timer: ReturnType<typeof setTimeout>; sdkStarted: boolean } | null>(null);
  const cancelled = useRef(false);

  const clearPending = useCallback(() => {
    if (pending.current) {
      clearTimeout(pending.current.timer);
      pending.current.controller.abort();
      pending.current = null;
    }
    setConnecting(false);
  }, []);

  const upsertAction = useCallback((input: { id?: string; label: string; detail?: string; state: ActionState }) => {
    const id = input.id || input.label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    setActions((current) => {
      const next: AssistantAction = { ...input, id, updatedAt: Date.now() };
      const existing = current.findIndex((item) => item.id === id);
      if (existing < 0) return [...current, next];
      return current.map((item, index) => (index === existing ? next : item));
    });
    return "The action display was updated.";
  }, []);

  const conversation = useConversation({
    // Controlled input mute is applied by the SDK when a session is created,
    // including when the user mutes before connecting.
    micMuted: microphoneMuted,
    onConnect: () => {
      if (cancelled.current) {
        conversation.endSession();
        return;
      }
      clearPending();
      setTransportConnected(true);
      setError(undefined);
    },
    onStatusChange: ({ status }) => {
      if (status === "disconnected" || status === "disconnecting") setTransportConnected(false);
    },
    onDisconnect: (details) => {
      clearPending();
      setTransportConnected(false);
      if (details.reason === "error") setError(voiceErrorMessage(details.message));
      else if (details.reason === "agent") setError("The assistant ended the conversation. You can reconnect when ready.");
    },
    onError: (message, details) => {
      // Tool failures do not mean the audio connection failed. The SDK still
      // sends an is_error tool response so the agent can correct its arguments.
      if (details && typeof details === "object" && "clientToolName" in details) {
        upsertAction({ id: "tool-error", label: "An assistant action failed", detail: "Please ask the assistant to retry the action.", state: "failed" });
        return;
      }
      clearPending();
      setError(voiceErrorMessage(message));
    },
    onMessage: (message) => {
      const event = message as unknown as { message?: string; source?: string };
      if (event.source === "ai" && event.message) setLastMessage(cleanAssistantCaption(event.message));
    },
    clientTools: {
      show_calendar_events: async (input: unknown) => {
        try {
          const result = parseCalendarEvents(input);
          setAgenda(result);
          upsertAction({ id: "calendar-display", label: "Calendar agenda updated", state: "complete" });
          return "The calendar agenda is now displayed. You can summarize the retrieved events.";
        } catch (error) {
          upsertAction({ id: "calendar-display", label: "Could not display calendar results", detail: "Previous agenda retained, if available.", state: "failed" });
          throw new Error(error instanceof Error ? error.message : "Invalid calendar results.");
        }
      },
      save_preferences: async (input: PreferenceInput) => {
        onSavePreferences({
          defaultMeetingMinutes: input.defaultMeetingMinutes,
          bufferMinutes: input.bufferMinutes,
          focusTime: { start: input.focusTimeStart, end: input.focusTimeEnd },
          avoidAfter: input.avoidAfter,
          protectFridayAfternoon: input.protectFridayAfternoon,
        });
        upsertAction({ id: "preferences", label: "Scheduling preferences saved", state: "complete" });
        return "Preferences saved. Continue naturally into normal assistant mode.";
      },
      get_preferences: async () => JSON.stringify(context.preferences),
      show_email_draft: async (input: EmailDraft) => {
        setDraft(input);
        upsertAction({ id: "email-draft", label: `Drafting a note to ${input.recipientName}`, state: "complete" });
        return "The email draft is now visible. It has not been sent.";
      },
      update_email_draft: async (input: { subject?: string; body?: string }) => {
        setDraft((current) => current ? { ...current, ...input } : current);
        upsertAction({ id: "email-draft", label: "Email draft updated", state: "complete" });
        return "The visible email draft was updated. It has not been sent.";
      },
      set_action_status: async (input: { id?: string; label: string; detail?: string; state: ActionState }) =>
        upsertAction(input),
    },
  });

  const connected = transportConnected || conversation.status === "connected";

  const start = useCallback(async () => {
    // This SDK cannot abort a stalled transport handshake. A fresh provider is
    // needed after cancelling one; do not silently retry its still-held lock.
    if (reconnectNeedsReload) { window.location.reload(); return; }
    if (pending.current || connected || conversation.status === "connecting") return;
    if (!assistant.agentId) {
      setError(`Add ${assistant.name}’s agent ID to your environment before starting.`);
      return;
    }
    setError(undefined);
    setConnecting(true);
    cancelled.current = false;
    const controller = new AbortController();
    const attempt = {
      controller,
      sdkStarted: false,
      timer: setTimeout(() => {
        cancelled.current = true;
        setReconnectNeedsReload(attempt.sdkStarted);
        clearPending();
        setTransportConnected(false);
        conversation.endSession();
        setError("Connecting took too long. Check microphone access and your connection, then try again. If it persists, reload this page.");
      }, 30_000),
    };
    pending.current = attempt;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // The SDK opens its own stream; release this permission-check stream.
      stream.getTracks().forEach((track) => track.stop());
      if (pending.current !== attempt) return;
    } catch {
      if (pending.current !== attempt) return;
      clearPending();
      setError("Microphone access is needed for a voice conversation. Allow access in your browser and try again.");
      return;
    }

    try {
      const credential = await fetch(`/api/elevenlabs/session?agentId=${encodeURIComponent(assistant.agentId)}`, { cache: "no-store", signal: controller.signal });
      const data = await credential.json() as { signedUrl?: string; code?: string; error?: string };
      if (pending.current !== attempt) return;
      if (credential.ok) {
        if (!data.signedUrl) throw new Error("The server did not return a voice-session credential.");
        attempt.sdkStarted = true;
        await conversation.startSession({ signedUrl: data.signedUrl, connectionType: "websocket" });
      } else if (credential.status === 503 && data.code === "PUBLIC_AGENT_ONLY") {
        attempt.sdkStarted = true;
        await conversation.startSession({ agentId: assistant.agentId, connectionType: "webrtc" });
      } else {
        throw new Error(data.error || `Voice-session authorization failed (${credential.status}).`);
      }
    } catch (error) {
      if (pending.current !== attempt) return;
      clearPending();
      setError(voiceErrorMessage(error));
    }
  }, [assistant.agentId, assistant.name, clearPending, connected, conversation, reconnectNeedsReload]);

  const stop = useCallback(async () => {
    cancelled.current = true;
    setReconnectNeedsReload(pending.current?.sdkStarted ?? false);
    clearPending();
    setTransportConnected(false);
    await conversation.endSession();
  }, [clearPending, conversation]);

  const endSession = conversation.endSession;
  useEffect(() => () => {
    cancelled.current = true;
    if (pending.current) {
      clearTimeout(pending.current.timer);
      pending.current.controller.abort();
      pending.current = null;
    }
    endSession();
  }, [endSession]);

  const toggleMicrophoneMuted = useCallback(() => {
    const next = !microphoneMuted;
    // Stop microphone chunks immediately; the controlled option reapplies on reconnect.
    if (connected) {
      try { conversation.setMuted(next); }
      catch { /* A disconnect may release the SDK session before React updates. */ }
    }
    setMicrophoneMuted(next);
  }, [connected, conversation, microphoneMuted]);

  const status = useMemo(() => {
    if (error) return "error" as const;
    if (connecting) return "connecting" as const;
    if (!connected) return "idle" as const;
    return conversation.isSpeaking ? "speaking" as const : "listening" as const;
  }, [connected, connecting, conversation.isSpeaking, error]);

  return {
    status,
    connected,
    start,
    stop,
    error,
    draft,
    setDraft,
    actions,
    lastMessage,
    agenda,
    microphoneMuted,
    toggleMicrophoneMuted,
    reconnectNeedsReload,
  };
}
