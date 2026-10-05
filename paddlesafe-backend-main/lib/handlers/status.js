export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const start = Date.now();

  try {
    const OPENCAGE_KEY = process.env.OPENCAGE_KEY;
    const STORMGLASS_KEY = process.env.STORMGLASS_KEY;
    // --- TEST OPENCAGE ---
    let opencageStatus = "OK";
    try {
      const geo = await fetch(
        `https://api.opencagedata.com/geocode/v1/json?q=Alicante&key=${OPENCAGE_KEY}`
      );
      if (!geo.ok) opencageStatus = "ERROR";
    } catch {
      opencageStatus = "ERROR";
    }

    // --- TEST STORMGLASS ---
    let stormStatus = "OK";
    try {
      const storm = await fetch(
        `https://api.stormglass.io/v2/weather/point?lat=38.34&lng=-0.48&params=windSpeed`,
        { headers: { Authorization: STORMGLASS_KEY } }
      );
      if (storm.status === 429) stormStatus = "LIMITED";
      if (!storm.ok) stormStatus = "ERROR";
    } catch {
      stormStatus = "ERROR";
    }

    const responseTime = Date.now() - start;

    return res.status(200).json({
      ok: true,
      status: "ONLINE",
      version: "1.0.0",
      responseTimeMs: responseTime,
      services: {
        opencage: opencageStatus,
        stormglass: stormStatus
      },
      timestamp: new Date().toISOString(),
      recommendations: [
        "Si StormGlass está en LIMITED, reduce llamadas.",
        "Si OpenCage está en ERROR, revisa la clave o el límite diario."
      ]
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      status: "ERROR",
      details: error.message
    });
  }
}
