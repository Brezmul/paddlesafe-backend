import coachHandler from "./coach.js";
import routeCoachHandler from "./route_coach.js";

export default async function handler(req, res) {
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch {}
  }
  const type = req.query?.type || body?.type;
  if (type === "route_analysis" || req.query?.action === "analyze_route") {
    return await routeCoachHandler(req, res);
  }
  return await coachHandler(req, res);
}
