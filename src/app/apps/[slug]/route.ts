import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { canAccessArea, getSession } from "@/lib/auth";
import { hubApps, rewriteAppHtml } from "@/lib/catalog";
import { softballContext } from "@/lib/softball";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login", _request.url));
  }

  const { slug } = await context.params;
  const app = hubApps.find((item) => item.slug === slug && !item.external);
  if (!app) {
    return new NextResponse("App not found", { status: 404 });
  }
  if (!canAccessArea(session, app.area)) {
    return new NextResponse("You do not have access to this app.", { status: 403 });
  }

  const filePath = path.join(process.cwd(), "content/apps", app.file);
  let html = rewriteAppHtml(await readFile(filePath, "utf8"));
  if (app.area === "softball") {
    const softball = await softballContext(session);
    const boot = JSON.stringify({
      clubId: softball.clubId,
      clubName: softball.clubName,
      teamId: softball.teamId,
      teamName: softball.teamName,
      teams: softball.teams,
      clubs: softball.clubs,
    }).replaceAll("<", "\\u003c");
    html = html.replace(
      "<head>",
      `<head><script>window.HUB_SOFTBALL=${boot};</script>`,
    );
  }
  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
