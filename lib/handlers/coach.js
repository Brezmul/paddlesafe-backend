// ============================================================================
// PaddleSafe - Coach IA Gemini Flash (lib/handlers/coach.js)
// Motor de Asesoramiento Náutico Inteligente para Stand Up Paddle (SUP)
// Con integración con Google Gemini 1.5 Flash (Gratuito) y Motor Experto de Respaldo
// ============================================================================

const cache = new Map();
const CACHE_TTL_MS = 1800 * 1000; // 30 minutos

/**
 * Normaliza y extrae las condiciones meteorológicas y el nivel de usuario
 */
function normalizarEntrada(req) {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  body = body || {};

  const query = req.query || {};
  const condiciones = body.condiciones || query.condiciones || {};
  const userLevel = body.userLevel || query.userLevel || "Intermedio";

  const viento = Number(condiciones.viento ?? query.viento ?? 0);
  const rachas = Number(condiciones.rachas ?? query.rachas ?? (viento * 1.35));
  const direccion = Number(condiciones.direccion ?? query.direccion ?? 0);
  const oleaje = Number(condiciones.oleaje ?? query.oleaje ?? 0);
  const periodo = Number(condiciones.periodo ?? query.periodo ?? 0);
  const tempAire = condiciones.tempAire ?? query.tempAire ?? "N/D";
  const tempAgua = condiciones.tempAgua ?? query.tempAgua ?? "N/D";
  const lluvia = Number(condiciones.lluvia ?? query.lluvia ?? 0);
  const precipProb = Number(condiciones.precipProb ?? query.precipProb ?? 0);
  const uv = Number(condiciones.uv ?? query.uv ?? 0);
  const distanciaKm = Number(condiciones.distanciaKm ?? query.distanciaKm ?? 0);
  const duracionMin = Number(condiciones.duracionMin ?? query.duracionMin ?? 0);
  const ubicacion = condiciones.ubicacion || query.ubicacion || "Spot de Costa";

  return {
    userLevel,
    cond: {
      viento: Math.round(viento * 10) / 10,
      rachas: Math.round(rachas * 10) / 10,
      direccion: Math.round(direccion),
      oleaje: Math.round(oleaje * 10) / 10,
      periodo: Math.round(periodo * 10) / 10,
      tempAire,
      tempAgua,
      lluvia: Math.round(lluvia * 10) / 10,
      precipProb: Math.round(precipProb),
      uv: Math.round(uv * 10) / 10,
      distanciaKm: Math.round(distanciaKm * 100) / 100,
      duracionMin: Math.round(duracionMin),
      ubicacion
    }
  };
}

/**
 * Obtiene la orientación cardinal a partir de los grados del viento
 */
function obtenerCardinal(grados) {
  const dirs = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  const idx = Math.round(((grados % 360) + 360) % 360 / 45) % 8;
  return dirs[idx];
}

/**
 * Motor Experto Local SUP (Garantiza respuestas hiper-realistas y 100% de disponibilidad)
 */
function generarCoachExperto(cond, userLevel) {
  let score = 100;
  const seguridad = [];
  const tecnica = [];
  const material = [];
  const cardinal = obtenerCardinal(cond.direccion);

  const isOffshoreProbable = (cond.direccion >= 150 && cond.direccion <= 230); // Viento terral común
  const tempAguaNum = parseFloat(cond.tempAgua);

  // --- 1. EVALUACIÓN DE VIENTO Y DERIVA ---
  if (cond.viento >= 22) {
    score -= 55;
    seguridad.push("⛔ VIENTO CRÍTICO (>22 km/h): Peligro severo de arrastre. No salir a mar abierto.");
    tecnica.push("Posición de rodillas (kneeling paddle) obligatoria para ofrecer mínima resistencia al viento.");
  } else if (cond.viento >= 15) {
    score -= 35;
    seguridad.push(`⚠️ Viento moderado-fuerte (${cond.viento} km/h, rachas de ${cond.rachas} km/h). Remar contra el viento al inicio.`);
    tecnica.push("Baja el centro de gravedad, flexiona rodillas y agarra el remo más bajo para ganar palanca.");
  } else if (cond.viento >= 10) {
    score -= 15;
    seguridad.push(`Viento moderado (${cond.viento} km/h de componente ${cardinal}). Planifica la ruta pegado a zonas abrigadas.`);
    tecnica.push("Adelanta la fase de agarre (catch) para que la pala entre limpia antes de traccionar.");
  } else {
    tecnica.push("Condiciones de agua plana (glassy/plácida): Excelente momento para trabajar cadencia fluida (45-50 SPM).");
  }

  // Peligro Offshore (Viento de tierra)
  if (isOffshoreProbable && cond.viento >= 11) {
    score -= 25;
    seguridad.push(`🚨 ALERTA VIENTO OFFSHORE (${cardinal}): Sopla hacia mar adentro. El agua parece plana cerca de la orilla pero empuja hacia fuera.`);
  }

  // --- 2. EVALUACIÓN DE OLEAJE Y SWELL ---
  if (cond.oleaje >= 1.2) {
    score -= 35;
    seguridad.push(`Oleaje significativo (${cond.oleaje}m). Salida y entrada por rompiente delicada; riesgo de vuelco.`);
    tecnica.push("Postura escalonada (hybrid surf stance) con pie dominante ligeramente adelantado para absorber el cabeceo.");
  } else if (cond.oleaje >= 0.7) {
    score -= 15;
    tecnica.push("Mar rizado/chop: Mantén las rodillas activas como amortiguadores y mirada fija en el horizonte, no en la tabla.");
  } else {
    tecnica.push("Superficie limpia: Pies paralelos centrados en el asa de transporte, peso distribuido en la bola del pie.");
  }

  // Periodo largo (>10s)
  if (cond.periodo >= 10 && cond.oleaje >= 0.5) {
    score -= 10;
    seguridad.push(`Swell oceánico de periodo largo (${cond.periodo}s): Las olas rompen con alta energía cinética en la orilla.`);
  }

  // --- 3. TEMPERATURA Y CHOQUE TÉRMICO ---
  if (Number.isFinite(tempAguaNum) && tempAguaNum < 15) {
    material.push(`Agua fría (${tempAguaNum}°C): Neopreno 4/3mm + escarpines obligatorio para evitar choque térmico o hipotermia.`);
  } else if (Number.isFinite(tempAguaNum) && tempAguaNum < 19) {
    material.push(`Agua templada-fría (${tempAguaNum}°C): Traje de neopreno 3/2mm o long-john recomendado.`);
  } else {
    material.push("Temperatura de agua agradable: Licra técnica con protección solar UV50+.");
  }

  // --- 4. MATERIAL DE SEGURIDAD ESPECÍFICO DE SUP ---
  if (cond.oleaje > 0.8) {
    material.push("Leash recto (surf) fijado a la pantorrilla/tobillo para que la tabla no te golpee en olas.");
  } else {
    material.push("Leash tipo coiled (muelle) de rodilla: Evita que el invento arrastre en el agua y frene la tabla.");
  }
  material.push("Chaleco de flotabilidad 50N homologado y funda estanca con móvil cargado (Salvamento Marítimo 900 202 202).");

  // --- 5. ADAPTACIÓN AL NIVEL DEL PADDLER ---
  let veredicto = "CONDICIONES FAVORABLES PARA SUP";
  let reglaOro = "Regla del 30%: Reserva siempre un tercio de tus fuerzas y agua para el regreso.";

  if (userLevel === "Principiante") {
    if (cond.viento > 12 || cond.oleaje > 0.5) {
      score -= 30;
      veredicto = "CONDICIONES EXIGENTES - NO RECOMENDADO PARA INICIACIÓN";
      seguridad.unshift("Como principiante, no te alejes más de 100m de la costa y rema siempre acompañado.");
      tecnica.unshift("Si notas pérdida de equilibrio o ráfagas repentinas, siéntate o ponte de rodillas de inmediato.");
      reglaOro = "Ante cualquier duda o racha imprevista: ¡A rodillas, manos bajas y rema con calma hacia la orilla!";
    } else {
      veredicto = "DÍA IDEAL PARA APRENDER Y DISFRUTAR";
      tecnica.push("Sujeta el pomo superior (T-grip) con una mano y el mástil con la otra; no dobles la espalda, flexiona tobillos y rodillas.");
      reglaOro = "Nunca mires a tus pies ni a la punta de la tabla: mira al horizonte para mantener el equilibrio natural.";
    }
  } else if (userLevel === "Intermedio") {
    if (cond.viento > 16 || cond.oleaje > 1.0) {
      score -= 20;
      veredicto = "CONDICIONES TÉCNICAS - REQUIERE EXPERIENCIA Y ATENCIÓN";
      reglaOro = "Inicia la travesía contra el viento para asegurar una vuelta con viento a favor (downwind técnico).";
    } else {
      veredicto = "BUENAS CONDICIONES PARA TRAVESÍA Y ENTRENAMIENTO";
      reglaOro = "Aprovecha el rumbo para practicar giros en pivote retrasando un pie hacia la cola del pad.";
    }
  } else {
    // Avanzado
    if (cond.viento >= 18) {
      veredicto = "POTENCIAL DOWNWIND TÉCNICO (SÓLO EXPERTOS)";
      tecnica.push("Transición adelante/atrás para coger la pendiente del oleaje (glides) y evitar clavar la proa.");
      reglaOro = "Monitorea constantemente los puntos de escape en la costa y mantén GPS activo.";
    } else {
      veredicto = "EXCELENTES CONDICIONES PARA VELOCIDAD Y DISTANCIA";
      reglaOro = "Optimiza la fase de empuje usando el core y dorsales en lugar de cargar los hombros y bíceps.";
    }
  }

  score = Math.max(10, Math.min(100, Math.round(score)));

  let resumen = "";
  if (score >= 80) {
    resumen = `Día óptimo para tu nivel (${userLevel}). Viento suave de ${cond.viento} km/h y oleaje manejable de ${cond.oleaje}m. Excelente para disfrutar de una sesión de alta calidad técnica.`;
  } else if (score >= 50) {
    resumen = `Sesión realizable para nivel ${userLevel}, pero requiere prudencia activa por viento de ${cond.viento} km/h (rachas ${cond.rachas} km/h) y mar rizado. Planifica muy bien el rumbo.`;
  } else {
    resumen = `Condiciones desfavorables o de alto riesgo para ${userLevel}. Viento de ${cond.viento} km/h con oleaje de ${cond.oleaje}m. Recomendado posponer o entrenar en una bahía totalmente resguardada.`;
  }

  return {
    score,
    veredicto,
    resumen,
    seguridad_estrategia: seguridad.slice(0, 3),
    tecnica_postura: tecnica.slice(0, 3),
    material_recomendado: material.slice(0, 3),
    regla_oro: reglaOro
  };
}

/**
 * Consulta a la API de Google Gemini Flash
 */
async function consultarGeminiFlash(cond, userLevel, apiKey) {
  const cardinal = obtenerCardinal(cond.direccion);

  const prompt = `Actúa como un Entrenador Máster Internacional de Stand Up Paddle (ISA/FESurfing SUP Coach) con 15+ años de experiencia.
Tu tarea es proporcionar un análisis experto, hiper-realista y directamente aplicable para una salida de paddle surf basada en estas condiciones reales:

DATOS CLIMÁTICOS Y MARINOS DEL SPOT:
- Nivel del practicante: ${userLevel} (Principiante / Intermedio / Avanzado)
- Viento medio: ${cond.viento} km/h (Rumbo del viento: ${cond.direccion}° componente ${cardinal})
- Rachas de viento: ${cond.rachas} km/h
- Altura del oleaje: ${cond.oleaje} m
- Periodo de ola: ${cond.periodo} s
- Temperatura del agua: ${cond.tempAgua}°C
- Temperatura del aire: ${cond.tempAire}°C
- Precipitación / Probabilidad lluvia: ${cond.lluvia} mm / ${cond.precipProb}%
- Radiación UV: ${cond.uv}
- Distancia prevista: ${cond.distanciaKm} km (Duración aprox: ${cond.duracionMin} min)
- Ubicación / Spot: ${cond.ubicacion}

CRITERIOS OBLIGATORIOS DE DOMINIO EN PADDLE SURF:
1. Viento Offshore (de tierra a mar): Si el viento sopla de tierra mar adentro y supera 10 km/h, resalta el peligro crítico de deriva involuntaria hacia alta mar.
2. Posición de rodillas (kneeling paddle): Si hay rachas > 15-18 km/h, indicar ponerse de rodillas para reducir el efecto vela del cuerpo.
3. Leash (invento): Coiled (muelle) en rodilla para travesía/aguas planas, leash recto para olas/surf.
4. Choque térmico: Si agua < 18°C neopreno obligatorio.
5. Postura y técnica adaptada estrictamente a su nivel (${userLevel}).

Responde ÚNICAMENTE en formato JSON con las siguientes claves:
{
  "score": (número entero entre 0 y 100),
  "veredicto": "(Frase corta en mayúsculas resumiendo el estado)",
  "resumen": "(Explicación clara de 2 o 3 frases)",
  "seguridad_estrategia": ["(Punto clave 1)", "(Punto clave 2)", "(Punto clave 3)"],
  "tecnica_postura": ["(Punto clave 1)", "(Punto clave 2)", "(Punto clave 3)"],
  "material_recomendado": ["(Punto clave 1)", "(Punto clave 2)", "(Punto clave 3)"],
  "regla_oro": "(Frase final contundente e inolvidable)"
}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.25,
      topP: 0.85,
      maxOutputTokens: 1000,
      responseMimeType: "application/json"
    }
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7500);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Google Gemini API error HTTP ${res.status}`);
    }

    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("Respuesta vacía de Gemini");

    const jsonParsed = JSON.parse(rawText.trim());
    return jsonParsed;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Handler principal exportado para Vercel Serverless / Node.js
 */
export default async function handler(req, res) {
  // CORS Preflight
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, apikey"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const { cond, userLevel } = normalizarEntrada(req);

    // Cache check
    const cacheKey = `gemini-coach-${JSON.stringify(cond)}-${userLevel}`;
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
      return res.status(200).json({ ok: true, cached: true, ...cached.data });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.VITE_GEMINI_API_KEY || "";

    let coachResultado = null;
    let fuente = "coach-experto-sup";

    if (apiKey) {
      try {
        coachResultado = await consultarGeminiFlash(cond, userLevel, apiKey);
        fuente = "gemini-1.5-flash";
      } catch (geminiErr) {
        console.warn("Aviso no crítico: Fallback activado tras fallo en Gemini API:", geminiErr.message);
        coachResultado = generarCoachExperto(cond, userLevel);
        fuente = "coach-experto-sup (fallback)";
      }
    } else {
      coachResultado = generarCoachExperto(cond, userLevel);
      fuente = "coach-experto-sup";
    }

    // Normalizar formato de salida para garantizar consistencia
    if (!coachResultado.veredicto) coachResultado.veredicto = "EVALUACIÓN COMPLETADA";
    if (!Array.isArray(coachResultado.seguridad_estrategia)) coachResultado.seguridad_estrategia = [];
    if (!Array.isArray(coachResultado.tecnica_postura)) coachResultado.tecnica_postura = [];
    if (!Array.isArray(coachResultado.material_recomendado)) coachResultado.material_recomendado = [];

    const responseData = {
      ok: true,
      fuente,
      userLevel,
      condiciones: cond,
      coach: coachResultado
    };

    cache.set(cacheKey, { timestamp: Date.now(), data: responseData });

    return res.status(200).json(responseData);
  } catch (error) {
    console.error("Error crítico en Coach Handler:", error);
    return res.status(500).json({
      ok: false,
      error: "Error interno procesando análisis del coach",
      details: error.message
    });
  }
}
