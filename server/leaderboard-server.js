const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "leaderboard.json");
const API_TOKEN = process.env.LEADERBOARD_TOKEN || "";

function ensureDataFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "[]\n", "utf8");
  }
}

function readEntries() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return normalizeEntries(parsed);
  } catch (error) {
    return [];
  }
}

function writeEntries(entries) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(normalizeEntries(entries), null, 2) + "\n", "utf8");
}

function normalizeEntries(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .filter((entry) => entry && typeof entry.name === "string" && Number.isFinite(Number(entry.score)))
    .map((entry) => ({
      id: String(entry.id || crypto.randomUUID()),
      name: String(entry.name).replace(/\s+/g, " ").trim().slice(0, 18) || "שחקן",
      score: Number(entry.score),
      combo: Number(entry.combo) || 0,
      stage: Number(entry.stage) || 1,
      completedAt: Number(entry.completedAt) || Date.now()
    }))
    .sort((a, b) => b.score - a.score || a.completedAt - b.completedAt)
    .slice(0, 5);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Body too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function isAuthorized(req) {
  if (!API_TOKEN) {
    return true;
  }

  const auth = req.headers.authorization || "";
  return auth === `Bearer ${API_TOKEN}`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (url.pathname === "/leaderboard" && req.method === "GET") {
    const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 5, 20));
    const entries = readEntries().slice(0, limit);
    sendJson(res, 200, { entries });
    return;
  }

  if (url.pathname === "/leaderboard" && req.method === "POST") {
    if (!isAuthorized(req)) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }

    try {
      const rawBody = await readBody(req);
      const payload = JSON.parse(rawBody || "{}");
      const entries = readEntries()
        .filter((entry) => entry.id !== payload.id)
        .concat(payload);
      const normalized = normalizeEntries(entries);
      writeEntries(normalized);
      sendJson(res, 200, { ok: true, entries: normalized });
    } catch (error) {
      sendJson(res, 400, { error: "Invalid payload" });
    }
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`Leaderboard server listening on http://127.0.0.1:${PORT}`);
});
