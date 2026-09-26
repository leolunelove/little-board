"use client";
import { useEffect, useState } from "react";
import { Mail, ArrowRight, Check } from "lucide-react";
import { memoRequest } from "@/lib/client-api";
export function MagicLinkForm({
  code,
  ready,
  onBack,
}: {
  code?: string;
  ready: boolean;
  onBack?: () => void;
}) {
  const [email, setEmail] = useState(""),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (!cooldown) return;
    const id = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);
  return (
    <form
      className="little-email"
      aria-label="Email sign in"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy || cooldown || !ready) return;
        setBusy(true);
        setError("");
        try {
          await memoRequest("/api/email", { action: "request", email, code });
          setSent(true);
          setCooldown(60);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {sent ? (
        <div className="mail-sent" role="status">
          <span className="little-icon">
            <Check size={22} />
          </span>
          <h3>Check your inbox.</h3>
          <p>
            Tap the sign-in link we sent to <strong>{email}</strong>. It opens
            Little Board without a password.
          </p>
          <p className="form-hint">
            Open it in this browser. The link works once.
          </p>
        </div>
      ) : (
        <>
          <label htmlFor="little-email">Email address</label>
          <input
            id="little-email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={254}
            required
            autoFocus
            placeholder="you@example.com"
            value={email}
            disabled={busy}
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="form-hint">
            We’ll email you a sign-in link. That’s it.
          </p>
        </>
      )}
      {!ready && (
        <p className="form-hint" role="status">
          Email sign-in isn’t available yet. You can create a board and start
          now.
        </p>
      )}
      {error && (
        <p className="draft-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="little-primary"
        type="submit"
        disabled={!ready || busy || cooldown > 0}
      >
        <Mail size={18} />
        {busy
          ? "Sending…"
          : sent
            ? cooldown
              ? `Send again in ${cooldown}s`
              : "Send another link"
            : "Send magic link"}
        <ArrowRight size={17} />
      </button>
      <div className="little-email-actions">
        {sent && (
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() => {
              setSent(false);
              setCooldown(0);
              setError("");
            }}
          >
            Use another email
          </button>
        )}
        {onBack && (
          <button className="text-button" type="button" onClick={onBack}>
            Back
          </button>
        )}
      </div>
    </form>
  );
}
