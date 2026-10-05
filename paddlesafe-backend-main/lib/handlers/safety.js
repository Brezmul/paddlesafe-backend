// --- CACHÉ ---
const cache = new Map();

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
    const OPENCAGE_KEY = process.env.OPENCAGE_KEY;
    const STORMGLASS_KEY = process.env.STORMGLASS_KEY;
    const { location, date, timeRange, userLevel } = req.body;

    if (!location || !date || !timeRange || !userLevel) {
      return res.status(400).json({
        ok: false,
        error: "Faltan parámetros",
        required: ["location", "date", "timeRange", "userLevel"]
      });
    }

    // --- CACHÉ ---
    const cacheKey = `safety-${location}-${date}-${timeRange}-${userLevel}`;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < 3600 * 1000) {
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

    const { lat, lng } = geoData.results[0].geometry;
    const altitud = geoData.results[0].annotations.elevation || 0;

    // --- STORMGLASS ---
    const stormRes = await fetch(
      `https://api.stormglass.io/v2/weather/point?lat=${lat}&lng=${lng}&params=waveHeight,wavePeriod,windSpeed,windDirection`,
      { headers: { Authorization: STORMGLASS_KEY } }
    );

    // --- DETECCIÓN DEL LÍMITE GRATUITO ---
    if (stormRes.status === 429) {
      return res.status(429).json({
        ok: false,
        error: "Límite gratuito excedido",
        detalle:
          "Has alcanzado el máximo de 10 solicitudes diarias del plan Free de StormGlass."
      });
    }

    const stormData = await stormRes.json();

    // --- DETECCIÓN DE DATOS VACÍOS ---
    if (!stormData.hours || stormData.hours.length === 0) {
      return res.status(200).json({
        ok: false,
        error: "StormGlass no devolvió datos",
        detalle:
          "Puede deberse a límite excedido, ubicación sin datos o parámetros no disponibles."
      });
    }

    // --- HORA CENTRAL ---
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

    if (condiciones.viento > 15) {
      alertas.push("Viento fuerte: no recomendado para SUP.");
    }

    if (condiciones.oleaje > 1.2) {
      alertas.push("Oleaje alto: riesgo de caída.");
    }

    if (condiciones.periodo > 12) {
      alertas.push("Swell largo: series potentes.");
    }

    if (condiciones.direccion > 160 && condiciones.direccion < 200) {
      alertas.push("Viento offshore: riesgo de ser arrastrado mar adentro.");
    }

    if (altitud > 20) {
      alertas.push("Costa elevada: posibles corrientes fuertes.");
    }

    if (alertas.length === 0) {
      alertas.push("Sin alertas críticas.");
    }

    // --- REGLAS DE SEGURIDAD ---
    const reglas = [
      "Usa leash siempre.",
      "Evita navegar solo.",
      "Mantén distancia de rocas y espigones.",
      "Revisa el material antes de entrar al agua.",
      "Evita viento offshore.",
      "Lleva chaleco si eres principiante."
    ];

    // --- RECOMENDACIONES PERSONALIZADAS ---
    const recomendaciones = [
      "Elige horas con viento bajo.",
      "Oleaje < 0.8m es ideal para SUP.",
      "Periodo corto suele ser más estable.",
      "Si el score < 50, evita salir al mar."
    ];

    const responseData = {
      ok: true,
      location,
      coordenadas: { lat, lng },
      altitud,
      condiciones,
      score_seguridad: score,
      alertas,
      reglas,
      recomendaciones
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
