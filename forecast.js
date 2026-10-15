import { filtrarAvisosAemet, obtenerAvisosAemet, resolverAreaAemet } from "./lib/aemet.js";

// --- CACHÉ EN MEMORIA Y PRESUPUESTO DE TIEMPO (Hallazgo I-3) ---
const cache = new Map();
const FORECAST_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_EXECUTION_BUDGET_MS = 8500;
const MIN_STEP_TIMEOUT_MS = 350;
const FETCH_GEOCODE_TIMEOUT_MS = 1500;
const FETCH_TIMEOUT_MS = 2200;
const FETCH_MARINE_TIMEOUT_MS = 1400;
const FETCH_RETRY_DELAY_MS = 250;

function crearPresupuesto(limiteTotalMs = MAX_EXECUTION_BUDGET_MS) {
  const inicio = Date.now();
  return {
    transcurrido() {
      return Date.now() - inicio;
    },
    restante(reservaMs = 0) {
      return Math.max(0, (limiteTotalMs - reservaMs) - (Date.now() - inicio));
    },
    tieneMargen(minimoRequeridoMs) {
      return this.restante(0) >= minimoRequeridoMs;
    },
    timeoutParaPaso(maxPasoMs, reservaMs = 0) {
      const disponible = this.restante(reservaMs);
      if (disponible < MIN_STEP_TIMEOUT_MS) {
        throw new Error("Tiempo de respuesta agotado en proveedores meteorológicos");
      }
      return Math.min(maxPasoMs, disponible);
    }
  };
}

function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS, presupuesto = null, reservaMs = 0) {
  const effectiveTimeout = presupuesto
    ? presupuesto.timeoutParaPaso(timeoutMs, reservaMs)
    : timeoutMs;

  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(effectiveTimeout)
  });
}

function esErrorTransitorioProveedor(error) {
  return error?.name === "AbortError" ||
    error?.name === "TimeoutError" ||
    error instanceof TypeError ||
    error?.status === 429 ||
    error?.status >= 500;
}

function obtenerVentanaHoraria(date, timeRange) {
  const dateMatch = /^(\d{4}-\d{2}-\d{2})$/.exec(date ?? "");
  const rangeMatch = /\((\d{2}):00\s*-\s*(\d{2}):00\)/.exec(timeRange ?? "");
  if (!dateMatch || !rangeMatch) {
    throw new Error("Fecha o franja horaria inválida");
  }

  const dateValue = new Date(`${dateMatch[1]}T00:00:00Z`);
  if (Number.isNaN(dateValue.getTime()) || dateValue.toISOString().slice(0, 10) !== dateMatch[1]) {
    throw new Error("Fecha inválida");
  }

  const startHour = Number(rangeMatch[1]);
  const endHour = Number(rangeMatch[2]);
  if (startHour < 0 || endHour > 24 || startHour >= endHour) {
    throw new Error("Franja horaria inválida");
  }

  const endIncludedHour = endHour - 1;
  const hourText = (hour) => String(hour).padStart(2, "0");
  return {
    startHour,
    endHour,
    startLocal: `${dateMatch[1]}T${hourText(startHour)}:00`,
    endLocal: `${dateMatch[1]}T${hourText(endIncludedHour)}:00`
  };
}

function convertirHoraLocalAUtc(dateTime, timeZone) {
  const [date, time] = dateTime.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });

  let utcTime = localAsUtc;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(utcTime)).map(({ type, value }) => [type, value])
    );
    const representedAsUtc = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second)
    );
    utcTime += localAsUtc - representedAsUtc;
  }

  return utcTime;
}

async function geocodificar(location, apiKey, presupuesto = crearPresupuesto()) {
  if (apiKey && presupuesto.tieneMargen(3500)) {
    try {
      const geoRes = await fetchWithTimeout(
        `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(location)}&key=${apiKey}`,
        {},
        FETCH_GEOCODE_TIMEOUT_MS,
        presupuesto,
        2500
      );
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        const result = geoData.results?.[0];
        const geometry = result?.geometry;
        if (Number.isFinite(geometry?.lat) && Number.isFinite(geometry?.lng)) {
          return {
            lat: geometry.lat,
            lng: geometry.lng,
            aemetArea: result.components?.country_code === "es"
              ? resolverAreaAemet(result.components?.state_code, result.components?.state)
              : null
          };
        }
      }
    } catch {
      // Open-Meteo puede geocodificar si OpenCage no está disponible.
    }
  }

  const geocodingUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geocodingUrl.search = new URLSearchParams({
    name: location,
    count: "1",
    language: "es",
    format: "json"
  });
  const geocodingResponse = await fetchWithTimeout(
    geocodingUrl,
    {},
    FETCH_GEOCODE_TIMEOUT_MS,
    presupuesto,
    2000
  );
  if (!geocodingResponse.ok) {
    throw new Error(`Open-Meteo geocoding respondió con status ${geocodingResponse.status}`);
  }

  const geocodingData = await geocodingResponse.json();
  const result = geocodingData.results?.[0];
  if (!Number.isFinite(result?.latitude) || !Number.isFinite(result?.longitude)) {
    return null;
  }

  return {
    lat: result.latitude,
    lng: result.longitude,
    aemetArea: result.country_code === "ES"
      ? resolverAreaAemet(null, result.admin1)
      : null
  };
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

  return { lat, lng, aemetArea: null };
}

async function resolverAreaAemetPorCoordenadas(lat, lng, apiKey, presupuesto) {
  if (!apiKey) {
    console.warn("[AEMET] No se puede asociar la ubicación a una comunidad autónoma sin geocodificación inversa.");
    return null;
  }

  try {
    const url = new URL("https://api.opencagedata.com/geocode/v1/json");
    url.search = new URLSearchParams({
      q: `${lat},${lng}`,
      key: apiKey,
      no_annotations: "1"
    });
    const response = await fetchWithTimeout(url, {}, FETCH_GEOCODE_TIMEOUT_MS, presupuesto, 1500);
    if (!response.ok) {
      throw new Error(`OpenCage reverse geocoding respondió con status ${response.status}`);
    }

    const result = (await response.json()).results?.[0];
    if (result?.components?.country_code !== "es") return null;
    return resolverAreaAemet(result.components?.state_code, result.components?.state);
  } catch (error) {
    console.warn(
      "[AEMET] No se pudo determinar la comunidad autónoma desde las coordenadas.",
      error instanceof Error ? error.name : "Error desconocido"
    );
    return null;
  }
}

export async function llamarApiPrincipal(lat, lon, date, timeRange, timeZone = "UTC", presupuesto = null) {
  const STORMGLASS_KEY = process.env.STORMGLASS_KEY;
  if (!STORMGLASS_KEY) {
    return { ok: false, status: 401, data: null, date, timeRange };
  }

  const window = obtenerVentanaHoraria(date, timeRange);
  const start = Math.floor(convertirHoraLocalAUtc(window.startLocal, timeZone) / 1000);
  const end = Math.floor(convertirHoraLocalAUtc(window.endLocal, timeZone) / 1000);
  const url = new URL("https://api.stormglass.io/v2/weather/point");
  url.search = new URLSearchParams({
    lat,
    lng: lon,
    params: "waveHeight,waveDirection,wavePeriod,windSpeed,windDirection,airTemperature,waterTemperature,cloudCover,precipitation",
    start,
    end
  });

  const response = await fetchWithTimeout(
    url,
    { headers: { Authorization: STORMGLASS_KEY } },
    FETCH_TIMEOUT_MS,
    presupuesto,
    1500
  );

  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { ok: response.ok, status: response.status, data, date, timeRange };
}

async function llamarMarineOpenMeteo(lat, lon, date, timeRange, presupuesto = null) {
  const window = obtenerVentanaHoraria(date, timeRange);
  const offsets = [[0, 0], [0.04, 0], [-0.04, 0], [0, 0.04], [0, -0.04]];

  async function solicitarMarine(dLat, dLon) {
    if (presupuesto && !presupuesto.tieneMargen(MIN_STEP_TIMEOUT_MS)) {
      return null;
    }

    const marineUrl = new URL("https://marine-api.open-meteo.com/v1/marine");
    marineUrl.search = new URLSearchParams({
      latitude: (Number(lat) + dLat).toFixed(4),
      longitude: (Number(lon) + dLon).toFixed(4),
      hourly: "wave_height,wave_period,sea_surface_temperature",
      cell_selection: "sea",
      timezone: "auto",
      start_hour: window.startLocal,
      end_hour: window.endLocal
    });

    const marineResponse = await fetchWithTimeout(
      marineUrl,
      {},
      FETCH_MARINE_TIMEOUT_MS,
      presupuesto,
      0
    );
    if (!marineResponse.ok) return null;

    const candidate = await marineResponse.json();
    const testWaves = candidate?.hourly?.wave_height ?? [];
    return testWaves.some((wave) => wave !== null && wave !== undefined) ? candidate : null;
  }

  let marineData = await solicitarMarine(...offsets[0]).catch(() => null);
  if (!marineData && (!presupuesto || presupuesto.tieneMargen(900))) {
    const neighborData = await Promise.all(
      offsets.slice(1).map(([dLat, dLon]) =>
        solicitarMarine(dLat, dLon).catch(() => null)
      )
    );
    marineData = neighborData.find(Boolean) ?? null;
  }

  return {
    wave_height: marineData?.hourly?.wave_height,
    wave_period: marineData?.hourly?.wave_period,
    ocean_temperature: marineData?.hourly?.sea_surface_temperature
  };
}

export async function llamarOpenMeteo(lat, lon, date, timeRange, incluirMarine = true, presupuesto = null) {
  const window = obtenerVentanaHoraria(date, timeRange);
  const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
  weatherUrl.search = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    hourly: "wind_speed_10m,wind_gusts_10m,wind_direction_10m,temperature_2m,weather_code,precipitation,precipitation_probability",
    timezone: "auto",
    wind_speed_unit: "ms",
    start_hour: window.startLocal,
    end_hour: window.endLocal
  });
  const weatherResponse = await fetchWithTimeout(
    weatherUrl,
    {},
    FETCH_TIMEOUT_MS,
    presupuesto,
    incluirMarine ? 1000 : 0
  );
  let weatherData;
  try {
    weatherData = await weatherResponse.json();
  } catch {
    throw Object.assign(new Error("Open-Meteo devolvió una respuesta JSON no válida"), {
      status: 502
    });
  }

  if (!weatherResponse.ok) {
    throw Object.assign(new Error(`Open-Meteo error ${weatherResponse.status}`), {
      status: weatherResponse.status
    });
  }
  if (typeof weatherData?.timezone !== "string" || !weatherData.hourly) {
    throw Object.assign(new Error("Open-Meteo devolvió una respuesta incompleta"), {
      status: 502
    });
  }

  const marineData = incluirMarine
    ? await llamarMarineOpenMeteo(lat, lon, date, timeRange, presupuesto)
    : null;

  return {
    timezone: weatherData.timezone,
    hourly: {
      time: weatherData.hourly?.time,
      wind_speed_10m: weatherData.hourly?.wind_speed_10m,
      wind_gusts_10m: weatherData.hourly?.wind_gusts_10m,
      wind_direction_10m: weatherData.hourly?.wind_direction_10m,
      temperature_2m: weatherData.hourly?.temperature_2m,
      weather_code: weatherData.hourly?.weather_code,
      precipitation: weatherData.hourly?.precipitation,
      precipitation_probability: weatherData.hourly?.precipitation_probability,
      wave_height: marineData?.wave_height,
      wave_period: marineData?.wave_period,
      ocean_temperature: marineData?.ocean_temperature
    }
  };
}

function normalizeForecastRequest(rawBody) {
  let body = rawBody;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return { error: "El cuerpo debe ser un JSON válido." };
    }
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "El cuerpo debe ser un objeto JSON." };
  }

  const location = body.location ?? body.coordenadas;
  const date = body.date ?? body.fecha;
  const userLevel = body.userLevel ?? body.nivel;
  let timeRange = body.timeRange;

  if (!timeRange) {
    const startMatch = /^([01]\d|2[0-3]):[0-5]\d$/.exec(body.horaSalida ?? "");
    if (!startMatch) {
      return { error: "Falta una franja horaria válida (timeRange)." };
    }
    const startHour = Number(startMatch[1]);
    const durationHours = Math.max(1, Math.ceil(Number(body.duracionRuta) / 60) || 2);
    const endHour = Math.min(24, startHour + durationHours);
    timeRange = `Salida (${String(startHour).padStart(2, "0")}:00 - ${String(endHour).padStart(2, "0")}:00)`;
  }

  const dateMatch = /^(\d{4}-\d{2}-\d{2})$/.exec(date ?? "");
  const rangeMatch = /\((\d{2}):00\s*-\s*(\d{2}):00\)/.exec(timeRange);
  if (!location || typeof location !== "string" || !location.trim() || location.length > 200) {
    return { error: "location debe ser una ubicación o un par de coordenadas válido." };
  }
  if (!dateMatch || Number.isNaN(Date.parse(`${dateMatch[1]}T00:00:00Z`)) ||
      new Date(`${dateMatch[1]}T00:00:00Z`).toISOString().slice(0, 10) !== dateMatch[1]) {
    return { error: "date debe tener el formato YYYY-MM-DD y ser una fecha válida." };
  }
  if (!rangeMatch) {
    return { error: "timeRange debe incluir una franja con formato (HH:00 - HH:00)." };
  }
  const startHour = Number(rangeMatch[1]);
  const endHour = Number(rangeMatch[2]);
  if (startHour < 0 || endHour > 24 || startHour >= endHour) {
    return { error: "La franja horaria no es válida." };
  }
  if (typeof userLevel !== "string" || !userLevel.trim()) {
    return { error: "userLevel es obligatorio." };
  }

  return {
    request: {
      location: location.trim(),
      date: dateMatch[1],
      timeRange,
      userLevel: userLevel.trim()
    }
  };
}

export function normalizarPrincipal(data) {
  const hours = data?.hours;
  if (!Array.isArray(hours) || hours.length === 0) {
    throw new Error("Stormglass no devolvió datos horarios");
  }

  const getVal = (obj) => obj?.sg ?? obj?.noaa ?? obj?.icon ?? null;
  const valuesFor = (field) => hours
    .map((hour) => getVal(hour[field]))
    .filter((value) => value !== null && Number.isFinite(Number(value)))
    .map(Number);
  const windSpeeds = valuesFor("windSpeed");
  const windSpeed = windSpeeds.length ? Math.max(...windSpeeds) : null;
  const windHour = hours.find((hour) => Number(getVal(hour.windSpeed)) === windSpeed);
  const windDirection = getVal(windHour?.windDirection) ?? valuesFor("windDirection")[0] ?? null;
  const waveHeights = valuesFor("waveHeight");
  const waveHeight = waveHeights.length ? Math.max(...waveHeights) : null;
  const average = (values) => values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;

  const tempAire = average(valuesFor("airTemperature"));
  const tempAgua = average(valuesFor("waterTemperature"));
  const cloudValues = valuesFor("cloudCover");
  const cloudCover = cloudValues.length ? Math.max(...cloudValues) : null;
  const precipitationValues = valuesFor("precipitation");
  const precipitation = precipitationValues.length
    ? Math.round(precipitationValues.reduce((sum, value) => sum + value, 0) * 100) / 100
    : null;
  const wavePeriods = valuesFor("wavePeriod");

  if (windSpeed === null || windDirection === null) {
    throw new Error("Viento inválido en API principal");
  }
  if (waveHeight === null) {
    throw new Error("Oleaje nulo en Stormglass, forzando radar costero de Open-Meteo");
  }
  let clima = "Sin datos meteorológicos";
  if (precipitation !== null && precipitation > 0.2) clima = "Lluvia";
  else if (cloudCover !== null) clima = cloudCover > 30 ? "Nublado" : "Soleado";

  return {
    windSpeed,
    windDirection,
    waveHeight,
    windGusts: null,
    wavePeriod: wavePeriods.length ? Math.max(...wavePeriods) : null,
    weatherCode: null,
    tempAire: tempAire === null ? null : Math.round(tempAire),
    tempAgua: tempAgua === null ? null : Math.round(tempAgua),
    clima,
    precipitation,
    precipProbability: null,
    source: "stormglass"
  };
}

export function normalizarFallback(data) {
  const hourly = data?.hourly ?? {};
  const finiteValues = (values = []) => values
    .filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)))
    .map(Number);
  const windSpeeds = finiteValues(hourly.wind_speed_10m);
  const windSpeed = windSpeeds.length ? Math.max(...windSpeeds) : null;
  const windGusts = finiteValues(hourly.wind_gusts_10m);
  const windIndex = hourly.wind_speed_10m?.findIndex((value) => Number(value) === windSpeed) ?? -1;
  const windDirection = hourly.wind_direction_10m?.[windIndex] ?? finiteValues(hourly.wind_direction_10m)[0] ?? null;
  const waveHeights = finiteValues(hourly.wave_height);
  const waveHeight = waveHeights.length ? Math.max(...waveHeights) : null;
  const wavePeriods = finiteValues(hourly.wave_period);
  const average = (values) => {
    const available = finiteValues(values);
    return available.length
      ? available.reduce((sum, value) => sum + value, 0) / available.length
      : null;
  };

  const tempAire = average(hourly.temperature_2m);
  const tempAgua = average(hourly.ocean_temperature);
  const weatherCodes = finiteValues(hourly.weather_code);
  const weatherCode = weatherCodes.find((code) => code >= 95) ??
    weatherCodes.find((code) => code >= 51) ??
    weatherCodes.find((code) => code >= 45) ??
    weatherCodes.find((code) => code >= 1) ?? weatherCodes[0] ?? null;
  const precipitationValues = finiteValues(hourly.precipitation);
  const precipitation = precipitationValues.length
    ? Math.round(precipitationValues.reduce((sum, value) => sum + value, 0) * 100) / 100
    : null;
  const precipitationProbabilities = finiteValues(hourly.precipitation_probability);
  const precipProbability = precipitationProbabilities.length
    ? Math.max(0, ...precipitationProbabilities)
    : null;

  if (windSpeed === undefined || windSpeed === null || !Number.isFinite(windSpeed)) {
    throw new Error("Viento inválido en Open-Meteo");
  }

  let clima = "Sin datos meteorológicos";
  if (weatherCode === 0) clima = "Soleado";
  if (weatherCode >= 1 && weatherCode <= 3) clima = "Nublado";
  if (weatherCode >= 45 && weatherCode <= 48) clima = "Niebla";
  if (weatherCode >= 51 && weatherCode <= 99) clima = "Lluvia";

  return {
    windSpeed,
    windGusts: windGusts.length ? Math.max(...windGusts) : null,
    windDirection,
    waveHeight,
    wavePeriod: wavePeriods.length ? Math.max(...wavePeriods) : null,
    weatherCode,
    tempAire: tempAire === null ? null : Math.round(tempAire),
    tempAgua: tempAgua === null ? null : Math.round(tempAgua),
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

async function obtenerMeteoConReintento(lat, lon, date, timeRange, presupuesto) {
  try {
    return await llamarOpenMeteo(lat, lon, date, timeRange, false, presupuesto);
  } catch (error) {
    if (!esErrorTransitorioProveedor(error) ||
        !presupuesto.tieneMargen(MIN_STEP_TIMEOUT_MS + FETCH_RETRY_DELAY_MS)) {
      throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, FETCH_RETRY_DELAY_MS));
    return llamarOpenMeteo(lat, lon, date, timeRange, false, presupuesto);
  }
}

export async function obtenerForecast(lat, lon, date, timeRange, presupuesto = crearPresupuesto()) {
  let meteo;
  try {
    meteo = await obtenerMeteoConReintento(lat, lon, date, timeRange, presupuesto);
  } catch (error) {
    const detalle = error instanceof Error ? `: ${error.message}` : "";
    throw new Error(`Open-Meteo no pudo obtener el pronóstico y su zona horaria${detalle}`);
  }
  if (!meteo?.timezone) {
    throw new Error("Open-Meteo respondió sin una zona horaria válida para la fecha y franja seleccionadas");
  }

  let principal = null;
  if (presupuesto.tieneMargen(2800)) {
    try {
      principal = await llamarApiPrincipal(lat, lon, date, timeRange, meteo.timezone, presupuesto);
    } catch {
      principal = null;
    }
  }

  if (!debeUsarFallback(principal)) {
    const datosPrincipales = normalizarPrincipal(principal.data);
    if (!meteo) return datosPrincipales;

    const datosMeteo = normalizarFallback(meteo);
    return {
      ...datosPrincipales,
      windGusts: datosMeteo.windGusts,
      wavePeriod: datosPrincipales.wavePeriod ?? datosMeteo.wavePeriod,
      weatherCode: datosMeteo.weatherCode,
      precipitation: datosMeteo.precipitation ?? datosPrincipales.precipitation,
      precipProbability: datosMeteo.precipProbability,
      clima: datosMeteo.clima !== "Sin datos meteorológicos"
        ? datosMeteo.clima
        : datosPrincipales.clima,
      timezone: meteo.timezone
    };
  }

  const datosMeteo = meteo ?? await llamarOpenMeteo(lat, lon, date, timeRange, false, presupuesto);
  const datosMarinos = await llamarMarineOpenMeteo(lat, lon, date, timeRange, presupuesto);
  return {
    ...normalizarFallback({
      ...datosMeteo,
      hourly: { ...datosMeteo.hourly, ...datosMarinos }
    }),
    timezone: datosMeteo.timezone
  };
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const presupuesto = crearPresupuesto(MAX_EXECUTION_BUDGET_MS);

  try {
    const OPENCAGE_KEY = process.env.OPENCAGE_KEY;
    const normalized = normalizeForecastRequest(req.body);
    if (normalized.error) {
      return res.status(400).json({
        ok: false,
        error: normalized.error,
        required: ["location", "date", "timeRange", "userLevel"],
        legacyFields: ["coordenadas", "fecha", "horaSalida", "nivel", "duracionRuta"]
      });
    }
    const { location, date, timeRange, userLevel } = normalized.request;

    // --- CACHÉ ---
    const cacheKey = `${location}-${date}-${timeRange}-${userLevel}`;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < FORECAST_CACHE_TTL_MS) {
      return res.status(200).json({ ok: true, cached: true, ...cached.data });
    }

    // --- GEOCODING ---
    const coordinates = parsearCoordenadas(location) ?? await geocodificar(location, OPENCAGE_KEY, presupuesto);

    if (!coordinates) {
      return res.status(404).json({
        ok: false,
        error: "No se encontraron coordenadas para la ubicación"
      });
    }

    const { lat, lng } = coordinates;

    const areaAemetPromise = coordinates.aemetArea
      ? Promise.resolve(coordinates.aemetArea)
      : resolverAreaAemetPorCoordenadas(lat, lng, OPENCAGE_KEY, presupuesto);
    const avisosAemetPromise = areaAemetPromise.then(async area => ({
      area,
      respuesta: await obtenerAvisosAemet({ area })
    }));

    const [datos, avisosAemet] = await Promise.all([
      obtenerForecast(lat, lng, date, timeRange, presupuesto),
      avisosAemetPromise
    ]);

    let alertasAemet = [];
    let aemetAvailable = avisosAemet.respuesta.disponible;
    if (aemetAvailable) {
      try {
        const ventana = obtenerVentanaHoraria(date, timeRange);
        if (!datos.timezone) throw new Error("La zona horaria del pronóstico no está disponible");
        const inicio = convertirHoraLocalAUtc(ventana.startLocal, datos.timezone);
        const fin = convertirHoraLocalAUtc(ventana.endLocal, datos.timezone);
        if (!Number.isFinite(inicio) || !Number.isFinite(fin) || inicio > fin) {
          throw new Error("La franja horaria no se pudo convertir a UTC");
        }
        alertasAemet = filtrarAvisosAemet(avisosAemet.respuesta.alertas, {
          inicio,
          fin
        });
      } catch (error) {
        aemetAvailable = false;
        console.warn("[AEMET] No se pudieron verificar las vigencias de los avisos.", error);
      }
    }

    datos.aemetAvailable = aemetAvailable;
    datos.aemet_alerts = alertasAemet;
    datos.aemetArea = avisosAemet.area?.nombre ?? null;
    datos.aemetAreaScope = avisosAemet.area ? "regional" : null;
    if (aemetAvailable) datos.alertSource = "AEMET";

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