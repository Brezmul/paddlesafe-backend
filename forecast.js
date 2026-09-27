// --- CACHÉ EN MEMORIA ---
const cache = new Map();

export async function llamarApiPrincipal(lat, lon, date, timeRange) {
  const STORMGLASS_KEY = process.env.STORMGLASS_KEY;
  const response = await fetch(
    `https://api.stormglass.io/v2/weather/point?lat=${lat}&lng=${lon}&params=waveHeight,waveDirection,wavePeriod,windSpeed,windDirection`,
    { headers: { Authorization: STORMGLASS_KEY } }
  );

  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { ok: response.ok, status: response.status, data, date, timeRange };
}

export async function llamarOpenMeteo(lat, lon) {
  const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
  weatherUrl.search = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    hourly: "wind_speed_10m,wind_direction_10m",
    timezone: "auto"
  });
  const marineUrl = new URL("https://marine-api.open-meteo.com/v1/marine");
  marineUrl.search = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    hourly: "wave_height",
    timezone: "auto"
  });

  const [weatherResponse, marineResponse] = await Promise.all([
    fetch(weatherUrl),
    fetch(marineUrl).catch(() => null)
  ]);
  if (!weatherResponse.ok) {
    throw new Error(`Open-Meteo respondió con status ${weatherResponse.status}`);
  }

  const weatherData = await weatherResponse.json();
  let waveHeight;
  if (marineResponse?.ok) {
    try {
      const marineData = await marineResponse.json();
      waveHeight = marineData.hourly?.wave_height;
    } catch {
      waveHeight = null;
    }
  }

  return {
    hourly: {
      wind_speed_10m: weatherData.hourly?.wind_speed_10m,
      wind_direction_10m: weatherData.hourly?.wind_direction_10m,
      wave_height: waveHeight
    }
  };
}

export function normalizarPrincipal(data) {
  const hour = data?.hours?.[0];
  const windSpeed = hour?.windSpeed?.noaa;
  const windDirection = hour?.windDirection?.noaa;
  const waveHeight = hour?.waveHeight?.noaa;

  if (![windSpeed, windDirection, waveHeight].every(Number.isFinite)) {
    throw new Error("La API principal devolvió datos inválidos");
  }

  return { windSpeed, windDirection, waveHeight, source: "stormglass" };
}

export function normalizarFallback(data) {
  const windSpeed = data?.hourly?.wind_speed_10m?.[0];
  const windDirection = data?.hourly?.wind_direction_10m?.[0];
  const waveHeight = data?.hourly?.wave_height?.[0] || null;

  if (![windSpeed, windDirection].every(Number.isFinite) ||
      (waveHeight !== null && !Number.isFinite(waveHeight))) {
    throw new Error("Open-Meteo devolvió datos inválidos");
  }

  return { windSpeed, windDirection, waveHeight, source: "open-meteo" };
}

export function debeUsarFallback(res) {
  if (!res?.ok || res.status === 429 || res.status >= 500) return true;

  try {
    normalizarPrincipal(res.data);
    return false;
  } catch {
    return true;
  }
}

export async function obtenerForecast(lat, lon, date, timeRange) {
  let principal;
  try {
    principal = await llamarApiPrincipal(lat, lon, date, timeRange);
  } catch {
    principal = null;
  }

  if (!debeUsarFallback(principal)) {
    return normalizarPrincipal(principal.data);
  }

  console.log("Usando fallback Open‑Meteo");
  const fallback = await llamarOpenMeteo(lat, lon);
  return normalizarFallback(fallback);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const OPENCAGE_KEY = process.env.OPENCAGE_KEY;
    const { location, date, timeRange, userLevel } = req.body;

    if (!location || !date || !timeRange || !userLevel) {
      return res.status(400).json({
        ok: false,
        error: "Faltan parámetros",
        required: ["location", "date", "timeRange", "userLevel"]
      });
    }

    // --- CACHÉ ---
    const cacheKey = `${location}-${date}-${timeRange}-${userLevel}`;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < 3600 * 1000) {
      return res.status(200).json({ ok: true, cached: true, ...cached.data });
    }

    // --- GEOCODING (OpenCage) ---
    const geoRes = await fetch(
      `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(location)}&key=${OPENCAGE_KEY}`
    );

    const geoData = await geoRes.json();

    if (!geoData.results?.length) {
      return res.status(404).json({
        ok: false,
        error: "No se encontraron coordenadas para la ubicación"
      });
    }

    const { lat, lng } = geoData.results[0].geometry;

    const datos = await obtenerForecast(lat, lng, date, timeRange);

    const responseData = {
      ok: true,
      cached: false,
      received: { location, date, timeRange, userLevel },
      datos
    };

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
