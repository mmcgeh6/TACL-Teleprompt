import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/storage';

export function SignIn({ onSkip }: { onSkip: () => void }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendLink = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setError(error.message);
  };

  return (
    <main className="signin">
      <div className="signin-card card">
        <img src="/icon-badge.png" alt="" width={72} height={72} className="signin-logo" />
        <p className="eyebrow">The AI Consulting Lab</p>
        <h1 className="signin-title">Teleprompt</h1>

        {!sent ? (
          <form onSubmit={sendLink} className="stack">
            <p className="muted">Sign in to keep your scripts synced across your phone, tablet, and laptop.</p>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </label>
            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy ? 'Sending…' : 'Email me a sign-in link'}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="stack">
            <p className="muted">
              Check <strong>{email}</strong>. Tap the link in the email, or type the code from it here.
            </p>
            <label className="field">
              <span>Code from email</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
              />
            </label>
            <button className="btn btn-primary btn-block" disabled={busy || code.trim().length < 6}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => setSent(false)}>
              Use a different email
            </button>
          </form>
        )}

        {error && <p className="error">{error}</p>}

        <button type="button" className="link-button" onClick={onSkip}>
          Skip and save scripts on this device only
        </button>
      </div>
    </main>
  );
}
