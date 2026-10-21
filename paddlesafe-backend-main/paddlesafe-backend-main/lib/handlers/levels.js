
// --- CACHÉ ---
const cache = new Map();

// --- DEFINICIÓN DE NIVELES SUP ---
const LEVELS = {
  Principiante: {
    descripcion: "Primer contacto con el paddle surf. Enfocado en equilibrio, remada básica y seguridad.",
    requisitos: [
      "Mantenerse de pie al menos 10 segundos.",
      "Realizar remada básica en línea recta.",
      "Conocer normas básicas de seguridad."
    ],
    condiciones_recomendadas: {
      viento_max: "10 km/h",
      oleaje_max: "0.8 m",
      periodo_max: "8 s"
    },
    riesgos: [
      "Caídas frecuentes.",
      "Pérdida de equilibrio.",
      "Dificultad para volver a la tabla."
    ],
    consejos: [
      "Evita viento fuerte.",
      "Practica cerca de la orilla.",
      "Usa leash siempre."
    ]
  },

  Intermedio: {
    descripcion: "Mayor control de la tabla, giros, velocidad y navegación en condiciones moderadas.",
    requisitos: [
      "Mantener equilibrio estable.",
      "Realizar giros controlados.",
      "Navegar con viento moderado."
    ],
    condiciones_recomendadas: {
      viento_max: "15 km/h",
      oleaje_max: "1.2 m",
      periodo_max: "10 s"
    },
    riesgos: [
      "Oleaje cruzado.",
      "Viento lateral.",
      "Fatiga en trayectos largos."
    ],
    consejos: [
      "Planifica rutas.",
      "Evita zonas con rocas.",
      "Revisa el material antes de salir."
    ]
  },

  Avanzado: {
    descripcion: "Control total de la tabla en condiciones exigentes. Ideal para travesías largas y mar abierto.",
    requisitos: [
      "Control total del equilibrio.",
      "Navegación en viento fuerte.",
      "Capacidad de rescate básico."
    ],
    condiciones_recomendadas: {
      viento_max: "20 km/h",
      oleaje_max: "1.5 m",
      periodo_max: "14 s"
    },
    riesgos: [
      "Viento offshore.",
      "Oleaje grande.",
      "Corrientes fuertes."
    ],
    consejos: [
      "Lleva chaleco.",
      "Evita navegar solo.",
      "Usa GPS o reloj con tracking."
    ]
  }
};

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // --- CACHÉ ---
    const cacheKey = "levels";
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < 24 * 3600 * 1000) {
      return res.status(200).json({ ok: true, cached: true, levels: cached.data });
    }

    // --- RESPUESTA ---
    const responseData = {
      ok: true,
      levels: LEVELS
    };

    // --- GUARDAR EN CACHÉ ---
    cache.set(cacheKey, { timestamp: Date.now(), data: LEVELS });

    return res.status(200).json(responseData);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Error interno",
      details: error.message
    });
  }
}
