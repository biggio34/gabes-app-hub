import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const sockets = new Set();

function sendFrame(socket, data, opcode = 0x1) {
  const payload = Buffer.from(data);
  const header = [0x80 | opcode];
  if (payload.length < 126) header.push(payload.length);
  else {
    header.push(126, (payload.length >> 8) & 0xff, payload.length & 0xff);
  }
  socket.write(Buffer.concat([Buffer.from(header), payload]));
}

function attachSocket(socket) {
  sockets.add(socket);
  let buf = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const opcode = buf[0] & 0x0f;
      const b1 = buf[1];
      let len = b1 & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) return;
      const masked = (b1 & 0x80) !== 0;
      if (buf.length < offset + (masked ? 4 : 0) + len) return;
      const mask = masked ? buf.subarray(offset, offset + 4) : null;
      const start = offset + (masked ? 4 : 0);
      const payload = Buffer.from(buf.subarray(start, start + len));
      if (mask) {
        for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
      }
      buf = buf.subarray(start + len);
      if (opcode === 0x8) {
        socket.end();
        return;
      }
      if (opcode === 0x9) {
        sendFrame(socket, payload, 0xA);
        continue;
      }
      if (opcode !== 0x1) continue;
      const text = payload.toString("utf8");
      let frame;
      try { frame = JSON.parse(text); } catch { continue; }
      if (!Array.isArray(frame)) continue;
      const [joinRef, ref, topic, event] = frame;
      if (event === "phx_join" || event === "heartbeat") {
        sendFrame(socket, JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response: {} }]));
      }
    }
  });
  socket.on("close", () => sockets.delete(socket));
  socket.on("error", () => sockets.delete(socket));
}

function broadcastRevision(revision) {
  const message = JSON.stringify([null, null, "realtime:game-manager:club-mn-elks", "broadcast", {
    type: "broadcast",
    event: "revision",
    payload: { revision },
  }]);
  for (const socket of sockets) sendFrame(socket, message);
}

const mock = createServer((req, res) => {
  if (req.method !== "POST" || !String(req.url || "").includes("/realtime/v1/api/broadcast")) {
    res.writeHead(404);
    res.end();
    return;
  }
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    let revision = null;
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      revision = typeof body.revision === "number"
        ? body.revision
        : body.messages && body.messages[0] && body.messages[0].payload && body.messages[0].payload.revision;
    } catch {
      revision = null;
    }
    if (typeof revision === "number") broadcastRevision(revision);
    res.writeHead(202);
    res.end();
  });
});
mock.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  const accept = createHash("sha1").update(String(key) + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    "Sec-WebSocket-Accept: " + accept + "\r\n\r\n",
  );
  attachSocket(socket);
});
await new Promise((resolve) => mock.listen(4399, "127.0.0.1", resolve));

const base = process.env.PROOF_BASE_URL || "http://127.0.0.1:43147";
const password = process.env.HUB_ADMIN_PASSWORD || "FransenHub2026";
const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

const results = {
  startedMs: null,
  outMs: null,
  swapMs: null,
  simultaneousOuts: null,
  notice: null,
  offlineSynced: null,
  awayOnTop: null,
};

function shot(page, name) {
  return page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
}

async function waitText(page, selector, text, timeout = 10000) {
  const started = Date.now();
  await page.waitForFunction(
    ({ selector, text }) => {
      const nodes = selector ? document.querySelectorAll(selector) : [document.body];
      return Array.from(nodes).some((node) => (node.textContent || "").includes(text));
    },
    { selector, text },
    { timeout },
  );
  return Date.now() - started;
}

async function waitSaved(page) {
  await page.waitForFunction(() => {
    const el = document.querySelector("#sync-status");
    return el && el.textContent.trim() === "Saved";
  }, null, { timeout: 10000 });
}

const browser = await chromium.launch({ headless: true });
const setup = await browser.newContext();
const setupPage = await setup.newPage();
const login = await setupPage.request.post(`${base}/api/auth/login`, {
  data: { username: "gabe", password },
});
if (!login.ok()) throw new Error(`Login failed: ${login.status()} ${await login.text()}`);
const seeded = await setupPage.request.put(`${base}/api/softball/state`, {
  data: {
    state: {
      players: [
        { id: "mia", firstName: "Mia", lastName: "Hill", name: "Mia Hill", number: "4", assignedTeamId: "team-16u-fransen" },
        { id: "ava", firstName: "Ava", lastName: "Cole", name: "Ava Cole", number: "12", assignedTeamId: "team-16u-fransen" },
        { id: "jo", firstName: "Jo", lastName: "Park", name: "Jo Park", number: "2", assignedTeamId: "team-16u-fransen" },
      ],
      lineups: {
        "team-16u-fransen": {
          version: 2,
          games: [
            {
              id: "game-eagles",
              name: "vs. Eagles - May 3",
              battingMode: "roster",
              battingOrder: ["mia", "ava", "jo"],
              defensivePositions: { P: "mia", C: "ava", "1B": "jo" },
              inningDefenses: [{ P: "mia", C: "ava", "1B": "jo" }],
            },
          ],
        },
      },
    },
  },
});
if (!seeded.ok()) throw new Error(`Seed failed: ${seeded.status()} ${await seeded.text()}`);
const storage = await setup.storageState();
await setup.close();

const contextA = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: storage });
const contextB = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: storage });
const pageA = await contextA.newPage();
const pageB = await contextB.newPage();
let streamHits = 0;
for (const page of [pageA, pageB]) {
  page.on("pageerror", (error) => console.log("pageerror", error.message));
  page.on("request", (request) => {
    if (request.url().includes("/api/softball/game-sessions/stream")) streamHits += 1;
  });
}

await Promise.all([
  pageA.goto(`${base}/apps/game-manager`, { waitUntil: "networkidle" }),
  pageB.goto(`${base}/apps/game-manager`, { waitUntil: "networkidle" }),
]);
await waitText(pageA, ".game-btn", "vs. Eagles");
await waitText(pageB, ".game-btn", "vs. Eagles");

await pageA.locator(".game-btn", { hasText: "vs. Eagles" }).click();
await pageA.locator("#start-game").click();
const startAt = Date.now();
await pageA.getByRole("button", { name: "We are HOME" }).click();
await waitText(pageA, "#outs", "0 outs");
await waitText(pageB, ".game-btn.live", "In progress");
results.startedMs = Date.now() - startAt;
await shot(pageB, "b-sees-game-started-on-a");
console.log("startedMs", results.startedMs);

await pageB.locator(".game-btn.live").click();
await waitText(pageB, "#outs", "0 outs");
const away = await pageB.locator("#scoreboard .who").nth(1).innerText();
const home = await pageB.locator("#scoreboard .who").nth(2).innerText();
results.awayOnTop = `${away.trim()} / ${home.trim()}`;
if (away.trim() !== "Eagles" || home.trim() !== "Us") {
  throw new Error(`Scoreboard rows were ${results.awayOnTop}`);
}

await waitSaved(pageA);
const outAt = Date.now();
await pageA.locator("#add-out").click();
await waitText(pageA, "#outs", "1 out");
await waitText(pageB, "#outs", "1 out");
results.outMs = Date.now() - outAt;
await shot(pageA, "a-scored-one-out");
await shot(pageB, "b-shows-one-out-without-reload");
console.log("outMs", results.outMs);

await waitSaved(pageA);
const swapAt = Date.now();
await pageA.locator('[data-pos="P"]').click();
await pageA.locator(".pick", { hasText: "Jo Park" }).click();
await pageA.locator("#confirm-sub").click();
await waitText(pageA, '[data-pos="P"]', "Jo Park");
await waitText(pageB, '[data-pos="P"]', "Jo Park");
results.swapMs = Date.now() - swapAt;
await shot(pageB, "b-shows-defensive-swap");
console.log("swapMs", results.swapMs);

await waitSaved(pageA);
await waitSaved(pageB);
let held = 0;
let releaseGate;
const gate = new Promise((resolve) => {
  releaseGate = resolve;
});
async function holdPuts(page) {
  await page.route("**/api/softball/game-sessions", async (route) => {
    if (route.request().method() === "PUT") {
      held += 1;
      await gate;
    }
    await route.continue();
  });
}
await holdPuts(pageA);
await holdPuts(pageB);
await Promise.all([
  pageA.locator("#add-out").click(),
  pageB.locator("#add-out").click(),
]);
const holdDeadline = Date.now() + 8000;
while (held < 2 && Date.now() < holdDeadline) {
  await new Promise((resolve) => setTimeout(resolve, 50));
}
if (held < 2) throw new Error(`Only ${held} simultaneous saves were in flight.`);
releaseGate();
await waitText(pageA, "#outs", "3 outs");
await waitText(pageB, "#outs", "3 outs");
results.simultaneousOuts = "3 outs";
const noticeA = await pageA.locator("#sync-notice").count();
const noticeB = await pageB.locator("#sync-notice").count();
results.notice = { a: noticeA > 0, b: noticeB > 0 };
await shot(pageA, "simultaneous-a-three-outs");
await shot(pageB, "simultaneous-b-three-outs");
console.log("simultaneous", results.notice, "held", held);
await pageA.unroute("**/api/softball/game-sessions");
await pageB.unroute("**/api/softball/game-sessions");
await waitSaved(pageA);
await waitSaved(pageB);

await pageA.locator("#undo-out").click();
await waitText(pageB, "#outs", "2 outs");
await waitSaved(pageA);
await contextA.setOffline(true);
await pageA.locator("#add-out").click();
await waitText(pageA, "#sync-status", "Offline, will sync");
await waitText(pageA, "#outs", "3 outs");
await shot(pageA, "a-offline-queued-out");
await contextA.setOffline(false);
await pageA.evaluate(() => window.dispatchEvent(new Event("online")));
await waitText(pageB, "#outs", "3 outs");
await waitText(pageA, "#sync-status", "Saved");
results.offlineSynced = true;
results.streamHits = streamHits;
results.realtime = "Local mock of Supabase Realtime Broadcast. The server POSTed {revision} only. Browsers subscribed on a websocket and then GETed the document. No SSE stream was opened.";
if (streamHits !== 0) throw new Error(`SSE was used ${streamHits} times.`);
const syncConfig = await pageA.evaluate(() => window.HUB_GAME_SYNC || null);
if (!syncConfig || !syncConfig.anonKey || !String(syncConfig.url || "").includes("127.0.0.1:4399")) {
  throw new Error("Browser was not pointed at the mock Realtime socket.");
}
await shot(pageB, "b-sees-queued-out-after-reconnect");
console.log(JSON.stringify(results, null, 2));
writeFileSync(`${outDir}/sync-proof-results.json`, JSON.stringify(results, null, 2));
await browser.close();
mock.close();
