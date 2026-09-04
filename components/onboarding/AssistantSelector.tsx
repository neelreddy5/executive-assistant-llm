"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { assistants } from "@/lib/assistants";
import { useAudioPreview } from "@/hooks/useAudioPreview";
import { AssistantCard } from "./AssistantCard";

type Props = { onSelect: (id: string) => void };

export function AssistantSelector({ onSelect }: Props) {
  const [selected, setSelected] = useState(assistants[0].id);
  const { play, stop, playingId, audioError } = useAudioPreview();
  const choice = assistants.find((item) => item.id === selected)!;

  return (
    <main className="selector-stage page-shell">
      <header className="selector-header">
        <div className="brand-lockup"><span className="brand-dot" /> ALEX / ASSISTANT</div>
        <span className="step-label">02 — Choose a voice</span>
      </header>
      <section className="selector-intro">
        <p className="eyebrow">A working style that feels right</p>
        <h1>Who would you like<br />by your side?</h1>
        <p>Each assistant shares the same capabilities and context. Their voice and point of view are distinctly their own.</p>
      </section>
      <div className="assistant-grid">
        {assistants.map((assistant) => (
          <AssistantCard
            key={assistant.id}
            assistant={assistant}
            active={selected === assistant.id}
            playing={playingId === assistant.id}
            onEnter={() => play(assistant.id, assistant.previewAudioSrc)}
            onLeave={stop}
            onSelect={() => setSelected(assistant.id)}
          />
        ))}
      </div>
      <footer className="selector-footer">
        <span className="inline-error" role="status">{audioError}</span>
        <button className="primary-button" onClick={() => { stop(); onSelect(selected); }}>
          Continue with {choice.name} <ArrowRight size={17} />
        </button>
      </footer>
    </main>
  );
}
