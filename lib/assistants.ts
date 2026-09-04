import type { AssistantConfig } from "./types";

export const assistants: AssistantConfig[] = [
  {
    id: "cove",
    name: "Cove",
    personality: "Composed · direct · concise",
    description: "Calm judgment with a bias toward the clearest next move.",
    agentId: process.env.NEXT_PUBLIC_COVE_AGENT_ID ?? "",
    previewAudioSrc: "/audio/cove-preview.mp3",
    accent: "#94a7ff",
  },
  {
    id: "maya",
    name: "Maya",
    personality: "Warm · empathetic · conversational",
    description: "Thoughtful coordination with a naturally human touch.",
    agentId: process.env.NEXT_PUBLIC_MAYA_AGENT_ID ?? "",
    previewAudioSrc: "/audio/maya-preview.mp3",
    accent: "#d9a7a0",
  },
  {
    id: "theo",
    name: "Theo",
    personality: "Energetic · proactive · efficient",
    description: "Forward momentum without sacrificing your control.",
    agentId: process.env.NEXT_PUBLIC_THEO_AGENT_ID ?? "",
    previewAudioSrc: "/audio/theo-preview.mp3",
    accent: "#9fc8ab",
  },
  {
    id: "avery",
    name: "Avery",
    personality: "Polished · formal · understated",
    description: "Quiet precision for a considered executive rhythm.",
    agentId: process.env.NEXT_PUBLIC_AVERY_AGENT_ID ?? "",
    previewAudioSrc: "/audio/avery-preview.mp3",
    accent: "#c8b69b",
  },
];

export const getAssistant = (id?: string | null) =>
  assistants.find((assistant) => assistant.id === id);
