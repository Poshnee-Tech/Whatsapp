import Link from "next/link";

export default function Home() {
  return (
    <main className="login">
      <div className="login-card">
        <h1>Poshnee WhatsApp</h1>
        <p className="muted">The service is running.</p>
        <Link href="/inbox" className="link-button">Open staff inbox →</Link>
      </div>
    </main>
  );
}
