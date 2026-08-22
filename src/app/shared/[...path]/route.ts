import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

const types: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const session = await getSession();
  if (!session) {
    return new NextResponse("Sign in required", { status: 401 });
  }

  const { path: parts } = await context.params;
  const relative = parts.join("/");
  if (relative.includes("..")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const filePath = path.join(process.cwd(), "content/shared", relative);
  try {
    const data = await readFile(filePath);
    const ext = path.extname(relative);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "content-type": types[ext] ?? "application/octet-stream",
        "cache-control": "no-store",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
