import { decryptApiKey } from "./credentials.js";

// --- CACHÉ ---
const cache = new Map();

// --- SCORE GEOGRÁFICO ---
function calcularGeoScore(altitud, tipoCosta) {
  let score = 100;

  // Altitud
  if (altitud > 20) score -= 20;
  if (altitud > 50) score -= 40;

  // Tipo de costa
  if (tipoCosta === "acantilado") score -= 40;
  if (tipoCosta === "rocas") score -= 20;
  if (tipoCosta === "playa") score -= 0;

  return Math.max(0, Math.min(100, score));
}

// --- DETECTAR TIPO DE COSTA ---
function detectarTipoCosta(annotations) {
  const comp = annotations?.components || {};

  if (comp?.cliff) return "acantilado";
  if (comp?.rock) return "rocas";
  if (comp?.beach) return "playa";

  return "desconocido";
}

// --- RECOMENDACIONES ---
function recomendaciones(tipoCosta, altitud, score) {
  const rec = [];

  if (tipoCosta === "acantilado") {
    rec.push("Evita acercarte a la pared del acantilado.");
    rec.push("Mantén distancia de zonas con corrientes fuertes.");
  }

  if (tipoCosta === "rocas") {
    rec.push("Mantén distancia de las rocas para evitar golpes.");
    rec.push("Evita entrar o salir del agua en zonas rocosas.");
  }

  if (tipoCosta === "playa") {
    rec.push("Entrada y salida del agua seguras.");
    rec.push("Ideal para principiantes.");
  }

  if (altitud > 20) {
    rec.push("La costa elevada puede generar corrientes fuertes.");
  }

  if (score < 50) {
    rec.push("La geografía del spot requiere experiencia.");
  }

  return rec;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const OPENCAGE_KEY = decryptApiKey("ENC_OPENCAGE");
    const { location } = req.body;

    if (!location) {
      return res.status(400).json({
        ok: false,
        error: "Falta el parámetro 'location'",
        required: ["location"]
      });
    }

    // --- CACHÉ ---
    const cacheKey = `geoanalyze-${location}`;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < 24 * 3600 * 1000) {
      return res.status(200).json({ ok: true, cached: true, ...cached.data });
    }

    // --- GEOCODING ---
    const geoRes = await fetch(
      `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(
        location
      )}&key=${OPENCAGE_KEY}`
    );

    const geoData = await geoRes.json();

    if (!geoData.results?.length) {
      return res.status(404).json({
        ok: false,
        error: "No se encontraron coordenadas"
      });
    }

    const result = geoData.results[0];
    const { lat, lng } = result.geometry;
    const altitud = result.annotations.elevation || 0;
    const tipoCosta = detectarTipoCosta(result.annotations);

    // --- SCORE ---
    const score = calcularGeoScore(altitud, tipoCosta);

    // --- RECOMENDACIONES ---
    const rec = recomendaciones(tipoCosta, altitud, score);

    const responseData = {
      ok: true,
      location,
      coordenadas: { lat, lng },
      altitud,
      tipoCosta,
      score_geografico: score,
      recomendaciones: rec
    };

    // --- GUARDAR EN CACHÉ ---
    cache.set(cacheKey, { timestamp: Date.now(), data: responseData });

    return res.status(200).json(responseData);

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Error interno",
      details: error.message
    });
  }
}
