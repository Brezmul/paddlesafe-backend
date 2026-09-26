import crypto from "crypto";

// --- LLAVES CIFRADAS (seguras para GitHub) ---
const ENC_OPENCAGE = process.env.ENC_OPENCAGE;

// --- TU CLAVE MAESTRA ---
const MASTER_KEY = process.env.MASTER_KEY;

// --- DESCIFRADOR AES-256-CBC ---
function decrypt(encrypted) {
  const key = crypto.createHash("sha256").update(MASTER_KEY).digest();
  const iv = Buffer.alloc(16, 0);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// --- LLAVE REAL ---
const OPENCAGE_KEY = decrypt(ENC_OPENCAGE);

// --- CACHÉ ---
const cache = new Map();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { location } = req.body;

    if (!location) {
      return res.status(400).json({
        ok: false,
        error: "Falta el parámetro 'location'"
      });
    }

    // --- CACHÉ ---
    const cacheKey = `spotinfo-${location}`;
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
        error: "No se encontró información del spot"
      });
    }

    const result = geoData.results[0];

    const lat = result.geometry.lat;
    const lng = result.geometry.lng;

    const spotName =
      result.components.beach ||
      result.components.suburb ||
      result.components.neighbourhood ||
      result.components.city ||
      location;

    const pais = result.components.country || "Desconocido";
    const region =
      result.components.state ||
      result.components.county ||
      result.components.region ||
      "Desconocido";

    const zona_horaria = result.annotations.timezone.name;
    const amanecer = result.annotations.sun.rise.apparent;
    const atardecer = result.annotations.sun.set.apparent;
    const altitud = result.annotations.elevation || 0;

    // --- INFORMACIÓN DEL SPOT (manual + automática) ---
    const tipo_costa = altitud < 20 ? "Playa abierta" : "Costa elevada";

    const riesgos = [
      "Corrientes laterales",
      "Viento térmico",
      "Oleaje cruzado",
      "Bañistas en temporada alta"
    ];

    const servicios = [
      "Duchas",
      "Socorrista",
      "Escuelas SUP",
      "Parking",
      "Restauración"
    ];

    const recomendaciones = [
      "Evita el extremo norte cuando hay viento fuerte.",
      "Las mejores condiciones suelen ser por la mañana.",
      "Mantén distancia de bañistas en temporada alta."
    ];

    const nivel_recomendado = "Principiante";

    const responseData = {
      ok: true,
      spot: spotName,
      coordenadas: { lat, lng },
      pais,
      region,
      zona_horaria,
      altitud,
      tipo_costa,
      riesgos,
      nivel_recomendado,
      amanecer,
      atardecer,
      servicios,
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
