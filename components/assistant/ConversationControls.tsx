import { Mic, MicOff, PhoneOff } from "lucide-react";

type Props = {
  muted: boolean;
  onToggleMute: () => void;
  onStop: () => void;
  connected: boolean;
  connecting: boolean;
};

export function ConversationControls({ muted, onToggleMute, onStop, connected, connecting }: Props) {
  const MicrophoneIcon = muted ? MicOff : Mic;
  return (
    <div className="conversation-controls">
      <div className="conversation-buttons">
        <button type="button" className="microphone-mute-button" aria-pressed={muted} onClick={onToggleMute}>
          <MicrophoneIcon size={16} aria-hidden="true" /> {muted ? "Unmute microphone" : "Mute microphone"}
        </button>
        {(connected || connecting) && <button type="button" className="end-conversation-button" onClick={onStop}>
          <PhoneOff size={16} aria-hidden="true" /> {connecting ? "Cancel connection" : "End conversation"}
        </button>}
      </div>
      <p className="mute-hint" role="status">{muted ? (connected ? "Microphone muted · the assistant cannot hear you" : "Microphone will be muted when you connect") : ""}</p>
    </div>
  );
}
