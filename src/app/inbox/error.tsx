"use client";

export default function InboxError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="login">
      <div className="login-card">
        <h1>Something went wrong</h1>
        <p className="muted">The inbox couldn't load. This is usually a temporary connection problem.</p>
        <button type="button" className="primary-button" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
