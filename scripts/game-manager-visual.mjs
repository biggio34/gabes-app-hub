/**
 * Phone-size screenshots and layout checks for Game Manager.
 * Uses the system Chrome. Does not need the Next server or a login.
 *
 *   node scripts/game-manager-visual.mjs --before
 *   node scripts/game-manager-visual.mjs
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const GameManager = require("../content/shared/game-manager.js");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pageUrl = "file://" + path.join(root, "content/apps/game-manager.html");
const before = process.argv.includes("--before");
const outDir = process.env.VISUAL_OUT || "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

const TEAM = "team-16u-fransen";
const players = [
  { id: "mia", name: "Mia Hill", number: "4" },
  { id: "ava", name: "Ava Cole", number: "12" },
  { id: "noa", name: "Noa / Bennett", number: "18" },
  { id: "sky", name: "Sky Nguyen", number: "7" },
  { id: "rory", name: "Rory Patel", number: "21" },
  { id: "quinn", name: "Quinn Brooks", number: "3" },
  { id: "elle", name: "Elle Hart", number: "9" },
  { id: "jules", name: "Jules Park", number: "2" },
  { id: "lina", name: "Lina Ortiz", number: "15" },
  { id: "bree", name: "Bree Solomon", number: "11" },
  { id: "tess", name: "Tess Alvarez", number: "6" },
];

function lineup(id, name) {
  return {
    id,
    name,
    battingMode: "roster",
    battingOrder: players.map((player) => player.id),
    defensivePositions: {
      P: "mia",
      C: "ava",
      "1B": "noa",
      "2B": "sky",
      "3B": "rory",
      SS: "quinn",
      LF: "elle",
      CF: "jules",
      RF: "lina",
    },
    inningDefenses: [],
    unavailableIds: [],
  };
}

function advance(state, runs) {
  return runs.reduce((current, scored, index) => GameManager.recordRuns(current, scored, 1000 + index), state);
}

const offenseGame = lineup("game-eagles", "vs. Eagles - May 3");
let offense = GameManager.createLiveGame({
  side: "away",
  game: offenseGame,
  players,
  teamName: "16U Fransen",
  scheduledInnings: 7,
}, 1000);
offense = advance(offense, [1, 0, 2, 0, 0, 3]);
offense = GameManager.addOut(offense, 2000);

const defenseGame = lineup("game-lions", "vs. Lions - May 17");
let defense = GameManager.createLiveGame({
  side: "away",
  game: defenseGame,
  players,
  teamName: "16U Fransen",
  scheduledInnings: 7,
}, 3000);
defense = advance(defense, Array.from({ length: 15 }, () => 0));
defense = GameManager.addOut(defense, 4000);
defense = GameManager.addOut(defense, 4001);
defense = GameManager.setTiebreaker(defense, true, 4002);

const finalGame = lineup("game-bears", "vs. Bears - Apr 12");
let finished = GameManager.createLiveGame({
  side: "home",
  game: finalGame,
  players,
  teamName: "16U Fransen",
  scheduledInnings: 5,
}, 5000);
finished = advance(finished, [1, 2, 0, 0, 1, 0, 0, 1, 0]);

const preGame = lineup("game-hawks", "vs. Hawks - May 10");

if (offense.half !== "top" || offense.status !== "live") {
  throw new Error("Offense fixture is not the top of a live inning.");
}
if (GameManager.roleFor(offense.side, offense.half) !== "offense") {
  throw new Error("Offense fixture is not batting.");
}
if (defense.half !== "bottom" || defense.status !== "live" || !defense.tiebreaker) {
  throw new Error("Defense fixture is not a live extra-inning tiebreaker.");
}
if (GameManager.roleFor(defense.side, defense.half) !== "defense") {
  throw new Error("Defense fixture is not in the field.");
}
if (finished.status !== "played" || finished.endedReason !== "home-lead") {
  throw new Error("Final fixture did not skip the bottom for a home lead.");
}

const nineIds = players.slice(0, 9).map((player) => player.id);
const subGame = lineup("game-subs", "vs. Subs - May 1");
subGame.battingMode = "nine";
subGame.battingOrder = nineIds;
const subsLive = GameManager.createLiveGame({
  side: "away",
  game: subGame,
  players,
  teamName: "16U Fransen",
  scheduledInnings: 7,
}, 6000);
const flexGame = lineup("game-flex", "vs. Flex - May 2");
flexGame.battingMode = "dp-flex";
flexGame.battingOrder = nineIds.concat(["tess"]);
flexGame.defensivePositions = Object.assign({}, flexGame.defensivePositions, { P: "tess", DP: "mia" });
const flexLive = GameManager.createLiveGame({
  side: "home",
  game: flexGame,
  players,
  teamName: "16U Fransen",
  scheduledInnings: 7,
}, 7000);
const nodpGame = lineup("game-nodp", "vs. Nodp - May 4");
nodpGame.battingMode = "dp-flex";
nodpGame.battingOrder = nineIds.concat(["tess"]);

const games = [offenseGame, defenseGame, finalGame, preGame, subGame, flexGame, nodpGame];
const sessions = {
  [offense.lineupGameId]: offense,
  [defense.lineupGameId]: defense,
  [finished.lineupGameId]: finished,
  [subsLive.lineupGameId]: subsLive,
  [flexLive.lineupGameId]: flexLive,
};
const document = GameManager.normalizeDocument({
  revision: 3,
  updatedAt: 5000,
  appliedOpIds: [],
  active: null,
  teams: {
    [TEAM]: { teamName: "16U Fransen", sessions },
  },
});
const envelope = {
  version: 2,
  acked: document,
  queue: [],
  localOpIds: [],
  cache: {
    teams: {
      [TEAM]: { teamName: "16U Fransen", games, players },
    },
  },
};

const hub = {
  role: "coach",
  clubId: "club-mn-elks",
  clubName: "MN Elks",
  teamId: TEAM,
  teamName: "16U Fransen",
  teams: [{ id: TEAM, name: "16U Fransen", clubName: "MN Elks", clubId: "club-mn-elks" }],
  userId: "user-gabe",
  userName: "Gabe",
};

const prefix = before ? "game-manager-before" : "game-manager-after";
const failures = [];

function fail(message) {
  failures.push(message);
  console.error("FAIL", message);
}

const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
  args: ["--disable-dev-shm-usage"],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  colorScheme: "dark",
});
await context.addInitScript(({ hub, key, envelope }) => {
  window.HUB_SOFTBALL = hub;
  localStorage.setItem(key, JSON.stringify(envelope));
}, { hub, key: GameManager.STORAGE_KEY, envelope });

let serverDoc = document;
const page = await context.newPage();
page.on("pageerror", (error) => fail("pageerror: " + error.message));
await page.route("**/api/softball/state", (route) => route.abort());
await page.route("**/api/softball/game-sessions/stream**", (route) => route.abort());
await page.route("**/api/softball/game-sessions", async (route) => {
  if (route.request().method() === "PUT") {
    try {
      const body = JSON.parse(route.request().postData() || "{}");
      if (body.document) serverDoc = body.document;
    } catch {
      /* keep the last document */
    }
  }
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ document: serverDoc }),
  });
});

async function shot(name) {
  await page.screenshot({ path: path.join(outDir, prefix + "-" + name + ".png") });
  console.log("shot", prefix + "-" + name + ".png");
}

async function openGame(title) {
  await page.locator("button", { hasText: title }).first().click();
  await page.waitForTimeout(80);
}

await page.goto(pageUrl, { waitUntil: "domcontentloaded" });
await page.locator("button", { hasText: "vs. Eagles" }).waitFor({ timeout: 8000 });
await page.evaluate(() => document.fonts && document.fonts.ready);
await page.waitForTimeout(200);
await shot("list");

await openGame("vs. Hawks");
await page.locator("#start-game").waitFor();
await shot("prestart");

await page.locator("#start-game").click();
await page.locator("#side-sheet").waitFor();
await shot("dialog");
await page.locator("[data-action='close-sheet']").click();
await page.locator("[data-action='back']").click();

await openGame("vs. Eagles");
await page.locator("#add-out").waitFor();
await page.locator("#half-indicator").waitFor();
await shot("offense");
await page.locator("[data-action='back']").click();

await openGame("vs. Lions");
await page.locator("#add-out").waitFor();
await page.locator("#tiebreaker").waitFor();
await shot("defense");
await page.locator("[data-action='back']").click();

await openGame("vs. Bears");
await page.locator("#ended-summary").waitFor();
await shot("final");

if (!before) {
  await page.locator("[data-action='back']").click();
  await openGame("vs. Hawks");
  const noa = page.locator(".name", { hasText: "Noa / Bennett" }).first();
  const noaBox = await noa.evaluate((el) => {
    const style = getComputedStyle(el);
    const line = parseFloat(style.lineHeight);
    return {
      whiteSpace: style.whiteSpace,
      height: el.getBoundingClientRect().height,
      line: Number.isFinite(line) ? line : 0,
      text: el.textContent,
    };
  });
  if (noaBox.whiteSpace !== "nowrap") fail("Lineup name does not stay on one line.");
  if (!(noaBox.line > 0) || noaBox.height > noaBox.line * 1.4) {
    fail("Noa / Bennett wraps (" + JSON.stringify(noaBox) + ").");
  }

  await page.locator("#start-game").click();
  const awayPressed = await page.locator("[data-action='pick-side'][data-side='away']").getAttribute("aria-pressed");
  if (awayPressed !== "true") fail("Away is not the selected side in the start dialog.");
  await page.locator("[data-action='pick-side'][data-side='home']").click();
  const homePressed = await page.locator("[data-action='pick-side'][data-side='home']").getAttribute("aria-pressed");
  if (homePressed !== "true") fail("Home segment does not stay selected.");
  const startSide = await page.locator("[data-action='choose-side']").getAttribute("data-side");
  if (startSide !== "home") fail("Start game is not using the selected side.");
  await page.locator("[data-action='close-sheet']").click();
  await page.locator("[data-action='back']").click();

  await openGame("vs. Eagles");
  const boardText = await page.locator("#scoreboard").innerText();
  if (/\bUs\b/.test(boardText)) fail("Line score still says Us.");
  if (!boardText.includes("FRANSE")) fail("Line score is missing the team name.");
  if (!boardText.includes("EAGLES")) fail("Line score is missing the opponent.");
  if ((boardText.match(/\n/g) || []).length < 2) fail("Line score rows are missing.");
  const inningHeads = await page.locator("#scoreboard .inn.head").count();
  if (inningHeads < 7) fail("Line score is not showing all 7 innings (" + inningHeads + ").");
  const runTotals = await page.locator("#scoreboard .run").allInnerTexts();
  if (runTotals[0] !== "3" || runTotals[1] !== "3") fail("Run totals are not the inning sums (" + runTotals.join(", ") + ").");
  const awaySide = await page.locator("#scoreboard [data-side]").first().getAttribute("data-side");
  if (awaySide !== "away") fail("Away team is not the top line-score row.");
  const atBatWeight = await page.locator(".at-bat .name").first().evaluate((el) => getComputedStyle(el).fontWeight);
  const otherWeight = await page.locator(".row:not(.at-bat) .name").first().evaluate((el) => getComputedStyle(el).fontWeight);
  if (Number(atBatWeight) < 600) fail("Current batter is not emphasized (" + atBatWeight + ").");
  if (Number(otherWeight) > 500) fail("Other names are too heavy (" + otherWeight + ").");
  const runFont = await page.locator(".run").first().evaluate((el) => getComputedStyle(el).fontFamily);
  const nameFont = await page.locator(".at-bat .name").first().evaluate((el) => getComputedStyle(el).fontFamily);
  if (!/Space Grotesk/i.test(runFont)) fail("Runs are not in Space Grotesk (" + runFont + ").");
  if (/Space Grotesk/i.test(nameFont)) fail("Batter names are using the display face.");
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  if (!/rgb\(\s*2,\s*6,\s*23\s*\)/.test(bodyBg)) fail("Page background is not the hub navy (" + bodyBg + ").");
  const mark = await page.locator(".mark").first().evaluate((el) => el.getBoundingClientRect().width);
  if (mark > 16) fail("Out marks are still the large outlined dots (" + mark + "px).");
  const primary = await page.locator("#add-out").boundingBox();
  const undo = await page.locator("#undo-out").boundingBox();
  if (!primary || primary.height < 56) fail("+1 Out is not the large primary.");
  if (!undo || undo.y > primary.y + 4) fail("Undo is not in the same thumb row as +1 Out.");
  await page.locator("[data-action='open-menu']").click();
  await page.locator("#end-game").waitFor();
  const endBg = await page.locator("#end-game").evaluate((el) => getComputedStyle(el).backgroundColor);
  const undoBg = await page.locator("#undo-out").evaluate((el) => getComputedStyle(el).backgroundColor);
  if (endBg === undoBg && endBg !== "rgba(0, 0, 0, 0)") fail("End Game looks like Undo.");
  await shot("m3-end-game");
  await page.locator("[data-action='close-sheet']").click();

  const dueBefore = await page.locator(".at-bat .name").innerText();
  await page.locator("[data-action='next-batter']").click();
  const dueAfter = await page.locator(".at-bat .name").innerText();
  if (dueBefore === dueAfter) fail("Due up did not move.");
  await shot("m1-due-up");
  await page.locator(".row.at-bat [data-action='select-player']").click();
  const leaveCount = await page.locator(".sub-btn").count();
  if (leaveCount !== 1) fail("Leaves should show on the selected player only (" + leaveCount + ").");
  await page.locator("[data-action='ask-leave']").click();
  await page.locator("#leave-sheet").waitFor();
  await shot("m9-leave");
  await page.locator("[data-action='close-sheet']").click();
  await page.locator("#courtesy-runner").click();
  const courtesyChoices = await page.locator("#courtesy-sheet .pick").allInnerTexts();
  if (courtesyChoices.length !== 2) fail("Courtesy runner is not limited to pitcher and catcher (" + courtesyChoices.join(" | ") + ").");
  await shot("m7-courtesy");
  await page.locator("[data-action='close-sheet']").click();
  await page.locator("#add-out").click();
  await page.locator("#undo-out").click();
  await shot("m2-undo");
  await shot("m8-linescore");

  await page.locator("[data-action='back']").click();
  await openGame("vs. Lions");
  const positions = await page.locator(".pos-btn").count();
  if (positions !== 9) fail("Defense is not showing all nine positions (" + positions + ").");
  const tieCount = await page.locator("#tiebreaker").count();
  const tieNotes = await page.locator("#tiebreaker-indicator, .tie-note").count();
  if (tieCount !== 1 || tieNotes !== 0) fail("Tiebreaker is not a single control.");
  const tieText = await page.locator("#tiebreaker").innerText();
  if (!/runner on 2nd/i.test(tieText)) fail("Tiebreaker control does not state the runner rule.");
  const fieldBottom = await page.locator(".pos-btn").last().evaluate((el) => el.getBoundingClientRect().bottom);
  const dockTop = await page.locator(".dock").evaluate((el) => el.getBoundingClientRect().top);
  if (fieldBottom > dockTop + 1) fail("The nine positions do not fit above the action dock.");
  await shot("m4-tiebreaker");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  if (overflow) fail("Phone width scrolls sideways.");

  const small = await page.locator("button:visible").evaluateAll((buttons) => buttons.flatMap((button) => {
    if (button.classList.contains("inn")) return [];
    const box = button.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return [];
    if (box.height >= 44 && box.width >= 44) return [];
    return [button.innerText.replace(/\s+/g, " ").trim().slice(0, 48) + " " + Math.round(box.width) + "x" + Math.round(box.height)];
  }));
  if (small.length) fail("Touch targets under 44px: " + small.join("; "));

  await page.locator("[data-action='back']").click();
  await openGame("vs. Subs");
  await page.locator(".row-hit").first().click();
  await page.locator("[data-action='ask-sub']").click();
  await page.locator("[data-action='pick-sub']").first().click();
  await page.locator("#sub-effect").waitFor();
  await shot("m5-reentry");
  await page.locator("[data-action='close-sheet']").click();

  await page.locator("[data-action='back']").click();
  await openGame("vs. Flex");
  await page.locator("#sub-for-flex").click();
  await page.locator("[data-action='pick-flex-sub']", { hasText: "Ava Cole" }).click();
  await page.locator("#form-error").waitFor();
  const flexError = await page.locator("#form-error").innerText();
  if (!/already playing/i.test(flexError)) fail("FLEX sub did not explain the double position (" + flexError + ").");
  await shot("m6-flex");
  await shot("m11-error");

  await page.locator("[data-action='back']").click();
  await openGame("vs. Nodp");
  await page.locator("#start-game").click();
  await page.locator("[data-action='choose-side']").click();
  await page.locator("#form-error").waitFor();
  const dpError = await page.locator("#form-error").innerText();
  if (!/DP/i.test(dpError)) fail("Start did not ask for the DP (" + dpError + ").");
  await shot("m10-dp");
}

await browser.close();
if (failures.length) {
  console.error(failures.length + " visual check(s) failed.");
  process.exit(1);
}
console.log(before ? "Before shots saved." : "Visual checks passed.");
