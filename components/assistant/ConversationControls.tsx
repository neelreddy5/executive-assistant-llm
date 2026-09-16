import { PhoneOff, Volume2, VolumeX } from "lucide-react";

type Props = {
  muted: boolean;
  onToggleMute: () => void;
  onStop: () => void;
};

export function ConversationControls({ muted, onToggleMute, onStop }: Props) {
  const SpeakerIcon = muted ? VolumeX : Volume2;
  return (
    <div className="conversation-controls">
      <div className="conversation-buttons">
        <button type="button" className="mute-assistant-button" aria-pressed={muted} onClick={onToggleMute}>
          <SpeakerIcon size={16} aria-hidden="true" /> {muted ? "Unmute assistant" : "Mute assistant"}
        </button>
        <button type="button" className="end-conversation-button" onClick={onStop}>
          <PhoneOff size={16} aria-hidden="true" /> End conversation
        </button>
      </div>
      <p className="mute-hint" role="status">{muted ? "Assistant audio muted · microphone still on" : ""}</p>
    </div>
  );
}
