// Shared storage for the Flex (Pad Dispatch) tracker.
// Uses the SAME Redis store as the OTD tracker, via the Vercel Redis integration's
// KV_REDIS_URL env var.
//
// Data model: ONE Redis HASH per board, "flex:<BOARD>", with:
//   • field "meta"        = JSON of the board STRUCTURE (pads' names/roles/waves/
//                           config/layout/stageMap/manifest/log…). Whole-blob,
//                           last-write-wins — fine because structure rarely changes
//                           from two people at once.
//   • field "s:<padId>:<i>" = JSON of ONE slot {s,t,n,g,a,m}
//                           (status, type, number, stage, auto-flag, modified-ms).
//
// Why per-slot fields: the old design saved the whole board as one blob, so when
// two people typed at once, one blob overwrote the other and a typed route was
// lost. Writing each slot as its own hash field means two people editing different
// slots write different fields — Redis keeps both, nothing is lost. (This mirrors
// how the OTD tracker stores one field per cell.)

let createClient = null, redisLoadError = null;
try { ({ createClient } = require("redis")); } catch (e) { redisLoadError = e; }

const REDIS_URL = process.env.KV_REDIS_URL || process.env.REDIS_URL || process.env.KV_URL;

let clientPromise = null;
function getClient() {
  if (redisLoadError) throw new Error("redis module failed to load: " + (redisLoadError.message || redisLoadError));
  if (!REDIS_URL) throw new Error("Missing KV_REDIS_URL. Connect the Redis store to this project in Vercel, then redeploy.");
  if (!clientPromise) {
    const client = createClient({ url: REDIS_URL });
    client.on("error", () => {});
    clientPromise = client.connect().then(() => client).catch((e) => { clientPromise = null; throw e; });
  }
  return clientPromise;
}

function safeBoard(b) {
  const s = String(b || "").toUpperCase().replace(/[^A-Z0-9-]/g, "");
  return s.length >= 1 && s.length <= 40 ? s : null;
}
function safeInt(v, max) {
  const n = parseInt(v, 10);
  if (isNaN(n) || n < 0 || n > max) return null;
  return n;
}
function slotField(padId, i) {
  const p = safeInt(padId, 100000), idx = safeInt(i, 200);
  if (p === null || idx === null) return null;
  return "s:" + p + ":" + idx;
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
      const h = await redis.hGetAll("flex:" + board);
      if (!h || !Object.keys(h).length) return res.status(200).json({ board, state: null });
      let meta = null;
      try { meta = h.meta ? JSON.parse(h.meta) : null; } catch (e) { meta = null; }
      if (!meta) return res.status(200).json({ board, state: null });
      // Collect the per-slot fields into { padId: { slotIndex: {s,t,n,g,a,m} } }.
      const slots = {};
      for (const f in h) {
        if (f.charCodeAt(0) === 115 && f[1] === ":") {   // starts with "s:"
          const parts = f.split(":");                    // ["s", padId, i]
          const pid = parts[1], idx = parts[2];
          try { (slots[pid] = slots[pid] || {})[idx] = JSON.parse(h[f]); } catch (e) {}
        }
      }
      return res.status(200).json({ board, state: { meta, slots } });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const board = safeBoard(body.board);
      if (!board) return res.status(400).json({ error: "bad board" });
      const key = "flex:" + board;

      // Save the STRUCTURE blob (everything except live slot contents).
      if (body.type === "meta") {
        const meta = body.meta || {};
        const json = JSON.stringify(meta);
        if (json.length > 2 * 1024 * 1024) return res.status(413).json({ error: "meta too large" });
        // Monotonic guard: don't let an older structure overwrite a newer one.
        const existing = await redis.hGet(key, "meta");
        if (existing) {
          let e = 0; try { e = Number(JSON.parse(existing)._ts) || 0; } catch (x) {}
          if ((Number(meta._ts) || 0) < e) return res.status(200).json({ ok: true, ignored: true });
        }
        await redis.hSet(key, "meta", json);
        return res.status(200).json({ ok: true });
      }

      // Save ONE slot (the collision-free path used while people type).
      if (body.type === "slot") {
        const f = slotField(body.padId, body.i);
        if (!f) return res.status(400).json({ error: "bad slot" });
        const incoming = body.slot || {};
        // Per-slot monotonic guard (best-effort): ignore an older write for this slot.
        const cur = await redis.hGet(key, f);
        if (cur) { try { if ((Number(incoming.m) || 0) < (Number(JSON.parse(cur).m) || 0)) return res.status(200).json({ ok: true, ignored: true }); } catch (x) {} }
        await redis.hSet(key, f, JSON.stringify(incoming));
        return res.status(200).json({ ok: true });
      }

      // Save MANY slots at once (used after wave hand-off / clear / dispatch /
      // capacity change, which change a whole pad's slots together).
      if (body.type === "slots") {
        const entries = {};
        (body.slots || []).forEach(o => {
          const f = slotField(o.padId, o.i);
          if (f) entries[f] = JSON.stringify(o.slot || {});
        });
        const keys = Object.keys(entries);
        if (keys.length) {
          // node-redis v4 accepts an object for multi-field HSET.
          await redis.hSet(key, entries);
        }
        return res.status(200).json({ ok: true });
      }

      // Remove specific slot fields (e.g. a removed pad's leftovers).
      if (body.type === "delslots") {
        const fields = (body.fields || []).map(f => {
          const parts = String(f).split(":");
          return slotField(parts[1], parts[2]);
        }).filter(Boolean);
        if (fields.length) await redis.hDel(key, fields);
        return res.status(200).json({ ok: true });
      }

      // Clear the whole board (End Session / Reset).
      if (body.type === "reset") {
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
