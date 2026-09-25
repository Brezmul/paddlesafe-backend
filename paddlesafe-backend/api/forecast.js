export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { location, date, timeRange, userLevel } = req.body;

    // Validación básica
    if (!location || !date || !timeRange || !userLevel) {
      return res.status(400).json({
        ok: false,
        error: "Faltan parámetros en la solicitud",
        required: ["location", "date", "timeRange", "userLevel"]
      });
    }

    // --- LÓGICA TEMPORAL (mock) ---
    // Aquí luego añadiremos StormGlass + OpenCage
    const detalle_por_horas = [
      {
        hora: "08:00",
        viento: "Suave",
        oleaje: "Bajo",
        seguridad: "Alta"
      },
      {
        hora: "09:00",
        viento: "Moderado",
        oleaje: "Bajo",
        seguridad: "Alta"
      },
      {
        hora: "10:00",
        viento: "Moderado",
        oleaje: "Medio",
        seguridad: "Media"
      },
      {
        hora: "11:00",
        viento: "Fuerte",
        oleaje: "Medio",
        seguridad: "Baja"
      }
    ];

    // Veredicto global simple (mock)
    const veredicto_global = "Seguro";
    const nivel_minimo = userLevel || "Principiante";

    const consejos = [
      "Evita zonas con viento fuerte.",
      "Mantén distancia de rocas y espigones.",
      "Revisa el material antes de entrar al agua."
    ];

    return res.status(200).json({
      ok: true,
      message: "Análisis generado correctamente",
      received: { location, date, timeRange, userLevel },
      veredicto_global,
      nivel_minimo,
      detalle_por_horas,
      consejos
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Error interno en el servidor",
      details: error.message
    });
  }
}
