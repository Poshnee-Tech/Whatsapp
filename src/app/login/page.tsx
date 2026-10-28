import { redirect } from "next/navigation";
import { login } from "@/app/actions";
import { hasSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in · Poshnee WhatsApp", robots: { index: false, follow: false } };

const ERRORS: Record<string, string> = {
  password: "That password isn't right. Try again.",
  config: "The inbox isn't set up yet: add INBOX_PASSWORD and INBOX_SESSION_SECRET in Vercel, then redeploy.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const configured = !!process.env.INBOX_PASSWORD && !!process.env.INBOX_SESSION_SECRET;
  if (configured && (await hasSession())) redirect("/inbox");
  const { error } = await searchParams;
  const message = configured ? (error ? ERRORS[error] : undefined) : ERRORS.config;

  return (
    <main className="login">
      <form action={login} className="login-card">
        <span className="brand-mark large">P</span>
        <h1>Poshnee WhatsApp</h1>
        <p className="muted">Sign in to the staff inbox</p>

        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
        {message && (
          <p className="form-error" role="alert">
            {message}
          </p>
        )}
        <button type="submit" className="primary-button" disabled={!configured}>
          Sign in
        </button>
      </form>
    </main>
  );
}
