import Link from "next/link";
import { redirect } from "next/navigation";
import { areaMeta, AREAS } from "@/lib/areas";
import { canAccessArea, getSession } from "@/lib/auth";
import { hubApps } from "@/lib/catalog";

export default async function HubHome() {
  const session = await getSession();
  if (!session) redirect("/login");

  const visibleAreas = AREAS.filter((area) => canAccessArea(session, area));

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-200">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-8">
        <div className="flex items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-3xl bg-red-700 text-2xl">
            ⌂
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Gabe&apos;s Apps</h1>
            <p className="text-red-400">Signed in as {session.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {session.role === "owner" ? (
            <Link
              href="/people"
              className="rounded-xl bg-slate-800 px-3 py-2 text-sm font-medium hover:bg-slate-700"
            >
              People
            </Link>
          ) : null}
          <form action={signOut}>
            <button className="rounded-xl bg-slate-800 px-3 py-2 text-sm font-medium hover:bg-red-900">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-5xl gap-10 px-6 pb-16">
        {visibleAreas.length === 0 ? (
          <p className="rounded-3xl border border-slate-800 bg-slate-900 px-6 py-12 text-center text-slate-400">
            Your account is signed in, but Gabe has not given it any areas yet.
          </p>
        ) : null}

        {visibleAreas.map((area) => {
          const meta = areaMeta[area];
          const apps = hubApps.filter((app) => app.area === area);
          return (
            <section key={area}>
              <p className="mb-3 text-xs font-semibold tracking-[0.16em] text-slate-400 uppercase">
                {meta.label}
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                {apps.map((app) => {
                  const href = app.external ? app.href! : `/apps/${app.slug}`;
                  return (
                    <a
                      key={app.slug}
                      href={href}
                      target={app.external ? "_blank" : undefined}
                      rel={app.external ? "noopener" : undefined}
                      className="rounded-3xl border border-slate-800 bg-slate-900 p-5 transition hover:-translate-y-0.5 hover:border-red-500"
                    >
                      <h2 className="text-lg font-semibold">{app.title}</h2>
                      <p className="mt-2 text-sm text-slate-400">{app.description}</p>
                      <span className="mt-4 inline-flex text-sm font-semibold text-red-400">
                        {app.external ? "Open" : "Launch"}
                      </span>
                    </a>
                  );
                })}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}

async function signOut() {
  "use server";
  const { cookies } = await import("next/headers");
  const { SESSION_COOKIE } = await import("@/lib/session-cookie");
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
