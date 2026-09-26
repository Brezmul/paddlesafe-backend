import crypto from "crypto";

// --- LLAVES CIFRADAS ---
const ENC_OPENCAGE = "9f8c4e7b1a2d9c3f0e4b7a1d9f3c2b7e";
const ENC_STORMGLASS = "4b9e1c7f0a3d8e2b9f7c1a4e0d3b8f1c7a2d9e0b4c7f1a3d9e2b7c4f0a1d3b";

// --- CLAVE MAESTRA ---
const MASTER_KEY = "Tiburon_23_93";

// --- DESCIFRADOR AES-256-CBC ---
function decrypt(encrypted) {
  const key = crypto.createHash("sha256").update(MASTER_KEY).digest();
  const iv = Buffer.alloc(16, 0);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

const OPENCAGE_KEY = decrypt(ENC_OPENCAGE);
const STORMGLASS_KEY = decrypt(ENC_STORMGLASS);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const start = Date.now();

  try {
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
