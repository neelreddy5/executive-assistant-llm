"use client";

import { CalendarDays, ChevronDown, Mic, RotateCcw, Square } from "lucide-react";
import { ActionStatus } from "./ActionStatus";
import { AgentStatus } from "./AgentStatus";
import { EmailDraftCard } from "./EmailDraftCard";
import { VoiceOrb } from "./VoiceOrb";
import { useExecutiveAssistant } from "@/hooks/useExecutiveAssistant";
import type { AssistantConfig, ExecutiveContext, Preferences } from "@/lib/types";

type Props = {
  assistant: AssistantConfig;
  context: ExecutiveContext;
  onSavePreferences: (preferences: Preferences) => void;
  onReset: () => void;
};

export function ExecutiveAssistant({ assistant, context, onSavePreferences, onReset }: Props) {
  const session = useExecutiveAssistant({ assistant, context, onSavePreferences });
  const onboarding = !context.onboardingComplete;

  return (
    <main className={`assistant-shell ${onboarding ? "preference-mode" : "dashboard-mode"}`}>
      <header className="app-header">
        <div className="brand-lockup"><span className="brand-dot" /> ALEX / ASSISTANT</div>
        <div className="header-right">
          <span className="calendar-ready"><CalendarDays size={14} /> Calendar ready</span>
          <button className="reset-button" onClick={onReset}><RotateCcw size={14} /> Reset onboarding</button>
        </div>
      </header>

      {onboarding ? (
        <section className="preference-content">
          <p className="eyebrow">A quick conversation</p>
          <h1>Let’s shape how {assistant.name}<br />manages your time.</h1>
          <p className="lede">Your assistant will learn your meeting rhythm, focus time, and boundaries naturally.</p>
          <VoiceOrb state={session.status} accent={assistant.accent} onClick={!session.connected ? session.start : undefined} />
          <AgentStatus assistant={assistant} status={session.status} />
          {!session.connected && session.status !== "connecting" && (
            <button className="primary-button voice-start" onClick={session.start}><Mic size={17} /> Start voice setup</button>
          )}
          {session.connected && (
            <button className="quiet-button" onClick={session.stop}><Square size={12} /> End conversation</button>
          )}
          {session.error && <p className="session-error" role="alert">{session.error}</p>}
          <p className="privacy-note">Preferences stay in this browser. Calendar access remains with your ElevenLabs agent.</p>
        </section>
      ) : (
        <div className="dashboard-grid">
          <section className="voice-workspace">
            <div className="executive-greeting">
              <p className="eyebrow">Good afternoon, Alex</p>
              <h1>What can I take<br />off your plate?</h1>
            </div>
            <div className="voice-center">
              <VoiceOrb state={session.status} accent={assistant.accent} onClick={!session.connected ? session.start : undefined} />
              <AgentStatus assistant={assistant} status={session.status} />
              <p className="spoken-caption">“{session.lastMessage}”</p>
              {!session.connected && session.status !== "connecting" ? (
                <button className="primary-button voice-start" onClick={session.start}><Mic size={17} /> Speak with {assistant.name}</button>
              ) : session.connected ? (
                <button className="quiet-button" onClick={session.stop}><Square size={12} /> End conversation</button>
              ) : null}
              {session.error && <p className="session-error" role="alert">{session.error}</p>}
            </div>
            <div className="preference-strip">
              <span>Meeting rhythm</span>
              <strong>{context.preferences.defaultMeetingMinutes ?? 30} min</strong>
              <i />
              <span>Buffer</span>
              <strong>{context.preferences.bufferMinutes ?? 15} min</strong>
              <i />
              <span>Focus</span>
              <strong>{context.preferences.focusTime?.start ?? "—"}–{context.preferences.focusTime?.end ?? "—"}</strong>
              <ChevronDown size={14} />
            </div>
          </section>
          <section className="context-rail">
            <ActionStatus actions={session.actions} />
            {session.draft && (
              <EmailDraftCard draft={session.draft} onChange={session.setDraft} onClose={() => session.setDraft(undefined)} />
            )}
          </section>
        </div>
      )}
    </main>
  );
}
