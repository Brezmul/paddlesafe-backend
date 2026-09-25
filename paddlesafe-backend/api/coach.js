// --- CACHÉ ---
const cache = new Map();

// --- MOTOR DE COACH SUP ---
function generarCoach(cond, userLevel) {
  let score = 100;
  const tips = [];
  const seguridad = [];
  const tecnica = [];

  // --- VIENTO ---
  if (cond.viento > 15) {
    score -= 40;
    seguridad.push("El viento es fuerte, mantente cerca de la orilla.");
    tecnica.push("Usa una remada más baja y estable para evitar desequilibrio.");
  } else if (cond.viento > 10) {
    score -= 20;
    seguridad.push("Viento moderado, navega con precaución.");
    tecnica.push("Inclina ligeramente el cuerpo hacia el viento.");
  } else {
    tecnica.push("Buen viento para practicar remada eficiente.");
  }

  // --- OLEAJE ---
  if (cond.oleaje > 1.2) {
    score -= 40;
    seguridad.push("Oleaje alto, riesgo de caída.");
    tecnica.push("Flexiona rodillas y baja el centro de gravedad.");
  } else if (cond.oleaje > 0.8) {
    score -= 20;
    tecnica.push("Oleaje moderado, trabaja tu equilibrio.");
  } else {
    tecnica.push("Oleaje suave, ideal para mejorar técnica.");
  }

  // --- PERIODO ---
  if (cond.periodo > 12) {
    score -= 15;
    seguridad.push("Swell largo, las series serán potentes.");
  }

  // --- DIRECCIÓN DEL VIENTO ---
  if (cond.direccion > 160 && cond.direccion < 200) {
    score -= 30;
    seguridad.push("Viento offshore, evita alejarte demasiado.");
  }

  // --- NIVEL DEL USUARIO ---
  if (userLevel === "Principiante") {
    if (cond.viento > 10 || cond.oleaje > 0.8) {
      seguridad.push("Como principiante, evita estas condiciones.");
    } else {
      tips.push("Buen día para seguir progresando.");
    }
  }

  // --- SCORE FINAL ---
  score = Math.max(0, Math.min(100, score));

  // --- MENSAJE MOTIVACIONAL ---
  let coachMsg = "";
  if (score >= 70) {
    coachMsg = "Día perfecto para remar y disfrutar. ¡A por ello!";
  } else if (score >= 40) {
    coachMsg = "Puedes salir, pero mantén atención al viento y al oleaje.";
  } else {
    coachMsg = "Hoy no es buen día para SUP, mejor espera condiciones más seguras.";
  }

  return {
    score,
    consejos_tecnicos: tecnica,
    consejos_seguridad: seguridad,
    consejos_extra: tips,
    coach: coachMsg
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
    const cacheKey = `coach-${JSON.stringify(condiciones)}-${userLevel}`;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < 3600 * 1000) {
      return res.status(200).json({ ok: true, cached: true, ...cached.data });
    }

    // --- GENERAR COACH ---
    const resultado = generarCoach(condiciones, userLevel);

    const responseData = {
      ok: true,
      condiciones,
      userLevel,
      coach: resultado
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
