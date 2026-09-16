# Calendar sidebar and microphone mute

The app handles the ElevenLabs `show_calendar_events` client tool with the supplied schema: `rangeStart`, exclusive `rangeEnd`, IANA `timezone`, and `events` with `id`, `title`, `start`, `end`, and `allDay`.

Valid calls replace the current agenda in session memory. Empty results display an empty agenda; invalid calls fail and retain the previous results. All-day end dates remain exclusive. Timed events display in the requested timezone, with multi-day events repeated on each occupied day. Duplicate event IDs are collapsed; recurring occurrence IDs remain separate.

The agent must retrieve real calendar results and invoke this display tool before summarizing them. The handler acknowledges receipt without waiting for narration. Loading/retrieval errors can use the existing `set_action_status` tool, because the calendar display call arrives only after retrieval. The supplied schema has no query identifier; display updates follow tool-call arrival order. It does not provide exact speech-synchronized highlighting.

The mute button controls microphone input through the ElevenLabs SDK. While muted, captured speech is not transmitted: WebRTC mutes its microphone track, while the WebSocket audio worklet replaces microphone samples with silence. Assistant playback, captions, and calendar updates continue. The choice survives disconnect/reconnect while the component remains mounted, and resets after a reload/reset. Both onboarding and dashboard share the same controls. No ElevenLabs follow-up configuration is changed.

The microphone control is visible before connecting as well as during a session. Muting before connection starts the session with input muted. Connection attempts have a 30-second timeout and a Cancel connection control. Cancelling before SDK startup aborts credential requests and ignores late microphone permission results. If a transport handshake has already started, recovery offers Reload voice session: the installed SDK cannot abort its pending handshake lock immediately. Duplicate starts are ignored, and unmounting the assistant ends the session.

The app tracks successful connection/disconnection events separately from SDK error status. In the installed SDK, a failed client tool sets its general status to `error` without disconnecting audio. Tool errors therefore stay in the activity panel and do not expose a false reconnect button. Microphone state uses the SDK's controlled `micMuted` option and its immediate `setMuted` input control.

## Verification

- Run `node --test tests/voice-session.test.mjs`, `npm run lint`, and `npm run build`.
- In a live session, request a populated week and an empty week; confirm the sidebar precedes the spoken summary and subsequent queries replace it.
- Check an all-day multi-day event, a recurring occurrence, and timed events spanning midnight or a daylight-saving transition.
- Mute while speaking, verify the agent receives no further microphone audio while playback, captions, and calendar tools continue, then unmute.
- End and reconnect while muted, checking that microphone input remains blocked. Repeat for private-agent WebSocket and public-agent WebRTC sessions, in onboarding and dashboard.
- Inspect desktop/mobile layout, keyboard focus, button labels, and scrolling through a busy agenda.

Automated tests mock the SDK boundary; they cannot establish real audio behavior or whether the configured agent invokes the display tool at the intended point. App changes require deployment before they appear on the hosted site.
