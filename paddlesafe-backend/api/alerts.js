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
    const cacheKey = `alerts-${location}-${date}-${timeRange}-${userLevel}`;
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

    // --- GENERAR ALERTAS ---
    const alertas = [];

    stormData.hours.forEach((h) => {
      const viento = h.windSpeed?.sg || 0;
      const oleaje = h.waveHeight?.sg || 0;
      const periodo = h.wavePeriod?.sg || 0;
      const direccionViento = h.windDirection?.sg || 0;

      // --- ALERTAS DE VIENTO ---
      if (viento > 15) {
        alertas.push({
          tipo: "Viento fuerte",
          hora: h.time,
          detalle: `Viento de ${viento} km/h. Condiciones peligrosas para SUP.`
        });
      } else if (viento > 10) {
        alertas.push({
          tipo: "Viento moderado",
          hora: h.time,
          detalle: `Viento de ${viento} km/h. Precaución para principiantes.`
        });
      }

      // --- ALERTAS DE OLEAJE ---
      if (oleaje > 1.2) {
        alertas.push({
          tipo: "Oleaje alto",
          hora: h.time,
          detalle: `Oleaje de ${oleaje} m. No recomendado para SUP.`
        });
      } else if (oleaje > 0.8) {
        alertas.push({
          tipo: "Oleaje moderado",
          hora: h.time,
          detalle: `Oleaje de ${oleaje} m. Precaución.`
        });
      }

      // --- ALERTAS DE PERIODO ---
      if (periodo > 12) {
        alertas.push({
          tipo: "Swell largo",
          hora: h.time,
          detalle: `Periodo de ${periodo}s. Series potentes y espaciadas.`
        });
      }

      // --- ALERTAS DE DIRECCIÓN DE VIENTO ---
      if (direccionViento > 160 && direccionViento < 200) {
        alertas.push({
          tipo: "Viento de tierra",
          hora: h.time,
          detalle: "Viento offshore. Riesgo de ser arrastrado mar adentro."
        });
      }
    });

    // --- ALERTAS POR NIVEL DEL USUARIO ---
    if (userLevel === "Principiante") {
      alertas.push({
        tipo: "Nivel principiante",
        detalle:
          "Evita viento > 10 km/h y oleaje > 0.8 m. Mantén distancia de rocas y espigones."
      });
    }

    if (alertas.length === 0) {
      alertas.push({
        tipo: "Sin alertas",
        detalle: "No se detectaron riesgos relevantes en este rango horario."
      });
    }

    const responseData = {
      ok: true,
      location,
      coordenadas: { lat, lng },
      alertas
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
