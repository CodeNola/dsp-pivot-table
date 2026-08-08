// Shared storage for the OTD tracker.
// Uses the standard Redis connection (node-redis) provided by the Vercel Redis
// integration via the KV_REDIS_URL environment variable.
//
// Data model: one Redis hash per date, key "otd:<date>".
//   field "cell:<row>:<col>" -> value      (one field per grid cell)
//   field "station:<i>"      -> label      (editable header labels)
// Cell-level fields mean two people editing different cells never clobber
// each other; only the same cell, edited at the same moment, is last-write-wins.

const { createClient } = require("redis");

// Accept whichever URL name the integration provides.
const REDIS_URL =
  process.env.KV_REDIS_URL ||
  process.env.REDIS_URL ||
  process.env.KV_URL;

// Reuse one client across warm invocations instead of reconnecting every request.
let clientPromise = null;
function getClient() {
  if (!REDIS_URL) {
    throw new Error("Missing KV_REDIS_URL. Connect the Redis store to this project in Vercel.");
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

function safeDate(d) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d || "") ? d : null;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const redis = await getClient();

    if (req.method === "GET") {
      const date = safeDate(req.query.date);
      if (!date) return res.status(400).json({ error: "bad date" });
      const map = await redis.hGetAll("otd:" + date); // { field: value, ... }
      const cells = {}, stations = {};
      for (const f in map) {
        if (f.startsWith("cell:")) cells[f.slice(5)] = map[f];
        else if (f.startsWith("station:")) stations[f.slice(8)] = map[f];
      }
      return res.status(200).json({ date, cells, stations });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const date = safeDate(body.date);
      if (!date) return res.status(400).json({ error: "bad date" });
      const key = "otd:" + date;

      if (body.type === "cell") {
        await redis.hSet(key, "cell:" + String(body.row) + ":" + String(body.col), String(body.value ?? ""));
        return res.status(200).json({ ok: true });
      }
      if (body.type === "station") {
        await redis.hSet(key, "station:" + String(body.i), String(body.value ?? ""));
        return res.status(200).json({ ok: true });
      }
      if (body.type === "reset") {
        await redis.del(key);
        return res.status(200).json({ ok: true });
      }
      return res.status(400).json({ error: "unknown type" });
    }

    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
};