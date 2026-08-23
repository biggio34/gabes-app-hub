"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SecretField } from "@/components/secret-field";

type Account = {
  id: string;
  username: string;
  name: string;
};

export default function AccountPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/account");
    if (!response.ok) {
      setError("Could not load this account.");
      return;
    }
    const data = (await response.json()) as { user: Account };
    setAccount(data.user);
    setUsername(data.user.username);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch account on mount
    void load();
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const response = await fetch("/api/account", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username,
          password: password.trim() || undefined,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        user?: Account;
      };
      if (!response.ok) {
        setError(data.error || "Could not save those changes.");
        return;
      }
      if (data.user) {
        setAccount(data.user);
        setUsername(data.user.username);
      }
      setPassword("");
      setNotice(
        password.trim()
          ? "Username and password saved. Use these the next time you sign in."
          : "Username saved.",
      );
    } catch {
      setError("Could not save those changes. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-200">
      <div className="mx-auto grid w-full max-w-lg gap-6 px-6 py-10">
        <div>
          <Link href="/" className="text-sm text-slate-400 hover:text-red-400">
            ← Hub
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Account</h1>
          <p className="text-sm text-slate-400">
            This is the username and password used to open Gabe&apos;s Apps.
            The saved password cannot be shown again. Type a new one to change
            it, and use Show if you want to see what you typed.
          </p>
        </div>

        {account ? (
          <form
            onSubmit={save}
            className="grid gap-4 rounded-3xl border border-slate-800 bg-slate-900 p-5"
          >
            <label className="grid gap-1.5 text-sm">
              Username
              <input
                autoComplete="username"
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-red-500"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <SecretField
              label="New password"
              value={password}
              onChange={setPassword}
              placeholder="Leave blank to keep the current password"
            />
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            {notice ? <p className="text-sm text-emerald-400">{notice}</p> : null}
            <button
              disabled={busy}
              className="w-fit rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold hover:bg-red-600 disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save login"}
            </button>
          </form>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : (
          <p className="text-sm text-slate-500">Loading account…</p>
        )}
      </div>
    </div>
  );
}
