"use client";

type Props = {
  state: "idle" | "connecting" | "listening" | "speaking" | "error";
  accent: string;
  onClick?: () => void;
};

export function VoiceOrb({ state, accent, onClick }: Props) {
  return (
    <button
      className={`voice-orb ${state}`}
      style={{ "--accent": accent } as React.CSSProperties}
      onClick={onClick}
      aria-label={state === "idle" ? "Start voice conversation" : `Assistant is ${state}`}
    >
      <span className="orb-glow" />
      <span className="orb-core" />
      <span className="orb-wave wave-one" />
      <span className="orb-wave wave-two" />
    </button>
  );
}
