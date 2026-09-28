// --- CACHÉ EN MEMORIA ---
const cache = new Map();
const FETCH_TIMEOUT_MS = 2500;
const FETCH_MARINE_TIMEOUT_MS = 1800;

function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs)
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

function parsearCoordenadas(location) {
  if (typeof location !== "string") return null;

  const parts = location.split(",");
  if (parts.length !== 2) return null;

  const lat = Number(parts[0].trim());
  const lng = Number(parts[1].trim());
  if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }

  return { lat, lng };
}

export async function llamarApiPrincipal(lat, lon, date, timeRange) {
  const STORMGLASS_KEY = process.env.STORMGLASS_KEY;
  const url = `https://api.stormglass.io/v2/weather/point?lat=${lat}&lng=${lon}&params=waveHeight,waveDirection,wavePeriod,windSpeed,windDirection,airTemperature,waterTemperature,cloudCover,precipitation`;
  const response = await fetchWithTimeout(url, {
    headers: { Authorization: STORMGLASS_KEY }
  });

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
    hourly: "wind_speed_10m,wind_direction_10m,temperature_2m,weather_code,precipitation,precipitation_probability",
    timezone: "auto"
  });
  const weatherResponse = await fetchWithTimeout(weatherUrl);
  let weatherData;
  try {
    weatherData = await weatherResponse.json();
  } catch {
    weatherData = null;
  }

  if (!weatherResponse.ok) {
    throw new Error(`Open-Meteo error ${weatherResponse.status}`);
  }

  const offsets = [[0, 0], [0.04, 0], [-0.04, 0], [0, 0.04], [0, -0.04]];

  async function solicitarMarine(dLat, dLon) {
    const marineUrl = new URL("https://marine-api.open-meteo.com/v1/marine");
    marineUrl.search = new URLSearchParams({
      latitude: (Number(lat) + dLat).toFixed(4),
      longitude: (Number(lon) + dLon).toFixed(4),
      hourly: "wave_height,sea_surface_temperature",
      cell_selection: "sea",
      timezone: "auto"
    });

    const marineResponse = await fetchWithTimeout(marineUrl, {}, FETCH_MARINE_TIMEOUT_MS);
    if (!marineResponse.ok) return null;

    const candidate = await marineResponse.json();
    const testWave = candidate?.hourly?.wave_height?.[0];
    return testWave !== null && testWave !== undefined ? candidate : null;
  }

  let marineData = await solicitarMarine(...offsets[0]).catch(() => null);
  if (!marineData) {
    const neighborData = await Promise.all(
      offsets.slice(1).map(([dLat, dLon]) =>
        solicitarMarine(dLat, dLon).catch(() => null)
      )
    );
    marineData = neighborData.find(Boolean) ?? null;
  }

  return {
    hourly: {
      wind_speed_10m: weatherData.hourly?.wind_speed_10m,
      wind_direction_10m: weatherData.hourly?.wind_direction_10m,
      temperature_2m: weatherData.hourly?.temperature_2m,
      weather_code: weatherData.hourly?.weather_code,
      precipitation: weatherData.hourly?.precipitation,
      precipitation_probability: weatherData.hourly?.precipitation_probability,
      wave_height: marineData?.hourly?.wave_height,
      ocean_temperature: marineData?.hourly?.sea_surface_temperature
    }
  };
}

export function normalizarPrincipal(data) {
  const hour = data?.hours?.[0];
  if (!hour) throw new Error("Stormglass no devolvió datos horarios");

  // EL ARREGLO ESTÁ AQUÍ: Leemos 'sg' primero (interpolado de alta resolución), si no 'noaa', si no 'icon'
  const getVal = (obj) => obj?.sg ?? obj?.noaa ?? obj?.icon ?? null;

  const windSpeed = getVal(hour.windSpeed);
  const windDirection = getVal(hour.windDirection);
  const waveHeight = getVal(hour.waveHeight);

  const tempAire = getVal(hour.airTemperature) ?? 25;
  const tempAgua = getVal(hour.waterTemperature) ?? 22;
  const cloudCover = getVal(hour.cloudCover) ?? 0;
  const precipitation = getVal(hour.precipitation) ?? 0;

  // Ya no obligamos al waveHeight a existir para no descartar el viento si estamos en un píxel rebelde
  if (windSpeed === null || windDirection === null) {
    throw new Error("Viento inválido en API principal");
  }
  if (waveHeight === null) {
    throw new Error("Oleaje nulo en Stormglass, forzando radar costero de Open-Meteo");
  }

  let clima = "Soleado";
  if (precipitation > 0.2) clima = "Lluvia";
  else if (cloudCover > 30) clima = "Nublado";

  return {
    windSpeed: windSpeed * 3.6,
    windDirection,
    waveHeight,
    tempAire: Math.round(tempAire),
    tempAgua: Math.round(tempAgua),
    clima,
    precipitation: Number(precipitation),
    precipProbability: precipitation > 0 ? 100 : 0,
    source: "stormglass"
  };
}

export function normalizarFallback(data) {
  const windSpeed = data?.hourly?.wind_speed_10m?.[0];
  const windDirection = data?.hourly?.wind_direction_10m?.[0];
  const waveHeight = data?.hourly?.wave_height?.[0] ?? null;

  const tempAire = data?.hourly?.temperature_2m?.[0] ?? 25;
  const tempAgua = data?.hourly?.ocean_temperature?.[0] ?? 22;
  const weatherCode = data?.hourly?.weather_code?.[0] ?? 0;
  const precipitation = data?.hourly?.precipitation?.[0] ?? 0;
  const precipProbability = data?.hourly?.precipitation_probability?.[0] ?? 0;

  if (windSpeed === undefined || windSpeed === null || !Number.isFinite(windSpeed)) {
    throw new Error("Viento inválido en Open-Meteo");
  }

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
    precipitation,
    precipProbability,
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
    const coordinates = parsearCoordenadas(location) ?? await geocodificar(location, OPENCAGE_KEY);

    if (!coordinates) {
      return res.status(404).json({
        ok: false,
        error: "No se encontraron coordenadas para la ubicación"
      });
    }

    const { lat, lng } = coordinates;

    // Ejecuta el motor meteorológico
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
