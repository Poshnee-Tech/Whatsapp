import { redirect } from "next/navigation";
import { login } from "@/app/actions";
import { hasSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in · Poshnee WhatsApp" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await hasSession()) redirect("/inbox");
  const { error } = await searchParams;

  return (
    <main className="login">
      <form action={login} className="login-card">
        <h1>Poshnee WhatsApp</h1>
        <p className="muted">Staff inbox</p>
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
        {error && <p className="error">Wrong password. Try again.</p>}
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
