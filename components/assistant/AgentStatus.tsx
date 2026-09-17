import type { AssistantConfig } from "@/lib/types";

type Props = {
  assistant: AssistantConfig;
  status: "idle" | "connecting" | "listening" | "speaking" | "working" | "error";
  workingLabel?: string;
  muted?: boolean;
};

const labels = {
  idle: "Ready when you are",
  connecting: "Joining you…",
  listening: "Listening",
  speaking: "Speaking",
  working: "Working…",
  error: "Needs your attention",
};

export function AgentStatus({ assistant, status, muted = false, workingLabel }: Props) {
  return (
    <div className="agent-status">
      <span className={`status-dot ${status}`} />
      <span>{assistant.name}</span>
      <span className="status-divider">/</span>
      <span className="status-copy" role="status">{muted && status !== "error" ? "Microphone muted" : status === "working" ? workingLabel || labels.working : labels[status]}</span>
    </div>
  );
}
