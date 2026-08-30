// Shared storage for the Flex (Pad Dispatch) tracker.
// Uses the SAME Redis store as the OTD tracker (api/state.js), via the Vercel
// Redis integration's KV_REDIS_URL env var — no separate storage to provision.
//
// Data model: one Redis key per board, "flex:<BOARD>".
//   • The whole board state is a single JSON blob stored as a string.
//   • Boards are named by the person who opens the tool (e.g. "PNP1"), so each
//     station/shift gets its own isolated board. Same name = same shared board.
//
// Why a single blob (vs OTD's per-cell fields): the Flex board is one connected
// state object (pads, waves, event log) that changes as a unit, and it's small
// (a few KB), so last-write-wins on the whole blob is simplest and fine here.

// Load the redis client defensively. If the module can't be resolved (e.g. it's
// not in package.json dependencies), we capture the error and return a clean
// message from the handler instead of crashing the whole function.
let createClient = null;
let redisLoadError = null;
try {
  ({ createClient } = require("redis"));
} catch (e) {
  redisLoadError = e;
}

// Accept whichever URL name the integration provides (same as state.js).
const REDIS_URL =
  process.env.KV_REDIS_URL ||
  process.env.REDIS_URL ||
  process.env.KV_URL;

// Reuse one client across warm invocations instead of reconnecting each request.
let clientPromise = null;
function getClient() {
  if (redisLoadError) {
    throw new Error("redis module failed to load: " + (redisLoadError.message || redisLoadError));
  }
  if (!REDIS_URL) {
    throw new Error("Missing KV_REDIS_URL. Connect the Redis store to this project in Vercel, then redeploy.");
  }
  if (!clientPromise) {
    const client = createClient({ url: REDIS_URL });
    client.on("error", () => {}); // avoid crashing the function on transient errors
    clientPromise = client.connect().then(() => client).catch((e) => {
      clientPromise = null; // allow a retry on the next request
      throw e;
    });
  }
  return clientPromise;
}

// Normalize a board name into a safe key segment: uppercase, and keep only
// letters, numbers, and dashes (station codes are ~3 letters + a number).
// Returns null if nothing usable is left.
function safeBoard(b) {
  const s = String(b || "").toUpperCase().replace(/[^A-Z0-9-]/g, "");
  return s.length >= 1 && s.length <= 40 ? s : null;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const redis = await getClient();

    if (req.method === "GET") {
      const board = safeBoard(req.query.board);
      if (!board) return res.status(400).json({ error: "bad board" });
      const raw = await redis.get("flex:" + board);
      // state is null when the board doesn't exist yet (fresh board).
      let state = null;
      if (raw) { try { state = JSON.parse(raw); } catch (e) { state = null; } }
      return res.status(200).json({ board, state });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const board = safeBoard(body.board);
      if (!board) return res.status(400).json({ error: "bad board" });
      const key = "flex:" + board;

      if (body.type === "state") {
        // Save the whole board blob. Reject anything unreasonably large so a
        // runaway payload can't blow the storage budget (2 MB is generous here).
        const incoming = body.state || {};
        const json = JSON.stringify(incoming);
        if (json.length > 2 * 1024 * 1024) {
          return res.status(413).json({ error: "state too large" });
        }
        // Monotonic guard: never let an OLDER save overwrite a NEWER state.
        // This is what makes a reset stick — the reset writes a "cleared" marker
        // with the newest _ts, so a stale/in-flight save (older _ts) landing
        // afterward is ignored instead of resurrecting the board.
        const existingRaw = await redis.get(key);
        if (existingRaw) {
          let existTs = 0;
          try { existTs = Number(JSON.parse(existingRaw)._ts) || 0; } catch (e) {}
          const inTs = Number(incoming._ts) || 0;
          if (inTs < existTs) {
            return res.status(200).json({ ok: true, ignored: true });
          }
        }
        await redis.set(key, json);
        return res.status(200).json({ ok: true });
      }
      if (body.type === "reset") {
        // Export & Clear: delete this board's stored data entirely.
        await redis.del(key);
        return res.status(200).json({ ok: true });
      }
      return res.status(400).json({ error: "unknown type" });
    }

    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    console.error("api/flex failed:", e && (e.stack || e.message || e));
    return res.status(500).json({ error: String(e && (e.message || e)) });
  }
};
