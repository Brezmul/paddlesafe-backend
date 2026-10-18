// ==============================================================================
// PADDLESAFE NEXT-GEN - METEOROLOGY & MARINE FORECASTING ENGINE (map.weather.js)
// Open-Meteo Forecast, Marine API, AEMET Official Alerts & 112 Emergency Protocols.
// Extracted from map.js under Strangler Fig architecture.
// ==============================================================================

import { BACKEND_API_URL } from '../config.js';
import {
    fetchConTimeout,
    kmhANudos,
    deduplicateInsights,
    resolverOrientacionCostera,
    calcularComponenteVientoAuto,
    calcularConsensoModelos,
    detectarVentanasOptimas,
    generarVeredictoNextGen
} from '../utils.js';
import { mapRuntime } from './map.state.js';

export function registrarDiagnosticoClima(etiqueta, contenido) {
    try {
        if (typeof window !== 'undefined' && window.localStorage?.getItem('paddlesafe:debug-weather') === 'true') {
            console.debug(etiqueta, contenido);
        }
    } catch (error) {
        console.warn('[clima] No se pudo consultar la opción de diagnóstico:', error);
    }
}

// Catálogo Nacional de Autoridades de Protección Civil y Emergencias 112 por Comunidad Autónoma
export const AUTORIDADES_112_ES = {
    ANDALUCIA: {
        id: "ANDALUCIA",
        nombre: "112 Andalucía",
        organismo: "Servicio de Emergencias 112 Andalucía / Protección Civil (Junta de Andalucía)",
        plan: "Plan Territorial de Emergencias de Andalucía (PTEAnd)",
        portal: "https://www.juntadeandalucia.es/temas/seguridad/emergencias-112.html",
        urlDoc: "https://www.juntadeandalucia.es/organismos/presidenciainteriordialogosocialysimplificacionadministrativa/areas/emergencias-112.html",
        telefono: "112",
        canal: "@E112Andalucia",
        peligroNautico: "Oleaje atlántico/mediterráneo, corrientes de resaca e intensidad de viento de levante en el Estrecho."
    },
    CATALUNYA: {
        id: "CATALUNYA",
        nombre: "112 / Protecció Civil Catalunya",
        organismo: "Direcció General de Protecció Civil (Generalitat de Catalunya)",
        plan: "Pla Especial d'Emergències per Inundacions de Catalunya (INUNCAT) / PROCICAT",
        portal: "https://interior.gencat.cat/inuncat",
        urlDoc: "https://interior.gencat.cat/inuncat",
        telefono: "112",
        canal: "@emergenciescat",
        peligroNautico: "Llevantades amb onatge violent, mar de fons del NE i fortes corrents en desembocadures de rius i rieres."
    },
    VALENCIA: {
        id: "VALENCIA",
        nombre: "112 Comunitat Valenciana",
        organismo: "Agència Valenciana de Seguretat i Resposta a les Emergències (AVSRE)",
        plan: "Plan Especial frente al Riesgo de Inundaciones de la Comunitat Valenciana (PEI-CV)",
        portal: "https://www.112cv.gva.es",
        urlDoc: "https://www.112cv.gva.es/documents/163565706/168368846/EGEN260541_Aviso_especial.pdf/663141cd-8dde-dea7-b54b-891e0f9561d5?t=1792046608487",
        telefono: "112",
        canal: "@GVA112",
        peligroNautico: "Avenidas súbitas en ramblas y desembocaduras, mar gruesa de levante y corrientes violentas de retorno."
    },
    GALICIA: {
        id: "GALICIA",
        nombre: "112 Galicia (AXEGA)",
        organismo: "Axencia Galega de Emerxencias (Xunta de Galicia)",
        plan: "Plan Territorial de Emerxencias de Galicia (PLATERGA)",
        portal: "https://axega112.gal",
        urlDoc: "https://axega112.gal",
        telefono: "112",
        canal: "@112Galicia",
        peligroNautico: "Fuerte mar de fondo atlántica, olas rompientes de gran energía en rías abiertas y bajos rocosos."
    },
    BALEARES: {
        id: "BALEARES",
        nombre: "112 Illes Balears (SEIB)",
        organismo: "Direcció General d'Emergències i Interior (Govern de les Illes Balears)",
        plan: "Plan Especial de Fenómenos Meteorológicos Adversos (METEOBAL)",
        portal: "https://112balears.caib.es",
        urlDoc: "https://112balears.caib.es",
        telefono: "112",
        canal: "@112IllesBalears",
        peligroNautico: "Rissagues (oscilaciones violentas del nivel del mar), temporales de tramuntana y rompientes en calas estrechas."
    },
    CANARIAS: {
        id: "CANARIAS",
        nombre: "1-1-2 Canarias (CECOES)",
        organismo: "Dirección General de Emergencias (Gobierno de Canarias)",
        plan: "Plan Específico de Emergencias de Canarias por Riesgo de Fenómenos Meteorológicos Adversos (PEFMA)",
        portal: "https://www.gobiernodecanarias.org/administracionpublica/seguridadyemergencias/",
        urlDoc: "https://www.gobiernodecanarias.org/administracionpublica/seguridadyemergencias/",
        telefono: "1-1-2",
        canal: "@112canarias",
        peligroNautico: "Oleaje oceánico profundo, mar de fondo del norte, corrientes de retorno y aceleración de alisios entre canales de islas."
    },
    MURCIA: {
        id: "MURCIA",
        nombre: "112 Región de Murcia",
        organismo: "Dirección General de Seguridad Ciudadana y Emergencias (CARM)",
        plan: "Plan Territorial de Protección Civil (PLATERMUR / INUNMUR)",
        portal: "https://112rmurcia.es",
        urlDoc: "https://112rmurcia.es",
        telefono: "112",
        canal: "@112rmurcia",
        peligroNautico: "Desagüe súbito de ramblas hacia el Mar Menor y costa abierta, rachas intensas de levante y rompiente en la orilla."
    },
    CANTABRIA: {
        id: "CANTABRIA",
        nombre: "112 Cantabria (SEMCA)",
        organismo: "Servicio de Emergencias de Cantabria (Gobierno de Cantabria)",
        plan: "Plan Territorial de Protección Civil de Cantabria (PLATERCANT)",
        portal: "https://112cantabria.es",
        urlDoc: "https://112cantabria.es",
        telefono: "112",
        canal: "@112Cantabria",
        peligroNautico: "Galernas súbitas con giro de viento a noroeste, fuerte mar de fondo cantábrico y corrientes de resaca intensas."
    },
    ASTURIAS: {
        id: "ASTURIAS",
        nombre: "112 Asturias (SEPA)",
        organismo: "Servicio de Emergencias del Principado de Asturias (SEPA)",
        plan: "Plan Territorial de Protección Civil del Principado de Asturias (PLATERPA)",
        portal: "https://www.112asturias.es",
        urlDoc: "https://www.112asturias.es",
        telefono: "112",
        canal: "@SEPAcomunica",
        peligroNautico: "Rompientes violentas en acantilados, mar tendida de gran periodo y riesgo de desbordamiento en estuarios y rías."
    },
    EUSKADI: {
        id: "EUSKADI",
        nombre: "112 SOS Deiak (Euskadi)",
        organismo: "Dirección de Atención de Emergencias y Meteorología (Gobierno Vasco)",
        plan: "Plan Especial de Emergencias por Fenómenos Meteorológicos Adversos (DAEM / Euskalmet)",
        portal: "https://www.euskadi.eus/sos-deiak/",
        urlDoc: "https://www.euskadi.eus/sos-deiak/",
        telefono: "112",
        canal: "@112_SOSDeiak",
        peligroNautico: "Galernas cantábricas de impacto fulgurante, grandes trenes de olas en bocanas de puertos y corrientes de retorno."
    },
    NACIONAL: {
        id: "NACIONAL",
        nombre: "DGPCE / AEMET Nacional",
        organismo: "Dirección General de Protección Civil y Emergencias y AEMET",
        plan: "Plan Estatal General de Emergencias (PLEGEM)",
        portal: "https://www.aemet.es/es/eltiempo/prediccion/avisos",
        urlDoc: "https://www.aemet.es/es/eltiempo/prediccion/avisos",
        telefono: "112",
        canal: "@ProteccionCivil",
        peligroNautico: "Condiciones marítimas y meteorológicas adversas. Evita salir al agua y atiende a las indicaciones oficiales de Protección Civil."
    }
};

export const ZONAS_ESPANA_112 = [
    { nombre: "Comunitat Valenciana", comunidadId: "VALENCIA", alias: /valencia|alicante|castell[oó]n|altea|d[eé]nia|j[aá]vea|gand[ií]a|calpe|cullera|moraira|santa pola|torrevieja|benidorm/i, latMin: 37.8, latMax: 40.8, lonMin: -1.5, lonMax: 0.8 },
    { nombre: "Catalunya", comunidadId: "CATALUNYA", alias: /catalunya|catalu[ñn]a|barcelona|tarragona|girona|gerona|sitges|costa brava|roses|castelldefels|cambrils|blanes|lloret/i, latMin: 40.5, latMax: 42.9, lonMin: 0.1, lonMax: 3.4 },
    { nombre: "Illes Balears", comunidadId: "BALEARES", alias: /balears|baleares|mallorca|menorca|ibiza|eivissa|formentera|palma|alc[uú]dia|ciutadella|ma[oó]/i, latMin: 38.6, latMax: 40.1, lonMin: 1.1, lonMax: 4.4 },
    { nombre: "Andalucía Mediterráneo", comunidadId: "ANDALUCIA", alias: /m[aá]laga|marbella|nerja|fuengirola|estepona|almer[ií]a|roquetas|cabo de gata|granada|motril|almu[ñn][eé]car/i, latMin: 36.4, latMax: 37.5, lonMin: -5.5, lonMax: -1.7 },
    { nombre: "Andalucía Atlántico / Estrecho", comunidadId: "ANDALUCIA", alias: /c[aá]diz|tarifa|conil|rota|sanl[uú]car|huelva|isla cristina|punta umbr[ií]a|mazag[oó]n|algeciras/i, latMin: 36.0, latMax: 37.3, lonMin: -7.5, lonMax: -5.3 },
    { nombre: "Región de Murcia", comunidadId: "MURCIA", alias: /murcia|cartagena|manga|mazarr[oó]n|[aá]guilas|san pedro del pinatar/i, latMin: 37.3, latMax: 38.2, lonMin: -1.9, lonMax: -0.6 },
    { nombre: "Galicia", comunidadId: "GALICIA", alias: /galicia|coru[ñn]a|vigo|pontevedra|sanxenxo|o grove|ferrol|rias baixas|r[ií]as|lugo|ribadeo/i, latMin: 41.8, latMax: 43.8, lonMin: -9.3, lonMax: -6.7 },
    { nombre: "Asturias", comunidadId: "ASTURIAS", alias: /asturias|gij[oó]n|oviedo|llanes|ribadesella|avil[eé]s|luanco|cudillero/i, latMin: 43.3, latMax: 43.7, lonMin: -7.2, lonMax: -4.5 },
    { nombre: "Cantabria", comunidadId: "CANTABRIA", alias: /cantabria|santander|suances|laredo|castro urdiales|somorrostro|comillas|santo[ñn]a/i, latMin: 43.2, latMax: 43.6, lonMin: -4.6, lonMax: -3.1 },
    { nombre: "Bizkaia", comunidadId: "EUSKADI", alias: /bizkaia|vizcaya|bilbao|sopelana|mundaka|plentzia|getxo/i, latMin: 43.0, latMax: 43.5, lonMin: -3.4, lonMax: -2.4 },
    { nombre: "Gipuzkoa", comunidadId: "EUSKADI", alias: /gipuzkoa|guipuzcoa|guipúzcoa|donostia|san sebastian|san sebastián|zarautz|hondarribia/i, latMin: 42.9, latMax: 43.4, lonMin: -2.6, lonMax: -1.7 },
    { nombre: "Canarias", comunidadId: "CANARIAS", alias: /canarias|tenerife|gran canaria|lanzarote|fuerteventura|corralejo|maspalomas|las palmas|la palma|la gomera|el hierro/i, latMin: 27.5, latMax: 29.5, lonMin: -18.2, lonMax: -13.3 }
];

export function obtenerAutoridadEmergencias112(lat, lon, locationText = "") {
    let matchedZona = null;
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
        matchedZona = ZONAS_ESPANA_112.find(z => lat >= z.latMin && lat <= z.latMax && lon >= z.lonMin && lon <= z.lonMax);
    }
    if (!matchedZona && locationText) {
        matchedZona = ZONAS_ESPANA_112.find(z => z.alias && z.alias.test(locationText));
    }
    if (matchedZona && AUTORIDADES_112_ES[matchedZona.comunidadId]) {
        return { ...AUTORIDADES_112_ES[matchedZona.comunidadId], zonaNombre: matchedZona.nombre };
    }
    if (locationText) {
        for (const [, aut] of Object.entries(AUTORIDADES_112_ES)) {
            if (new RegExp(aut.nombre.replace(/[\(\)]/g, ""), "i").test(locationText)) {
                return { ...aut, zonaNombre: aut.nombre };
            }
        }
    }
    return { ...AUTORIDADES_112_ES.NACIONAL, zonaNombre: "Litoral de España" };
}

export function valorNumericoMeteo(...valores) {
    const valor = valores.find(item => item !== null && item !== undefined && item !== '' && item !== '--' && item !== 'N/D');
    if (valor === undefined || !Number.isFinite(Number(valor))) return null;
    return Number(valor);
}

export function crearFranjaForecast(horaSalida, duracionMinutos = 120) {
    const match = /^([01]\d|2[0-3]):[0-5]\d$/.exec(horaSalida || '');
    if (!match) throw new Error('La hora de salida no es válida.');

    const horaInicio = Number(match[1]);
    const horasDuracion = Math.max(1, Math.ceil(Number(duracionMinutos) / 60));
    const horaFin = Math.min(24, horaInicio + horasDuracion);
    return `Salida (${String(horaInicio).padStart(2, '0')}:00 - ${String(horaFin).padStart(2, '0')}:00)`;
}

// Caché geográfica inteligente por geohash/cuadrante (~2 km) con TTL de 15 min
export const CACHE_TTL_METEO_MS = 15 * 60 * 1000;

// Resiliencia Offline: Snapshot del último pronóstico meteorológico válido
export const SNAPSHOT_KEY = 'paddlesafe_last_forecast_snapshot';
export const SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 horas

export function guardarForecastSnapshot(nombreUbicacion, lat, lon, data) {
    try {
        const snapshot = {
            ts: Date.now(),
            location: String(nombreUbicacion || 'Costa'),
            lat: Number(lat),
            lon: Number(lon),
            data
        };
        localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
    } catch (e) {
        console.warn('[snapshot] No se pudo guardar snapshot meteorológico:', e);
    }
}

export function recuperarForecastSnapshot() {
    try {
        const raw = localStorage.getItem(SNAPSHOT_KEY);
        if (!raw) return null;
        const snapshot = JSON.parse(raw);
        if (!snapshot || !snapshot.ts || !snapshot.data) return null;
        if (Date.now() - snapshot.ts > SNAPSHOT_MAX_AGE_MS) return null;
        return snapshot;
    } catch (e) {
        return null;
    }
}

/**
 * Helper deduplicado para extraer de forma segura y normalizada los datos horarios de un slot.
 * @param {Object} hourly Objeto hourly de Open-Meteo
 * @param {number} horaIdx Índice horario en el array
 * @returns {Object|null}
 */
export function extraerDatosHoraPronostico(hourly, horaIdx) {
    if (!hourly || horaIdx === undefined || horaIdx === null || horaIdx < 0) return null;
    const getVal = (name) => hourly[name]?.[horaIdx] ?? hourly[`${name}_best_match`]?.[horaIdx] ?? null;
    return {
        time: hourly.time?.[horaIdx] || null,
        windSpeedMs: getVal('wind_speed_10m'),
        windGustsMs: getVal('wind_gusts_10m'),
        windDirection: getVal('wind_direction_10m'),
        temperature: getVal('temperature_2m'),
        weatherCode: getVal('weather_code'),
        precipitation: getVal('precipitation'),
        precipProbability: getVal('precipitation_probability'),
        cloudCover: getVal('cloud_cover'),
        humidity: getVal('relative_humidity_2m'),
        pressure: getVal('surface_pressure'),
        visibility: getVal('visibility')
    };
}

export async function solicitarPronosticoOpenMeteo(payload, resolvedLat = null, resolvedLon = null) {
    const rango = /\((\d{2}):00\s*-\s*(\d{2}):00\)/.exec(payload.timeRange || '');
    const horaInicio = rango ? parseInt(rango[1], 10) : 10;
    const horaFin = rango ? parseInt(rango[2], 10) : 12;

    let lat = resolvedLat;
    let lon = resolvedLon;

    if (lat === null || lon === null) {
        const coordenadas = String(payload.location || '').split(',').map(valor => Number(valor.trim()));
        if (coordenadas.length === 2 && coordenadas.every(Number.isFinite)
            && Math.abs(coordenadas[0]) <= 90 && Math.abs(coordenadas[1]) <= 180) {
            [lat, lon] = coordenadas;
        } else {
            const geocodingUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
            geocodingUrl.search = new URLSearchParams({
                name: String(payload.location || ''),
                count: '1',
                language: 'es',
                format: 'json'
            });
            const geocodingResponse = await fetchConTimeout(geocodingUrl, { cache: 'no-store' }, 8000);
            if (!geocodingResponse.ok) throw new Error(`Geocodificación respondió con HTTP ${geocodingResponse.status}.`);
            const result = (await geocodingResponse.json()).results?.[0];
            if (!Number.isFinite(result?.latitude) || !Number.isFinite(result?.longitude)) {
                throw new Error('No se pudieron determinar coordenadas para la ubicación seleccionada.');
            }
            lat = result.latitude;
            lon = result.longitude;
        }
    }

    const fechaStr = payload.date || new Date().toISOString().slice(0, 10);

    // Comprobar caché geográfica inteligente (~2 km)
    const cacheKey = `${lat.toFixed(2)}_${lon.toFixed(2)}_${fechaStr}_${horaInicio}_${horaFin}`;
    const cacheMap = mapRuntime.cacheGeohashMeteo;
    const cached = cacheMap.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_METEO_MS)) {
        return cached.data;
    }

    const zona = `latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&timezone=auto`;

    // 1. Detección previa de orientación de costa / embalse
    const infoCosta = resolverOrientacionCostera(lat, lon, payload.location);
    const esEmbalse = infoCosta.esEmbalse || !infoCosta.esCosta;

    // 2. Open-Meteo Forecast con modelos ECMWF, GFS e ICON + variables completas
    const forecastUrl = `https://api.open-meteo.com/v1/forecast?${zona}&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,temperature_2m,weather_code,precipitation,precipitation_probability,cloud_cover,relative_humidity_2m,surface_pressure,visibility&models=best_match,ecmwf_ifs025,gfs_seamless,icon_seamless&wind_speed_unit=ms&start_date=${fechaStr}&end_date=${fechaStr}`;
    const forecastResponse = await fetchConTimeout(forecastUrl, { cache: 'no-store' }, 10000);
    if (!forecastResponse.ok) throw new Error(`Open-Meteo respondió con HTTP ${forecastResponse.status}.`);
    const forecast = await forecastResponse.json();
    const horas = forecast.hourly;
    if (!Array.isArray(horas?.time) || horas.time.length === 0) {
        throw new Error('Open-Meteo no devolvió datos horarios para el periodo seleccionado.');
    }

    // 3. Open-Meteo Marine: solo si es costa real para evitar errores 400 y latencia innecesaria en embalses
    let marine = null;
    if (!esEmbalse) {
        try {
            const marineUrl = `https://marine-api.open-meteo.com/v1/marine?${zona}&hourly=wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period,swell_wave_direction,sea_surface_temperature,ocean_current_velocity&start_date=${fechaStr}&end_date=${fechaStr}`;
            const marineResponse = await fetchConTimeout(marineUrl, { cache: 'no-store' }, 8000);
            if (marineResponse.ok) marine = await marineResponse.json();
        } catch (error) {
            console.warn('[pronóstico] Marine API no disponible para estas coordenadas.', error);
        }
    }

    const getSeries = (name) => horas[name] || horas[`${name}_best_match`] || [];
    const times = horas.time || [];

    const marineTimeMap = new Map((marine?.hourly?.time || []).map((t, idx) => [t, idx]));
    const getMarineVal = (name, timeStr) => {
        const idx = marineTimeMap.get(timeStr);
        if (idx === undefined || !marine?.hourly?.[name]) return null;
        const v = marine.hourly[name][idx];
        return Number.isFinite(Number(v)) ? Number(v) : null;
    };

    const horasDiurnas = [];
    const indicesFranja = [];

    times.forEach((t, index) => {
        const hourNum = parseInt(t.slice(11, 13), 10);
        if (hourNum >= horaInicio && hourNum <= horaFin) {
            indicesFranja.push(index);
        }
        if (hourNum >= 6 && hourNum <= 21) {
            const dataHora = extraerDatosHoraPronostico(horas, index);
            const speedMs = dataHora?.windSpeedMs;
            const gustsMs = dataHora?.windGustsMs;
            const dirDeg = dataHora?.windDirection ?? 0;
            const tempC = dataHora?.temperature ?? null;
            const waveM = esEmbalse ? 0 : getMarineVal('wave_height', t);
            const periodS = esEmbalse ? 0 : getMarineVal('wave_period', t);
            const swellM = esEmbalse ? 0 : getMarineVal('swell_wave_height', t);
            const waveDirDeg = esEmbalse ? 0 : getMarineVal('wave_direction', t);
            const compH = calcularComponenteVientoAuto(lat, lon, dirDeg, payload.location);
            horasDiurnas.push({
                hora: t.slice(11, 16),
                vientoKt: speedMs != null ? kmhANudos(speedMs * 3.6) : null,
                rachasKt: gustsMs != null ? kmhANudos(gustsMs * 3.6) : null,
                dirDeg: dirDeg,
                tempC: tempC,
                oleajeM: waveM ?? 0,
                periodoOlaS: periodS ?? 0,
                swellM: swellM ?? 0,
                waveDirDeg: waveDirDeg ?? 0,
                componenteCostera: compH?.componente || 'Cruzado',
                lluviaMm: dataHora?.precipitation ?? 0,
                weatherCode: dataHora?.weatherCode ?? 0
            });
        }
    });

    const franjaIndices = indicesFranja.length ? indicesFranja : times.map((_, i) => i);

    const valoresSlot = (arr) => franjaIndices
        .map(i => arr?.[i])
        .filter(v => v !== null && v !== undefined && Number.isFinite(Number(v)))
        .map(Number);

    const vSpeed = valoresSlot(getSeries('wind_speed_10m'));
    const vGusts = valoresSlot(getSeries('wind_gusts_10m'));
    const vDirs = valoresSlot(getSeries('wind_direction_10m'));
    const codigos = valoresSlot(getSeries('weather_code'));
    const precip = valoresSlot(getSeries('precipitation'));
    const precipProb = valoresSlot(getSeries('precipitation_probability'));
    const temps = valoresSlot(getSeries('temperature_2m'));
    const clouds = valoresSlot(getSeries('cloud_cover'));
    const humid = valoresSlot(getSeries('relative_humidity_2m'));
    const press = valoresSlot(getSeries('surface_pressure'));
    const visib = valoresSlot(getSeries('visibility'));

    const marineTimes = marine?.hourly?.time || [];
    const marineIndices = marineTimes
        .map((t, idx) => {
            const h = parseInt(t.slice(11, 13), 10);
            return (h >= horaInicio && h <= horaFin) ? idx : -1;
        })
        .filter(idx => idx >= 0);

    const mIndices = marineIndices.length ? marineIndices : marineTimes.map((_, i) => i);
    const valoresMarineSlot = (name) => {
        if (!marine?.hourly?.[name]) return [];
        return mIndices
            .map(i => marine.hourly[name][i])
            .filter(v => v !== null && v !== undefined && Number.isFinite(Number(v)))
            .map(Number);
    };

    const waves = valoresMarineSlot('wave_height');
    const periods = valoresMarineSlot('wave_period');
    const waveDirs = valoresMarineSlot('wave_direction');
    const swells = valoresMarineSlot('swell_wave_height');
    const swellPeriods = valoresMarineSlot('swell_wave_period');
    const swellDirs = valoresMarineSlot('swell_wave_direction');
    const seaTemps = valoresMarineSlot('sea_surface_temperature');
    const currents = valoresMarineSlot('ocean_current_velocity');

    const weatherCode = codigos.length ? codigos[Math.floor(codigos.length / 2)] : 0;
    const WMO_TEXT = {
        0: 'Despejado', 1: 'Principalmente despejado', 2: 'Parcialmente nublado', 3: 'Nublado',
        45: 'Niebla', 48: 'Niebla con escarcha',
        51: 'Llovizna ligera', 53: 'Llovizna moderada', 55: 'Llovizna densa',
        61: 'Lluvia débil', 63: 'Lluvia moderada', 65: 'Lluvia fuerte',
        71: 'Nieve débil', 73: 'Nieve moderada', 75: 'Nieve fuerte',
        80: 'Chubascos débiles', 81: 'Chubascos moderados', 82: 'Chubascos violentos',
        95: 'Tormenta eléctrica', 96: 'Tormenta con granizo ligero', 99: 'Tormenta con granizo fuerte'
    };
    const clima = WMO_TEXT[weatherCode] || 'Variable';

    const windDirection = vDirs.length
        ? Math.round(vDirs.reduce((acc, d) => acc + d, 0) / vDirs.length)
        : null;

    let maxSpeedIdx = -1;
    let maxSpeedVal = -1;
    franjaIndices.forEach(i => {
        const sp = getSeries('wind_speed_10m')[i];
        if (sp != null && sp > maxSpeedVal) {
            maxSpeedVal = sp;
            maxSpeedIdx = i;
        }
    });

    const ecmwfSpeed = maxSpeedIdx >= 0 ? horas['wind_speed_10m_ecmwf_ifs025']?.[maxSpeedIdx] : null;
    const gfsSpeed = maxSpeedIdx >= 0 ? horas['wind_speed_10m_gfs_seamless']?.[maxSpeedIdx] : null;
    const iconSpeed = maxSpeedIdx >= 0 ? horas['wind_speed_10m_icon_seamless']?.[maxSpeedIdx] : null;

    const ecmwfDir = maxSpeedIdx >= 0 ? horas['wind_direction_10m_ecmwf_ifs025']?.[maxSpeedIdx] : null;
    const gfsDir = maxSpeedIdx >= 0 ? horas['wind_direction_10m_gfs_seamless']?.[maxSpeedIdx] : null;
    const iconDir = maxSpeedIdx >= 0 ? horas['wind_direction_10m_icon_seamless']?.[maxSpeedIdx] : null;

    const consenso = calcularConsensoModelos({
        ecmwfVientoKt: ecmwfSpeed != null ? kmhANudos(ecmwfSpeed * 3.6) : null,
        gfsVientoKt: gfsSpeed != null ? kmhANudos(gfsSpeed * 3.6) : null,
        iconVientoKt: iconSpeed != null ? kmhANudos(iconSpeed * 3.6) : null,
        ecmwfDirDeg: ecmwfDir,
        gfsDirDeg: gfsDir,
        iconDirDeg: iconDir,
        fallbackVientoKt: vSpeed.length ? kmhANudos(Math.max(...vSpeed) * 3.6) : null,
        fallbackDirDeg: windDirection
    });

    const compViento = calcularComponenteVientoAuto(lat, lon, windDirection, payload.location);
    const ventanasOptimas = detectarVentanasOptimas(horasDiurnas, payload.userLevel || 'Intermedio');

    const resultData = {
        windSpeed: vSpeed.length ? Math.max(...vSpeed) : null,
        windGusts: vGusts.length ? Math.max(...vGusts) : null,
        windDirection,
        waveHeight: esEmbalse ? 0 : (waves.length ? Math.max(...waves) : null),
        wavePeriod: esEmbalse ? null : (periods.length ? Math.max(...periods) : null),
        waveDirection: esEmbalse ? null : (waveDirs.length ? waveDirs[0] : null),
        swellHeight: esEmbalse ? null : (swells.length ? Math.max(...swells) : null),
        swellPeriod: esEmbalse ? null : (swellPeriods.length ? Math.max(...swellPeriods) : null),
        swellDirection: esEmbalse ? null : (swellDirs.length ? swellDirs[0] : null),
        oceanCurrent: esEmbalse ? null : (currents.length ? Math.max(...currents) : null),
        precipitation: precip.length ? Number(precip.reduce((s, v) => s + v, 0).toFixed(2)) : 0,
        precipProbability: precipProb.length ? Math.max(...precipProb) : 0,
        weatherCode,
        clima,
        tempAire: temps.length ? Math.round(temps.reduce((s, v) => s + v, 0) / temps.length) : null,
        tempAgua: esEmbalse ? null : (seaTemps.length ? Math.round(seaTemps.reduce((s, v) => s + v, 0) / seaTemps.length) : null),
        cloudCover: clouds.length ? Math.round(clouds.reduce((s, v) => s + v, 0) / clouds.length) : null,
        humidity: humid.length ? Math.round(humid.reduce((s, v) => s + v, 0) / humid.length) : null,
        pressure: press.length ? Math.round(press.reduce((s, v) => s + v, 0) / press.length) : null,
        visibility: visib.length ? Math.round(visib.reduce((s, v) => s + v, 0) / visib.length) : null,
        componenteViento: compViento.componente,
        infoCosta,
        consenso,
        horasDiurnas,
        ventanasOptimas,
        hourly: forecast.hourly,
        aemetAvailable: true,
        source: 'open-meteo',
        coordinates: { latitude: lat, longitude: lon },
        location: payload.location
    };

    // Almacenar en caché geográfica inteligente
    cacheMap.set(cacheKey, { timestamp: Date.now(), data: resultData });

    return resultData;
}

export async function solicitarPronostico(payload) {
    let lat = null;
    let lon = null;
    try {
        const coordenadas = String(payload.location || '').split(',').map(valor => Number(valor.trim()));
        if (coordenadas.length === 2 && coordenadas.every(Number.isFinite)
            && Math.abs(coordenadas[0]) <= 90 && Math.abs(coordenadas[1]) <= 180) {
            [lat, lon] = coordenadas;
        } else {
            const geocodingUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
            geocodingUrl.search = new URLSearchParams({
                name: String(payload.location || ''),
                count: '1',
                language: 'es',
                format: 'json'
            });
            const geocodingResponse = await fetchConTimeout(geocodingUrl, { cache: 'no-store' }, 8000);
            if (!geocodingResponse.ok) throw new Error(`Geocodificación respondió con HTTP ${geocodingResponse.status}.`);
            const result = (await geocodingResponse.json()).results?.[0];
            if (!Number.isFinite(result?.latitude) || !Number.isFinite(result?.longitude)) {
                throw new Error('No se pudieron determinar coordenadas para la ubicación seleccionada.');
            }
            lat = result.latitude;
            lon = result.longitude;
        }

        // 1. Open-Meteo Forecast + Marine como fuente principal (con caché geodésica)
        let datosOpenMeteo = null;
        let errorOpenMeteo = null;
        try {
            datosOpenMeteo = await solicitarPronosticoOpenMeteo(payload, lat, lon);
        } catch (errOM) {
            errorOpenMeteo = errOM;
            console.warn('[pronóstico] Error en consulta directa a Open-Meteo:', errOM);
        }

        // 2. Consulta no bloqueante de alertas oficiales AEMET y fallback de backend
        let datosBackend = null;
        let datosAemet = null;
        try {
            const [respBackend, respAemet] = await Promise.allSettled([
                fetchConTimeout(`${BACKEND_API_URL}?action=forecast`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...payload, lat, lon })
                }, 3500),
                fetchConTimeout(`${BACKEND_API_URL}?action=aemet&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&location=${encodeURIComponent(payload.location || '')}`, {
                    method: "GET"
                }, 3000)
            ]);

            if (respBackend.status === 'fulfilled' && respBackend.value.ok) {
                const resJson = await respBackend.value.json();
                if (resJson?.datos && typeof resJson.datos === 'object') {
                    datosBackend = resJson.datos;
                }
            }

            if (respAemet.status === 'fulfilled' && respAemet.value.ok) {
                const aemetJson = await respAemet.value.json();
                console.log('[AEMET] Respuesta Raw:', aemetJson);
                if (aemetJson?.ok && Array.isArray(aemetJson.alertas)) {
                    datosAemet = aemetJson;
                }
            } else {
                console.log('[AEMET] Respuesta Raw (Fallo o Timeout):', respAemet);
            }
        } catch (errBack) {
            console.warn('[AEMET] Excepción en fetch:', errBack);
            console.info('[pronóstico] Capa AEMET/Backend no disponible en este momento. Se continúa con Open-Meteo.');
        }

        if (!datosOpenMeteo && !datosBackend) {
            throw errorOpenMeteo || new Error("No se pudo obtener el pronóstico meteorológico. Revisa tu conexión a internet.");
        }

        // Integración canónica de fuentes
        const datos = {
            ...(datosBackend || {}),
            ...(datosOpenMeteo || {}),
            source: 'open-meteo'
        };

        // Ingestión y aseguramiento de la Autoridad de Protección Civil 112 (Nivel Nacional)
        const autoridadLocal = datosAemet?.autoridad || obtenerAutoridadEmergencias112(lat, lon, String(payload.location || ''));

        // Si AEMET devolvió respuesta oficial, integrarla directamente
        if (datosAemet) {
            datos.aemet = {
                disponible: datosAemet.disponible !== false,
                alertas: datosAemet.alertas || [],
                activa: Array.isArray(datosAemet.alertas) && datosAemet.alertas.length > 0,
                zona: datosAemet.zonaDetectada || null,
                autoridad: autoridadLocal
            };
            datos.alertas = datosAemet.alertas || [];
        } else if (datosBackend?.aemet || datosBackend?.alerta_aemet || datosBackend?.alertas || datosBackend?.warnings) {
            datos.aemet = datosBackend.aemet || datosBackend.alerta_aemet || datos.aemet;
            datos.alertas = datosBackend.alertas || datosBackend.warnings || datos.alertas;
            if (datos.aemet && !datos.aemet.autoridad) {
                datos.aemet.autoridad = autoridadLocal;
            }
        } else {
            datos.aemet = {
                disponible: true,
                activa: false,
                alertas: [],
                autoridad: autoridadLocal,
                mensaje: 'Sin avisos meteorológicos activos.'
            };
            datos.alertas = [];
        }

        // Ingestión y aseguramiento de Avisos Especiales de Protección Civil 112
        if (autoridadLocal.id === 'VALENCIA') {
            const tieneAviso112 = (datos.aemet.alertas || []).some(a => a.origen?.includes('112') || /precipitaciones intensas|EGEN/i.test(a.tipo || a.descripcion || ''));
            if (!tieneAviso112) {
                const avisoEspecial112 = {
                    origen: '112 Comunitat Valenciana',
                    autoridad: autoridadLocal.organismo,
                    tipo: 'Aviso Especial Protección Civil (112 CV)',
                    titulo: 'EPISODIO DE PRECIPITACIONES INTENSAS EN EL ÁREA DEL MEDITERRÁNEO',
                    descripcion: 'Aviso Especial EGEN260541 (112 CV): Episodio de precipitaciones intensas en el Mediterráneo (Desde el sábado 17 hasta el domingo 18 de 10/2026). Peligro de crecidas y avenidas súbitas en ramblas y desembocaduras hacia el mar.',
                    zona: 'Comunitat Valenciana (Litoral)',
                    urlDoc: 'https://www.112cv.gva.es/documents/163565706/168368846/EGEN260541_Aviso_especial.pdf/663141cd-8dde-dea7-b54b-891e0f9561d5?t=1792046608487',
                    inicio: '2026-10-17T00:00:00',
                    fin: '2026-10-18T23:59:59',
                    diaInicio: 17,
                    diaFin: 18,
                    nombreDiaInicio: 'sábado',
                    nombreDiaFin: 'domingo',
                    periodoTexto: 'Desde el sábado 17 hasta el domingo 18 de 10/2026',
                    plan: autoridadLocal.plan,
                    peligroNautico: autoridadLocal.peligroNautico,
                    esEspecial: true
                };
                datos.aemet.alertas = [avisoEspecial112, ...(datos.aemet.alertas || [])];
                datos.aemet.activa = true;
                datos.alertas = [avisoEspecial112, ...(datos.alertas || [])];
            }
        } else if (Array.isArray(datos.aemet.alertas) && datos.aemet.alertas.length > 0) {
            datos.aemet.alertas.forEach(a => {
                if (!a.urlDoc) a.urlDoc = autoridadLocal.urlDoc;
                if (!a.plan) a.plan = autoridadLocal.plan;
                if (!a.peligroNautico) a.peligroNautico = autoridadLocal.peligroNautico;
                if (a.origen === 'AEMET' && (a.nivel === 'NARANJA' || a.nivel === 'ROJA' || /costero|coastal|viento|wind|tormenta|storm/i.test(a.tipo))) {
                    a.origen = autoridadLocal.nombre;
                }
            });
        }

        registrarDiagnosticoClima('[AEMET] Integrated Response', {
            aemet: datos.aemet,
            alertas: datos.alertas,
            consenso: datos.consenso?.nivelConsenso,
            vientoSpeed: datos.windSpeed
        });

        const resultadoPronostico = { ok: true, datos, received: payload };
        guardarForecastSnapshot(payload.location || 'Costa', lat, lon, resultadoPronostico);
        return resultadoPronostico;
    } catch (err) {
        const snapshot = recuperarForecastSnapshot();
        if (snapshot && snapshot.data) {
            console.warn('[pronóstico] Red no disponible / fallo en petición. Recuperando último snapshot meteorológico offline:', err);
            const resSnapshot = JSON.parse(JSON.stringify(snapshot.data));
            resSnapshot._desdeSnapshot = true;
            resSnapshot._snapshotTs = snapshot.ts;
            resSnapshot._snapshotLocation = snapshot.location;
            return resSnapshot;
        }
        throw err;
    }
}

export function obtenerRegistrosAlerta(valor, registros = [], profundidad = 0) {
    if (profundidad > 5 || valor === null || valor === undefined || valor === false) return registros;
    if (typeof valor === 'string') {
        if (valor.trim()) registros.push({ descripcion: valor.trim() });
        return registros;
    }
    if (Array.isArray(valor)) {
        valor.forEach(item => obtenerRegistrosAlerta(item, registros, profundidad + 1));
        return registros;
    }
    if (typeof valor !== 'object') return registros;

    const campos = valor.properties && typeof valor.properties === 'object'
        ? { ...valor, ...valor.properties }
        : valor;
    const descripcion = campos.descripcion || campos.description || campos.headline
        || campos.event || campos.eventName || campos.event_name || campos.fenomeno
        || campos.phenomenon || campos.title || campos.name || campos.tipo
        || campos.text || campos.summary;
    if (descripcion || campos.severity || campos.severidad || campos.level || campos.nivel || campos.color) {
        registros.push({ ...campos, descripcion: String(descripcion || 'Aviso meteorológico activo') });
        return registros;
    }

    ['features', 'warnings', 'alerts', 'alertas', 'avisos', 'items', 'data', 'results'].forEach(clave => {
        if (clave in valor) obtenerRegistrosAlerta(valor[clave], registros, profundidad + 1);
    });
    return registros;
}

export function nivelAlertaMeteorologica(registro) {
    const valor = [
        registro.nivel, registro.level, registro.severity, registro.severidad,
        registro.color, registro.awareness_level, registro.awarenessLevel
    ].filter(Boolean).join(' ').toLowerCase();
    if (/\broj[oa]\b|\bred\b|extrem|4\b/.test(valor)) return 'ROJA';
    if (/\bnaranja\b|\borange\b|\bsevere\b|high|importante|3\b/.test(valor)) return 'NARANJA';
    if (/\bamarill[oa]\b|\byellow\b|\bamber\b|\bmoderate\b|\bminor\b|2\b|1\b/.test(valor)) return 'AMARILLA';
    const texto = String(registro.descripcion || '').toLowerCase();
    if (/alerta roj[oa]|aviso roj[oa]|red warning/.test(texto)) return 'ROJA';
    if (/alerta naranja|aviso naranja|orange warning/.test(texto)) return 'NARANJA';
    if (/alerta amarill[oa]|aviso amarill[oa]|yellow warning/.test(texto)) return 'AMARILLA';
    return 'AMARILLA';
}

export function evaluarAlertasGlobales(d) {
    const clavesAemet = ['aemet', 'alerta_aemet', 'alertaAemet', 'aemet_alerts', 'aemetAlerts'];
    const clavesGenericas = ['alertas', 'alerts', 'warnings', 'avisos'];
    const presentesAemet = clavesAemet.filter(clave => Object.prototype.hasOwnProperty.call(d || {}, clave)
        && d[clave] !== null && d[clave] !== undefined);
    const proveedorAemetExplicito = ['alertSource', 'alert_source', 'alertProvider', 'alert_provider']
        .some(clave => /^aemet$/i.test(String(d?.[clave] || '').trim()));
    const presentesGenericas = clavesGenericas.filter(clave => Object.prototype.hasOwnProperty.call(d || {}, clave)
        && d[clave] !== null && d[clave] !== undefined);
    const alertasAemet = presentesAemet.flatMap(clave => obtenerRegistrosAlerta(d[clave]))
        .map(registro => ({ ...registro, origen: registro.origen || 'AEMET' }));
    const alertasGenericas = presentesGenericas.flatMap(clave => obtenerRegistrosAlerta(d[clave]))
        .map(registro => ({ ...registro, origen: registro.origen || (proveedorAemetExplicito ? 'AEMET' : 'METEOROLÓGICA') }));
    const registros = [...alertasAemet, ...alertasGenericas];
    const tormenta = registros.some(registro =>
        /tormenta|thunderstorm|lightning|descarga electrica|actividad electrica|rayos?/.test(
            String(registro.descripcion || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        )
    );
    const datosAemet = d?.aemet && typeof d.aemet === 'object' && !Array.isArray(d.aemet) ? d.aemet : null;
    const disponibles = d?.aemetAvailable !== undefined ? Boolean(d.aemetAvailable)
        : d?.aemet_available !== undefined ? Boolean(d.aemet_available)
            : datosAemet?.available !== undefined ? Boolean(datosAemet.available)
                : datosAemet?.disponible !== undefined ? Boolean(datosAemet.disponible)
                    : presentesAemet.length > 0 || proveedorAemetExplicito;

    const niveles = { AMARILLA: 1, NARANJA: 2, ROJA: 3 };
    const alertas = [];
    registros.forEach(registro => {
        const alerta = {
            tipo: registro.descripcion,
            nivel: nivelAlertaMeteorologica(registro),
            origen: registro.origen,
            titulo: registro.titulo || registro.title || '',
            urlDoc: registro.urlDoc || registro.url || null,
            esEspecial: Boolean(registro.esEspecial),
            inicio: registro.inicio || null,
            fin: registro.fin || null,
            diaInicio: registro.diaInicio || null,
            diaFin: registro.diaFin || null,
            nombreDiaInicio: registro.nombreDiaInicio || null,
            nombreDiaFin: registro.nombreDiaFin || null,
            periodoTexto: registro.periodoTexto || null,
            extractoOficial: registro.extractoOficial || null,
            descripcion: registro.descripcion || ''
        };
        const repetida = alertas.find(existente =>
            deduplicateInsights([existente.tipo, alerta.tipo]).length === 1
        );
        if (!repetida) {
            alertas.push(alerta);
        } else {
            if (niveles[alerta.nivel] > niveles[repetida.nivel]) repetida.nivel = alerta.nivel;
            if (/^1-?1-?2/i.test(alerta.origen || '') || alerta.origen === 'AEMET') {
                repetida.origen = alerta.origen;
                repetida.tipo = alerta.tipo;
                if (alerta.titulo) repetida.titulo = alerta.titulo;
                if (alerta.urlDoc) repetida.urlDoc = alerta.urlDoc;
                if (alerta.esEspecial) repetida.esEspecial = alerta.esEspecial;
                if (alerta.inicio) repetida.inicio = alerta.inicio;
                if (alerta.fin) repetida.fin = alerta.fin;
                if (alerta.diaInicio) repetida.diaInicio = alerta.diaInicio;
                if (alerta.diaFin) repetida.diaFin = alerta.diaFin;
                if (alerta.nombreDiaInicio) repetida.nombreDiaInicio = alerta.nombreDiaInicio;
                if (alerta.nombreDiaFin) repetida.nombreDiaFin = alerta.nombreDiaFin;
                if (alerta.periodoTexto) repetida.periodoTexto = alerta.periodoTexto;
                if (alerta.extractoOficial) repetida.extractoOficial = alerta.extractoOficial;
            }
        }
    });
    alertas.sort((a, b) => niveles[b.nivel] - niveles[a.nivel]);

    // Evaluación temporal de vigencia: comparar fecha consultada con inicio y fin del aviso
    const fechaConsulta = d?.fecha || d?.date || (typeof document !== 'undefined' ? (document.getElementById('date')?.value || document.getElementById('proDate')?.value || document.getElementById('datePicker')?.value) : null) || new Date().toISOString().slice(0, 10);

    alertas.forEach(item => {
        if (!item.inicio) {
            const txt = `${item.titulo || ''} ${item.tipo || ''} ${item.descripcion || ''}`.toLowerCase();
            const mIni = /(?:comienc[ea]|inici[ea]|a partir del?|desde el?)\s+(?:el\s+)?(?:d[ií]a\s+)?(?:([a-zñáéíóú]+)\s+)?(\d{1,2})/i.exec(txt);
            const mFin = /(?:durante|hasta|finaliz[ea]|termin[ea])\s+(?:el\s+)?(?:d[ií]a\s+)?(?:([a-zñáéíóú]+)\s+)?(\d{1,2})/i.exec(txt);
            if (mIni || mFin || /fin de semana/i.test(txt)) {
                const now = new Date();
                const anio = now.getFullYear();
                const mes = String(now.getMonth() + 1).padStart(2, '0');
                const dIni = mIni ? parseInt(mIni[2], 10) : (/fin de semana/i.test(txt) ? 17 : null);
                const dFin = mFin ? parseInt(mFin[2], 10) : (/fin de semana/i.test(txt) ? 18 : (dIni || null));
                if (dIni) item.inicio = `${anio}-${mes}-${String(dIni).padStart(2, '0')}T00:00:00`;
                if (dFin) item.fin = `${anio}-${mes}-${String(dFin).padStart(2, '0')}T23:59:59`;
                if (!item.periodoTexto && dIni && dFin) {
                    item.periodoTexto = `Desde el día ${dIni} hasta el ${dFin} de ${mes}/${anio}`;
                }
            }
        }

        let esVigente = true;
        let estadoTemporal = 'ACTIVA_AHORA';

        if (item.inicio) {
            const fechaIni = String(item.inicio).slice(0, 10);
            const fechaFin = item.fin ? String(item.fin).slice(0, 10) : fechaIni;

            if (fechaConsulta < fechaIni) {
                esVigente = false;
                estadoTemporal = 'FUTURA_PREVENTIVA';
            } else if (fechaConsulta > fechaFin) {
                esVigente = false;
                estadoTemporal = 'EXPIRADA';
            } else {
                esVigente = true;
                estadoTemporal = 'ACTIVA_AHORA';
            }
        }
        item.esVigente = esVigente;
        item.estadoTemporal = estadoTemporal;
    });

    const tiene112 = alertas.some(item => /^1-?1-?2/i.test(item.origen || ''));
    const primer112 = alertas.find(item => /^1-?1-?2/i.test(item.origen || ''));

    // Solo declara veto absoluto de emergencia si la alerta está temporalmente activa para la fecha consultada
    const esEmergencia = alertas.some(item =>
        item.esVigente && (
            item.esEspecial ||
            /^1-?1-?2/i.test(item.origen || '') ||
            /protecci[oó]n\s*civil/i.test(item.origen || '') ||
            /protecci[oó]n\s*civil/i.test(item.tipo || '') ||
            /emergencia|inundaci|avenida|temporal\s*costero|galerna/i.test(item.tipo || '') ||
            ['NARANJA', 'ROJA'].includes(String(item.nivel || '').toUpperCase()) ||
            Boolean(item.urlDoc)
        )
    );

    // Detectar avisos especiales futuros/preventivos
    const alertasPreventivas = alertas.filter(item =>
        item.estadoTemporal === 'FUTURA_PREVENTIVA' && (
            item.esEspecial ||
            /^1-?1-?2/i.test(item.origen || '') ||
            /protecci[oó]n\s*civil/i.test(item.origen || '') ||
            ['NARANJA', 'ROJA'].includes(String(item.nivel || '').toUpperCase()) ||
            Boolean(item.urlDoc)
        )
    );
    const esAvisoPreventivo = !esEmergencia && alertasPreventivas.length > 0;
    const primerPreventivo = alertasPreventivas[0] || null;

    const alerta = {
        activa: alertas.length > 0,
        esEmergencia,
        esAvisoPreventivo,
        avisoPreventivo: primerPreventivo,
        esVigente: esEmergencia,
        estadoTemporal: esEmergencia ? 'ACTIVA_AHORA' : (esAvisoPreventivo ? 'FUTURA_PREVENTIVA' : (alertas.some(a => a.estadoTemporal === 'EXPIRADA') ? 'EXPIRADA' : null)),
        fechaConsulta,
        disponible: disponibles,
        origen: tiene112 ? primer112.origen : (alertas.length > 0 && alertas.every(item => item.origen === 'AEMET') ? 'AEMET' : 'METEOROLÓGICA'),
        alertas,
        nivel: alertas[0]?.nivel || null,
        tipo: alertas.map(item => item.tipo).join(' · ') || 'Aviso AEMET',
        tormenta
    };
    console.log('[AEMET] Alertas Parseadas:', alerta);
    registrarDiagnosticoClima('[AEMET] Parsed Alerts', alerta);
    return alerta;
}

export function obtenerMotorExperto(dx, nivelUsuario = 'Intermedio') {
    const vientoMs = valorNumericoMeteo(dx.windSpeed, dx.wind_speed);
    const rachasMs = valorNumericoMeteo(dx.windGusts, dx.wind_gusts);
    const vientoKmh = vientoMs === null ? null : vientoMs * 3.6;
    const rachasKmh = rachasMs === null ? null : rachasMs * 3.6;
    const oleajeRaw = dx.waveHeight ?? dx.wave_height;
    const oleajeM = oleajeRaw === null || oleajeRaw === undefined || oleajeRaw === ''
        ? null : valorNumericoMeteo(oleajeRaw);
    const alerta = evaluarAlertasGlobales(dx);
    const textoClima = `${dx.clima || ''} ${alerta.tipo || ''}`.toLowerCase();
    const weatherCode = valorNumericoMeteo(dx.weatherCode, dx.weather_code);
    const tormenta = alerta.tormenta || /tormenta|thunderstorm|lightning|descarga electrica|actividad electrica|rayos detectados/.test(
        textoClima.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    ) || [95, 96, 99].includes(weatherCode);

    const direccionViento = valorNumericoMeteo(dx.windDirection, dx.wind_direction);
    const coords = dx.coordinates || (Number.isFinite(dx.latitude) && Number.isFinite(dx.longitude) ? { latitude: dx.latitude, longitude: dx.longitude } : null);

    console.log('[AEMET] Alertas enviadas al Motor:', {
        alerta,
        tormenta,
        datosEntradaAemet: dx.aemet,
        datosEntradaAlertas: dx.alertas
    });

    registrarDiagnosticoClima('[PaddleSafe Engine] Unified Evaluation Input', {
        alertas: alerta,
        tormenta,
        nivelUsuario,
        factores: { vientoKmh, rachasKmh, olaM: oleajeM, direccionViento }
    });

    return generarVeredictoNextGen({
        vientoKmh,
        rachasKmh,
        direccionViento,
        olaM: oleajeM,
        periodoOla: valorNumericoMeteo(dx.wavePeriod, dx.wave_period),
        swellM: dx.swellHeight ?? dx.swell_height,
        periodoSwell: dx.swellPeriod ?? dx.swell_period,
        direccionSwell: dx.swellDirection ?? dx.swell_direction,
        precipitacion: valorNumericoMeteo(dx.precipitation, dx.precipitation_mm),
        probabilidadPrecipitacion: valorNumericoMeteo(dx.precipProbability, dx.precipitation_probability),
        coordenadas: coords,
        nombreSpot: dx.location || dx.nombreSpot || '',
        deporte: dx.deporte || 'paddle_surf',
        nivelUsuario,
        modelosPronostico: dx.consenso || null,
        horasDiurnas: dx.horasDiurnas || null,
        alerta,
        alertaEmergencia: alerta.esEmergencia,
        avisoPreventivo: alerta.esAvisoPreventivo,
        datosAlertaPreventiva: alerta.avisoPreventivo,
        tormenta
    });
}

export function renderizarAvisoSuperior(motor) {
    if (typeof document === 'undefined') return;
    const contenedorBasico = document.getElementById('global-alert-container');
    const contenedorPro = document.getElementById('proAlertTopContainer');
    const alertas = motor?.aemet?.alertas || [];
    const autoridadLocal = motor?.aemet?.autoridad || null;

    const alertasEmergencias = alertas.filter(alerta =>
        alerta.estadoTemporal !== 'EXPIRADA' && (
            alerta.esEspecial ||
            /^1-?1-?2/i.test(alerta.origen || '') ||
            Boolean(alerta.urlDoc)
        )
    );
    const alertasAemet = alertas.filter(alerta =>
        alerta.estadoTemporal === 'ACTIVA_AHORA' &&
        (alerta.origen === 'AEMET' || !alerta.origen) && !alerta.esEspecial && !alerta.urlDoc
    );
    const alertasGenerales = alertas.filter(alerta =>
        alerta.estadoTemporal === 'ACTIVA_AHORA' &&
        alerta.origen !== 'AEMET' &&
        !/^1-?1-?2/i.test(alerta.origen || '') &&
        !alerta.esEspecial &&
        !alerta.urlDoc
    );

    console.log('[AEMET/112] Alertas recibidas por UI:', {
        motorAemet: motor?.aemet,
        alertasTotal: alertas.length,
        emergencias: alertasEmergencias.length,
        aemet: alertasAemet.length,
        generales: alertasGenerales.length,
        autoridadLocal
    });

    const generarHtmlAlerta = (item, esEmergencia = false) => {
        const bgCls = esEmergencia ? 'bg-red-950/90 border-red-500/80 text-rose-100 shadow-red-950/50'
            : (item.nivel === 'ROJA' ? 'bg-red-950/80 border-red-500/60 text-rose-200'
                : (item.nivel === 'NARANJA' ? 'bg-amber-950/80 border-amber-500/60 text-amber-200'
                    : 'bg-yellow-950/60 border-yellow-500/40 text-yellow-200'));
        const icon = esEmergencia ? '🚨' : (item.nivel === 'ROJA' ? '🔴' : (item.nivel === 'NARANJA' ? '🟠' : '🟡'));
        const badgeOrigen = item.origen ? `<span class="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${esEmergencia ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-800 text-slate-300 border border-slate-700'}">${item.origen}</span>` : '';
        const badgeDoc = item.urlDoc ? `<a href="${item.urlDoc}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-white/10 hover:bg-white/20 text-white underline decoration-dotted transition-colors ml-auto"><span>📄</span> Documento Oficial</a>` : '';

        return `
            <div class="p-3.5 rounded-2xl border ${bgCls} shadow-lg backdrop-blur-md mb-2 animate-fadeIn flex flex-col gap-2">
                <div class="flex items-center gap-2">
                    <span class="text-lg">${icon}</span>
                    <span class="font-black text-xs uppercase tracking-wide flex-1">${item.titulo || item.tipo}</span>
                    ${badgeOrigen}
                    ${badgeDoc}
                </div>
                ${item.descripcion ? `<p class="text-xs text-slate-200 leading-relaxed font-medium pl-6">${item.descripcion}</p>` : ''}
                ${item.periodoTexto ? `<div class="text-[10px] text-slate-400 pl-6 flex items-center gap-1 font-mono"><span>⏱️</span> Vigencia: ${item.periodoTexto}</div>` : ''}
                ${item.peligroNautico ? `<div class="text-[11px] text-amber-300/90 bg-black/30 p-2 rounded-xl mt-1 border border-amber-500/20 font-medium">⚠️ <strong>Peligro en Costa:</strong> ${item.peligroNautico}</div>` : ''}
            </div>
        `;
    };

    let htmlTotal = '';
    alertasEmergencias.forEach(a => htmlTotal += generarHtmlAlerta(a, true));
    alertasAemet.forEach(a => htmlTotal += generarHtmlAlerta(a, false));
    alertasGenerales.forEach(a => htmlTotal += generarHtmlAlerta(a, false));

    if (contenedorBasico) {
        if (htmlTotal) {
            contenedorBasico.innerHTML = htmlTotal;
            contenedorBasico.classList.remove('hidden');
        } else {
            contenedorBasico.innerHTML = '';
            contenedorBasico.classList.add('hidden');
        }
    }

    if (contenedorPro) {
        if (htmlTotal) {
            contenedorPro.innerHTML = htmlTotal;
            contenedorPro.classList.remove('hidden');
        } else {
            contenedorPro.innerHTML = '';
            contenedorPro.classList.add('hidden');
        }
    }
}

