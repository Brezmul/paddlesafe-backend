import crypto from "crypto";

// --- LLAVES CIFRADAS ---
const ENC_OPENCAGE = "9f8c4e7b1a2d9c3f0e4b7a1d9f3c2b7e";
const ENC_STORMGLASS = "4b9e1c7f0a3d8e2b9f7c1a4e0d3b8f1c7a2d9e0b4c7f1a3d9e2b7c4f0a1d3b";

// --- CLAVE MAESTRA ---
const MASTER_KEY = "Tiburon_23_93";

// --- DESCIFRADOR AES-256-CBC ---
function decrypt(encrypted) {
  const key = crypto.createHash("sha256").update(MASTER_KEY).digest();
  const iv = Buffer.alloc(16, 0);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// --- LLAVES REALES ---
const OPENCAGE_KEY = decrypt(ENC_OPENCAGE);
const STORMGLASS_KEY = decrypt(ENC_STORMGLASS);

// --- CACHÉ ---
const cache = new Map();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { location, date, timeRange, userLevel } = req.body;

    if (!location || !date || !timeRange || !userLevel) {
      return res.status(400).json({
        ok: false,
        error: "Faltan parámetros",
        required: ["location", "date", "timeRange", "userLevel"]
      });
    }

    // --- CACHÉ ---
    const cacheKey = `conditions-${location}-${date}-${timeRange}-${userLevel}`;
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

    // --- STORMGLASS ---
    const stormRes = await fetch(
      `https://api.stormglass.io/v2/weather/point?lat=${lat}&lng=${lng}&params=waveHeight,waveDirection,wavePeriod,windSpeed,windDirection`,
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

    // --- PROCESAR HORAS ---
    const condiciones = stormData.hours.map((h) => {
      const viento = h.windSpeed?.sg || 0;
      const oleaje = h.waveHeight?.sg || 0;
      const periodo = h.wavePeriod?.sg || 0;
      const direccionViento = h.windDirection?.sg || 0;

      let calidad = "Buenas";

      if (viento > 10 || oleaje > 0.8) calidad = "Regulares";
      if (viento > 15 || oleaje > 1.2) calidad = "Malas";

      return {
        hora: h.time,
        viento,
        oleaje,
        periodo,
        direccionViento,
        calidad
      };
    });

    // --- EVALUACIÓN GLOBAL ---
    const malas = condiciones.filter((c) => c.calidad === "Malas").length;
    const regulares = condiciones.filter((c) => c.calidad === "Regulares").length;

    let estado_global = "Buenas";

    if (malas > 3) estado_global = "Malas";
    else if (regulares > 3) estado_global = "Regulares";

    // --- ALERTAS ---
    const alertas = [];

    condiciones.forEach((c) => {
      if (c.viento > 15) {
        alertas.push({
          tipo: "Viento fuerte",
          hora: c.hora,
          detalle: `Viento de ${c.viento} km/h. Condiciones peligrosas para SUP.`
        });
      }

      if (c.oleaje > 1.2) {
        alertas.push({
          tipo: "Oleaje alto",
          hora: c.hora,
          detalle: `Oleaje de ${c.oleaje} m. No recomendado para SUP.`
        });
      }

      if (c.direccionViento > 160 && c.direccionViento < 200) {
        alertas.push({
          tipo: "Viento offshore",
          hora: c.hora,
          detalle: "Riesgo de ser arrastrado mar adentro."
        });
      }
    });

    if (alertas.length === 0) {
      alertas.push({
        tipo: "Sin alertas",
        detalle: "No se detectaron riesgos relevantes."
      });
    }

    // --- RECOMENDACIONES ---
    const recomendaciones = [
      "Las mejores condiciones suelen ser por la mañana.",
      "Evita viento > 10 km/h si eres principiante.",
      "Mantén distancia de rocas y espigones.",
      "Revisa el material antes de entrar al agua."
    ];

    const responseData = {
      ok: true,
      location,
      coordenadas: { lat, lng },
      estado_global,
      condiciones,
      alertas,
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
