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
  if (score >= 70) return { color: "Verde", mensaje: "Buenas condiciones para SUP." };
  if (score >= 40) return { color: "Amarillo", mensaje: "Condiciones aceptables con precaución." };
  return { color: "Rojo", mensaje: "No recomendado para SUP." };
}

// --- MODELO DE MAREAS ---
function calcularMarea(fechaISO, lat, lng) {
  const fecha = new Date(fechaISO);
  const horas = fecha.getHours() + fecha.getMinutes() / 60;
  const ciclo = 12.42;
  const faseLocal = ((lat + lng) % ciclo + ciclo) % ciclo;
  const fase = (horas + faseLocal) % ciclo;
  const altura = Math.abs(Math.sin((fase / ciclo) * Math.PI * 2)) * 1.8;

  let estado = "";
  if (fase < ciclo * 0.25) estado = "Subiendo";
  else if (fase < ciclo * 0.5) estado = "Pleamar";
  else if (fase < ciclo * 0.75) estado = "Bajando";
  else estado = "Bajamar";

  return {
    altura: Number(altura.toFixed(2)),
    estado
  };
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
    const cacheKey = `dashboard-${location}-${date}-${timeRange}-${userLevel}`;
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

    // --- STORMGLASS ---
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

    if (!stormData.hours || stormData.hours.length === 0) {
      return res.status(200).json({
        ok: false,
        error: "StormGlass no devolvió datos"
      });
    }

    const h = stormData.hours[Math.floor(stormData.hours.length / 2)];

    const condiciones = {
      viento: h.windSpeed?.sg || 0,
      oleaje: h.waveHeight?.sg || 0,
      periodo: h.wavePeriod?.sg || 0,
      direccion: h.windDirection?.sg || 0
    };

    // --- SCORE ---
    const score = calcularScore(condiciones, userLevel);
    const sem = semaforo(score);

    // --- ALERTAS ---
    const alertas = [];

    if (condiciones.viento > 15) alertas.push("Viento fuerte: no recomendado.");
    if (condiciones.oleaje > 1.2) alertas.push("Oleaje alto: riesgo de caída.");
    if (condiciones.periodo > 12) alertas.push("Swell largo: series potentes.");
    if (condiciones.direccion > 160 && condiciones.direccion < 200)
      alertas.push("Viento offshore: riesgo de ser arrastrado mar adentro.");

    if (alertas.length === 0) alertas.push("Sin alertas críticas.");

    // --- MAREA ---
    const marea = calcularMarea(date, lat, lng);

    const responseData = {
      ok: true,
      location,
      coordenadas: { lat, lng },
      condiciones,
      score_seguridad: score,
      semaforo: sem,
      alertas,
      marea,
      resumen: {
        viento: `${condiciones.viento} km/h`,
        oleaje: `${condiciones.oleaje} m`,
        periodo: `${condiciones.periodo} s`,
        direccion_viento: `${condiciones.direccion}°`
      },
      recomendaciones: [
        "Usa leash siempre.",
        "Evita viento offshore.",
        "Oleaje < 0.8m es ideal para SUP.",
        "Si el semáforo está en Rojo, no salgas al agua."
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
