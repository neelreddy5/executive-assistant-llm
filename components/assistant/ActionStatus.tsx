import { AlertCircle, Check, Circle, LoaderCircle } from "lucide-react";
import type { AssistantAction } from "@/lib/types";

function StateIcon({ state }: { state: AssistantAction["state"] }) {
  if (state === "active") return <LoaderCircle className="spin" size={15} />;
  if (state === "complete") return <Check size={15} />;
  if (state === "failed") return <AlertCircle size={15} />;
  return <Circle size={10} />;
}

export function ActionStatus({ actions }: { actions: AssistantAction[] }) {
  return (
    <aside className="action-panel" aria-label="Assistant activity" aria-live="polite">
      <div className="panel-heading">
        <span>In progress</span><span className="quiet-label">LIVE</span>
      </div>
      {actions.length === 0 ? (
        <div className="action-empty">When I take action, you’ll see it here.</div>
      ) : (
        <div className="action-list">
          {actions.slice(-5).map((action) => (
            <div className={`action-row ${action.state}`} key={action.id}>
              <span className="action-icon"><StateIcon state={action.state} /></span>
              <span><strong>{action.label}</strong>{action.detail && <small>{action.detail}</small>}</span>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
