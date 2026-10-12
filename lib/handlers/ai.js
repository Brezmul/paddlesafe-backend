// ============================================================================
// PaddleSafe - AI Handler (lib/handlers/ai.js)
// Redirige al Coach IA Gemini Flash unificado para garantizar consistencia
// ============================================================================

import coachHandler from "./coach.js";

export default async function handler(req, res) {
  return await coachHandler(req, res);
}
