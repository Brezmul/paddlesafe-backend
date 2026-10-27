/**
 * PaddleSafe - Sistema Unificado de Errores, Validación y Observabilidad Meteorológica
 * FASE 2 & FASE 3: Jerarquía de errores, validaciones defensivas y observabilidad estructurada.
 */

// ==============================================================================
// 1. JERARQUÍA UNIFORME DE ERRORES DE APLICACIÓN
// ==============================================================================

export class BaseAppError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = this.constructor.name;
        this.code = options.code || 'UNKNOWN_ERROR';
        this.userMessage = options.userMessage || message;
        this.status = options.status !== undefined ? options.status : null;
        this.spot = options.spot || null;
        this.lat = options.lat !== undefined ? options.lat : null;
        this.lng = options.lng !== undefined ? options.lng : (options.lon !== undefined ? options.lon : null);
        this.durationMs = options.durationMs !== undefined ? options.durationMs : null;
        this.technicalDetails = options.technicalDetails || null;
        this.timestamp = options.timestamp || new Date().toISOString();

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

export class WeatherError extends BaseAppError {}
export class ForecastError extends BaseAppError {}
export class MapError extends BaseAppError {}
export class RadarError extends BaseAppError {}

// Exponer defensivamente en window para interoperabilidad legacy y depuración
if (typeof window !== 'undefined') {
    window.BaseAppError = BaseAppError;
    window.WeatherError = WeatherError;
    window.ForecastError = ForecastError;
    window.MapError = MapError;
    window.RadarError = RadarError;
}

// ==============================================================================
// 2. VALIDACIÓN DEFENSIVA DE COORDENADAS
// ==============================================================================

/**
 * Valida de forma estricta que latitud y longitud sean números finitos y dentro de rango.
 * @param {*} lat 
 * @param {*} lon 
 * @returns {{ valido: boolean, lat?: number, lon?: number, error?: string, code?: string, userMessage?: string }}
 */
export function validarCoordenadas(lat, lon) {
    if (lat === undefined || lat === null || lon === undefined || lon === null || lat === '' || lon === '') {
        return {
            valido: false,
            error: 'Coordenadas incompletas: latitud o longitud no definidas.',
            code: 'MISSING_COORDINATES',
            userMessage: 'Las coordenadas del spot no están disponibles o están incompletas.'
        };
    }

    const numLat = Number(lat);
    const numLon = Number(lon);

    if (!Number.isFinite(numLat) || !Number.isFinite(numLon)) {
        return {
            valido: false,
            error: `Coordenadas corruptas o no numéricas: lat=${lat}, lon=${lon}`,
            code: 'INVALID_COORDINATES',
            userMessage: 'Las coordenadas del spot contienen un formato numérico corrupto o no válido.'
        };
    }

    if (numLat < -90 || numLat > 90) {
        return {
            valido: false,
            error: `Latitud fuera de rango [-90, 90]: ${numLat}`,
            code: 'LATITUDE_OUT_OF_RANGE',
            userMessage: 'La latitud del spot está fuera del rango geográfico válido (-90° a 90°).'
        };
    }

    if (numLon < -180 || numLon > 180) {
        return {
            valido: false,
            error: `Longitud fuera de rango [-180, 180]: ${numLon}`,
            code: 'LONGITUDE_OUT_OF_RANGE',
            userMessage: 'La longitud del spot está fuera del rango geográfico válido (-180° a 180°).'
        };
    }

    return {
        valido: true,
        lat: numLat,
        lon: numLon
    };
}

if (typeof window !== 'undefined') {
    window.validarCoordenadas = validarCoordenadas;
}

// ==============================================================================
// 3. RESOLUCIÓN DE SPOTS NAÚTICOS CONOCIDOS (FAST PRESET MATCH)
// ==============================================================================

const SPOTS_CONOCIDOS_CACHE = [
    { match: /denia|d[eé]nia|las rotas|les rotes/i, nombre: 'Les Rotes (Dénia)', lat: 38.8242, lon: 0.1472, seaward_deg: 60 },
    { match: /j[aá]vea|x[aà]bia|cala blanca|granadella|portitxol/i, nombre: 'Cala Blanca (Jávea)', lat: 38.7681, lon: 0.2078, seaward_deg: 85 },
    { match: /moraira|el portet|portet/i, nombre: 'El Portet (Moraira)', lat: 38.6881, lon: 0.1389, seaward_deg: 160 },
    { match: /campello|coveta|ba[nñ]os de la reina/i, nombre: 'Coveta Fumà (El Campello)', lat: 38.4411, lon: -0.3603, seaward_deg: 110 },
    { match: /cabo de las huertas|huertas/i, nombre: 'Cabo de las Huertas (Alicante)', lat: 38.3569, lon: -0.2167, seaward_deg: 105 },
    { match: /tabarca|isla tabarca/i, nombre: 'Isla de Tabarca', lat: 38.1656, lon: -0.4736, seaward_deg: 180 },
    { match: /gand[ií]a/i, nombre: 'Puerto de Gandía', lat: 38.9972, lon: -0.1556, seaward_deg: 90 },
    { match: /cullera/i, nombre: 'Faro de Cullera', lat: 39.1867, lon: -0.2189, seaward_deg: 80 },
    { match: /valencia|malvarrosa/i, nombre: 'Malvarrosa (Valencia)', lat: 39.4792, lon: -0.3242, seaward_deg: 85 },
    { match: /formentor|mallorca/i, nombre: 'Cap de Formentor (Mallorca)', lat: 39.9272, lon: 3.1367, seaward_deg: 350 },
    { match: /galdana|menorca/i, nombre: 'Cala Galdana (Menorca)', lat: 39.9378, lon: 3.9611, seaward_deg: 200 },
    { match: /aiguablava|begur|costa brava/i, nombre: 'Aiguablava (Begur, Costa Brava)', lat: 41.9356, lon: 3.2189, seaward_deg: 100 }
];

/**
 * Busca si un nombre o término coincide de forma inmediata con un spot náutico predefinido.
 * @param {string} query 
 * @returns {{ nombre: string, lat: number, lon: number, seaward_deg: number }|null}
 */
export function resolverSpotConocido(query) {
    if (!query || typeof query !== 'string') return null;
    const clean = query.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    
    // Primero buscar en spots guardados del usuario si están disponibles
    try {
        if (typeof window !== 'undefined' && typeof window.recuperarSpotsGuardados === 'function') {
            const guardados = window.recuperarSpotsGuardados();
            if (Array.isArray(guardados)) {
                const encontrado = guardados.find(s => {
                    if (!s || !s.nombre) return false;
                    const nomClean = s.nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                    return nomClean === clean || nomClean.includes(clean) || clean.includes(nomClean);
                });
                if (encontrado && Number.isFinite(Number(encontrado.lat)) && Number.isFinite(Number(encontrado.lon))) {
                    return {
                        nombre: encontrado.nombre,
                        lat: Number(encontrado.lat),
                        lon: Number(encontrado.lon),
                        seaward_deg: encontrado.seaward_deg || 90
                    };
                }
            }
        }
    } catch (_) {}

    for (const spot of SPOTS_CONOCIDOS_CACHE) {
        if (spot.match.test(query) || spot.match.test(clean)) {
            return {
                nombre: spot.nombre,
                lat: spot.lat,
                lon: spot.lon,
                seaward_deg: spot.seaward_deg
            };
        }
    }

    return null;
}

if (typeof window !== 'undefined') {
    window.resolverSpotConocido = resolverSpotConocido;
}

// ==============================================================================
// 4. CLASIFICACIÓN DE ERRORES METEOROLÓGICOS (FASE 3 & 4)
// ==============================================================================

/**
 * Clasifica cualquier excepción o código HTTP en una instancia tipada de ForecastError con mensaje amigable.
 */
export function clasificarErrorMeteo(error, status = null, url = null, spot = null, lat = null, lng = null, durationMs = null) {
    if (error instanceof ForecastError || error instanceof WeatherError) {
        if (spot && !error.spot) error.spot = spot;
        if (lat !== null && error.lat === null) error.lat = lat;
        if (lng !== null && error.lng === null) error.lng = lng;
        if (durationMs !== null && error.durationMs === null) error.durationMs = durationMs;
        return error;
    }

    let code = 'UNKNOWN_ERROR';
    let userMessage = 'No se ha podido cargar el pronóstico. Comprueba tu conexión e inténtalo de nuevo.';

    const errMsg = error?.message || (typeof error === 'string' ? error : '');

    if (error?.name === 'AbortError' || errMsg.toLowerCase().includes('timeout') || errMsg.toLowerCase().includes('aborted')) {
        code = 'TIMEOUT';
        userMessage = 'El proveedor meteorológico no ha respondido a tiempo. Por favor, inténtalo de nuevo en unos momentos.';
    } else if (status === 400 || errMsg.includes('HTTP 400')) {
        code = 'HTTP_400';
        userMessage = 'Las coordenadas del spot no son válidas o están fuera de la cobertura del modelo meteorológico.';
    } else if (status === 404 || errMsg.includes('HTTP 404')) {
        code = 'HTTP_404';
        userMessage = 'No se encontraron datos meteorológicos para esta ubicación o estación marina.';
    } else if (status === 429 || errMsg.includes('HTTP 429') || errMsg.toLowerCase().includes('rate limit')) {
        code = 'RATE_LIMITED';
        userMessage = 'Límite de consultas meteorológicas alcanzado temporalmente. Espera unos segundos y vuelve a consultar.';
    } else if ((status && status >= 500 && status < 600) || errMsg.includes('HTTP 5')) {
        code = status ? `HTTP_${status}` : 'SERVER_ERROR';
        userMessage = 'El servicio meteorológico está temporalmente no disponible. Estamos intentando recuperar datos de respaldo.';
    } else if (error instanceof SyntaxError || errMsg.includes('JSON')) {
        code = 'INVALID_JSON';
        userMessage = 'Se ha recibido una respuesta no legible del servidor meteorológico.';
    } else if (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError') || errMsg.includes('ENOTFOUND')) {
        code = 'NETWORK_ERROR';
        userMessage = 'No se ha podido conectar con el servicio meteorológico. Comprueba tu conexión a internet.';
    } else if (errMsg.includes('No se pudieron determinar coordenadas') || errMsg.includes('coordenadas')) {
        code = 'SPOT_NOT_FOUND';
        userMessage = `No se pudieron determinar coordenadas para "${spot || 'el spot indicado'}". Comprueba el nombre o escribe coordenadas (ej. 38.84, 0.10).`;
    } else if (errMsg.includes('datos horarios')) {
        code = 'EMPTY_RESPONSE';
        userMessage = 'El proveedor meteorológico no devolvió datos horarios para la fecha seleccionada.';
    } else if (error?.code) {
        code = error.code;
        userMessage = error.userMessage || errMsg;
    } else if (errMsg) {
        userMessage = errMsg;
    }

    return new ForecastError(userMessage, {
        code,
        userMessage,
        status: status || error?.status || null,
        spot,
        lat,
        lng,
        durationMs,
        technicalDetails: { url, originalError: errMsg }
    });
}

if (typeof window !== 'undefined') {
    window.clasificarErrorMeteo = clasificarErrorMeteo;
}

// ==============================================================================
// 5. OBSERVABILIDAD Y LOGGING ESTRUCTURADO (FASE 5)
// ==============================================================================

/**
 * Registra un log estructurado del servicio de pronóstico según el formato especificado.
 */
export function logForecastService({ spot, lat, lng, url, status, durationMs, error = null }) {
    if (error) {
        const errMessage = error instanceof Error ? error.message : String(error);
        const code = error?.code || 'ERROR';
        console.warn(
            `[ForecastService]\nSpot: ${spot || 'N/A'}\nLat: ${lat !== null && lat !== undefined ? lat : 'undefined'}\nLng: ${lng !== null && lng !== undefined ? lng : 'undefined'}\nCode: ${code}\nStatus: ${status || 'ERR'}\nDuration: ${durationMs !== null && durationMs !== undefined ? `${durationMs}ms` : 'N/A'}\nError: ${errMessage}`
        );
    } else {
        console.log(
            `[ForecastService]\nSpot: ${spot || 'N/A'}\nLat: ${lat}\nLng: ${lng}\nURL: ${url || 'N/A'}\nStatus: ${status || 200}\nDuration: ${durationMs !== null && durationMs !== undefined ? `${durationMs}ms` : 'N/A'}`
        );
    }
}

if (typeof window !== 'undefined') {
    window.logForecastService = logForecastService;
}
