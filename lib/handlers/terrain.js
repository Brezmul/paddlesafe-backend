// --- GEOCODING ---

// --- CACHÉ ---
const cache = new Map();

// --- DETECTAR TIPO DE COSTA ---
function detectarTipoCosta(annotations) {
  const comp = annotations?.components || {};

  if (comp?.cliff) return "acantilado";
  if (comp?.rock) return "rocas";
  if (comp?.beach) return "playa";

  return "desconocido";
}

// --- CALCULAR PENDIENTE ---
function calcularPendiente(altitud) {
  if (altitud < 5) return "plana";
  if (altitud < 20) return "ligera";
  if (altitud < 50) return "moderada";
  return "pronunciada";
}

// --- SCORE DEL TERRENO ---
function scoreTerreno(tipoCosta, pendiente) {
  let score = 100;

  if (tipoCosta === "acantilado") score -= 40;
  if (tipoCosta === "rocas") score -= 20;

  if (pendiente === "moderada") score -= 20;
  if (pendiente === "pronunciada") score -= 40;

  return Math.max(0, Math.min(100, score));
}

// --- RECOMENDACIONES ---
function recomendaciones(tipoCosta, pendiente, score) {
  const rec = [];

  if (tipoCosta === "playa") {
    rec.push("Terreno ideal para SUP.");
    rec.push("Entrada y salida del agua seguras.");
  }

  if (tipoCosta === "rocas") {
    rec.push("Evita entrar al agua cerca de rocas.");
    rec.push("Mantén distancia para evitar golpes.");
  }

  if (tipoCosta === "acantilado") {
    rec.push("No te acerques a la pared del acantilado.");
    rec.push("Riesgo de corrientes fuertes.");
  }

  if (pendiente === "moderada") {
    rec.push("La pendiente puede generar corrientes laterales.");
  }

  if (pendiente === "pronunciada") {
    rec.push("Terreno peligroso, evita zonas profundas.");
  }

  if (score < 50) {
    rec.push("Terreno exigente, recomendado solo para usuarios avanzados.");
  }

  return rec;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const OPENCAGE_KEY = process.env.OPENCAGE_KEY;
    const { location } = req.body;

    if (!location) {
      return res.status(400).json({
        ok: false,
        error: "Falta el parámetro 'location'",
        required: ["location"]
      });
    }

    // --- CACHÉ ---
    const cacheKey = `terrain-${location}`;
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

    const result = geoData.results[0];
    const { lat, lng } = result.geometry;
    const altitud = result.annotations.elevation || 0;

    const tipoCosta = detectarTipoCosta(result.annotations);
    const pendiente = calcularPendiente(altitud);
    const score = scoreTerreno(tipoCosta, pendiente);
    const rec = recomendaciones(tipoCosta, pendiente, score);

    const responseData = {
      ok: true,
      location,
      coordenadas: { lat, lng },
      altitud,
      tipoCosta,
      pendiente,
      score_terreno: score,
      recomendaciones: rec
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
