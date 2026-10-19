// Shared storage for the Pad Staging Board. Same Redis store as Flex / OTD (KV_REDIS_URL).
// ONE Redis HASH per board, "stg:<BOARD>":
//   "meta"        = JSON { _ts, plan:[[route,wave,staging,pkgs]…], cfg:{c1,r1,c2,r2,red} }
//   "s:<pad>:<i>" = JSON { n:"CX15", m:<ms> }   (one field per slot → no typing collisions)
// Storage is kept tiny on purpose: no driver names are ever stored, and the whole key
// auto-expires 36h after the last write. "reset" deletes it immediately.

let createClient = null, loadErr = null;
try { ({ createClient } = require("redis")); } catch (e) { loadErr = e; }
const REDIS_URL = process.env.KV_REDIS_URL || process.env.REDIS_URL || process.env.KV_URL;
const TTL = 36 * 3600;

function clientOptions() {
  try {
    const u = new URL(REDIS_URL);
    const o = {
      username: u.username ? decodeURIComponent(u.username) : undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined,
      socket: { host: u.hostname, port: u.port ? Number(u.port) : 6379, tls: u.protocol === "rediss:",
                reconnectStrategy: (n) => Math.min(n * 50, 2000) },
    };
    const db = u.pathname && u.pathname.length > 1 ? Number(u.pathname.slice(1)) : NaN;
    if (!Number.isNaN(db)) o.database = db;
    return o;
  } catch (e) { return { url: REDIS_URL }; }
}

let client = null, clientPromise = null;
function getClient() {
  if (loadErr) throw new Error("redis module failed to load: " + loadErr.message);
  if (!REDIS_URL) throw new Error("Missing KV_REDIS_URL.");
  if (client && client.isReady) return Promise.resolve(client);
  if (!clientPromise) {
    const c = createClient(clientOptions());
    c.on("error", () => { clientPromise = null; client = null; });
    clientPromise = c.connect().then(() => { client = c; return c; })
      .catch((e) => { clientPromise = null; client = null; throw e; });
  }
  return clientPromise;
}

const safeBoard = (b) => { const s = String(b || "").toUpperCase().replace(/[^A-Z0-9-]/g, ""); return s.length >= 1 && s.length <= 40 ? s : null; };
const safeInt = (v, max) => { const n = parseInt(v, 10); return isNaN(n) || n < 0 || n > max ? null : n; };
function slotField(p, i) { const a = safeInt(p, 2), b = safeInt(i, 400); return a === null || b === null ? null : "s:" + a + ":" + b; }

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
      const h = await redis.hGetAll("stg:" + board);
      let meta = null;
      try { meta = h && h.meta ? JSON.parse(h.meta) : null; } catch (e) {}
      const slots = {};
      for (const f in h || {}) {
        if (f.startsWith("s:")) {
          const [, p, i] = f.split(":");
          try { (slots[p] = slots[p] || {})[i] = JSON.parse(h[f]); } catch (e) {}
        }
      }
      return res.status(200).json({ board, meta, slots });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const board = safeBoard(body.board);
      if (!board) return res.status(400).json({ error: "bad board" });
      const key = "stg:" + board;

      if (body.type === "meta") {
        const json = JSON.stringify(body.meta || {});
        if (json.length > 1024 * 1024) return res.status(413).json({ error: "too large" });
        await redis.hSet(key, "meta", json);
      } else if (body.type === "slot") {
        const f = slotField(body.padId, body.i);
        if (!f) return res.status(400).json({ error: "bad slot" });
        const inc = body.slot || {};
        const cur = await redis.hGet(key, f);
        if (cur) { try { if ((+inc.m || 0) < (+JSON.parse(cur).m || 0)) return res.status(200).json({ ok: true, ignored: true }); } catch (e) {} }
        if (inc.n) await redis.hSet(key, f, JSON.stringify({ n: String(inc.n).slice(0, 12), m: +inc.m || Date.now() }));
        else await redis.hDel(key, f);                       // empty slot = delete the field (saves space)
      } else if (body.type === "clearslots") {
        const fields = (await redis.hKeys(key)).filter((f) => f.startsWith("s:"));
        if (fields.length) await redis.hDel(key, fields);
        return res.status(200).json({ ok: true });
      } else if (body.type === "reset") {
        await redis.del(key);
        return res.status(200).json({ ok: true });
      } else return res.status(400).json({ error: "unknown type" });

      await redis.expire(key, TTL);
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    console.error("api/staging failed:", e && (e.stack || e.message || e));
    return res.status(500).json({ error: String(e && (e.message || e)) });
  }
};
