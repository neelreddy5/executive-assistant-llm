"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, Check, LoaderCircle } from "lucide-react";

type Props = { onComplete: () => void };

export function GoogleConnectStep({ onComplete }: Props) {
  const [state, setState] = useState<"idle" | "connecting" | "connected">("idle");

  useEffect(() => {
    if (state !== "connecting") return;
    const connected = window.setTimeout(() => setState("connected"), 1050);
    const next = window.setTimeout(onComplete, 2050);
    return () => {
      window.clearTimeout(connected);
      window.clearTimeout(next);
    };
  }, [state, onComplete]);

  return (
    <main className="center-stage onboarding-stage">
      <div className="brand-mark"><span>AM</span></div>
      <p className="eyebrow">Your working day, thoughtfully managed</p>
      <h1>Meet your executive<br />assistant.</h1>
      <p className="lede">
        A voice-first partner for Alex Morgan that understands your time,
        handles coordination, and keeps you in control.
      </p>

      <button
        className={`primary-button connect-button ${state}`}
        onClick={() => state === "idle" && setState("connecting")}
        disabled={state !== "idle"}
      >
        <span className="button-icon">
          {state === "idle" && <CalendarDays size={18} />}
          {state === "connecting" && <LoaderCircle className="spin" size={18} />}
          {state === "connected" && <Check size={18} />}
        </span>
        {state === "idle" && "Connect Google Calendar"}
        {state === "connecting" && "Connecting calendar…"}
        {state === "connected" && "Calendar connected"}
        {state === "idle" && <ArrowRight size={17} />}
      </button>
      <p className="microcopy">
        {state === "connected"
          ? "Your calendar context is ready"
          : "Demo connection — calendar access is configured securely in ElevenLabs"}
      </p>
    </main>
  );
}
