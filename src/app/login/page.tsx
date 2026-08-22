"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setError(data.error || "Could not sign in");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-950 px-4 text-slate-200">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-red-700 text-xl">
            ⌂
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Gabe&apos;s Apps</h1>
            <p className="text-sm text-slate-400">Sign in to see your tools</p>
          </div>
        </div>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <label className="grid gap-1.5 text-sm">
            Username
            <input
              autoComplete="username"
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-red-500"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            Password
            <input
              type="password"
              autoComplete="current-password"
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-red-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold hover:bg-red-600 disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
