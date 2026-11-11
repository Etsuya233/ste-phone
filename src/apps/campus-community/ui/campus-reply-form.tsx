import { useState, type RefObject } from "react";
import { Button } from "../../../frontend/foundation/button.tsx";

export function CampusReplyForm({
  input,
  replyName,
  busy,
  onCancel,
  onSend,
}: {
  input: RefObject<HTMLInputElement | null>;
  replyName: string | null;
  busy: boolean;
  onCancel: () => void;
  onSend: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  return (
    <form
      className="campus-reply"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!busy && text.trim() && (await onSend(text.trim()))) {
          setText("");
        }
      }}
    >
      {replyName ? (
        <div className="campus-reply-target">
          <span>回复 {replyName}</span>
          <Button aria-label="取消回复" disabled={busy} onClick={onCancel}>
            ×
          </Button>
        </div>
      ) : null}
      <div className="campus-row">
        <input
          ref={input}
          aria-label="评论正文"
          placeholder="写一条评论…"
          value={text}
          disabled={busy}
          onChange={(event) => setText(event.target.value)}
        />
        <Button type="submit" disabled={busy || !text.trim()}>
          发送
        </Button>
      </div>
    </form>
  );
}
