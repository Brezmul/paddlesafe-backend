// --- CACHÉ ---
const cache = new Map();

// --- DEFINICIÓN DE PERFILES SUP ---
const PROFILES = {
  Principiante: {
    descripcion: "Primer contacto con el paddle surf. Enfocado en equilibrio, remada básica y seguridad.",
    habilidades: [
      "Mantenerse de pie brevemente",
      "Remada básica",
      "Conocer normas básicas de seguridad"
    ],
    riesgos: [
      "Caídas frecuentes",
      "Pérdida de equilibrio",
      "Dificultad para volver a la tabla"
    ],
    recomendaciones: [
      "Practica cerca de la orilla",
      "Evita viento fuerte",
      "Usa leash siempre"
    ],
    equipo: [
      "Tabla estable (all-round)",
      "Remo básico",
      "Leash obligatorio",
      "Chaleco si no sabes nadar"
    ],
    score: 30
  },

  Intermedio: {
    descripcion: "Mayor control de la tabla, giros, velocidad y navegación en condiciones moderadas.",
    habilidades: [
      "Mantener equilibrio estable",
      "Realizar giros controlados",
      "Navegar con viento moderado"
    ],
    riesgos: [
      "Oleaje cruzado",
      "Viento lateral",
      "Fatiga en trayectos largos"
    ],
    recomendaciones: [
      "Planifica rutas",
      "Evita zonas con rocas",
      "Revisa el material antes de salir"
    ],
    equipo: [
      "Tabla touring o all-round",
      "Remo de carbono",
      "Leash",
      "Chaleco opcional"
    ],
    score: 60
  },

  Avanzado: {
    descripcion: "Control total de la tabla en condiciones exigentes. Ideal para travesías largas y mar abierto.",
    habilidades: [
      "Control total del equilibrio",
      "Navegación en viento fuerte",
      "Capacidad de rescate básico"
    ],
    riesgos: [
      "Viento offshore",
      "Oleaje grande",
      "Corrientes fuertes"
    ],
    recomendaciones: [
      "Lleva chaleco",
      "Evita navegar solo",
      "Usa GPS o reloj con tracking"
    ],
    equipo: [
      "Tabla touring o race",
      "Remo de carbono premium",
      "Leash",
      "Chaleco obligatorio"
    ],
    score: 90
  }
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { userLevel, name } = req.body;

    if (!userLevel) {
      return res.status(400).json({
        ok: false,
        error: "Falta el parámetro 'userLevel'",
        required: ["userLevel"]
      });
    }

    if (!PROFILES[userLevel]) {
      return res.status(400).json({
        ok: false,
        error: "Nivel no válido",
        niveles_validos: Object.keys(PROFILES)
      });
    }

    // --- CACHÉ ---
    const cacheKey = `profile-${userLevel}-${name || "anon"}`;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < 24 * 3600 * 1000) {
      return res.status(200).json({ ok: true, cached: true, ...cached.data });
    }

    const perfil = PROFILES[userLevel];

    const responseData = {
      ok: true,
      nombre: name || "Usuario",
      nivel: userLevel,
      descripcion: perfil.descripcion,
      habilidades: perfil.habilidades,
      riesgos: perfil.riesgos,
      recomendaciones: perfil.recomendaciones,
      equipo_recomendado: perfil.equipo,
      score_habilidad: perfil.score
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
