const ai = () => import("../lib/handlers/ai.js");
const alerts = () => import("../lib/handlers/alerts.js");
const coach = () => import("../lib/handlers/coach.js");
const compare = () => import("../lib/handlers/compare.js");
const conditions = () => import("../lib/handlers/conditions.js");
const dashboard = () => import("../lib/handlers/dashboard.js");
const forecast = () => import("../lib/handlers/forecast.js");
const geoanalyze = () => import("../lib/handlers/geoanalyze.js");
const heatmap = () => import("../lib/handlers/heatmap.js");
const history = () => import("../lib/handlers/history.js");
const levels = () => import("../lib/handlers/levels.js");
const map = () => import("../lib/handlers/map.js");
const profile = () => import("../lib/handlers/profile.js");
const radar = () => import("../lib/handlers/radar.js");
const route = () => import("../lib/handlers/route.js");
const safety = () => import("../lib/handlers/safety.js");
const spotinfo = () => import("../lib/handlers/spotinfo.js");
const spotlist = () => import("../lib/handlers/spotlist.js");
const spotquality = () => import("../lib/handlers/spotquality.js");
const spotrating = () => import("../lib/handlers/spotrating.js");
const spotzones = () => import("../lib/handlers/spotzones.js");
const status = () => import("../lib/handlers/status.js");
const summary = () => import("../lib/handlers/summary.js");
const terrain = () => import("../lib/handlers/terrain.js");
const tides = () => import("../lib/handlers/tides.js");
const warnings = () => import("../lib/handlers/warnings.js");

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const { action } = req.query;

  try {
    switch (action) {
      case "ai":
        return await (await ai()).default(req, res);
      case "alerts":
        return await (await alerts()).default(req, res);
      case "coach":
        return await (await coach()).default(req, res);
      case "compare":
        return await (await compare()).default(req, res);
      case "conditions":
        return await (await conditions()).default(req, res);
      case "dashboard":
        return await (await dashboard()).default(req, res);
      case "forecast":
        return await (await forecast()).default(req, res);
      case "geoanalyze":
        return await (await geoanalyze()).default(req, res);
      case "heatmap":
        return await (await heatmap()).default(req, res);
      case "history":
        return await (await history()).default(req, res);
      case "levels":
        return await (await levels()).default(req, res);
      case "map":
        return await (await map()).default(req, res);
      case "profile":
        return await (await profile()).default(req, res);
      case "radar":
        return await (await radar()).default(req, res);
      case "route":
        return await (await route()).default(req, res);
      case "safety":
        return await (await safety()).default(req, res);
      case "spotinfo":
        return await (await spotinfo()).default(req, res);
      case "spotlist":
        return await (await spotlist()).default(req, res);
      case "spotquality":
        return await (await spotquality()).default(req, res);
      case "spotrating":
        return await (await spotrating()).default(req, res);
      case "spotzones":
        return await (await spotzones()).default(req, res);
      case "status":
        return await (await status()).default(req, res);
      case "summary":
        return await (await summary()).default(req, res);
      case "terrain":
        return await (await terrain()).default(req, res);
      case "tides":
        return await (await tides()).default(req, res);
      case "warnings":
        return await (await warnings()).default(req, res);
      default:
        return res.status(404).json({ error: "Acción no válida" });
    }
  } catch (error) {
    return res.status(500).json({ error: "Error interno", details: error.message });
  }
}