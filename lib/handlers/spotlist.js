import { decryptApiKey } from "./credentials.js";

// --- CACHÉ ---
const cache = new Map();

// --- LISTA BASE DE SPOTS ---
const SPOTS_BASE = [
  {
    nombre: "Playa de San Juan",
    location: "Playa de San Juan, Alicante, España",
    nivel: "Principiante",
    tipo_costa: "Playa abierta",
    riesgos: ["Corrientes laterales", "Oleaje cruzado"],
    servicios: ["Duchas", "Socorrista", "Escuelas SUP", "Parking"]
  },
  {
    nombre: "La Barceloneta",
    location: "Playa de la Barceloneta, Barcelona, España",
    nivel: "Intermedio",
    tipo_costa: "Playa urbana",
    riesgos: ["Viento térmico", "Tráfico de embarcaciones"],
    servicios: ["Duchas", "Restauración", "Escuelas SUP"]
  },
  {
    nombre: "Playa de la Malvarrosa",
    location: "Playa de la Malvarrosa, Valencia, España",
    nivel: "Principiante",
    tipo_costa: "Playa abierta",
    riesgos: ["Oleaje moderado", "Corrientes suaves"],
    servicios: ["Duchas", "Socorrista", "Restauración"]
  },
  {
    nombre: "Playa de Bolonia",
    location: "Playa de Bolonia, Cádiz, España",
    nivel: "Avanzado",
    tipo_costa: "Playa abierta",
    riesgos: ["Viento fuerte", "Oleaje alto"],
    servicios: ["Parking", "Restauración"]
  }
];

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const OPENCAGE_KEY = decryptApiKey("ENC_OPENCAGE");
    // --- CACHÉ ---
    const cacheKey = "spotlist";
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < 24 * 3600 * 1000) {
      return res.status(200).json({ ok: true, cached: true, spots: cached.data });
    }

    const spotsFinal = [];

    // --- ENRIQUECER SPOTS CON OPENCAGE ---
    for (const spot of SPOTS_BASE) {
      const geoRes = await fetch(
        `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(
          spot.location
        )}&key=${OPENCAGE_KEY}`
      );

      const geoData = await geoRes.json();

      if (!geoData.results?.length) {
        spotsFinal.push({
          ...spot,
          coordenadas: null,
          zona_horaria: null,
          altitud: null
        });
        continue;
      }

      const result = geoData.results[0];

      spotsFinal.push({
        ...spot,
        coordenadas: {
          lat: result.geometry.lat,
          lng: result.geometry.lng
        },
        pais: result.components.country || "Desconocido",
        region:
          result.components.state ||
          result.components.county ||
          result.components.region ||
          "Desconocido",
        zona_horaria: result.annotations.timezone.name,
        altitud: result.annotations.elevation || 0,
        recomendaciones: [
          "Evita zonas con rocas.",
          "Las mejores condiciones suelen ser por la mañana.",
          "Mantén distancia de bañistas en temporada alta."
        ]
      });
    }

    // --- GUARDAR EN CACHÉ ---
    cache.set(cacheKey, { timestamp: Date.now(), data: spotsFinal });

    return res.status(200).json({
      ok: true,
      spots: spotsFinal
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Error interno",
      details: error.message
    });
  }
}
