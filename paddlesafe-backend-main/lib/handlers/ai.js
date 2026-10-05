// --- CACHÉ ---
const cache = new Map();

// --- IA SUP (motor basado en reglas) ---
function analizarIA(cond, userLevel) {
  let score = 100;
  let mensajes = [];

  // Viento
  if (cond.viento > 15) {
    score -= 40;
    mensajes.push("El viento es fuerte y puede dificultar la remada.");
  } else if (cond.viento > 10) {
    score -= 20;
    mensajes.push("El viento es moderado, navega con precaución.");
  } else {
    mensajes.push("El viento es suave, ideal para SUP.");
  }

  // Oleaje
  if (cond.oleaje > 1.2) {
    score -= 40;
    mensajes.push("El oleaje es alto y puede provocar caídas.");
  } else if (cond.oleaje > 0.8) {
    score -= 20;
    mensajes.push("El oleaje es moderado, mantén estabilidad.");
  } else {
    mensajes.push("El oleaje es suave, perfecto para principiantes.");
  }

  // Periodo
  if (cond.periodo > 12) {
    score -= 15;
    mensajes.push("El swell es largo, las series serán potentes.");
  }

  // Dirección del viento
  if (cond.direccion > 160 && cond.direccion < 200) {
    score -= 30;
    mensajes.push("Hay viento offshore, riesgo de ser arrastrado mar adentro.");
  }

  // Nivel del usuario
  if (userLevel === "Principiante") {
    if (cond.viento > 10 || cond.oleaje > 0.8) {
      mensajes.push("Como principiante, evita estas condiciones.");
    } else {
      mensajes.push("Condiciones adecuadas para seguir aprendiendo.");
    }
  }

  // Score final
  score = Math.max(0, Math.min(100, score));

  // Nivel sugerido
  let nivelSugerido = "Principiante";
  if (score >= 70) nivelSugerido = "Principiante";
  else if (score >= 40) nivelSugerido = "Intermedio";
  else nivelSugerido = "Avanzado";

  // Mensaje final tipo coach
  let coach = "";
  if (score >= 70) coach = "Día perfecto para remar con calma y disfrutar.";
  else if (score >= 40) coach = "Puedes salir, pero mantén atención al viento y al oleaje.";
  else coach = "Hoy no es buen día para SUP, mejor espera condiciones más seguras.";

  return {
    score,
    mensajes,
    nivelSugerido,
    coach
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { condiciones, userLevel } = req.body;

    if (!condiciones || !userLevel) {
      return res.status(400).json({
        ok: false,
        error: "Faltan parámetros",
        required: ["condiciones", "userLevel"]
      });
    }

    // --- CACHÉ ---
    const cacheKey = `ai-${JSON.stringify(condiciones)}-${userLevel}`;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < 3600 * 1000) {
      return res.status(200).json({ ok: true, cached: true, ...cached.data });
    }

    // --- ANÁLISIS IA ---
    const resultado = analizarIA(condiciones, userLevel);

    const responseData = {
      ok: true,
      condiciones,
      userLevel,
      ia: resultado
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
