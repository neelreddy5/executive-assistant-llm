"use client";

import { Check, Volume2 } from "lucide-react";
import type { AssistantConfig } from "@/lib/types";

type Props = {
  assistant: AssistantConfig;
  active: boolean;
  playing: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onSelect: () => void;
};

export function AssistantCard({ assistant, active, playing, onEnter, onLeave, onSelect }: Props) {
  return (
    <button
      className={`assistant-card ${active ? "selected" : ""}`}
      style={{ "--accent": assistant.accent } as React.CSSProperties}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={onSelect}
      aria-pressed={active}
    >
      <span className="card-topline">
        <span className="preview-state">
          <Volume2 size={14} /> {playing ? "Playing preview" : "Hover to hear"}
        </span>
        {active && <Check size={16} />}
      </span>
      <span className={`mini-orb ${playing ? "playing" : ""}`} aria-hidden="true" />
      <span className="assistant-name">{assistant.name}</span>
      <span className="assistant-personality">{assistant.personality}</span>
      <span className="assistant-description">{assistant.description}</span>
    </button>
  );
}
