import crypto from "crypto";

// --- LLAVES CIFRADAS ---
const ENC_OPENCAGE = process.env.ENC_OPENCAGE;
const ENC_STORMGLASS = process.env.ENC_STORMGLASS;

// --- CLAVE MAESTRA ---
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

// --- LLAVES REALES ---
const OPENCAGE_KEY = decrypt(ENC_OPENCAGE);
const STORMGLASS_KEY = decrypt(ENC_STORMGLASS);

// --- CACHÉ ---
const cache = new Map();

// --- FUNCIÓN PARA OBTENER COORDENADAS ---
async function getCoords(location) {
  const geoRes = await fetch(
    `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(
      location
    )}&key=${OPENCAGE_KEY}`
  );

  const geoData = await geoRes.json();

  if (!geoData.results?.length) return null;

  const { lat, lng } = geoData.results[0].geometry;

  return { lat, lng };
}

// --- FUNCIÓN PARA OBTENER CONDICIONES DE STORMGLASS ---
async function getConditions(lat, lng) {
  const stormRes = await fetch(
    `https://api.stormglass.io/v2/weather/point?lat=${lat}&lng=${lng}&params=waveHeight,wavePeriod,windSpeed,windDirection`,
    { headers: { Authorization: STORMGLASS_KEY } }
  );

  if (stormRes.status === 429) {
    return { error429: true };
  }

  const stormData = await stormRes.json();

  if (!stormData.hours || stormData.hours.length === 0) {
    return { empty: true };
  }

  // Tomamos la hora central del rango
  const h = stormData.hours[Math.floor(stormData.hours.length / 2)];

  return {
    viento: h.windSpeed?.sg || 0,
    oleaje: h.waveHeight?.sg || 0,
    periodo: h.wavePeriod?.sg || 0,
    direccion: h.windDirection?.sg || 0
  };
}

// --- FUNCIÓN PARA EVALUAR UN SPOT ---
function evaluarSpot(cond, userLevel) {
  let puntuacion = 100;

  // Viento
  if (cond.viento > 10) puntuacion -= 20;
  if (cond.viento > 15) puntuacion -= 40;

  // Oleaje
  if (cond.oleaje > 0.8) puntuacion -= 20;
  if (cond.oleaje > 1.2) puntuacion -= 40;

  // Periodo
  if (cond.periodo > 12) puntuacion -= 15;

  // Viento offshore
  if (cond.direccion > 160 && cond.direccion < 200) puntuacion -= 30;

  // Nivel del usuario
  if (userLevel === "Principiante") {
    if (cond.viento > 10) puntuacion -= 20;
    if (cond.oleaje > 0.8) puntuacion -= 20;
  }

  let calidad = "Buenas";
  if (puntuacion < 70) calidad = "Regulares";
  if (puntuacion < 40) calidad = "Malas";

  return { puntuacion, calidad };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { spotA, spotB, date, timeRange, userLevel } = req.body;

    if (!spotA || !spotB || !date || !timeRange || !userLevel) {
      return res.status(400).json({
        ok: false,
        error: "Faltan parámetros",
        required: ["spotA", "spotB", "date", "timeRange", "userLevel"]
      });
    }

    // --- CACHÉ ---
    const cacheKey = `compare-${spotA}-${spotB}-${date}-${timeRange}-${userLevel}`;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < 3600 * 1000) {
      return res.status(200).json({ ok: true, cached: true, ...cached.data });
    }

    // --- COORDENADAS ---
    const coordsA = await getCoords(spotA);
    const coordsB = await getCoords(spotB);

    if (!coordsA || !coordsB) {
      return res.status(404).json({
        ok: false,
        error: "No se pudieron obtener coordenadas de uno o ambos spots"
      });
    }

    // --- CONDICIONES ---
    const condA = await getConditions(coordsA.lat, coordsA.lng);
    const condB = await getConditions(coordsB.lat, coordsB.lng);

    // Límite excedido
    if (condA.error429 || condB.error429) {
      return res.status(429).json({
        ok: false,
        error: "Límite gratuito excedido",
        detalle:
          "Has alcanzado el máximo de 10 solicitudes diarias del plan Free de StormGlass."
      });
    }

    // Datos vacíos
    if (condA.empty || condB.empty) {
      return res.status(200).json({
        ok: false,
        error: "StormGlass no devolvió datos",
        detalle:
          "Puede deberse a límite excedido, ubicación sin datos o parámetros no disponibles."
      });
    }

    // --- EVALUACIÓN ---
    const evalA = evaluarSpot(condA, userLevel);
    const evalB = evaluarSpot(condB, userLevel);

    let mejor = "Iguales";
    if (evalA.puntuacion > evalB.puntuacion) mejor = spotA;
    if (evalB.puntuacion > evalA.puntuacion) mejor = spotB;

    const responseData = {
      ok: true,
      spots: {
        A: {
          nombre: spotA,
          coordenadas: coordsA,
          condiciones: condA,
          evaluacion: evalA
        },
        B: {
          nombre: spotB,
          coordenadas: coordsB,
          condiciones: condB,
          evaluacion: evalB
        }
      },
      mejor_spot: mejor,
      recomendaciones: [
        "Elige el spot con menor viento si eres principiante.",
        "Evita viento offshore en ambos spots.",
        "Si ambos spots están 'Regulares', elige el más cercano."
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
