"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { send } from "@/lib/client";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/";
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError(null);
    try {
      await send("POST", mode === "login" ? "/auth/login" : "/auth/register", data);
      router.push(next.startsWith("/") ? next : "/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card card-pad stack">
      <h1 style={{ fontSize: "1.5rem" }}>{mode === "login" ? "Sign in" : "Create your account"}</h1>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      {mode === "register" && (
        <div className="field">
          <label htmlFor="username">Username</label>
          <input id="username" name="username" pattern="[a-zA-Z0-9_]{3,24}" title="3-24 letters, numbers or underscores" required />
        </div>
      )}
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 10 : 1} required />
      </div>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primary" disabled={busy}>{mode === "login" ? "Sign in" : "Create account"}</button>
      <p className="small muted">
        {mode === "login" ? <>New here? <Link href="/register">Create an account</Link></> : <>Already have an account? <Link href="/login">Sign in</Link></>}
      </p>
    </form>
  );
}
