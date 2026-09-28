// --- CACHÉ EN MEMORIA ---
const cache = new Map();
const FETCH_TIMEOUT_MS = 2500;

function fetchWithTimeout(url, options = {}) {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
}

async function geocodificar(location, apiKey) {
  if (apiKey) {
    try {
      const geoRes = await fetchWithTimeout(
        `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(location)}&key=${apiKey}`
      );
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        const geometry = geoData.results?.[0]?.geometry;
        if (Number.isFinite(geometry?.lat) && Number.isFinite(geometry?.lng)) {
          return { lat: geometry.lat, lng: geometry.lng };
        }
      }
    } catch {
      // Open-Meteo can still geocode when OpenCage is unavailable.
    }
  }

  const geocodingUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geocodingUrl.search = new URLSearchParams({
    name: location,
    count: "1",
    language: "es",
    format: "json"
  });
  const geocodingResponse = await fetchWithTimeout(geocodingUrl);
  if (!geocodingResponse.ok) {
    throw new Error(`Open-Meteo geocoding respondió con status ${geocodingResponse.status}`);
  }

  const geocodingData = await geocodingResponse.json();
  const result = geocodingData.results?.[0];
  if (!Number.isFinite(result?.latitude) || !Number.isFinite(result?.longitude)) {
    return null;
  }

  return { lat: result.latitude, lng: result.longitude };
}

export async function llamarApiPrincipal(lat, lon, date, timeRange) {
  const STORMGLASS_KEY = process.env.STORMGLASS_KEY;
  // MEJORA: Añadidos parámetros 'airTemperature', 'waterTemperature', 'cloudCover' y 'precipitation' a la petición
  const response = await fetchWithTimeout(
    `https://api.stormglass.io/v2/weather/point?lat=${lat}&lng=${lon}&params=waveHeight,waveDirection,wavePeriod,windSpeed,windDirection,airTemperature,waterTemperature,cloudCover,precipitation`,
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
    // MEJORA: Añadida la temperatura y el código meteorológico del clima (WMO)
    hourly: "wind_speed_10m,wind_direction_10m,temperature_2m,weather_code",
    timezone: "auto"
  });
  
  const marineUrl = new URL("https://marine-api.open-meteo.com/v1/marine");
  marineUrl.search = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    // MEJORA: Añadida la temperatura del océano en la API marítima
    hourly: "wave_height,ocean_temperature",
    timezone: "auto"
  });

  const [weatherResponse, marineResponse] = await Promise.all([
    fetchWithTimeout(weatherUrl),
    fetchWithTimeout(marineUrl).catch(() => null)
  ]);
  
  if (!weatherResponse.ok) {
    throw new Error(`Open-Meteo respondió con status ${weatherResponse.status}`);
  }

  const weatherData = await weatherResponse.json();
  
  let waveHeight, oceanTemperature;
  if (marineResponse?.ok) {
    try {
      const marineData = await marineResponse.json();
      waveHeight = marineData.hourly?.wave_height;
      oceanTemperature = marineData.hourly?.ocean_temperature;
    } catch {
      waveHeight = null;
      oceanTemperature = null;
    }
  }

  return {
    hourly: {
      wind_speed_10m: weatherData.hourly?.wind_speed_10m,
      wind_direction_10m: weatherData.hourly?.wind_direction_10m,
      temperature_2m: weatherData.hourly?.temperature_2m,
      weather_code: weatherData.hourly?.weather_code,
      wave_height: waveHeight,
      ocean_temperature: oceanTemperature
    }
  };
}

export function normalizarPrincipal(data) {
  const hour = data?.hours?.[0];
  const windSpeed = hour?.windSpeed?.noaa;
  const windDirection = hour?.windDirection?.noaa;
  const waveHeight = hour?.waveHeight?.noaa;
  
  // MEJORA: Extracción de nuevas métricas. Si la API las omite, inyectamos valores lógicos por defecto
  const tempAire = hour?.airTemperature?.noaa ?? 25;
  const tempAgua = hour?.waterTemperature?.noaa ?? 22;
  const cloudCover = hour?.cloudCover?.noaa ?? 0;
  const precipitation = hour?.precipitation?.noaa ?? 0;

  if (![windSpeed, windDirection, waveHeight].every(Number.isFinite)) {
    throw new Error("La API principal devolvió datos inválidos");
  }

  // MEJORA: Lógica para derivar el clima general en Stormglass a través de la nubosidad y la precipitación
  let clima = "Soleado";
  if (precipitation > 0.2) clima = "Lluvia";
  else if (cloudCover > 30) clima = "Nublado";

  return { 
    windSpeed: windSpeed * 3.6, // Mantenemos tu conversión matemática original
    windDirection, 
    waveHeight, 
    tempAire: Math.round(tempAire),
    tempAgua: Math.round(tempAgua),
    clima,
    source: "stormglass" 
  };
}

export function normalizarFallback(data) {
  const windSpeed = data?.hourly?.wind_speed_10m?.[0];
  const windDirection = data?.hourly?.wind_direction_10m?.[0];
  const waveHeight = data?.hourly?.wave_height?.[0] ?? null;
  
  // MEJORA: Extracción de variables Open-Meteo
  const tempAire = data?.hourly?.temperature_2m?.[0] ?? 25;
  const tempAgua = data?.hourly?.ocean_temperature?.[0] ?? 22;
  const weatherCode = data?.hourly?.weather_code?.[0] ?? 0;

  if (![windSpeed, windDirection].every(Number.isFinite) ||
      (waveHeight !== null && !Number.isFinite(waveHeight))) {
    throw new Error("Open-Meteo devolvió datos inválidos");
  }

  // MEJORA: Diccionario de traducción de códigos WMO (Organización Meteorológica Mundial)
  let clima = "Soleado";
  if (weatherCode >= 1 && weatherCode <= 3) clima = "Nublado";
  if (weatherCode >= 45 && weatherCode <= 48) clima = "Niebla";
  if (weatherCode >= 51 && weatherCode <= 99) clima = "Lluvia";

  return { 
    windSpeed, 
    windDirection, 
    waveHeight, 
    tempAire: Math.round(tempAire),
    tempAgua: Math.round(tempAgua),
    clima,
    source: "open-meteo" 
  };
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

  console.warn("Usando fallback Open‑Meteo");
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
    const coordinates = await geocodificar(location, OPENCAGE_KEY);
    if (!coordinates) {
      return res.status(404).json({
        ok: false,
        error: "No se encontraron coordenadas para la ubicación"
      });
    }

    const { lat, lng } = coordinates;

    // Ejecuta el motor meteorológico integrado con las nuevas variables
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
