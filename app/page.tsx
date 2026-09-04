"use client";

import { useCallback, useState } from "react";
import { ExecutiveAssistant } from "@/components/assistant/ExecutiveAssistant";
import { AssistantSelector } from "@/components/onboarding/AssistantSelector";
import { GoogleConnectStep } from "@/components/onboarding/GoogleConnectStep";
import { useExecutiveContext } from "@/hooks/useExecutiveContext";
import { getAssistant } from "@/lib/assistants";

export default function Home() {
  const state = useExecutiveContext();
  const [calendarReady, setCalendarReady] = useState(false);
  const markCalendarReady = useCallback(() => setCalendarReady(true), []);

  if (!state.hydrated) return <main className="loading-screen"><span className="brand-dot pulse" /></main>;

  const assistant = getAssistant(state.selectedAssistantId);
  if (!calendarReady && !assistant) return <GoogleConnectStep onComplete={markCalendarReady} />;
  if (!assistant) return <AssistantSelector onSelect={state.setSelectedAssistantId} />;

  return (
    <>
      {!state.storageAvailable && <div className="storage-warning">Preferences will last for this visit only.</div>}
      <ExecutiveAssistant
        assistant={assistant}
        context={state.context}
        onSavePreferences={state.savePreferences}
        onReset={() => { state.reset(); setCalendarReady(false); }}
      />
    </>
  );
}
