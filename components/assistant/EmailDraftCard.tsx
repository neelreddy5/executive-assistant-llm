"use client";

import { Mail, Send, X } from "lucide-react";
import { useState } from "react";
import type { EmailDraft } from "@/lib/types";

type Props = { draft: EmailDraft; onChange: (draft: EmailDraft) => void; onClose: () => void };

export function EmailDraftCard({ draft, onChange, onClose }: Props) {
  const [notice, setNotice] = useState(false);
  return (
    <section className="draft-card" aria-label="Email draft">
      <header>
        <div><Mail size={16} /><span>Email draft</span><span className="draft-pill">DRAFT</span></div>
        <button className="icon-button" onClick={onClose} aria-label="Close draft"><X size={17} /></button>
      </header>
      <label>
        <span>To</span>
        <input
          value={draft.recipientEmail ? `${draft.recipientName} <${draft.recipientEmail}>` : draft.recipientName}
          onChange={(event) => onChange({ ...draft, recipientName: event.target.value, recipientEmail: undefined })}
        />
      </label>
      <label>
        <span>Subject</span>
        <input value={draft.subject} onChange={(event) => onChange({ ...draft, subject: event.target.value })} />
      </label>
      <textarea
        aria-label="Email body"
        value={draft.body}
        onChange={(event) => onChange({ ...draft, body: event.target.value })}
      />
      <footer>
        <span>{notice ? "Demo mode — sending disabled" : "Edit here or ask your assistant"}</span>
        <button className="send-button" onClick={() => setNotice(true)}><Send size={14} /> Send</button>
      </footer>
    </section>
  );
}
