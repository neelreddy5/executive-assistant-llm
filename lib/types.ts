export type AssistantConfig = {
  id: string;
  name: string;
  personality: string;
  description: string;
  agentId: string;
  previewAudioSrc: string;
  accent: string;
};

export type Contact = {
  name: string;
  title: string;
  email: string;
};

export type Preferences = {
  defaultMeetingMinutes?: number;
  bufferMinutes?: number;
  focusTime?: { start: string; end: string };
  avoidAfter?: string;
  protectFridayAfternoon?: boolean;
};

export interface ExecutiveContext {
  profile: {
    name: string;
    email?: string;
    title: string;
    timezone: string;
  };
  contacts: Contact[];
  preferences: Preferences;
  onboardingComplete: boolean;
}

export type EmailDraft = {
  recipientName: string;
  recipientEmail?: string;
  subject: string;
  body: string;
};

export type ActionState = "pending" | "active" | "complete" | "failed";
export type AssistantAction = {
  id: string;
  label: string;
  detail?: string;
  state: ActionState;
  updatedAt: number;
};
