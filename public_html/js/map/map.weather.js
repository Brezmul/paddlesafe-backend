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
        location: payload.location,
        date: fechaStr,
        fecha: fechaStr,
        selected_date: fechaStr,
        fechaConsulta: fechaStr
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

        // Enriquecer alertas reales con metadatos de la autoridad competente
        if (Array.isArray(datos.aemet.alertas) && datos.aemet.alertas.length > 0) {
            datos.aemet.alertas.forEach(a => {
                if (!a.urlDoc && autoridadLocal?.urlDoc) a.urlDoc = autoridadLocal.urlDoc;
                if (!a.plan && autoridadLocal?.plan) a.plan = autoridadLocal.plan;
                if (!a.peligroNautico && autoridadLocal?.peligroNautico) a.peligroNautico = autoridadLocal.peligroNautico;
            });
        }
        const fechaResuelta = payload.date || payload.fecha || payload.selected_date || (typeof document !== 'undefined' ? (document.getElementById('proDate')?.value || document.getElementById('quedadaFechaInput')?.value || document.getElementById('date')?.value) : null) || new Date().toISOString().slice(0, 10);
        datos.date = fechaResuelta;
        datos.fecha = fechaResuelta;
        datos.selected_date = fechaResuelta;
        datos.fechaConsulta = fechaResuelta;

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

// ==============================================================================
// VALIDACIÓN TEMPORAL Y EXPLICACIÓN HUMANA DE AVISOS OFICIALES (AEMET / 112)
// ==============================================================================

/**
 * Valida si la fecha consultada se encuentra estrictamente dentro del periodo de vigencia del aviso.
 * Regla 3: selected_date >= warning_start && selected_date <= warning_end.
 */
export function validarVigenciaAlerta(selectedDateStr, alertStartStr, alertEndStr, textoFallback = '') {
    const sel = String(selectedDateStr || '').slice(0, 10);
    let fechaIni = alertStartStr ? String(alertStartStr).slice(0, 10) : null;
    let fechaFin = alertEndStr ? String(alertEndStr).slice(0, 10) : null;

    if (!fechaIni && textoFallback) {
        const txt = String(textoFallback).toLowerCase();
        const mIni = /(?:comienc[ea]|inici[ea]|a partir del?|desde el?)\s+(?:el\s+)?(?:d[ií]a\s+)?(?:([a-zñáéíóú]+)\s+)?(\d{1,2})/i.exec(txt);
        const mFin = /(?:durante|hasta|finaliz[ea]|termin[ea])\s+(?:el\s+)?(?:d[ií]a\s+)?(?:([a-zñáéíóú]+)\s+)?(\d{1,2})/i.exec(txt);
        if (mIni || mFin || /fin de semana/i.test(txt)) {
            const now = new Date();
            const anio = now.getFullYear();
            const mes = String(now.getMonth() + 1).padStart(2, '0');
            const dIni = mIni ? parseInt(mIni[2], 10) : (/fin de semana/i.test(txt) ? 17 : null);
            const dFin = mFin ? parseInt(mFin[2], 10) : (/fin de semana/i.test(txt) ? 18 : dIni);
            if (dIni) fechaIni = `${anio}-${mes}-${String(dIni).padStart(2, '0')}`;
            if (dFin) fechaFin = `${anio}-${mes}-${String(dFin).padStart(2, '0')}`;
        }
    }

    if (!fechaIni && !fechaFin) {
        return { esVigente: true, estadoTemporal: 'ACTIVA_AHORA' };
    }

    const start = fechaIni || sel;
    const end = fechaFin || start;

    if (sel < start) {
        return { esVigente: false, estadoTemporal: 'FUTURA_PREVENTIVA' };
    }
    if (sel > end) {
        return { esVigente: false, estadoTemporal: 'EXPIRADA' };
    }
    return { esVigente: true, estadoTemporal: 'ACTIVA_AHORA' };
}

/**
 * Genera una explicación humana basada en tipo, nivel y boletín oficial (Regla 5).
 */
export function generarExplicacionAvisoAemet(item) {
    if (!item) return '';
    const nivelMap = {
        ROJA: 'rojo',
        NARANJA: 'naranja',
        AMARILLA: 'amarillo'
    };
    const nivelTxt = nivelMap[String(item.nivel || '').toUpperCase()] || 'amarillo';
    const tipoRaw = String(item.tipo || item.titulo || item.descripcion || 'Aviso meteorológico');
    let fenomTxt = 'por fenómenos adversos';
    if (/tormenta|rayo|lightning|thunderstorm/i.test(tipoRaw)) {
        fenomTxt = 'por tormentas';
    } else if (/costero|mar|oleaje|coastal|wave/i.test(tipoRaw)) {
        fenomTxt = 'por fenómenos costeros';
    } else if (/viento|racha|wind/i.test(tipoRaw)) {
        fenomTxt = 'por rachas de viento';
    } else if (/lluvia|precipitaci|rain/i.test(tipoRaw)) {
        fenomTxt = 'por precipitaciones intensas';
    } else if (/temperatura|calor|ola de calor|heat/i.test(tipoRaw)) {
        fenomTxt = 'por altas temperaturas';
    }

    const zonaTxt = item.zona ? `para ${item.zona}` : 'para esta zona';

    let tiempoTxt = '';
    if (item.periodoTexto && !/desde.*hasta/i.test(item.periodoTexto)) {
        tiempoTxt = ` entre las ${item.periodoTexto}`;
    } else if (item.inicio && item.fin && item.inicio.includes('T') && item.fin.includes('T')) {
        const hIni = item.inicio.split('T')[1].slice(0, 5);
        const hFin = item.fin.split('T')[1].slice(0, 5);
        tiempoTxt = ` entre las ${hIni} y las ${hFin}`;
    } else if (item.periodoTexto) {
        tiempoTxt = ` (${item.periodoTexto})`;
    }

    let impactoTxt = '';
    if (/tormenta|rayo|lightning|thunderstorm/i.test(tipoRaw)) {
        impactoTxt = ' Pueden producirse descargas eléctricas, chubascos intensos y cambios súbitos de viento.';
    } else if (/costero|mar|oleaje|coastal|wave/i.test(tipoRaw)) {
        impactoTxt = ' Fuerte rompiente y corrientes de resaca peligrosas en la costa.';
    } else if (/viento|racha|wind/i.test(tipoRaw)) {
        impactoTxt = ' Las rachas pueden provocar desestabilización en la tabla y dificultad para volver a la costa.';
    } else if (/lluvia|precipitaci|rain/i.test(tipoRaw)) {
        impactoTxt = ' Peligro de crecidas súbitas y escorrentías hacia las playas.';
    } else if (item.descripcion && item.descripcion !== item.tipo) {
        impactoTxt = ` ${item.descripcion}.`;
    }

    return `AEMET ha emitido un aviso ${nivelTxt} ${fenomTxt} ${zonaTxt}${tiempoTxt}.${impactoTxt}`;
}

/**
 * Registro de diagnóstico para auditoría y verificación de alertas (Regla 7).
 */
export function registrarDiagnosticoAemet(info = {}) {
    try {
        const isDebug = (typeof window !== 'undefined' && (
            Boolean(window.psDebugMode) ||
            window.localStorage?.getItem('paddlesafe:debug-weather') === 'true' ||
            window.localStorage?.getItem('paddlesafe:debug') === 'true' ||
            ['localhost', '127.0.0.1'].includes(window.location?.hostname)
        ));
        if (isDebug) {
            console.debug('[PaddleSafe:AEMET_Diagnostic]', {
                selected_date: info.selected_date ?? null,
                warning_source: info.warning_source ?? null,
                warning_start: info.warning_start ?? null,
                warning_end: info.warning_end ?? null,
                warning_type: info.warning_type ?? null,
                warning_active: Boolean(info.warning_active),
                forecast_risk_level: info.forecast_risk_level ?? 'BAJO'
            });
        }
    } catch (_) {
        // Safe logging
    }
}

/**
 * Limpia y purga avisos meteorológicos obsoletos (Regla 4).
 */
export function limpiarAvisosMeteorologicos() {
    if (typeof document === 'undefined') return;
    const contBasico = document.getElementById('global-alert-container');
    const contPro = document.getElementById('proAlertTopContainer');
    if (contBasico) {
        contBasico.innerHTML = '';
        contBasico.classList.add('hidden');
    }
    if (contPro) {
        contPro.innerHTML = '';
        contPro.classList.add('hidden');
    }
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
            tipo: registro.tipo || registro.descripcion,
            nivel: nivelAlertaMeteorologica(registro),
            origen: registro.origen || 'AEMET',
            titulo: registro.titulo || registro.title || '',
            urlDoc: registro.urlDoc || registro.url || null,
            esEspecial: Boolean(registro.esEspecial),
            inicio: registro.inicio || registro.start || registro.valid_from || null,
            fin: registro.fin || registro.end || registro.valid_to || null,
            diaInicio: registro.diaInicio || null,
            diaFin: registro.diaFin || null,
            nombreDiaInicio: registro.nombreDiaInicio || null,
            nombreDiaFin: registro.nombreDiaFin || null,
            periodoTexto: registro.periodoTexto || null,
            extractoOficial: registro.extractoOficial || null,
            zona: registro.zona || registro.area || datosAemet?.zona || null,
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
                if (alerta.zona) repetida.zona = alerta.zona;
            }
        }
    });
    alertas.sort((a, b) => niveles[b.nivel] - niveles[a.nivel]);

    // Evaluación temporal de vigencia: comparar fecha consultada con inicio y fin del aviso (Regla 3)
    const fechaConsulta = d?.selected_date
        || d?.fecha
        || d?.date
        || d?.fechaConsulta
        || d?.payload?.date
        || d?.payload?.fecha
        || (typeof document !== 'undefined' ? (
            document.getElementById('proDate')?.value
            || document.getElementById('quedadaFechaInput')?.value
            || document.getElementById('date')?.value
            || document.getElementById('datePicker')?.value
        ) : null)
        || new Date().toISOString().slice(0, 10);

    alertas.forEach(item => {
        const vigencia = validarVigenciaAlerta(fechaConsulta, item.inicio, item.fin, `${item.titulo || ''} ${item.tipo || ''} ${item.descripcion || ''}`);
        item.esVigente = vigencia.esVigente;
        item.estadoTemporal = vigencia.estadoTemporal;
        if (item.inicio && item.fin && !item.periodoTexto && item.inicio.includes('T') && item.fin.includes('T')) {
            const hI = item.inicio.split('T')[1].slice(0, 5);
            const hF = item.fin.split('T')[1].slice(0, 5);
            if (hI && hF) item.periodoTexto = `${hI} y las ${hF}`;
        }
        item.explicacionHumana = generarExplicacionAvisoAemet(item);
    });

    // Avisos oficiales activos y vigentes para la fecha consultada (Regla 2 & Regla 3)
    const alertasOficialesActivas = alertas.filter(item =>
        item.esVigente === true &&
        item.estadoTemporal === 'ACTIVA_AHORA' &&
        (item.origen === 'AEMET' || /^1-?1-?2/i.test(item.origen || ''))
    );
    const alertaOficialActiva = alertasOficialesActivas.length > 0;

    // Tormenta oficial: solo si AEMET o 112 ha emitido aviso activo para la fecha (Regla 6)
    const aemetAvisoTormentaActivo = alertasOficialesActivas.some(item =>
        /tormenta|thunderstorm|lightning|descarga\s*electrica|actividad\s*electrica|rayos?/i.test(
            `${item.tipo || ''} ${item.descripcion || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        )
    );

    // Sistema A: Estimación de riesgo convectivo / inestabilidad por modelo de pronóstico (Regla 1)
    const cape = Number(d?.cape ?? d?.convective_available_potential_energy ?? d?.convection ?? 0);
    const weatherCode = Number(d?.weatherCode ?? d?.weather_code ?? 0);
    const lightningProb = Number(d?.lightning_probability ?? d?.probabilidad_rayos ?? d?.probabilidadTormenta ?? 0);
    const precipitacion = Number(d?.precipitation ?? d?.precipitation_mm ?? d?.precipitacion ?? 0);

    const riesgoModeloConvectivo = (
        cape >= 1000 ||
        [95, 96, 99].includes(weatherCode) ||
        lightningProb >= 40 ||
        (cape >= 600 && precipitacion >= 5)
    );

    const forecastRiskLevel = (cape >= 1500 || [96, 99].includes(weatherCode)) ? 'CRITICO'
        : (cape >= 1000 || weatherCode === 95 || lightningProb >= 50) ? 'ALTO'
        : (cape >= 500 || lightningProb >= 25) ? 'MODERADO'
        : 'BAJO';

    const etiquetaRiesgoModelo = riesgoModeloConvectivo ? '⚠️ Riesgo Meteorológico Estimado' : null;
    const mensajeRiesgoModelo = riesgoModeloConvectivo
        ? (cape >= 1000 ? '⚠️ Condiciones favorables para desarrollo tormentoso.' : '⚠️ Posible inestabilidad atmosférica.')
        : null;

    const primerAvisoActivo = alertasOficialesActivas[0] || null;
    const diagnostico = {
        selected_date: fechaConsulta,
        warning_source: alertaOficialActiva ? (primerAvisoActivo?.origen || 'AEMET') : null,
        warning_start: primerAvisoActivo?.inicio || null,
        warning_end: primerAvisoActivo?.fin || null,
        warning_type: primerAvisoActivo?.tipo || null,
        warning_active: alertaOficialActiva,
        forecast_risk_level: forecastRiskLevel
    };
    registrarDiagnosticoAemet(diagnostico);

    const tiene112 = alertasOficialesActivas.some(item => /^1-?1-?2/i.test(item.origen || ''));
    const primer112 = alertasOficialesActivas.find(item => /^1-?1-?2/i.test(item.origen || ''));

    // Veto de emergencias solo para alertas activas y vigentes
    const esEmergencia = alertasOficialesActivas.some(item =>
        item.esEspecial ||
        /^1-?1-?2/i.test(item.origen || '') ||
        /protecci[oó]n\s*civil/i.test(item.origen || item.tipo || '') ||
        /emergencia|inundaci|avenida|temporal\s*costero|galerna/i.test(item.tipo || '') ||
        ['NARANJA', 'ROJA'].includes(String(item.nivel || '').toUpperCase()) ||
        Boolean(item.urlDoc)
    );

    // Detectar avisos preventivos futuros
    const alertasPreventivas = alertas.filter(item =>
        item.estadoTemporal === 'FUTURA_PREVENTIVA' && (
            item.esEspecial ||
            /^1-?1-?2/i.test(item.origen || '') ||
            /protecci[oó]n\s*civil/i.test(item.origen || item.tipo || '') ||
            ['NARANJA', 'ROJA'].includes(String(item.nivel || '').toUpperCase()) ||
            Boolean(item.urlDoc)
        )
    );
    const esAvisoPreventivo = !esEmergencia && alertasPreventivas.length > 0;
    const primerPreventivo = alertasPreventivas[0] || null;

    const alerta = {
        activa: alertaOficialActiva,
        esOficialAemet: alertaOficialActiva,
        aemetAvisoTormentaActivo,
        esEmergencia,
        esAvisoPreventivo,
        avisoPreventivo: primerPreventivo,
        esVigente: alertaOficialActiva,
        estadoTemporal: alertaOficialActiva ? 'ACTIVA_AHORA' : (esAvisoPreventivo ? 'FUTURA_PREVENTIVA' : (alertas.some(a => a.estadoTemporal === 'EXPIRADA') ? 'EXPIRADA' : null)),
        fechaConsulta,
        disponible: disponibles,
        origen: alertaOficialActiva ? (tiene112 ? primer112.origen : 'AEMET') : null,
        alertas: alertasOficialesActivas,
        todasLasAlertas: alertas,
        nivel: alertasOficialesActivas[0]?.nivel || null,
        tipo: alertasOficialesActivas.map(item => item.tipo).join(' · ') || (alertaOficialActiva ? 'Aviso AEMET' : null),
        zona: alertasOficialesActivas[0]?.zona || null,
        explicacionHumana: alertasOficialesActivas[0]?.explicacionHumana || null,
        // Sistema A: Estimación del modelo interno
        riesgoModeloConvectivo,
        riesgoMeteorologicoEstimado: riesgoModeloConvectivo && !alertaOficialActiva,
        etiquetaRiesgoModelo,
        mensajeRiesgoModelo,
        forecastRiskLevel,
        diagnostico,
        tormenta: aemetAvisoTormentaActivo
    };
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
    const weatherCode = valorNumericoMeteo(dx.weatherCode, dx.weather_code);
    const cape = valorNumericoMeteo(dx.cape, dx.convective_available_potential_energy, dx.convection) ?? 0;
    const lightningProb = valorNumericoMeteo(dx.lightning_probability, dx.probabilidad_rayos, dx.probabilidadTormenta) ?? 0;

    const direccionViento = valorNumericoMeteo(dx.windDirection, dx.wind_direction);
    const coords = dx.coordinates || (Number.isFinite(dx.latitude) && Number.isFinite(dx.longitude) ? { latitude: dx.latitude, longitude: dx.longitude } : null);

    console.log('[AEMET] Alertas enviadas al Motor:', {
        alerta,
        tormentaOficial: alerta.aemetAvisoTormentaActivo,
        riesgoModelo: alerta.riesgoModeloConvectivo,
        datosEntradaAemet: dx.aemet,
        datosEntradaAlertas: dx.alertas
    });

    registrarDiagnosticoClima('[PaddleSafe Engine] Unified Evaluation Input', {
        alertas: alerta,
        tormentaOficial: alerta.aemetAvisoTormentaActivo,
        riesgoModelo: alerta.riesgoModeloConvectivo,
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
        cape,
        weatherCode,
        lightningProb,
        coordenadas: coords,
        nombreSpot: dx.location || dx.nombreSpot || '',
        deporte: dx.deporte || 'paddle_surf',
        nivelUsuario,
        modelosPronostico: dx.consenso || null,
        horasDiurnas: dx.horasDiurnas || null,
        fechaConsulta: alerta.fechaConsulta,
        alerta,
        alertaOficial: alerta,
        alertaEmergencia: alerta.esEmergencia,
        avisoPreventivo: alerta.esAvisoPreventivo,
        datosAlertaPreventiva: alerta.avisoPreventivo,
        alertaTormentaOficialActiva: alerta.aemetAvisoTormentaActivo,
        tormentaElectricaOficial: alerta.aemetAvisoTormentaActivo,
        riesgoModeloConvectivo: alerta.riesgoModeloConvectivo,
        riesgoMeteorologicoEstimado: alerta.riesgoMeteorologicoEstimado,
        etiquetaRiesgoModelo: alerta.etiquetaRiesgoModelo,
        mensajeRiesgoModelo: alerta.mensajeRiesgoModelo,
        tormenta: alerta.aemetAvisoTormentaActivo
    });
}

export function renderizarAvisoSuperior(motor) {
    if (typeof document === 'undefined') return;
    const contenedorBasico = document.getElementById('global-alert-container');
    const contenedorPro = document.getElementById('proAlertTopContainer');

    const alertas = (motor?.aemet?.alertas || []).filter(a => a.esVigente === true && a.estadoTemporal === 'ACTIVA_AHORA');
    const tieneAlertaOficial = Boolean(motor?.aemet?.activa && alertas.length > 0);
    const tieneRiesgoModelo = Boolean(
        (motor?.riesgoMeteorologicoEstimado || motor?.riesgoModeloConvectivo) && !tieneAlertaOficial
    );

    if (!tieneAlertaOficial && !tieneRiesgoModelo) {
        if (contenedorBasico) { contenedorBasico.innerHTML = ''; contenedorBasico.classList.add('hidden'); }
        if (contenedorPro) { contenedorPro.innerHTML = ''; contenedorPro.classList.add('hidden'); }
        return;
    }

    let htmlTotal = '';

    if (tieneAlertaOficial) {
        alertas.forEach(item => {
            const esEmergencia = Boolean(item.esEspecial || /^1-?1-?2/i.test(item.origen || '') || ['NARANJA', 'ROJA'].includes(String(item.nivel || '').toUpperCase()));
            const bgCls = esEmergencia ? 'bg-red-950/90 border-red-500/80 text-rose-100 shadow-red-950/50'
                : (item.nivel === 'ROJA' ? 'bg-red-950/80 border-red-500/60 text-rose-200'
                    : (item.nivel === 'NARANJA' ? 'bg-amber-950/80 border-amber-500/60 text-amber-200'
                        : 'bg-yellow-950/60 border-yellow-500/40 text-yellow-200'));
            const icon = '🚨';
            const badgeOrigen = `<span class="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${esEmergencia ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-800 text-slate-300 border border-slate-700'}">${item.origen || 'AEMET'}</span>`;
            const badgeDoc = item.urlDoc ? `<a href="${item.urlDoc}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-white/10 hover:bg-white/20 text-white underline decoration-dotted transition-colors ml-auto"><span>📄</span> Documento Oficial</a>` : '';
            const explicacion = item.explicacionHumana || item.descripcion || 'Aviso meteorológico oficial activo.';

            htmlTotal += `
                <div class="p-3.5 rounded-2xl border ${bgCls} shadow-lg backdrop-blur-md mb-2 animate-fadeIn flex flex-col gap-2">
                    <div class="flex items-center gap-2">
                        <span class="text-lg">${icon}</span>
                        <span class="font-black text-xs uppercase tracking-wide flex-1">Aviso Oficial AEMET: ${item.tipo || item.titulo || 'Aviso'} (${item.nivel || 'AMARILLA'})</span>
                        ${badgeOrigen}
                        ${badgeDoc}
                    </div>
                    ${item.zona ? `<div class="text-[11px] text-slate-300 pl-6 font-semibold">📍 Zona: ${item.zona}</div>` : ''}
                    <p class="text-xs text-slate-200 leading-relaxed font-medium pl-6">${explicacion}</p>
                    ${item.periodoTexto ? `<div class="text-[10px] text-slate-400 pl-6 flex items-center gap-1 font-mono"><span>⏱️</span> Vigencia: ${item.periodoTexto}</div>` : ''}
                    <div class="text-[10px] text-slate-400 pl-6 italic">Fuente oficial: Agencia Estatal de Meteorología (AEMET)</div>
                </div>
            `;
        });
    } else if (tieneRiesgoModelo) {
        const mensaje = motor?.mensajeRiesgoModelo || motor?.mensaje || '⚠️ Condiciones favorables para desarrollo tormentoso.';
        htmlTotal = `
            <div class="p-3.5 rounded-2xl border bg-amber-950/70 border-amber-500/50 text-amber-100 shadow-lg backdrop-blur-md mb-2 animate-fadeIn flex flex-col gap-2">
                <div class="flex items-center gap-2">
                    <span class="text-lg">⚠️</span>
                    <span class="font-black text-xs uppercase tracking-wide flex-1">Riesgo Meteorológico Estimado</span>
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-900/80 text-amber-300 border border-amber-700">Modelo Numérico</span>
                </div>
                <p class="text-xs text-amber-200 leading-relaxed font-medium pl-6">${mensaje}</p>
                <div class="text-[10px] text-amber-400/80 pl-6">Estimación interna por índices de inestabilidad convectiva (CAPE). Sin aviso oficial AEMET activo.</div>
            </div>
        `;
    }

    if (contenedorBasico) {
        contenedorBasico.innerHTML = htmlTotal;
        contenedorBasico.classList.remove('hidden');
    }
    if (contenedorPro) {
        contenedorPro.innerHTML = htmlTotal;
        contenedorPro.classList.remove('hidden');
    }
}

// ==============================================================================
// 72H OPTIMAL PADDLING WINDOWS SCANNER (BATCH #19)
// ==============================================================================

/**
 * Escanea las horas diurnas (07:00 a 20:00) en el dataset de pronóstico disponible (72h),
 * evalúa cada bloque contiguo de 3 horas con el motor de veredictos y deriva PaddleSafe,
 * y retorna las 3 mejores ventanas ordenadas de mayor a menor score de seguridad.
 * @param {number} lat Latitud del spot
 * @param {number} lon Longitud del spot
 * @param {Object} pronosticoData Dataset horario de Open-Meteo o series horarias
 * @param {number|null} seawardDeg Orientación de salida a mar abierto
 * @returns {Array<Object>} Top 3 ventanas: { fechaStr, etiquetaDia, horaInicio, horaFin, scoreMedio, vientoMedioKt, olasMediasM, resumen }
 */
export function escanearMejoresVentanas72h(lat, lon, pronosticoData, seawardDeg = null) {
    if (!pronosticoData) return [];

    let registrosHorarios = [];

    // Formato 1: Objeto Open-Meteo con hourly (arrays paralelos)
    const hourly = pronosticoData.hourly || (pronosticoData.time ? pronosticoData : null);
    if (hourly && Array.isArray(hourly.time)) {
        for (let i = 0; i < hourly.time.length; i++) {
            const timeStr = hourly.time[i];
            if (!timeStr) continue;
            const fechaStr = timeStr.slice(0, 10);
            const horaNum = parseInt(timeStr.slice(11, 13), 10);
            if (isNaN(horaNum) || horaNum < 7 || horaNum > 20) continue;

            const wSpeedRaw = hourly.wind_speed_10m?.[i] ?? hourly.windSpeed?.[i] ?? 0;
            const vientoKt = Number(kmhANudos(Number(wSpeedRaw) * 3.6).toFixed(1));
            const wGustRaw = hourly.wind_gust_10m?.[i] ?? hourly.wind_gusts_10m?.[i] ?? hourly.windGusts?.[i] ?? wSpeedRaw;
            const rachasKt = Number(kmhANudos(Number(wGustRaw) * 3.6).toFixed(1));
            const dirDeg = Number(hourly.wind_direction_10m?.[i] ?? hourly.windDirection?.[i] ?? 0);
            const olaM = Number(Number(hourly.wave_height?.[i] ?? hourly.waveHeight?.[i] ?? 0.2).toFixed(1));
            const wCode = Number(hourly.weather_code?.[i] ?? hourly.weatherCode?.[i] ?? 0);

            registrosHorarios.push({
                fechaStr,
                horaNum,
                vientoKt,
                rachasKt,
                dirDeg,
                olaM,
                weatherCode: wCode
            });
        }
    } else if (Array.isArray(pronosticoData.horasDiurnas)) {
        // Formato 2: horasDiurnas de un pronóstico diario
        const fechaBase = pronosticoData.fecha || pronosticoData.date || (typeof document !== 'undefined' ? document.getElementById('date')?.value : null) || new Date().toISOString().slice(0, 10);
        for (const h of pronosticoData.horasDiurnas) {
            const horaNum = parseInt((h.hora || '12:00').slice(0, 2), 10);
            if (isNaN(horaNum) || horaNum < 7 || horaNum > 20) continue;
            registrosHorarios.push({
                fechaStr: h.fecha || fechaBase,
                horaNum,
                vientoKt: Number(Number(h.vientoKt ?? 5).toFixed(1)),
                rachasKt: Number(Number(h.rachasKt ?? h.vientoKt ?? 6).toFixed(1)),
                dirDeg: Number(h.dirDeg ?? h.direccionDeg ?? h.wind_direction ?? 0),
                olaM: Number(Number(h.olaM ?? h.oleajeM ?? 0.2).toFixed(1)),
                weatherCode: Number(h.weatherCode ?? 0)
            });
        }
    } else if (Array.isArray(pronosticoData)) {
        // Formato 3: Array plano de horas
        for (const h of pronosticoData) {
            const timeStr = String(h.hora || h.time || '12:00');
            const horaNum = h.horaNum !== undefined ? h.horaNum : (timeStr.includes(':') ? parseInt(timeStr.slice(0, 2), 10) : 12);
            if (isNaN(horaNum) || horaNum < 7 || horaNum > 20) continue;
            registrosHorarios.push({
                fechaStr: h.fechaStr || h.fecha || (h.time ? String(h.time).slice(0, 10) : new Date().toISOString().slice(0, 10)),
                horaNum,
                vientoKt: Number(Number(h.vientoKt ?? 5).toFixed(1)),
                rachasKt: Number(Number(h.rachasKt ?? h.vientoKt ?? 6).toFixed(1)),
                dirDeg: Number(h.dirDeg ?? h.dirVientoDeg ?? 0),
                olaM: Number(Number(h.olaM ?? h.oleajeM ?? 0.2).toFixed(1)),
                weatherCode: Number(h.weatherCode ?? 0)
            });
        }
    }

    if (registrosHorarios.length === 0) return [];

    // Agrupar por fecha
    const porFecha = new Map();
    for (const r of registrosHorarios) {
        if (!porFecha.has(r.fechaStr)) porFecha.set(r.fechaStr, []);
        porFecha.get(r.fechaStr).push(r);
    }

    const ventanasCandidatas = [];

    porFecha.forEach((horasDelDia, fechaStr) => {
        horasDelDia.sort((a, b) => a.horaNum - b.horaNum);

        for (let i = 0; i < horasDelDia.length; i++) {
            const hStart = horasDelDia[i].horaNum;
            if (hStart > 18) continue; // Una ventana de 3h iniciada después de las 18:00 termina pasadas las 21:00

            // Buscar bloque contiguo de 3 horas
            const bloque = [
                horasDelDia.find(h => h.horaNum === hStart),
                horasDelDia.find(h => h.horaNum === hStart + 1),
                horasDelDia.find(h => h.horaNum === hStart + 2)
            ].filter(Boolean);

            if (bloque.length < 3) continue;

            const avgViento = Number((bloque.reduce((acc, h) => acc + h.vientoKt, 0) / 3).toFixed(1));
            const avgRachas = Number((bloque.reduce((acc, h) => acc + h.rachasKt, 0) / 3).toFixed(1));
            const avgOla = Number((bloque.reduce((acc, h) => acc + h.olaM, 0) / 3).toFixed(1));
            const avgDir = bloque[1].dirDeg;
            const tieneTormenta = bloque.some(h => [95, 96, 99].includes(h.weatherCode));

            let score = 90;
            let resumen = 'Condiciones excelentes para remar.';
            if (tieneTormenta) {
                score = 0;
                resumen = 'Riesgo de tormenta eléctrica en la franja.';
            } else {
                try {
                    const verd = generarVeredictoNextGen({
                        vientoKt: avgViento,
                        rachasKt: avgRachas,
                        oleajeM: avgOla,
                        dirVientoDeg: avgDir,
                        seaward_deg: seawardDeg,
                        esCosta: true,
                        deporte: 'paddle_surf',
                        nivelUsuario: 'Intermedio'
                    });
                    score = verd.score ?? Math.max(10, Math.round(100 - avgViento * 4 - avgOla * 30));
                    resumen = verd.justificacion || verd.respuestaDirecta || resumen;
                } catch (_) {
                    score = Math.max(10, Math.round(100 - avgViento * 4 - avgOla * 30));
                }
            }

            const hoyStr = new Date().toISOString().slice(0, 10);
            const mananaStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
            let etiquetaDia = 'Hoy';
            if (fechaStr === hoyStr) etiquetaDia = 'Hoy';
            else if (fechaStr === mananaStr) etiquetaDia = 'Mañana';
            else {
                const [y, m, d] = fechaStr.split('-').map(Number);
                const dt = new Date(Date.UTC(y, m - 1, d));
                const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
                etiquetaDia = `${dias[dt.getUTCDay()]} ${d}`;
            }

            ventanasCandidatas.push({
                fechaStr,
                etiquetaDia,
                horaInicio: `${String(hStart).padStart(2, '0')}:00`,
                horaFin: `${String(hStart + 3).padStart(2, '0')}:00`,
                scoreMedio: Math.round(score),
                vientoMedioKt: avgViento,
                olasMediasM: avgOla,
                resumen
            });
        }
    });

    // Ordenar por scoreMedio descendente y menor viento
    ventanasCandidatas.sort((a, b) => b.scoreMedio - a.scoreMedio || a.vientoMedioKt - b.vientoMedioKt);

    // Selección evitando duplicidad idéntica en el mismo día
    const seleccionadas = [];
    for (const v of ventanasCandidatas) {
        const solapa = seleccionadas.some(s =>
            s.fechaStr === v.fechaStr &&
            Math.abs(parseInt(s.horaInicio, 10) - parseInt(v.horaInicio, 10)) < 2
        );
        if (!solapa) {
            seleccionadas.push(v);
        }
        if (seleccionadas.length === 3) break;
    }

    if (seleccionadas.length < 3) {
        for (const v of ventanasCandidatas) {
            if (!seleccionadas.some(s => s.fechaStr === v.fechaStr && s.horaInicio === v.horaInicio)) {
                seleccionadas.push(v);
            }
            if (seleccionadas.length === 3) break;
        }
    }

    return seleccionadas;
}

if (typeof window !== 'undefined') {
    window.escanearMejoresVentanas72h = escanearMejoresVentanas72h;
}

