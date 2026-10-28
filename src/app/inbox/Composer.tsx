"use client";

import { useActionState, useEffect, useRef } from "react";
import { sendReply, type ReplyState } from "@/app/actions";
import { SendIcon } from "./icons";

/** Reply box. Enter sends, Shift+Enter adds a new line. */
export function Composer({ waId }: { waId: string }) {
  const [state, action, pending] = useActionState<ReplyState, FormData>(sendReply, {});
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (state.sentAt) {
      formRef.current?.reset();
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
          disabled={pending}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
        />
        <button type="submit" className="send-button" disabled={pending} aria-label="Send">
          {pending ? <span className="spinner" /> : <SendIcon />}
        </button>
      </div>
    </form>
  );
}
