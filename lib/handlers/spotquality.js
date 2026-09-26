import { decryptApiKey } from "./credentials.js";

// --- CACHÉ ---
const cache = new Map();

// --- SCORE SEGURIDAD ---
function scoreSeguridad(cond, userLevel) {
  let score = 100;

  if (cond.viento > 10) score -= 20;
  if (cond.viento > 15) score -= 40;

  if (cond.oleaje > 0.8) score -= 20;
  if (cond.oleaje > 1.2) score -= 40;

  if (cond.periodo > 12) score -= 15;

  if (cond.direccion > 160 && cond.direccion < 200) score -= 30;

  if (userLevel === "Principiante") {
    if (cond.viento > 10) score -= 20;
    if (cond.oleaje > 0.8) score -= 20;
  }

  return Math.max(0, Math.min(100, score));
}

// --- SCORE GEOGRÁFICO ---
function scoreGeografico(altitud, tipoCosta) {
  let score = 100;

  if (altitud > 20) score -= 20;
  if (altitud > 50) score -= 40;

  if (tipoCosta === "acantilado") score -= 40;
  if (tipoCosta === "rocas") score -= 20;

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

// --- CATEGORÍA FINAL ---
function categoria(score) {
  if (score >= 80) return "Excelente";
  if (score >= 60) return "Bueno";
  if (score >= 40) return "Regular";
  return "Malo";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const OPENCAGE_KEY = decryptApiKey("ENC_OPENCAGE");
    const STORMGLASS_KEY = decryptApiKey("ENC_STORMGLASS");
    const { location, date, timeRange, userLevel } = req.body;

    if (!location || !date || !timeRange || !userLevel) {
      return res.status(400).json({
        ok: false,
        error: "Faltan parámetros",
        required: ["location", "date", "timeRange", "userLevel"]
      });
    }

    // --- CACHÉ ---
    const cacheKey = `spotquality-${location}-${date}-${timeRange}-${userLevel}`;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < 1800 * 1000) {
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

    // --- STORMGLASS ---
    const stormRes = await fetch(
      `https://api.stormglass.io/v2/weather/point?lat=${lat}&lng=${lng}&params=waveHeight,wavePeriod,windSpeed,windDirection`,
      { headers: { Authorization: STORMGLASS_KEY } }
    );

    if (stormRes.status === 429) {
      return res.status(429).json({
        ok: false,
        error: "Límite gratuito excedido",
        detalle: "Has alcanzado el máximo de 10 solicitudes diarias del plan Free de StormGlass."
      });
    }

    const stormData = await stormRes.json();

    if (!stormData.hours || stormData.hours.length === 0) {
      return res.status(200).json({
        ok: false,
        error: "StormGlass no devolvió datos"
      });
    }

    const h = stormData.hours[Math.floor(stormData.hours.length / 2)];

    const condiciones = {
      viento: h.windSpeed?.sg || 0,
      oleaje: h.waveHeight?.sg || 0,
      periodo: h.wavePeriod?.sg || 0,
      direccion: h.windDirection?.sg || 0
    };

    // --- SCORES ---
    const score1 = scoreSeguridad(condiciones, userLevel);
    const score2 = scoreGeografico(altitud, tipoCosta);

    const scoreFinal = Number(((score1 * 0.6) + (score2 * 0.4)).toFixed(1));
    const categoriaFinal = categoria(scoreFinal);

    // --- ALERTAS ---
    const alertas = [];

    if (condiciones.viento > 15) alertas.push("Viento fuerte");
    if (condiciones.oleaje > 1.2) alertas.push("Oleaje alto");
    if (condiciones.periodo > 12) alertas.push("Swell largo");
    if (condiciones.direccion > 160 && condiciones.direccion < 200)
      alertas.push("Viento offshore");

    if (altitud > 20) alertas.push("Costa elevada: posibles corrientes fuertes");
    if (tipoCosta === "acantilado") alertas.push("Acantilado: riesgo elevado");

    if (alertas.length === 0) alertas.push("Sin alertas críticas");

    const responseData = {
      ok: true,
      location,
      coordenadas: { lat, lng },
      altitud,
      tipoCosta,
      condiciones,
      score_seguridad: score1,
      score_geografico: score2,
      score_final: scoreFinal,
      categoria: categoriaFinal,
      alertas,
      recomendaciones: [
        "Evita viento offshore.",
        "Oleaje < 0.8m es ideal para SUP.",
        "Si la categoría es 'Malo', evita salir al agua.",
        "La costa elevada puede generar corrientes fuertes."
      ]
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
