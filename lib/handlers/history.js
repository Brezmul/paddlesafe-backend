import { decryptApiKey } from "./credentials.js";

// --- CACHÉ ---
const cache = new Map();

// --- MODELO HISTÓRICO (fallback cuando StormGlass no da datos) ---
function generarHistoricoSimulado(fechaISO, lat, lng) {
  const fecha = new Date(fechaISO);
  const dia = fecha.getDate();

  // Variación suave basada en lat/lng
  const base = Math.abs(Math.sin((lat + lng + dia) * 0.1));

  const viento = Number((base * 15).toFixed(1)); // 0–15 km/h
  const oleaje = Number((base * 1.5).toFixed(2)); // 0–1.5 m
  const periodo = Number((base * 10).toFixed(1)); // 0–10 s

  let calidad = "Buenas";
  if (viento > 10 || oleaje > 0.8) calidad = "Regulares";
  if (viento > 15 || oleaje > 1.2) calidad = "Malas";

  return {
    fecha: fechaISO,
    viento,
    oleaje,
    periodo,
    calidad,
    simulated: true
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const OPENCAGE_KEY = decryptApiKey("ENC_OPENCAGE");
    const STORMGLASS_KEY = decryptApiKey("ENC_STORMGLASS");
    const { location, startDate, endDate } = req.body;

    if (!location || !startDate || !endDate) {
      return res.status(400).json({
        ok: false,
        error: "Faltan parámetros",
        required: ["location", "startDate", "endDate"]
      });
    }

    // --- CACHÉ ---
    const cacheKey = `history-${location}-${startDate}-${endDate}`;
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

    const { lat, lng } = geoData.results[0].geometry;

    // --- GENERAR RANGO DE FECHAS ---
    const fechas = [];
    let actual = new Date(startDate);
    const final = new Date(endDate);

    while (actual <= final) {
      fechas.push(actual.toISOString().split("T")[0]);
      actual.setDate(actual.getDate() + 1);
    }

    const historico = [];

    // --- INTENTAR STORMGLASS PARA CADA DÍA ---
    for (const fecha of fechas) {
      const stormRes = await fetch(
        `https://api.stormglass.io/v2/weather/point?lat=${lat}&lng=${lng}&start=${fecha}&end=${fecha}&params=waveHeight,wavePeriod,windSpeed`,
        { headers: { Authorization: STORMGLASS_KEY } }
      );

      // Límite excedido
      if (stormRes.status === 429) {
        historico.push({
          fecha,
          error: "Límite gratuito excedido",
          detalle:
            "Has alcanzado el máximo de 10 solicitudes diarias del plan Free de StormGlass.",
          simulated: true
        });
        continue;
      }

      const stormData = await stormRes.json();

      // Sin datos → usar simulación
      if (!stormData.hours || stormData.hours.length === 0) {
        historico.push(generarHistoricoSimulado(fecha, lat, lng));
        continue;
      }

      // Tomar la hora central del día
      const h = stormData.hours[Math.floor(stormData.hours.length / 2)];

      const viento = h.windSpeed?.sg || 0;
      const oleaje = h.waveHeight?.sg || 0;
      const periodo = h.wavePeriod?.sg || 0;

      let calidad = "Buenas";
      if (viento > 10 || oleaje > 0.8) calidad = "Regulares";
      if (viento > 15 || oleaje > 1.2) calidad = "Malas";

      historico.push({
        fecha,
        viento,
        oleaje,
        periodo,
        calidad,
        simulated: false
      });
    }

    // --- TENDENCIA ---
    const valores = historico.map((h) => h.viento + h.oleaje * 10);
    let tendencia = "Estable";

    if (valores[valores.length - 1] > valores[0] + 5) tendencia = "Empeorando";
    if (valores[valores.length - 1] < valores[0] - 5) tendencia = "Mejorando";

    const responseData = {
      ok: true,
      location,
      coordenadas: { lat, lng },
      historico,
      tendencia,
      recomendaciones: [
        "Si la tendencia es empeorando, evita días con viento > 10 km/h.",
        "Si la tendencia es mejorando, aprovecha las primeras horas del día.",
        "Consulta también las mareas y alertas antes de salir."
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
