"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AREAS, areaMeta, type Area } from "@/lib/areas";

type Person = {
  id: string;
  username: string;
  name: string;
  email: string;
  role: "owner" | "member";
  areas: Area[];
};

export default function PeoplePage() {
  const [users, setUsers] = useState<Person[]>([]);
  const [emailReady, setEmailReady] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeOk, setNoticeOk] = useState(true);
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [areas, setAreas] = useState<Area[]>([]);

  async function load() {
    const response = await fetch("/api/people");
    if (!response.ok) {
      setError("Only Gabe can manage people.");
      return;
    }
    const data = (await response.json()) as {
      users: Person[];
      emailReady?: boolean;
    };
    setUsers(data.users);
    setEmailReady(data.emailReady !== false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch people on mount
    void load();
  }, []);

  function toggle(area: Area, current: Area[], setter: (next: Area[]) => void) {
    setter(
      current.includes(area)
        ? current.filter((item) => item !== area)
        : [...current, area],
    );
  }

  async function addPerson(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setNoticeOk(true);
    setBusy(true);
    try {
      const response = await fetch("/api/people", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, name, email, password, areas }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        emailSent?: boolean;
        emailError?: string;
        user?: Person;
      };
      if (!response.ok) {
        setError(data.error || "Could not add person");
        return;
      }
      setUsername("");
      setName("");
      setEmail("");
      setPassword("");
      setAreas([]);
      if (data.emailSent) {
        setNoticeOk(true);
        setNotice(`Login email sent to ${data.user?.email || email}.`);
      } else {
        setNoticeOk(false);
        setNotice(
          data.emailError ||
            "Person added, but the login email could not be sent.",
        );
      }
      await load();
    } catch {
      setError("Could not add that person. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function saveAreas(id: string, nextAreas: Area[]) {
    await fetch("/api/people", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, areas: nextAreas }),
    });
    await load();
  }

  async function resend(id: string) {
    setError("");
    setNotice("");
    setNoticeOk(true);
    const response = await fetch("/api/people/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(data.error || "Could not send that email.");
      return;
    }
    setNotice("Login email sent again.");
  }

  async function remove(id: string) {
    if (!confirm("Remove this login?")) return;
    await fetch("/api/people", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-200">
      <div className="mx-auto grid w-full max-w-3xl gap-8 px-6 py-10">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/" className="text-sm text-slate-400 hover:text-red-400">
              ← Hub
            </Link>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">People</h1>
            <p className="text-sm text-slate-400">
              Each person gets a username, a password, and the areas they may
              open. We email them a link to the sign-in page.
            </p>
          </div>
        </div>

        {emailReady ? null : (
          <p className="rounded-2xl border border-amber-700/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
            The site can save new logins, but it cannot email them yet. Add
            GMAIL_USER and GMAIL_APP_PASSWORD in Netlify, then publish again.
          </p>
        )}

        <form
          onSubmit={addPerson}
          className="grid gap-3 rounded-3xl border border-slate-800 bg-slate-900 p-5"
        >
          <h2 className="font-semibold">Add someone</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              placeholder="Name"
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              placeholder="Email"
              type="email"
              autoComplete="off"
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              placeholder="Username"
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <input
              placeholder="Password"
              type="password"
              autoComplete="new-password"
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {AREAS.map((area) => (
              <button
                key={area}
                type="button"
                onClick={() => toggle(area, areas, setAreas)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  areas.includes(area)
                    ? "bg-red-700 text-white"
                    : "bg-slate-800 text-slate-400"
                }`}
              >
                {areaMeta[area].label}
              </button>
            ))}
          </div>
          <button
            disabled={busy}
            className="w-fit rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold hover:bg-red-600 disabled:opacity-60"
          >
            {busy ? "Adding…" : "Add and email login"}
          </button>
          {notice ? (
            <p className={`text-sm ${noticeOk ? "text-emerald-400" : "text-amber-300"}`}>
              {notice}
            </p>
          ) : null}
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
        </form>

        {users.length === 0 ? (
          <p className="rounded-3xl border border-slate-800 bg-slate-900 px-6 py-12 text-center text-slate-400">
            No people yet.
          </p>
        ) : (
          <ul className="grid gap-3">
            {users.map((user) => (
              <li
                key={user.id}
                className="rounded-3xl border border-slate-800 bg-slate-900 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {user.name}{" "}
                      <span className="text-sm font-normal text-slate-400">
                        @{user.username}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {user.role === "owner" ? "Owner · all areas" : "Member"}
                      {user.email ? ` · ${user.email}` : ""}
                    </p>
                  </div>
                  {user.role !== "owner" ? (
                    <div className="flex items-center gap-3">
                      {user.email ? (
                        <button
                          type="button"
                          onClick={() => void resend(user.id)}
                          className="text-xs text-slate-400 hover:text-red-400"
                        >
                          Email login again
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => remove(user.id)}
                        className="text-xs text-slate-400 hover:text-red-400"
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}
                </div>
                {user.role === "owner" ? null : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {AREAS.map((area) => (
                      <button
                        key={area}
                        type="button"
                        onClick={() => {
                          const next = user.areas.includes(area)
                            ? user.areas.filter((item) => item !== area)
                            : [...user.areas, area];
                          void saveAreas(user.id, next);
                        }}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          user.areas.includes(area)
                            ? "bg-red-700 text-white"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {areaMeta[area].label}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
