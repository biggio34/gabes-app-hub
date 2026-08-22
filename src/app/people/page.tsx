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
  clubIds: string[];
  teamIds: string[];
};

type Club = { id: string; name: string };
type Team = { id: string; clubId: string; name: string };

function toggleValue<T>(list: T[], value: T) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export default function PeoplePage() {
  const [users, setUsers] = useState<Person[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [emailReady, setEmailReady] = useState(true);
  const [databaseReady, setDatabaseReady] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeOk, setNoticeOk] = useState(true);
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [areas, setAreas] = useState<Area[]>([]);
  const [clubIds, setClubIds] = useState<string[]>([]);
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [newClub, setNewClub] = useState("");
  const [newTeamByClub, setNewTeamByClub] = useState<Record<string, string>>({});

  async function load() {
    const response = await fetch("/api/people");
    if (!response.ok) {
      setError("Only Gabe can manage people.");
      return;
    }
    const data = (await response.json()) as {
      users: Person[];
      clubs?: Club[];
      teams?: Team[];
      emailReady?: boolean;
      databaseReady?: boolean;
    };
    setUsers(
      data.users.map((user) => ({
        ...user,
        clubIds: user.clubIds ?? [],
        teamIds: user.teamIds ?? [],
      })),
    );
    setClubs(data.clubs ?? []);
    setTeams(data.teams ?? []);
    setEmailReady(data.emailReady !== false);
    setDatabaseReady(data.databaseReady !== false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch people on mount
    void load();
  }, []);

  function assignmentText(user: Person) {
    const labels: string[] = [];
    for (const clubId of user.clubIds) {
      const club = clubs.find((item) => item.id === clubId);
      if (!club) continue;
      const onATeam = teams.some(
        (team) => team.clubId === clubId && user.teamIds.includes(team.id),
      );
      if (!onATeam) labels.push(`${club.name} (whole club)`);
    }
    for (const teamId of user.teamIds) {
      const team = teams.find((item) => item.id === teamId);
      if (!team) continue;
      const club = clubs.find((item) => item.id === team.clubId);
      labels.push(club ? `${club.name} · ${team.name}` : team.name);
    }
    return labels.join(" · ");
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
        body: JSON.stringify({
          username,
          name,
          email,
          password,
          areas,
          clubIds,
          teamIds,
        }),
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
      setClubIds([]);
      setTeamIds([]);
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

  async function savePerson(
    id: string,
    patch: { areas?: Area[]; clubIds?: string[]; teamIds?: string[] },
  ) {
    await fetch("/api/people", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
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

  async function addClub(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/clubs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newClub }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(data.error || "Could not add club");
      return;
    }
    setNewClub("");
    await load();
  }

  async function addTeam(clubId: string) {
    setError("");
    const response = await fetch("/api/teams", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clubId, name: newTeamByClub[clubId] ?? "" }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(data.error || "Could not add team");
      return;
    }
    setNewTeamByClub((current) => ({ ...current, [clubId]: "" }));
    await load();
  }

  async function removeClub(id: string, name: string) {
    if (!confirm(`Remove ${name} and its teams?`)) return;
    await fetch("/api/clubs", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  async function removeTeam(id: string, name: string) {
    if (!confirm(`Remove ${name}?`)) return;
    await fetch("/api/teams", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  function AssignmentPicker({
    selectedClubIds,
    selectedTeamIds,
    onClub,
    onTeam,
  }: {
    selectedClubIds: string[];
    selectedTeamIds: string[];
    onClub: (id: string) => void;
    onTeam: (id: string) => void;
  }) {
    if (clubs.length === 0) {
      return (
        <p className="text-xs text-slate-500">
          Add a club below first. MN Elks should already be here.
        </p>
      );
    }
    return (
      <div className="grid gap-3">
        {clubs.map((club) => {
          const clubTeams = teams.filter((team) => team.clubId === club.id);
          return (
            <div key={club.id}>
              <p className="mb-1.5 text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">
                {club.name}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onClub(club.id)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    selectedClubIds.includes(club.id)
                      ? "bg-indigo-700 text-white"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  Whole club
                </button>
                {clubTeams.map((team) => (
                  <button
                    key={team.id}
                    type="button"
                    onClick={() => onTeam(team.id)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      selectedTeamIds.includes(team.id)
                        ? "bg-red-700 text-white"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {team.name}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-200">
      <div className="mx-auto grid w-full max-w-3xl gap-8 px-6 py-10">
        <div>
          <Link href="/" className="text-sm text-slate-400 hover:text-red-400">
            ← Hub
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">People</h1>
          <p className="text-sm text-slate-400">
            Give someone a login, pick Financial / Softball / Luna Haus, then
            put them on a club or team. MN Elks is the club. 16U Fransen is the
            team.
          </p>
        </div>

        {databaseReady ? null : (
          <p className="rounded-2xl border border-amber-700/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
            People, clubs, and teams are saved on this computer until
            Supabase is connected. The live site needs the Supabase service
            key in Netlify so extra clubs stay saved.
          </p>
        )}
        {emailReady ? null : (
          <p className="rounded-2xl border border-amber-700/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
            The site can save new logins, but it cannot email them yet. Add
            GMAIL_USER and GMAIL_APP_PASSWORD in Netlify, then publish again.
          </p>
        )}

        <section className="grid gap-4 rounded-3xl border border-slate-800 bg-slate-900 p-5">
          <div>
            <h2 className="font-semibold">Clubs and teams</h2>
            <p className="text-sm text-slate-400">
              Start with MN Elks and 16U Fransen. Add another team when the
              club grows.
            </p>
          </div>
          {clubs.length === 0 ? (
            <p className="text-sm text-slate-500">No clubs yet.</p>
          ) : (
            <ul className="grid gap-4">
              {clubs.map((club) => (
                <li
                  key={club.id}
                  className="rounded-2xl border border-slate-800 bg-slate-950 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">
                      {club.name}{" "}
                      <span className="text-xs font-normal text-slate-500">
                        club
                      </span>
                    </p>
                    <button
                      type="button"
                      onClick={() => void removeClub(club.id, club.name)}
                      className="text-xs text-slate-400 hover:text-red-400"
                    >
                      Remove club
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {teams.filter((team) => team.clubId === club.id).length ===
                    0 ? (
                      <p className="text-xs text-slate-500">No teams yet.</p>
                    ) : (
                      teams
                        .filter((team) => team.clubId === club.id)
                        .map((team) => (
                          <span
                            key={team.id}
                            className="inline-flex items-center gap-2 rounded-full bg-slate-800 px-3 py-1 text-xs"
                          >
                            {team.name}
                            <button
                              type="button"
                              onClick={() => void removeTeam(team.id, team.name)}
                              className="text-slate-400 hover:text-red-400"
                              aria-label={`Remove ${team.name}`}
                            >
                              ×
                            </button>
                          </span>
                        ))
                    )}
                  </div>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      placeholder="New team name"
                      className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                      value={newTeamByClub[club.id] ?? ""}
                      onChange={(e) =>
                        setNewTeamByClub((current) => ({
                          ...current,
                          [club.id]: e.target.value,
                        }))
                      }
                    />
                    <button
                      type="button"
                      onClick={() => void addTeam(club.id)}
                      className="rounded-xl bg-slate-800 px-3 py-2 text-sm font-semibold hover:bg-slate-700"
                    >
                      Add team
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={addClub} className="flex flex-col gap-2 sm:flex-row">
            <input
              placeholder="New club name"
              className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              value={newClub}
              onChange={(e) => setNewClub(e.target.value)}
            />
            <button className="rounded-xl bg-slate-800 px-3 py-2 text-sm font-semibold hover:bg-slate-700">
              Add club
            </button>
          </form>
        </section>

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
          <div>
            <p className="mb-1.5 text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">
              Areas
            </p>
            <div className="flex flex-wrap gap-2">
              {AREAS.map((area) => (
                <button
                  key={area}
                  type="button"
                  onClick={() => setAreas(toggleValue(areas, area))}
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
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">
              Club and team
            </p>
            <AssignmentPicker
              selectedClubIds={clubIds}
              selectedTeamIds={teamIds}
              onClub={(id) => setClubIds(toggleValue(clubIds, id))}
              onTeam={(id) => setTeamIds(toggleValue(teamIds, id))}
            />
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
                    {user.role === "owner" ? null : (
                      <p className="mt-1 text-xs text-slate-400">
                        {assignmentText(user) || "No club or team yet"}
                      </p>
                    )}
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
                  <div className="mt-3 grid gap-3">
                    <div className="flex flex-wrap gap-2">
                      {AREAS.map((area) => (
                        <button
                          key={area}
                          type="button"
                          onClick={() => {
                            void savePerson(user.id, {
                              areas: toggleValue(user.areas, area),
                            });
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
                    <AssignmentPicker
                      selectedClubIds={user.clubIds}
                      selectedTeamIds={user.teamIds}
                      onClub={(id) => {
                        void savePerson(user.id, {
                          clubIds: toggleValue(user.clubIds, id),
                          teamIds: user.teamIds,
                        });
                      }}
                      onTeam={(id) => {
                        void savePerson(user.id, {
                          clubIds: user.clubIds,
                          teamIds: toggleValue(user.teamIds, id),
                        });
                      }}
                    />
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
