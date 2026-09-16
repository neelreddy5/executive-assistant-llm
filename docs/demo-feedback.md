# Initial demo tuning

## Caption delivery tags

`cleanAssistantCaption` in `hooks/useExecutiveAssistant.ts` strips known delivery cues (including `[reassuring]`) before showing the agent's message. This is display-only: expressive audio is unchanged. The filter deliberately preserves other bracketed content such as `[Board Review]`. Add newly observed delivery cues to the allowlist if needed.

## Progressive captions: proposed follow-up

The current implementation displays complete messages from `onMessage`. It does not yet stream captions.

- Generated-text streaming: use `onAgentChatResponsePart` start/delta/stop events and enable `agent_chat_response_part` in each agent's `client_events`. Estimated engineering effort: 2–4 hours including interruption, turn-boundary, split-tag filtering, final-message reconciliation, and fallback checks. Text may appear ahead of spoken audio.
- Speech-timed captions: use `onAudioAlignment` character timing and align display to actual playback, accounting for buffering and interruption. Estimated effort: 1–2 engineering days including live verification of the timing events on the configured agents and WebRTC/WebSocket transport paths. This is the recommended behavior for text that appears as the assistant speaks.

These are planning estimates, not measured timings or guarantees. First verify event availability with the configured agent. Keep complete-message fallback if timing events are unavailable. Do not substitute a fixed typing animation and call it synchronized speech.

## Conciseness: apply manually to all four ElevenLabs agents

Add the following to the shared system prompt while retaining confirmation requirements and each assistant's personality:

```text
EXECUTIVE COMMUNICATION
- For routine successful actions, confirm the outcome in one short sentence, usually under 20 words.
- Include only the event name and relevant date/time. Do not repeat implications already obvious from the action.
- Do not append generic questions such as "Is there anything else you'd like to schedule or review?" after each completed task. Pause and let Alex lead.
- Give additional context only for a conflict, failure, ambiguity, material consequence, or when Alex asks.
- Before material calendar writes, still get explicit confirmation. Never omit important details to meet a word limit.
- After saving preferences, say "Preferences saved. What can I help you with?" Do not recite every preference unless asked.
- Keep delivery natural and brisk, with warmth expressed through tone rather than extra sentences.

Example after a successful calendar write:
"Done—lunch is blocked for Monday, September 14, noon to 12:30."
```

Remove or reconcile older prompt instructions that demand lengthy confirmations or full preference recaps. Publish/save each agent's updated configuration as required in your workspace. These changes are in ElevenLabs, not Vercel or local React state.

## Speaking speed

In each agent's Voice settings, audition a speed of **1.1** as a starting point; compare against the current value and tune per voice. ElevenLabs documents a supported range of 0.7–1.2. Save/publish the configuration and start a fresh conversation to test. This does not alter the static preview MP3s; regenerate those separately only if you want matching preview delivery.

## End conversation

Both onboarding and dashboard now use a visibly bounded button with a phone-hang-up icon. The original control was already a semantic button; the outlined square icon caused the checkbox appearance.

## Release and verify

Local UI changes need to be committed, pushed, and deployed before they appear on Vercel. Agent prompt and voice setting changes must be applied separately in ElevenLabs. Test all four voices for concise confirmations, microphone release on hang-up, readable captions without delivery cues, and the required pre-write confirmation. Streaming captions remain a follow-up, not part of these UI changes.

References:
- https://elevenlabs.io/docs/eleven-agents/libraries/react
- https://elevenlabs.io/docs/eleven-agents/customization/voice/speed-control
- https://elevenlabs.io/docs/eleven-agents/customization/voice/expressive-mode
