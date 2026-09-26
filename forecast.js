// --- CACHÉ EN MEMORIA ---
const cache = new Map();

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
    const cacheKey = `${location}-${date}-${timeRange}-${userLevel}`;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < 3600 * 1000) {
      return res.status(200).json({ ok: true, cached: true, ...cached.data });
    }

    // --- GEOCODING (OpenCage) ---
    const geoRes = await fetch(
      `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(location)}&key=${OPENCAGE_KEY}`
    );

    const geoData = await geoRes.json();

    if (!geoData.results?.length) {
      return res.status(404).json({
        ok: false,
        error: "No se encontraron coordenadas para la ubicación"
      });
    }

    const { lat, lng } = geoData.results[0].geometry;

    // --- STORMGLASS ---
    const stormRes = await fetch(
      `https://api.stormglass.io/v2/weather/point?lat=${lat}&lng=${lng}&params=waveHeight,waveDirection,wavePeriod,windSpeed,windDirection`,
      { headers: { Authorization: STORMGLASS_KEY } }
    );

    if (stormRes.status === 429) {
      return res.status(429).json({
        ok: false,
        error: "Límite gratuito excedido",
        detalle: "Has alcanzado el máximo de solicitudes diarias del plan Free de StormGlass."
      });
    }

    const stormData = await stormRes.json();

    if (!stormData.hours || stormData.hours.length === 0) {
      return res.status(200).json({
        ok: false,
        error: "StormGlass no devolvió datos"
      });
    }

    // --- PROCESAR HORAS ---
    const detalle_por_horas = stormData.hours.map((h) => {
      const viento = h.windSpeed?.sg || 0;
      const oleaje = h.waveHeight?.sg || 0;

      let seguridad = "Alta";
      if (viento > 10 || oleaje > 0.8) seguridad = "Media";
      if (viento > 15 || oleaje > 1.2) seguridad = "Baja";

      return {
        hora: h.time,
        viento,
        oleaje,
        seguridad
      };
    });

    const riesgosAltos = detalle_por_horas.filter((h) => h.seguridad === "Baja").length;

    const veredicto_global =
      riesgosAltos > 3 ? "Peligroso" : riesgosAltos > 0 ? "Precaución" : "Seguro";

    const consejos = [
      "Evita zonas con viento fuerte.",
      "Mantén distancia de rocas y espigones.",
      "Revisa el material antes de entrar al agua.",
      "Si el oleaje supera 1m, no salgas si eres principiante."
    ];

    const responseData = {
      ok: true,
      cached: false,
      received: { location, date, timeRange, userLevel },
      coordenadas: { lat, lng },
      veredicto_global,
      detalle_por_horas,
      consejos
    };

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
