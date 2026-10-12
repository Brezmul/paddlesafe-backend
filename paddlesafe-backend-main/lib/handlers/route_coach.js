// ==============================================================================
// lib/handlers/route_coach.js - ENTRENADOR DEPORTIVO IA (ANALIZADOR DE RUTAS)
// PaddleSafe v5.19
// Analiza telemetría real (distancia, duración, velocidades y splits por kilómetro)
// devolviendo un análisis estructurado en 3 puntos con Gemini 1.5 Flash
// ==============================================================================

/**
 * Motor experto de respaldo deportivo (100% de disponibilidad si falla la API externa)
 */
function generarFeedbackExpertoLocal({ distance_km, duration_seconds, avg_speed, max_speed, splits_data }) {
  const dist = Number(distance_km) || 0;
  const durSecs = Number(duration_seconds) || 0;
  const mins = Math.max(1, Math.round(durSecs / 60));
  const avg = Number(avg_speed) || (mins > 0 ? Number((dist / (mins / 60)).toFixed(1)) : 0);
  const max = Number(max_speed) || Number((avg * 1.35).toFixed(1));
  const splits = Array.isArray(splits_data) ? splits_data : [];

  let puntoBien = "";
  let puntoMejora = "";
  let puntoProxima = "";

  if (splits.length >= 2) {
    const primerKm = splits[0];
    const ultimoKm = splits[splits.length - 1];
    
    // Buscar el tramo más rápido y el más lento
    let mejorSplit = splits[0];
    let peorSplit = splits[0];
    for (const s of splits) {
      if ((s.avg_speed_kmh || 0) > (mejorSplit.avg_speed_kmh || 0)) mejorSplit = s;
      if ((s.avg_speed_kmh || 0) < (peorSplit.avg_speed_kmh || 0)) peorSplit = s;
    }

    const velPrimero = Number(primerKm.avg_speed_kmh || avg);
    const velUltimo = Number(ultimoKm.avg_speed_kmh || avg);
    const difFatiga = velPrimero - velUltimo;

    if (difFatiga > 1.2) {
      // Hubo caída notable por fatiga al final
      puntoBien = `Salida muy enérgica: completaste el km 1 a ${velPrimero} km/h marcando un ritmo de ataque excelente en la primera mitad.`;
      puntoMejora = `En el km ${peorSplit.km || splits.length} sufriste una caída de ritmo hasta ${peorSplit.avg_speed_kmh} km/h (caída de ${Math.abs(difFatiga).toFixed(1)} km/h respecto al inicio) por fatiga muscular acumulada.`;
      puntoProxima = `Dosifica el esfuerzo: reduce 0.5 km/h el ritmo del primer kilómetro para llegar con reserva y no bajar de ${Number((avg * 0.95).toFixed(1))} km/h en el tercio final.`;
    } else if (difFatiga < -0.8) {
      // Negative split (aceleró al final)
      puntoBien = `Estrategia de pacing sobresaliente (negative split): cerraste la sesión en el km ${ultimoKm.km} a ${velUltimo} km/h, superando la velocidad inicial (${velPrimero} km/h).`;
      puntoMejora = `Durante el km ${peorSplit.km} el ritmo bajó levemente a ${peorSplit.avg_speed_kmh} km/h antes del cambio de ritmo final.`;
      puntoProxima = `Intenta anticipar tu aceleración final medio kilómetro antes para aumentar tu velocidad media total por encima de ${Number((avg + 0.4).toFixed(1))} km/h.`;
    } else {
      // Ritmo regular y constante
      puntoBien = `Gran solidez y estabilidad de ritmo: mantuviste una cadencia constante alrededor de ${avg} km/h con mínima dispersión entre kilómetros.`;
      puntoMejora = `El punto de menor eficiencia se situó en el km ${peorSplit.km} (${peorSplit.avg_speed_kmh} km/h), donde hubo ligeras pausas o deceleraciones momentáneas.`;
      puntoProxima = `Incluye 3 series de 30 segundos de remada explosiva para trabajar potencia sin romper la regularidad de crucero.`;
    }
  } else {
    // Sesión corta (<2 km)
    puntoBien = `Sesión intensa de ${dist} km completada a ${avg} km/h con un pico de velocidad máxima alcanzado de ${max} km/h.`;
    puntoMejora = `En distancias cortas la aceleración inicial determina la media; conviene acortar la fase de calentamiento para ganar metros útiles.`;
    puntoProxima = `Amplía el recorrido a al menos 3 km continuados para evaluar tu resistencia aeróbica en tramos largos.`;
  }

  return {
    bien: puntoBien,
    mejora: puntoMejora,
    proxima_salida: puntoProxima
  };
}

/**
 * Consulta a Google Gemini 1.5 Flash para análisis hiper-específico de rendimiento
 */
async function consultarGeminiFlashRoute(datos, apiKey) {
  const { distance_km, duration_seconds, avg_speed, max_speed, splits_data } = datos;
  const dist = Number(distance_km) || 0;
  const durSecs = Number(duration_seconds) || 0;
  const mins = Math.max(1, Math.round(durSecs / 60));
  const avg = Number(avg_speed) || 0;
  const max = Number(max_speed) || 0;

  const splitsText = Array.isArray(splits_data) && splits_data.length > 0
    ? splits_data.map(s => `- Km ${s.km}: distancia ${s.distance_km || 1} km, duración ${Math.round(s.duration_seconds || 0)}s, vel. media ${s.avg_speed_kmh} km/h`).join("\n")
    : "Sin desglose de splits por kilómetro.";

  const prompt = `Actúa como un Entrenador Deportivo de Alto Rendimiento especializado en deportes náuticos y Stand Up Paddle (ISA/FESurfing SUP Coach).
Analiza detalladamente la telemetría y especialmente la evolución del ritmo y velocidad por kilómetro (splits) de la siguiente sesión:

DATOS GENERALES DE LA SESIÓN:
- Distancia total: ${dist} km
- Duración total: ${mins} minutos (${durSecs} segundos)
- Velocidad media: ${avg} km/h
- Velocidad máxima: ${max} km/h

DESGLOSE POR KILÓMETRO (SPLITS):
${splitsText}

INSTRUCCIONES CLAVE DE ENTRENADOR:
1. No des consejos genéricos como "bebe agua" o "duerme bien". Básate estrictamente en los números y datos reales de la sesión.
2. Analiza si hubo un ritmo constante (pacing), si empezó demasiado rápido y decayó por fatiga al final (positive split), o si aceleró al final (negative split).
3. Identifica con precisión matemática en qué kilómetro o tramo exacto se produjo la mayor bajada de velocidad o pérdida de eficiencia.
4. Devuelve ÚNICAMENTE un objeto JSON válido sin texto adicional, con exactamente las siguientes 3 claves:

{
  "bien": "(Qué hizo bien según los datos reales de ritmo y velocidad en 1-2 frases concretas)",
  "mejora": "(En qué kilómetro o tramo específico perdió ritmo y cuánta velocidad decayó)",
  "proxima_salida": "(Un reto o consejo técnico concreto y medible para la próxima salida, ej. mantener el ritmo del km 2 en los últimos kilómetros)"
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
      temperature: 0.2,
      topP: 0.8,
      maxOutputTokens: 500,
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
      throw new Error(`Google Gemini API HTTP ${res.status}`);
    }

    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("Respuesta vacía de Gemini");

    const parsed = JSON.parse(rawText.trim());
    if (!parsed.bien || !parsed.mejora || !parsed.proxima_salida) {
      throw new Error("Estructura JSON incompleta");
    }

    return parsed;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Handler HTTP principal para análisis de ruta deportiva
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
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    body = body || {};

    const distance_km = Number(body.distance_km ?? body.distancia_km ?? 0);
    const duration_seconds = Number(body.duration_seconds ?? (body.tiempo_minutos ? body.tiempo_minutos * 60 : 0));
    const avg_speed = Number(body.avg_speed ?? body.avg_speed_kmh ?? 0);
    const max_speed = Number(body.max_speed ?? 0);
    const splits_data = Array.isArray(body.splits_data) ? body.splits_data : (Array.isArray(body.splits) ? body.splits : []);

    const datosSesion = {
      distance_km,
      duration_seconds,
      avg_speed,
      max_speed,
      splits_data
    };

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.VITE_GEMINI_API_KEY || "";
    let feedback = null;
    let fuente = "coach-experto-local";

    if (apiKey) {
      try {
        feedback = await consultarGeminiFlashRoute(datosSesion, apiKey);
        fuente = "gemini-1.5-flash";
      } catch (geminiErr) {
        console.warn("[route_coach] Fallback a motor experto local:", geminiErr.message);
        feedback = generarFeedbackExpertoLocal(datosSesion);
        fuente = "coach-experto-local (fallback)";
      }
    } else {
      feedback = generarFeedbackExpertoLocal(datosSesion);
      fuente = "coach-experto-local";
    }

    return res.status(200).json({
      ok: true,
      fuente,
      ai_feedback: feedback
    });
  } catch (error) {
    console.error("Error en route_coach handler:", error);
    return res.status(500).json({
      ok: false,
      error: "Error interno al analizar la ruta",
      details: error.message
    });
  }
}
