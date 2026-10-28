"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { sendReply, type ReplyState } from "@/app/actions";
import { SendIcon } from "./icons";

/** Reply box. Enter sends, Shift+Enter adds a new line. */
export function Composer({ waId }: { waId: string }) {
  const [state, action, pending] = useActionState<ReplyState, FormData>(sendReply, {});
  // Controlled, so a failed send keeps the text instead of the form resetting it.
  const [text, setText] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (state.sentAt) {
      setText("");
      inputRef.current?.focus();
    }
  }, [state.sentAt]);

  return (
    <form ref={formRef} action={action} className="composer">
      {state.error && (
        <p className="composer-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="composer-row">
        <input type="hidden" name="wa_id" value={waId} />
        <textarea
          ref={inputRef}
          name="text"
          rows={1}
          maxLength={4096}
          placeholder="Type a reply"
          aria-label="Reply"
          value={text}
          onChange={(e) => setText(e.target.value)}
          readOnly={pending}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (!pending && text.trim()) formRef.current?.requestSubmit();
            }
          }}
        />
        <button type="submit" className="send-button" disabled={pending || !text.trim()} aria-label="Send">
          {pending ? <span className="spinner" /> : <SendIcon />}
        </button>
      </div>
    </form>
  );
}
