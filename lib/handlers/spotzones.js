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

// --- SEMÁFORO ---
function semaforo(score) {
  if (score >= 70) return "Verde";
  if (score >= 40) return "Amarillo";
  return "Rojo";
}

// --- GENERAR ZONAS ---
function generarZonas(lat, lng) {
  const delta = 0.002; // ~200m
  return [
    { nombre: "Zona Norte", lat: lat + delta, lng: lng },
    { nombre: "Zona Sur", lat: lat - delta, lng: lng },
    { nombre: "Zona Este", lat: lat, lng: lng + delta },
    { nombre: "Zona Oeste", lat: lat, lng: lng - delta },
    { nombre: "Zona Central", lat, lng }
  ];
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
    const cacheKey = `spotzones-${location}-${date}-${timeRange}-${userLevel}`;
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

    const { lat, lng } = geoData.results[0].geometry;

    // --- GENERAR ZONAS ---
    const zonas = generarZonas(lat, lng);

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
    let resultado;

    if (!stormData.hours || stormData.hours.length === 0) {
      resultado = zonas.map((zona) => ({
        zona: zona.nombre,
        lat: zona.lat,
        lng: zona.lng,
        score: 0,
        semaforo: "Rojo",
        condiciones: null,
        alertas: ["Sin datos"]
      }));
    } else {
      const h = stormData.hours[Math.floor(stormData.hours.length / 2)];
      const condicionesBase = {
        viento: (h.windSpeed?.sg || 0) * 3.6,
        oleaje: h.waveHeight?.sg || 0,
        periodo: h.wavePeriod?.sg || 0,
        direccion: h.windDirection?.sg || 0
      };

      resultado = zonas.map((zona) => {
        const variacion = Math.sin((zona.lat - lat) * 800 + (zona.lng - lng) * 800) * 0.05;
        const condiciones = {
          ...condicionesBase,
          viento: Number((condicionesBase.viento * (1 + variacion)).toFixed(2)),
          oleaje: Number((condicionesBase.oleaje * (1 - variacion)).toFixed(2))
        };

        const score = calcularScore(condiciones, userLevel);
        const color = semaforo(score);
        const alertas = [];

        if (condiciones.viento > 15) alertas.push("Viento fuerte");
        if (condiciones.oleaje > 1.2) alertas.push("Oleaje alto");
        if (condiciones.periodo > 12) alertas.push("Swell largo");
        if (condiciones.direccion > 160 && condiciones.direccion < 200)
          alertas.push("Viento offshore");

        if (alertas.length === 0) alertas.push("Sin alertas críticas");

        return {
          zona: zona.nombre,
          lat: zona.lat,
          lng: zona.lng,
          score,
          semaforo: color,
          condiciones,
          alertas
        };
      });
    }

    const responseData = {
      ok: true,
      location,
      zonas: resultado
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
