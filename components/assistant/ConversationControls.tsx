import { PhoneOff, Volume2, VolumeX } from "lucide-react";

type Props = {
  muted: boolean;
  onToggleMute: () => void;
  onStop: () => void;
  connected: boolean;
  connecting: boolean;
};

export function ConversationControls({ muted, onToggleMute, onStop, connected, connecting }: Props) {
  const SpeakerIcon = muted ? VolumeX : Volume2;
  return (
    <div className="conversation-controls">
      <div className="conversation-buttons">
        <button type="button" className="mute-assistant-button" aria-pressed={muted} onClick={onToggleMute}>
          <SpeakerIcon size={16} aria-hidden="true" /> {muted ? "Unmute assistant" : "Mute assistant"}
        </button>
        {(connected || connecting) && <button type="button" className="end-conversation-button" onClick={onStop}>
          <PhoneOff size={16} aria-hidden="true" /> {connecting ? "Cancel connection" : "End conversation"}
        </button>}
      </div>
      <p className="mute-hint" role="status">{muted ? (connected ? "Assistant audio muted · microphone still on" : "Assistant will connect with audio muted") : ""}</p>
    </div>
  );
}
