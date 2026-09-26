import aiHandler from "../lib/handlers/ai.js";
import alertsHandler from "../lib/handlers/alerts.js";
import coachHandler from "../lib/handlers/coach.js";
import compareHandler from "../lib/handlers/compare.js";
import conditionsHandler from "../lib/handlers/conditions.js";
import dashboardHandler from "../lib/handlers/dashboard.js";
import forecastHandler from "../lib/handlers/forecast.js";
import geoanalyzeHandler from "../lib/handlers/geoanalyze.js";
import heatmapHandler from "../lib/handlers/heatmap.js";
import historyHandler from "../lib/handlers/history.js";
import levelsHandler from "../lib/handlers/levels.js";
import mapHandler from "../lib/handlers/map.js";
import profileHandler from "../lib/handlers/profile.js";
import radarHandler from "../lib/handlers/radar.js";
import routeHandler from "../lib/handlers/route.js";
import safetyHandler from "../lib/handlers/safety.js";
import spotinfoHandler from "../lib/handlers/spotinfo.js";
import spotlistHandler from "../lib/handlers/spotlist.js";
import spotqualityHandler from "../lib/handlers/spotquality.js";
import spotratingHandler from "../lib/handlers/spotrating.js";
import spotzonesHandler from "../lib/handlers/spotzones.js";
import statusHandler from "../lib/handlers/status.js";
import summaryHandler from "../lib/handlers/summary.js";
import terrainHandler from "../lib/handlers/terrain.js";
import tidesHandler from "../lib/handlers/tides.js";
import warningsHandler from "../lib/handlers/warnings.js";

export default async function handler(req, res) {
  const { action } = req.query;

  try {
    switch (action) {
      case "ai": return await aiHandler(req, res);
      case "alerts": return await alertsHandler(req, res);
      case "coach": return await coachHandler(req, res);
      case "compare": return await compareHandler(req, res);
      case "conditions": return await conditionsHandler(req, res);
      case "dashboard": return await dashboardHandler(req, res);
      case "forecast": return await forecastHandler(req, res);
      case "geoanalyze": return await geoanalyzeHandler(req, res);
      case "heatmap": return await heatmapHandler(req, res);
      case "history": return await historyHandler(req, res);
      case "levels": return await levelsHandler(req, res);
      case "map": return await mapHandler(req, res);
      case "profile": return await profileHandler(req, res);
      case "radar": return await radarHandler(req, res);
      case "route": return await routeHandler(req, res);
      case "safety": return await safetyHandler(req, res);
      case "spotinfo": return await spotinfoHandler(req, res);
      case "spotlist": return await spotlistHandler(req, res);
      case "spotquality": return await spotqualityHandler(req, res);
      case "spotrating": return await spotratingHandler(req, res);
      case "spotzones": return await spotzonesHandler(req, res);
      case "status": return await statusHandler(req, res);
      case "summary": return await summaryHandler(req, res);
      case "terrain": return await terrainHandler(req, res);
      case "tides": return await tidesHandler(req, res);
      case "warnings": return await warningsHandler(req, res);
      default:
        return res.status(404).json({ error: "Acción no válida" });
    }
  } catch (error) {
    return res.status(500).json({ error: "Error interno", details: error.message });
  }
}