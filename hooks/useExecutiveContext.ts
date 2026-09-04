"use client";

import { useEffect, useState } from "react";
import { initialExecutiveContext } from "@/lib/executive-context";
import { clearState, loadState, saveState } from "@/lib/storage";
import type { ExecutiveContext, Preferences } from "@/lib/types";

export function useExecutiveContext() {
  const [context, setContext] = useState<ExecutiveContext>(initialExecutiveContext);
  const [selectedAssistantId, setSelectedAssistantId] = useState<string>();
  const [hydrated, setHydrated] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const restored = loadState();
      if (restored) {
        setContext({ ...initialExecutiveContext, ...restored.context });
        setSelectedAssistantId(restored.selectedAssistantId);
      }
      setHydrated(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const saved = saveState({ context, selectedAssistantId });
    if (!saved) queueMicrotask(() => setStorageAvailable(false));
  }, [context, selectedAssistantId, hydrated]);

  const savePreferences = (preferences: Preferences) => {
    setContext((current) => ({
      ...current,
      preferences: { ...current.preferences, ...preferences },
      onboardingComplete: true,
    }));
  };

  const reset = () => {
    clearState();
    setContext(initialExecutiveContext);
    setSelectedAssistantId(undefined);
  };

  return {
    context,
    setContext,
    selectedAssistantId,
    setSelectedAssistantId,
    savePreferences,
    reset,
    hydrated,
    storageAvailable,
  };
}
