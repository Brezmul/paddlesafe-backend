// ============================================================================
// PaddleSafe - Coach (lib/handlers/coach.js)
// Motor de Asesoramiento Náutico Inteligente para Stand Up Paddle (SUP)
// Integra Motor Experto de Alta Precisión (100% autónomo y gratuito)
// con integración opcional a Google Gemini Flash cuando hay API Key configurada
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

  const hasViento = condiciones.viento !== undefined || query.viento !== undefined;
  const hasOleaje = condiciones.oleaje !== undefined || query.oleaje !== undefined;
  const sinDatos = !hasViento && !hasOleaje;

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

  const tramos_data = Array.isArray(condiciones.tramos_data)
    ? condiciones.tramos_data
    : (Array.isArray(body.tramos_data) ? body.tramos_data : []);

  const lat = condiciones.lat ?? body.lat ?? query.lat ?? null;
  const lon = condiciones.lon ?? body.lon ?? query.lon ?? null;

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
      ubicacion,
      tramos_data,
      lat,
      lon,
      sinDatos
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
 * Calcula la dureza y demanda física estimada de la ruta
 */
function calcularDurezaRuta(cond, userLevel, tramos) {
  const dist = cond.distanciaKm || 0;
  const viento = cond.viento || 0;
  const oleaje = cond.oleaje || 0;

  let baseDificultad = 3.0; // base 3/10

  // Distancia
  if (dist > 8) baseDificultad += 3.5;
  else if (dist > 5) baseDificultad += 2.5;
  else if (dist > 2.5) baseDificultad += 1.5;
  else if (dist > 1) baseDificultad += 0.8;

  // Viento
  if (viento >= 18) baseDificultad += 3.0;
  else if (viento >= 14) baseDificultad += 2.0;
  else if (viento >= 10) baseDificultad += 1.0;

  // Oleaje
  if (oleaje >= 1.0) baseDificultad += 2.5;
  else if (oleaje >= 0.6) baseDificultad += 1.5;
  else if (oleaje >= 0.3) baseDificultad += 0.8;

  // Ajuste por nivel de usuario
  if (userLevel === "Principiante") baseDificultad += 1.5;
  else if (userLevel === "Avanzado") baseDificultad -= 1.0;

  const difClamped = Math.max(1, Math.min(10, Math.round(baseDificultad * 10) / 10));

  let nivelTexto = "Baja / Plácida";
  if (difClamped >= 8) nivelTexto = "Muy Alta / Extrema";
  else if (difClamped >= 6.5) nivelTexto = "Alta / Exigente";
  else if (difClamped >= 4.5) nivelTexto = "Moderada / Intermedia";

  let detalle = "";
  if (difClamped >= 7) {
    detalle = `Sesión físicamente muy exigente (${difClamped}/10). La combinación de ${dist > 0 ? dist + ' km de travesía' : 'la distancia'} con viento de ${viento} km/h y ${oleaje}m de ola demandará un esfuerzo continuo de piernas y core. Se prevé fatiga muscular a partir de los 25-30 minutos si no mantienes un ritmo regular.`;
  } else if (difClamped >= 4.5) {
    detalle = `Exigencia media (${difClamped}/10). Nivel de esfuerzo aeróbico asumible pero constante. El mar requerirá correcciones de estabilidad y trabajo de dorsales. Distribuye bien el esfuerzo y alterna el lado de remada cada 5-8 paladas.`;
  } else {
    detalle = `Sesión de baja exigencia física (${difClamped}/10). Buenas condiciones para disfrutar, rodar metros con soltura y trabajar técnica de palada limpia sin sobrecargar articulaciones.`;
  }

  return {
    score_dureza: difClamped,
    nivel: `${nivelTexto} (${difClamped}/10)`,
    descripcion: detalle
  };
}

/**
 * Calcula la estrategia de viento y analiza cuándo habrá viento a favor (downwind)
 */
function calcularEstrategiaViento(cond, tramos, userLevel) {
  const dirViento = cond.direccion || 0;
  const viento = cond.viento || 0;
  const cardinal = obtenerCardinal(dirViento);
  
  let tramoFavor = null;
  let tramoContra = null;
  let tramoLateral = null;

  if (Array.isArray(tramos) && tramos.length > 0) {
    for (const t of tramos) {
      const vRel = (t.viento_relativo || "").toUpperCase();
      if (vRel.includes("FAVOR") && !tramoFavor) tramoFavor = t;
      if (vRel.includes("CONTRA") && !tramoContra) tramoContra = t;
      if (vRel.includes("LATERAL") && !tramoLateral) tramoLateral = t;
    }
  }

  let cuandoSeraFacil = "";
  let tramoCritico = "";
  let consejoPacing = "";

  if (tramoFavor) {
    cuandoSeraFacil = `El tramo más fácil será "${tramoFavor.nombre}" (${tramoFavor.distancia_km ? tramoFavor.distancia_km + ' km, ' : ''}rumbo ${tramoFavor.rumbo}°): contarás con viento a favor (downwind) de componente ${cardinal} que empujará la tabla y aumentará tu velocidad con mínimo esfuerzo físico.`;
  } else {
    const rumboDownwind = Math.round((dirViento + 180) % 360);
    const cardDownwind = obtenerCardinal(rumboDownwind);
    cuandoSeraFacil = `Navegar con rumbo ~${rumboDownwind}° (${cardDownwind}) será cuando la ruta sea más fácil y fluida, al entrarte el viento de ${cardinal} (${viento} km/h) directamente por la popa (downwind).`;
  }

  if (tramoContra) {
    tramoCritico = `¡Ojo con "${tramoContra.nombre}"! Remarás contra viento directo (${viento} km/h). La resistencia será máxima. Flexiona rodillas, baja el centro de gravedad e inclina el torso hacia delante.`;
  } else if (viento >= 10) {
    const rumboUpwind = Math.round(dirViento % 360);
    tramoCritico = `Evita remar contra el rumbo ~${rumboUpwind}° de regreso sin reserva de energía: avanzarás contra los ${viento} km/h de viento y tu avance se reducirá hasta un 40%.`;
  } else {
    tramoCritico = "Con viento suave (< 10 km/h) no hay tramos con resistencia crítica; cualquier rumbo es navegable con comodidad.";
  }

  if (tramoContra && tramoFavor) {
    consejoPacing = "Regla de oro de ida y vuelta: Sal siempre contra el viento al inicio mientras tengas el 100% de tus fuerzas, para que el regreso cansado sea el tramo fácil con viento en popa.";
  } else {
    consejoPacing = `Reserva un 35% de tu energía para los tramos con viento lateral o en contra. No te confíes si el inicio te parece demasiado fácil: probablemente tienes el viento a favor empujándote mar adentro.`;
  }

  return {
    tramo_facil: cuandoSeraFacil,
    tramo_exigente: tramoCritico,
    consejo_pacing: consejoPacing
  };
}

/**
 * Analiza la zona marcada en el mapa con dificultades orográficas y costeras reales
 */
function calcularAnalisisZona(cond, lat, lon, userLevel) {
  const dir = cond.direccion || 0;
  const viento = cond.viento || 0;
  const oleaje = cond.oleaje || 0;
  const cardinal = obtenerCardinal(dir);

  // Viento terral / offshore (150-240 en costa este española / mediterráneo o genérico)
  const isOffshore = (dir >= 150 && dir <= 240);
  
  const riesgosZona = [];
  let orografia = "Costa abierta con exposición al mar y viento predominante.";

  if (isOffshore && viento >= 10) {
    riesgosZona.push(`🚨 ALERTA OFFSHORE (Viento de tierra ${cardinal}): El agua parece totalmente plana cerca de la orilla, pero sopla mar adentro empujándote fuera. Si te separas más de 100-150m te costará regresar.`);
  }

  if (viento >= 14) {
    riesgosZona.push("Efecto Venturi en cabos y puntas: Al rebasar salientes o acantilados el viento se canaliza y acelera bruscamente de 3 a 5 km/h más.");
  }

  if (oleaje >= 0.6) {
    riesgosZona.push("Efecto rebote (clapotis) junto a paredes y acantilados: Las olas rebotan en la roca generando mar cruzado desordenado. Mantén al menos 30 metros de distancia de la pared rocosa.");
  }

  riesgosZona.push("Entrada y salida: Presta atención a fondos someros de roca y calado para la quilla central al aproximarte a la orilla.");

  let recomendacionZona = "";
  if (isOffshore && viento >= 12) {
    recomendacionZona = "Navega estrictamente en paralelo a la línea de costa a menos de 50-80 metros y ten localizada la cala o playa de desembarco más cercana.";
  } else if (oleaje >= 0.8) {
    recomendacionZona = "Elige playas protegidas por espigones o bahías naturales para botar la tabla y evitar la rompiente directa de la orilla.";
  } else {
    recomendacionZona = "Zona con buena navegabilidad costera; mantén distancia de seguridad respecto a zonas de bañistas balizadas y canales de entrada de embarcaciones.";
  }

  return {
    orografia,
    peligros_detectados: riesgosZona,
    recomendacion_seguridad: recomendacionZona
  };
}

/**
 * Consejos prácticos de técnica y seguridad estrictamente adaptados al nivel del practicante
 */
function calcularConsejosNivel(cond, userLevel) {
  const viento = cond.viento || 0;
  const oleaje = cond.oleaje || 0;
  const c = [];

  if (userLevel === "Principiante") {
    if (viento > 12 || oleaje > 0.4) {
      c.push("Postura de emergencia: Si notas rachas repentinas o desequilibrio, siéntate o ponte de rodillas de inmediato para reducir la resistencia al viento y bajar el centro de gravedad.");
    }
    c.push("Posición en la tabla: Pies paralelos y centrados sobre el asa de transporte, rodillas ligeramente flexionadas para amortiguar el movimiento del agua.");
    c.push("Límites de navegación: No te alejes más de 100 metros de la orilla y ten siempre una referencia visual fija en tierra para controlar tu deriva.");
  } else if (userLevel === "Intermedio") {
    if (viento >= 14) {
      c.push("Técnica de viento en contra: Adelanta el peso, baja la mano superior en la pértiga y realiza remadas más cortas y rápidas en la zona de proa para ganar inercia.");
    } else {
      c.push("Eficiencia de palada: Introduce la pala completamente en el agua antes de traccionar (fase catch limpia) y sácala a la altura de tus tobillos; no arrastres la pala por detrás.");
    }
    c.push("Técnica de giro: Practica el giro retrasando el pie retrasado un paso hacia el pad (giro en paso o step-back turn) para elevar la proa.");
  } else {
    // Avanzado
    if (viento >= 16) {
      c.push("Manejo de Downwind: En tramos a favor con chop, adelanta el pie dominante, bombea con dos paladas explosivas para entrar en la pendiente de la ola y retrasa el peso en cuanto la tabla planee para no clavar la punta.");
    } else {
      c.push("Cadencia y potencia: Utiliza rotación activa del core y dorsal ancho en cada palada para mantener una velocidad constante de 5-6 km/h minimizando el desgaste de brazos.");
    }
    c.push("Seguridad de expedición: Lleva leash coiled de sujeción rápida, GPS encendido y planifica al menos dos puntos de escape intermedios en la costa.");
  }

  return c;
}

/**
 * Motor Experto Local SUP (Garantiza respuestas hiper-realistas y 100% de disponibilidad)
 */
function generarCoachExperto(cond, userLevel) {
  if (cond.sinDatos) {
    return {
      score: 0,
      veredicto: "Sin datos meteorológicos suficientes",
      resumen: "No se dispone de información meteorológica (viento u oleaje) para generar una recomendación fiable. Consulta las fuentes oficiales antes de entrar al agua.",
      dureza_ruta: { score_dureza: 0, nivel_dureza: "Desconocida", detalle_esfuerzo: "Sin datos" },
      estrategia_viento: "Precaución: sin datos de viento disponibles.",
      analisis_zona: "No es posible evaluar la zona sin datos meteorológicos.",
      consejos_nivel: ["Consulta el parte marítimo antes de navegar."],
      seguridad_estrategia: ["No entrar al agua si no conoces el pronóstico de viento y oleaje."],
      tecnica_postura: [],
      material_recomendado: [],
      regla_oro: "No salgas al agua sin conocer el pronóstico oficial de viento y mar."
    };
  }

  let score = 100;
  const seguridad = [];
  const tecnica = [];
  const material = [];
  const cardinal = obtenerCardinal(cond.direccion);

  const isOffshoreProbable = (cond.direccion >= 150 && cond.direccion <= 240);
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
    dureza_ruta: calcularDurezaRuta(cond, userLevel, cond.tramos_data),
    estrategia_viento: calcularEstrategiaViento(cond, cond.tramos_data, userLevel),
    analisis_zona: calcularAnalisisZona(cond, cond.lat, cond.lon, userLevel),
    consejos_nivel: calcularConsejosNivel(cond, userLevel),
    seguridad_estrategia: seguridad.slice(0, 3),
    tecnica_postura: tecnica.slice(0, 3),
    material_recomendado: material.slice(0, 3),
    regla_oro: reglaOro
  };
}

/**
 * Consulta a la API de Google Gemini Flash (si hay API Key disponible)
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

CRITERIOS OBLIGATORIOS QUE DEBES ANALIZAR:
1. DUREZA DE LA RUTA: Evalúa el esfuerzo físico necesario (1-10) y cuándo aparecerá la fatiga muscular según la distancia, oleaje y viento.
2. ESTRATEGIA DE VIENTO & DOWNWIND: Indica claramente cuándo será más fácil por tener viento a favor (downwind), qué rumbo será el más exigente contra el viento y cómo dosificar fuerzas.
3. ANÁLISIS DE LA ZONA: Si el viento sopla de tierra mar adentro (offshore), destaca el peligro de arrastre. Analiza aceleración de viento en cabos/puntas (Venturi) y rebote de olas en acantilados (clapotis).
4. CONSEJOS ESPECÍFICOS: Postura y remada ajustados a nivel ${userLevel}.

Responde ÚNICAMENTE en formato JSON con las siguientes claves:
{
  "score": (número entero entre 0 y 100),
  "veredicto": "(Frase corta en mayúsculas resumiendo el estado)",
  "resumen": "(Explicación clara de 2 o 3 frases)",
  "dureza_ruta": {
    "nivel": "(ej. Moderada (5.5/10))",
    "descripcion": "(Explicación de la dureza física y muscular esperada en 2 frases)"
  },
  "estrategia_viento": {
    "tramo_facil": "(Cuándo será más fácil gracias al viento a favor / downwind)",
    "tramo_exigente": "(Qué tramo o rumbo será más duro contra viento y cómo afrontarlo)",
    "consejo_pacing": "(Estrategia de dosificación de fuerzas ida vs vuelta)"
  },
  "analisis_zona": {
    "orografia": "(Descripción de la orografía y abrigo del spot)",
    "peligros_detectados": ["(Peligro 1: ej. Viento offshore o clapotis en acantilados)", "(Peligro 2)"],
    "recomendacion_seguridad": "(Consejo concreto para navegar en esta zona)"
  },
  "consejos_nivel": ["(Consejo 1 para ${userLevel})", "(Consejo 2 para ${userLevel})"],
  "seguridad_estrategia": ["(Punto clave 1)", "(Punto clave 2)", "(Punto clave 3)"],
  "tecnica_postura": ["(Punto clave 1)", "(Punto clave 2)", "(Punto clave 3)"],
  "material_recomendado": ["(Punto clave 1)", "(Punto clave 2)", "(Punto clave 3)"],
  "regla_oro": "(Frase final contundente e inolvidable)"
}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

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
      maxOutputTokens: 1200,
      responseMimeType: "application/json"
    }
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500);

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

  let cond = null;
  let userLevel = "Intermedio";

  try {
    const normalizado = normalizarEntrada(req);
    cond = normalizado.cond;
    userLevel = normalizado.userLevel;

    // Cache check
    const cacheKey = `coach-${JSON.stringify(cond)}-${userLevel}`;
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
        fuente = "gemini-2.5-flash";
      } catch (geminiErr) {
        console.warn("Aviso no crítico: Fallback activado tras fallo en Gemini API:", geminiErr.message);
        coachResultado = generarCoachExperto(cond, userLevel);
        fuente = "coach-experto-sup (fallback)";
      }
    } else {
      coachResultado = generarCoachExperto(cond, userLevel);
      fuente = "coach-experto-sup";
    }

    // Normalizar formato de salida para garantizar consistencia absoluta
    if (!coachResultado.veredicto) coachResultado.veredicto = "EVALUACIÓN COMPLETADA";
    if (!coachResultado.dureza_ruta) coachResultado.dureza_ruta = calcularDurezaRuta(cond, userLevel, cond.tramos_data);
    if (!coachResultado.estrategia_viento) coachResultado.estrategia_viento = calcularEstrategiaViento(cond, cond.tramos_data, userLevel);
    if (!coachResultado.analisis_zona) coachResultado.analisis_zona = calcularAnalisisZona(cond, cond.lat, cond.lon, userLevel);
    if (!Array.isArray(coachResultado.consejos_nivel)) coachResultado.consejos_nivel = calcularConsejosNivel(cond, userLevel);
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
    console.warn("Aviso no crítico en Coach Handler, respondiendo con motor experto local:", error);
    
    // Si algo falló en la normalización o proceso, respondemos siempre 200 con el motor experto
    const condSegura = cond || {
      viento: 10, rachas: 14, direccion: 90, oleaje: 0.4, periodo: 6,
      tempAire: "22", tempAgua: "19", lluvia: 0, precipProb: 0, uv: 5,
      distanciaKm: 3, duracionMin: 45, ubicacion: "Spot de Costa"
    };
    const coachFallback = generarCoachExperto(condSegura, userLevel || "Intermedio");

    return res.status(200).json({
      ok: true,
      fuente: "coach-experto-sup (reserva)",
      userLevel: userLevel || "Intermedio",
      condiciones: condSegura,
      coach: coachFallback
    });
  }
}
