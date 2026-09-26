import crypto from "crypto";

// --- LLAVES CIFRADAS ---
const ENC_OPENCAGE = process.env.ENC_OPENCAGE;

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

// --- LLAVE REAL ---
const OPENCAGE_KEY = decrypt(ENC_OPENCAGE);

// --- CACHÉ ---
const cache = new Map();

// --- MODELO DE MAREAS (simplificado, basado en ciclo lunar) ---
function calcularMarea(fechaISO, lat, lng) {
  const fecha = new Date(fechaISO);
  const horas = fecha.getHours() + fecha.getMinutes() / 60;

  // Ciclo de marea aproximado: 12.42 horas
  const ciclo = 12.42;

  // Fase basada en latitud + longitud (solo para variar por ubicación)
  const faseLocal = ((lat + lng) % ciclo + ciclo) % ciclo;

  const fase = (horas + faseLocal) % ciclo;

  // Altura aproximada (0 a 1.8m)
  const altura = Math.abs(Math.sin((fase / ciclo) * Math.PI * 2)) * 1.8;

  let estado = "";
  if (fase < ciclo * 0.25) estado = "Subiendo";
  else if (fase < ciclo * 0.5) estado = "Pleamar";
  else if (fase < ciclo * 0.75) estado = "Bajando";
  else estado = "Bajamar";

  // Próximas mareas
  const horasPleamar = ciclo * 0.5 - fase;
  const horasBajamar = ciclo - fase;

  const proximaPleamar = new Date(fecha.getTime() + horasPleamar * 3600000);
  const proximaBajamar = new Date(fecha.getTime() + horasBajamar * 3600000);

  return {
    altura: Number(altura.toFixed(2)),
    estado,
    proximaPleamar: proximaPleamar.toISOString(),
    proximaBajamar: proximaBajamar.toISOString()
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { location, date, userLevel } = req.body;

    if (!location || !date || !userLevel) {
      return res.status(400).json({
        ok: false,
        error: "Faltan parámetros",
        required: ["location", "date", "userLevel"]
      });
    }

    // --- CACHÉ ---
    const cacheKey = `tides-${location}-${date}-${userLevel}`;
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

    // --- CALCULAR MAREA ---
    const marea = calcularMarea(date, lat, lng);

    // --- ALERTAS ---
    const alertas = [];

    if (marea.altura > 1.2) {
      alertas.push({
        tipo: "Marea alta",
        detalle: "La pleamar puede generar corrientes fuertes cerca de espigones."
      });
    }

    if (marea.estado === "Bajamar" && marea.altura < 0.4) {
      alertas.push({
        tipo: "Marea muy baja",
        detalle: "Posible exposición de rocas y bancos de arena."
      });
    }

    if (userLevel === "Principiante") {
      alertas.push({
        tipo: "Nivel principiante",
        detalle:
          "Evita practicar SUP en pleamar con altura > 1m si no tienes experiencia."
      });
    }

    if (alertas.length === 0) {
      alertas.push({
        tipo: "Sin alertas",
        detalle: "No se detectaron riesgos relevantes relacionados con la marea."
      });
    }

    const responseData = {
      ok: true,
      location,
      coordenadas: { lat, lng },
      marea,
      alertas,
      recomendaciones: [
        "Evita zonas con rocas durante la baja mar.",
        "La pleamar suele ofrecer agua más profunda y estable.",
        "Consulta siempre las condiciones del viento además de la marea."
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
