// Serverless function: shared storage for the OTD tracker.
// Uses a Redis REST store (Vercel KV or Upstash) via env vars — no npm deps needed.
//
// Data model: one Redis hash per date, key "otd:<date>".
//   field "cell:<row>:<col>" -> value          (one field per grid cell)
//   field "station:<i>"      -> label          (editable header labels)
// Cell-level fields mean two people editing different cells never clobber
// each other; only the exact same cell, edited at the same moment, is last-write-wins.

const URL   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(cmd) {
  if (!URL || !TOKEN) {
    throw new Error("Missing Redis env vars. Set KV_REST_API_URL and KV_REST_API_TOKEN in Vercel.");
  }
  const r = await fetch(URL, {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

function safeDate(d) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d || "") ? d : null;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    if (req.method === "GET") {
      const date = safeDate(req.query.date);
      if (!date) return res.status(400).json({ error: "bad date" });
      const flat = await redis(["HGETALL", "otd:" + date]); // [f,v,f,v,...]
      const cells = {}, stations = {};
      if (Array.isArray(flat)) {
        for (let i = 0; i < flat.length; i += 2) {
          const f = flat[i], v = flat[i + 1];
          if (f.startsWith("cell:")) cells[f.slice(5)] = v;
          else if (f.startsWith("station:")) stations[f.slice(8)] = v;
        }
      }
      return res.status(200).json({ date, cells, stations });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const date = safeDate(body.date);
      if (!date) return res.status(400).json({ error: "bad date" });
      const key = "otd:" + date;

      if (body.type === "cell") {
        const field = "cell:" + String(body.row) + ":" + String(body.col);
        await redis(["HSET", key, field, String(body.value ?? "")]);
        return res.status(200).json({ ok: true });
      }
      if (body.type === "station") {
        await redis(["HSET", key, "station:" + String(body.i), String(body.value ?? "")]);
        return res.status(200).json({ ok: true });
      }
      if (body.type === "reset") {
        await redis(["DEL", key]);
        return res.status(200).json({ ok: true });
      }
      return res.status(400).json({ error: "unknown type" });
    }

    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
};