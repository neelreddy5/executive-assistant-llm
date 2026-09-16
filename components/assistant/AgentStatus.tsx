import type { AssistantConfig } from "@/lib/types";

type Props = {
  assistant: AssistantConfig;
  status: "idle" | "connecting" | "listening" | "speaking" | "error";
  muted?: boolean;
};

const labels = {
  idle: "Ready when you are",
  connecting: "Joining you…",
  listening: "Listening",
  speaking: "Speaking",
  error: "Needs your attention",
};

export function AgentStatus({ assistant, status, muted = false }: Props) {
  return (
    <div className="agent-status">
      <span className={`status-dot ${status}`} />
      <span>{assistant.name}</span>
      <span className="status-divider">/</span>
      <span className="status-copy">{muted && status !== "error" ? "Microphone muted" : labels[status]}</span>
    </div>
  );
}
