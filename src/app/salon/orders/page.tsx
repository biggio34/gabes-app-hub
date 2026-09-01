import Link from "next/link";
import { redirect } from "next/navigation";
import { canAccessArea, getSession } from "@/lib/auth";
import { SupplyOrdersClient } from "./orders-client";

export default async function SupplyOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canAccessArea(session, "luna-haus")) {
    return (
      <div className="min-h-dvh bg-slate-950 px-6 py-10 text-slate-200">
        <Link href="/" className="text-sm text-slate-400 hover:text-rose-300">
          ← Hub
        </Link>
        <p className="mt-8 rounded-3xl border border-slate-800 bg-slate-900 px-6 py-12 text-center text-slate-400">
          This login does not have Luna Haus access yet.
        </p>
      </div>
    );
  }
  const params = await searchParams;
  return (
    <SupplyOrdersClient initialYear={params.year} initialMonth={params.month} />
  );
}
