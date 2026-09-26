import { decryptApiKey } from "./credentials.js";

// --- CACHÉ ---
const cache = new Map();

// --- DISTANCIA ENTRE DOS COORDENADAS (km) ---
function distanciaKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// --- SCORE DE SEGURIDAD ---
function calcularScore(cond, userLevel) {
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const OPENCAGE_KEY = decryptApiKey("ENC_OPENCAGE");
    const STORMGLASS_KEY = decryptApiKey("ENC_STORMGLASS");
    const { origin, destination, date, timeRange, userLevel } = req.body;

    if (!origin || !destination || !date || !timeRange || !userLevel) {
      return res.status(400).json({
        ok: false,
        error: "Faltan parámetros",
        required: ["origin", "destination", "date", "timeRange", "userLevel"]
      });
    }

    // --- CACHÉ ---
    const cacheKey = `route-${origin}-${destination}-${date}-${timeRange}-${userLevel}`;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < 3600 * 1000) {
      return res.status(200).json({ ok: true, cached: true, ...cached.data });
    }

    // --- GEOCODING ORIGEN ---
    const geoA = await fetch(
      `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(
        origin
      )}&key=${OPENCAGE_KEY}`
    );
    const dataA = await geoA.json();
    if (!dataA.results?.length) {
      return res.status(404).json({ ok: false, error: "Origen no encontrado" });
    }
    const { lat: latA, lng: lngA } = dataA.results[0].geometry;

    // --- GEOCODING DESTINO ---
    const geoB = await fetch(
      `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(
        destination
      )}&key=${OPENCAGE_KEY}`
    );
    const dataB = await geoB.json();
    if (!dataB.results?.length) {
      return res.status(404).json({ ok: false, error: "Destino no encontrado" });
    }
    const { lat: latB, lng: lngB } = dataB.results[0].geometry;

    // --- DISTANCIA ---
    const distancia = distanciaKm(latA, lngA, latB, lngB);

    // --- TIEMPO ESTIMADO ---
    let velocidad = 4; // km/h
    if (userLevel === "Intermedio") velocidad = 5;
    if (userLevel === "Avanzado") velocidad = 6;

    const tiempoHoras = Number((distancia / velocidad).toFixed(2));

    // --- STORMGLASS (condiciones en el origen) ---
    const stormRes = await fetch(
      `https://api.stormglass.io/v2/weather/point?lat=${latA}&lng=${lngA}&params=waveHeight,wavePeriod,windSpeed,windDirection`,
      { headers: { Authorization: STORMGLASS_KEY } }
    );

    if (stormRes.status === 429) {
      return res.status(429).json({
        ok: false,
        error: "Límite gratuito excedido",
        detalle:
          "Has alcanzado el máximo de 10 solicitudes diarias del plan Free de StormGlass."
      });
    }

    const stormData = await stormRes.json();

    if (!stormData.hours || stormData.hours.length === 0) {
      return res.status(200).json({
        ok: false,
        error: "StormGlass no devolvió datos",
        detalle:
          "Puede deberse a límite excedido, ubicación sin datos o parámetros no disponibles."
      });
    }

    const h = stormData.hours[Math.floor(stormData.hours.length / 2)];

    const condiciones = {
      viento: h.windSpeed?.sg || 0,
      oleaje: h.waveHeight?.sg || 0,
      periodo: h.wavePeriod?.sg || 0,
      direccion: h.windDirection?.sg || 0
    };

    // --- SCORE ---
    const score = calcularScore(condiciones, userLevel);

    // --- ALERTAS ---
    const alertas = [];

    if (condiciones.viento > 15) alertas.push("Viento fuerte: no recomendado.");
    if (condiciones.oleaje > 1.2) alertas.push("Oleaje alto: riesgo de caída.");
    if (condiciones.periodo > 12) alertas.push("Swell largo: series potentes.");
    if (condiciones.direccion > 160 && condiciones.direccion < 200)
      alertas.push("Viento offshore: riesgo de ser arrastrado mar adentro.");

    if (alertas.length === 0) alertas.push("Sin alertas críticas.");

    const responseData = {
      ok: true,
      origen: { name: origin, lat: latA, lng: lngA },
      destino: { name: destination, lat: latB, lng: lngB },
      distancia_km: Number(distancia.toFixed(2)),
      tiempo_estimado_horas: tiempoHoras,
      condiciones,
      score_seguridad: score,
      alertas,
      recomendaciones: [
        "Evita viento offshore.",
        "Lleva agua y protección solar.",
        "Revisa el material antes de salir.",
        "Si el score < 50, evita realizar la ruta."
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
