export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { location, date, timeRange, userLevel } = req.body;

    // Respuesta mínima para confirmar que el backend funciona
    return res.status(200).json({
      ok: true,
      message: "Backend funcionando correctamente",
      received: {
        location,
        date,
        timeRange,
        userLevel
      },
      veredicto_global: "Prueba OK",
      nivel_minimo: "Principiante",
      detalle_por_horas: [],
      consejos: ["Todo está conectado correctamente"]
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Error interno en el servidor",
      details: error.message
    });
  }
}
