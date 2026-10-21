// --- CACHÉ ---
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
    const cacheKey = `warnings-${location}-${date}-${timeRange}-${userLevel}`;
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

    // --- GENERAR ADVERTENCIAS ---
    const advertencias = [];

    stormData.hours.forEach((h) => {
      const viento = (h.windSpeed?.sg || 0) * 3.6;
      const oleaje = h.waveHeight?.sg || 0;
      const periodo = h.wavePeriod?.sg || 0;
      const direccion = h.windDirection?.sg || 0;

      // --- VIENTO FUERTE ---
      if (viento > 20) {
        advertencias.push({
          tipo: "Viento extremo",
          hora: h.time,
          detalle: `Viento de ${viento} km/h. Condiciones muy peligrosas.`
        });
      } else if (viento > 15) {
        advertencias.push({
          tipo: "Viento fuerte",
          hora: h.time,
          detalle: `Viento de ${viento} km/h. No recomendado para SUP.`
        });
      }

      // --- OLEAJE PELIGROSO ---
      if (oleaje > 1.5) {
        advertencias.push({
          tipo: "Oleaje peligroso",
          hora: h.time,
          detalle: `Oleaje de ${oleaje} m. Riesgo alto de caída.`
        });
      } else if (oleaje > 1.2) {
        advertencias.push({
          tipo: "Oleaje alto",
          hora: h.time,
          detalle: `Oleaje de ${oleaje} m. Precaución extrema.`
        });
      }

      // --- SWELL LARGO ---
      if (periodo > 14) {
        advertencias.push({
          tipo: "Swell largo",
          hora: h.time,
          detalle: `Periodo de ${periodo}s. Series potentes y espaciadas.`
        });
      }

      // --- VIENTO OFFSHORE ---
      if (direccion > 160 && direccion < 200) {
        advertencias.push({
          tipo: "Viento offshore",
          hora: h.time,
          detalle: "Riesgo de ser arrastrado mar adentro."
        });
      }
    });

    // --- ADVERTENCIAS POR NIVEL DEL USUARIO ---
    if (userLevel === "Principiante") {
      advertencias.push({
        tipo: "Nivel principiante",
        detalle:
          "Evita viento > 10 km/h y oleaje > 0.8 m. Mantén distancia de rocas y espigones."
      });
    }

    // --- ADVERTENCIAS POR ALTITUD ---
    if (altitud > 20) {
      advertencias.push({
        tipo: "Costa elevada",
        detalle: "Posible presencia de corrientes fuertes cerca de acantilados."
      });
    }

    if (advertencias.length === 0) {
      advertencias.push({
        tipo: "Sin advertencias",
        detalle: "No se detectaron riesgos relevantes."
      });
    }

    const responseData = {
      ok: true,
      location,
      coordenadas: { lat, lng },
      altitud,
      advertencias
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
