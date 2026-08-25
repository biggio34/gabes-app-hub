#!/usr/bin/env node
/**
 * Luna Haus Social Sync bot — talks to the Chrome you are already signed into.
 * Double-click start.command, leave this window open, then use http://127.0.0.1:8787
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const DATA_PATH = path.join(here, "data.json");
const HTML_PATH = path.join(here, "..", "content", "apps", "luna-haus-social.html");

const DEFAULTS = {
  facebook_page_url: "https://www.facebook.com/p/Luna-Haus-Salon-61585014904118/",
  google_posts_url: "https://business.google.com/posts",
  book_url: "https://lunahaussalon.glossgenius.com/",
  auto_publish: false,
  bot_attached: false,
  history: [],
};

function loadData() {
  try {
    return Object.assign({}, DEFAULTS, JSON.parse(fs.readFileSync(DATA_PATH, "utf8")));
  } catch {
    return Object.assign({}, DEFAULTS);
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function fingerprint(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 280);
}

async function osascript(source) {
  if (process.platform !== "darwin") {
    throw new Error("Social Sync drives Chrome on a Mac. Run start.command on the salon Mac.");
  }
  const { stdout } = await execFileAsync("osascript", ["-e", source], {
    timeout: 90000,
    maxBuffer: 2 * 1024 * 1024,
  });
  return String(stdout || "").trim();
}

async function openChromeTab(url) {
  const escaped = String(url).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  await osascript(`
tell application "Google Chrome"
  activate
  if (count of windows) is 0 then make new window
  set URL of active tab of window 1 to "${escaped}"
end tell`);
}

async function ensureChromeTab(url, needle) {
  const found = await osascript(`
tell application "Google Chrome"
  set found to false
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t as string) contains ${JSON.stringify(needle)} then set found to true
    end repeat
  end repeat
  return found
end tell`);
  if (found !== "true") await openChromeTab(url);
}

async function chromeJs(urlNeedle, userCode) {
  const wrapped = `(${userCode})()`;
  const encoded = encodeURIComponent(wrapped);
  const result = await osascript(`
tell application "Google Chrome"
  activate
  set foundTab to missing value
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t as string) contains ${JSON.stringify(urlNeedle)} then set foundTab to t
    end repeat
  end repeat
  if foundTab is missing value then error "No matching Chrome tab. Click Use my Chrome first."
  delay 1
  set r to execute foundTab javascript "eval(decodeURIComponent("${encoded}"))"
  return r
end tell`);
  if (!result) throw new Error("Chrome returned nothing. Turn on View → Developer → Allow JavaScript from Apple Events.");
  try {
    return JSON.parse(result);
  } catch {
    return { raw: result };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function draftFromFacebook(message, bookUrl) {
  const body = String(message || "").trim();
  const lines = [body];
  if (bookUrl && body.toLowerCase().indexOf(bookUrl.toLowerCase()) === -1) {
    lines.push("", "Book online: " + bookUrl);
  }
  lines.push("Call 763-497-5003 · Luna Haus Salon, St. Michael");
  return { summary: lines.join("\n") };
}

const READ_FACEBOOK = `function () {
  const articles = Array.prototype.slice.call(document.querySelectorAll('[role="article"]'));
  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const msg = article.querySelector('[data-ad-preview="message"], [data-ad-comet-preview="message"]');
    let text = msg ? String(msg.innerText || "").trim() : "";
    if (!text) {
      const blocks = Array.prototype.slice.call(article.querySelectorAll('div[dir="auto"]'))
        .map(function (el) { return String(el.innerText || "").trim(); })
        .filter(function (line) { return line && line.length > 8 && line.length < 2000; });
      text = blocks[0] || "";
    }
    if (!text) continue;
    const img = article.querySelector('img[src*="scontent"], img[src*="fbcdn"]');
    const link = article.querySelector('a[href*="/posts/"], a[href*="story_fbid"], a[href*="/reel/"]');
    return {
      message: text,
      image_url: img ? img.src : "",
      permalink_url: link ? link.href : location.href
    };
  }
  return { error: "Could not read a Facebook post. Scroll the page to the latest post and try again." };
}`;

const PUBLISH_GOOGLE = `function () {
  const summary = window.__LUNA_DRAFT || "";
  const book = window.__LUNA_BOOK || "";
  function visible(el) {
    return el && el.offsetParent !== null;
  }
  const editors = Array.prototype.slice.call(document.querySelectorAll('[contenteditable="true"], textarea'));
  const editor = editors.find(visible);
  if (!editor) {
    return { error: "Could not find the Google Business composer. Open Posts, click Create post, then try Post draft again." };
  }
  editor.focus();
  document.execCommand("selectAll", false, null);
  document.execCommand("insertText", false, summary);
  if (book) {
    const buttons = Array.prototype.slice.call(document.querySelectorAll("button, div[role='button']"));
    const add = buttons.find(function (el) {
      const t = (el.innerText || "").toLowerCase();
      return visible(el) && (t.indexOf("add button") !== -1 || t.indexOf("call to action") !== -1 || t === "button");
    });
    if (add) add.click();
  }
  const postBtn = Array.prototype.slice.call(document.querySelectorAll("button")).find(function (el) {
    const t = (el.innerText || "").trim().toLowerCase();
    return visible(el) && (t === "post" || t === "publish");
  });
  if (postBtn && !postBtn.disabled) {
    postBtn.click();
    return { ok: true, posted: true };
  }
  return { ok: true, posted: false, reason: "Draft is in the composer. Click Post in Chrome if it did not publish." };
}`;

async function preview(data) {
  await ensureChromeTab(data.facebook_page_url, "facebook.com");
  await sleep(2500);
  const facebook = await chromeJs("facebook.com", READ_FACEBOOK);
  if (facebook.error) throw new Error(facebook.error);
  const draft = draftFromFacebook(facebook.message, data.book_url);
  const already = (data.history || []).some((row) => fingerprint(row.summary) === fingerprint(draft.summary));
  return { facebook, draft, already_synced: already };
}

async function publish(data, summary) {
  await ensureChromeTab(data.google_posts_url, "business.google.com");
  await sleep(2500);
  const inject = `function () {
    window.__LUNA_DRAFT = ${JSON.stringify(summary)};
    window.__LUNA_BOOK = ${JSON.stringify(data.book_url)};
    return (${PUBLISH_GOOGLE})();
  }`;
  const result = await chromeJs("business.google.com", inject);
  if (result.error) throw new Error(result.error);
  return result;
}

function statusPayload(data) {
  return {
    server: true,
    facebook_page_url: data.facebook_page_url,
    google_posts_url: data.google_posts_url,
    book_url: data.book_url,
    auto_publish: !!data.auto_publish,
    bot_attached: !!data.bot_attached,
    history: data.history || [],
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    json(res, 204, {});
    return;
  }
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  try {
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const html = fs
        .readFileSync(HTML_PATH, "utf8")
        .replaceAll("href='/'", "href='https://gabes-app-hub.netlify.app/'")
        .replaceAll('href="/"', 'href="https://gabes-app-hub.netlify.app/"');
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/status") {
      json(res, 200, statusPayload(loadData()));
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/history") {
      json(res, 200, { history: loadData().history || [] });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/settings") {
      const body = await readBody(req);
      const data = loadData();
      if (body.facebook_page_url != null) data.facebook_page_url = String(body.facebook_page_url);
      if (body.google_posts_url != null) data.google_posts_url = String(body.google_posts_url);
      if (body.book_url != null) data.book_url = String(body.book_url);
      if (body.auto_publish != null) data.auto_publish = !!body.auto_publish;
      saveData(data);
      json(res, 200, statusPayload(data));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/chrome/connect") {
      const data = loadData();
      await openChromeTab(data.facebook_page_url);
      data.bot_attached = true;
      saveData(data);
      json(res, 200, statusPayload(data));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/preview") {
      const data = loadData();
      const prepared = await preview(data);
      json(res, 200, prepared);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/publish") {
      const body = await readBody(req);
      const data = loadData();
      const summary = (body.draft && body.draft.summary) || "";
      if (!summary) throw new Error("Read the Facebook post first.");
      const already = (data.history || []).some((row) => fingerprint(row.summary) === fingerprint(summary));
      if (already && !body.force) {
        json(res, 200, { duplicate: true, reason: "This post may already be on Google Business.", prepared: { draft: { summary } } });
        return;
      }
      const result = await publish(data, summary);
      data.history = [{ summary, at: new Date().toLocaleString() }].concat(data.history || []).slice(0, 40);
      saveData(data);
      json(res, 200, { ok: true, skipped: false, posted: result.posted, reason: result.reason });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/sync") {
      const body = await readBody(req);
      const data = loadData();
      const prepared = await preview(data);
      if (prepared.already_synced && !body.force) {
        json(res, 200, {
          duplicate: true,
          reason: "This Facebook post looks like one we already sent to Google.",
          prepared,
        });
        return;
      }
      await ensureChromeTab(data.google_posts_url, "business.google.com");
      const result = await publish(data, prepared.draft.summary);
      data.history = [{ summary: prepared.draft.summary, at: new Date().toLocaleString() }].concat(data.history || []).slice(0, 40);
      data.bot_attached = true;
      saveData(data);
      json(res, 200, { ok: true, prepared, posted: result.posted, reason: result.reason });
      return;
    }
    json(res, 404, { error: "Not found" });
  } catch (err) {
    json(res, 400, { ok: false, error: err instanceof Error ? err.message : "Request failed" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("Luna Haus Social Sync is running at http://127.0.0.1:" + PORT);
  console.log("Leave this window open. Chrome → View → Developer → Allow JavaScript from Apple Events.");
});

setInterval(async () => {
  const data = loadData();
  if (!data.auto_publish || !data.bot_attached) return;
  try {
    const prepared = await preview(data);
    if (prepared.already_synced) return;
    await publish(data, prepared.draft.summary);
    data.history = [{ summary: prepared.draft.summary, at: new Date().toLocaleString() }].concat(data.history || []).slice(0, 40);
    saveData(data);
    console.log("Auto-published a Facebook post to Google Business.");
  } catch (err) {
    console.warn("Auto-publish skipped:", err instanceof Error ? err.message : err);
  }
}, 10 * 60 * 1000);
