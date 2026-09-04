"use client";

import { useCallback, useMemo, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import type {
  ActionState,
  AssistantAction,
  AssistantConfig,
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

export function useExecutiveAssistant({ assistant, context, onSavePreferences }: Params) {
  const [error, setError] = useState<string>();
  const [draft, setDraft] = useState<EmailDraft>();
  const [actions, setActions] = useState<AssistantAction[]>([]);
  const [lastMessage, setLastMessage] = useState("I’m ready when you are.");
  const [connecting, setConnecting] = useState(false);

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
    onConnect: () => {
      setConnecting(false);
      setError(undefined);
    },
    onDisconnect: () => setConnecting(false),
    onError: () => {
      setConnecting(false);
      setError("The voice session was interrupted. Please try connecting again.");
    },
    onMessage: (message) => {
      const event = message as unknown as { message?: string; source?: string };
      if (event.source === "ai" && event.message) setLastMessage(event.message);
    },
    clientTools: {
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

  const start = useCallback(async () => {
    if (!assistant.agentId) {
      setError(`Add ${assistant.name}’s agent ID to your environment before starting.`);
      return;
    }
    setError(undefined);
    setConnecting(true);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setConnecting(false);
      setError("Microphone access is needed for a voice conversation. Allow access in your browser and try again.");
      return;
    }

    try {
      const credential = await fetch(`/api/elevenlabs/session?agentId=${encodeURIComponent(assistant.agentId)}`);
      if (credential.ok) {
        const { signedUrl } = (await credential.json()) as { signedUrl: string };
        await conversation.startSession({ signedUrl });
      } else {
        await conversation.startSession({ agentId: assistant.agentId, connectionType: "webrtc" });
      }
    } catch {
      setConnecting(false);
      setError("I couldn’t connect to the voice service. Check the agent configuration and try again.");
    }
  }, [assistant.agentId, assistant.name, conversation]);

  const stop = useCallback(async () => {
    await conversation.endSession();
  }, [conversation]);

  const status = useMemo(() => {
    if (error) return "error" as const;
    if (connecting) return "connecting" as const;
    if (conversation.status !== "connected") return "idle" as const;
    return conversation.isSpeaking ? "speaking" as const : "listening" as const;
  }, [connecting, conversation.isSpeaking, conversation.status, error]);

  return {
    status,
    connected: conversation.status === "connected",
    start,
    stop,
    error,
    draft,
    setDraft,
    actions,
    lastMessage,
  };
}
