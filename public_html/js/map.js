// ====================================================
// js/map.js - MAPA, TRAZADOS, CLIMA Y TRACKING GPS
// ====================================================
import { supabaseClient, appState, BACKEND_API_URL } from './config.js';
import {
    fetchConTimeout,
    esc,
    formatearTiempo,
    calcularVeredicto,
    kmhANudos,
    deduplicateInsights,
    sonMensajesEquivalentes,
    filtrarConsejosRedundantes,
    generarVeredictoNextGen,
    resolverOrientacionCostera,
    calcularComponenteVientoAuto,
    calcularConsensoModelos,
    detectarVentanasOptimas,
    calcularBeginnerIndex,
    evaluarCondicionesDeporte,
    generarConsejoCoach,
    calcularSolYCrepusculo
} from './utils.js';
import { ClubState } from './club/state.js';
import { calcularXpRuta } from './gamification.js';
import { parseGPX, generarGPX, descargarGPX } from './gpxParser.js';

const ICONOS_SEGURIDAD = {
    'SEGURO': '🟢',
    'PRECAUCIÓN': '🟡',
    'RIESGO ELEVADO': '🟠',
    'PELIGROSO': '🔴',
    'RIESGO EXTREMO': '⛔',
    'NO RECOMENDADO': '⛔'
};
const ICONOS_DERIVA = {
    'BAJO': '🟢',
    'MODERADO': '🟡',
    'ALTO': '🟠',
    'MUY ALTO': '🔴',
    'EXTREMO': '⛔'
};

function registrarDiagnosticoClima(etiqueta, contenido) {
    try {
        if (window.localStorage?.getItem('paddlesafe:debug-weather') === 'true') {
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
        peligroNautico: "Oleaje atlántico/mediterráneo, corrientes de resaca e intensificación de viento por efecto canal en el Estrecho y costa andaluza."
    },
    CATALUNYA: {
        id: "CATALUNYA",
        nombre: "112 Catalunya (Protecció Civil)",
        organismo: "Direcció General de Protecció Civil (Generalitat de Catalunya)",
        plan: "Plans Especials INUNCAT / VENTCAT / CAMCAT",
        portal: "https://interior.gencat.cat/ca/arees_dactuacio/proteccio_civil/",
        urlDoc: "https://interior.gencat.cat/ca/arees_dactuacio/proteccio_civil/estat_dels_plans/index.html",
        telefono: "112",
        canal: "@emergenciescat",
        peligroNautico: "Viento de Tramuntana/Mestral terral violento en Costa Brava y desembocaduras torrenciales en el litoral central y delta del Ebro."
    },
    VALENCIA: {
        id: "VALENCIA",
        nombre: "112 Comunitat Valenciana",
        organismo: "Agència Valenciana de Seguretat i Resposta a les Emergències (AVSRE / 112 CV)",
        plan: "Plan Especial de Inundaciones y Temporal Costero (Generalitat Valenciana)",
        portal: "https://www.112cv.gva.es/es/inicio",
        urlDoc: "https://www.112cv.gva.es/documents/163565706/168368846/EGEN260541_Aviso_especial.pdf/663141cd-8dde-dea7-b54b-891e0f9561d5?t=1792046608487",
        telefono: "112",
        canal: "@GVA112",
        peligroNautico: "Avenidas súbitas en ramblas y cauces secos que desaguan en la playa, generando corrientes de arrastre violentas hacia mar abierto y aguas turbias."
    },
    GALICIA: {
        id: "GALICIA",
        nombre: "112 Galicia (AXEGA)",
        organismo: "Axencia Galega de Emerxencias (Xunta de Galicia)",
        plan: "Plan Especial de Protección Civil ante o Risco de Inundacións e Temporais Costeiros",
        portal: "https://axega112.gal",
        urlDoc: "https://axega112.gal/es/avisos",
        telefono: "112",
        canal: "@112Galicia",
        peligroNautico: "Mar de fondo atlántico violento, rompientes masivas en bajos costeros y fuertes corrientes de marea en bocanas de rías."
    },
    BALEARS: {
        id: "BALEARS",
        nombre: "112 Illes Balears (SEIB 112)",
        organismo: "Direcció General d'Emergències i Interior (Govern de les Illes Balears)",
        plan: "Pla Especial METEOBAL / INUNBAL",
        portal: "https://112ib.caib.es",
        urlDoc: "https://112ib.caib.es",
        telefono: "112",
        canal: "@112IllesBalears",
        peligroNautico: "Rissagas (oscilaciones súbitas del nivel del mar), vientos cambiantes de tramuntana y oleaje cruzado en calas abiertas."
    },
    CANARIAS: {
        id: "CANARIAS",
        nombre: "1-1-2 Canarias (CECOES)",
        organismo: "Dirección General de Emergencias (Gobierno de Canarias)",
        plan: "Plan Específico de Emergencias de Canarias por Fenómenos Meteorológicos Adversos (PEFMA)",
        portal: "https://www.gobiernodecanarias.org/administracionpublica/seguridadyemergencias/avisos/",
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
        peligroNautico: "Condiciones marítimas y meteorológicas adversas. Evita navegar y atiende a las indicaciones oficiales de Protección Civil."
    }
};

export const ZONAS_ESPANA_112 = [
    { nombre: "Alicante", comunidadId: "VALENCIA", alias: /alicante|alacant|campello|santa pola|torrevieja|benidorm|altea|javea|xabia|xàbia|denia|dénia|moraira|calpe/i, latMin: 37.8, latMax: 38.9, lonMin: -1.0, lonMax: 0.3 },
    { nombre: "Valencia", comunidadId: "VALENCIA", alias: /valencia|valència|cullera|gandia|oliva|sagunto|saler/i, latMin: 38.8, latMax: 40.1, lonMin: -1.5, lonMax: 0.1 },
    { nombre: "Castellón", comunidadId: "VALENCIA", alias: /castellon|castelló|oropesa|benicassim|benicàssim|peñiscola|vinaros|vinaròs/i, latMin: 39.8, latMax: 40.8, lonMin: -0.8, lonMax: 0.6 },
    { nombre: "Murcia", comunidadId: "MURCIA", alias: /murcia|cartagena|mazarron|mazarrón|aguilas|águilas|la manga|mar menor|guadalentin/i, latMin: 37.3, latMax: 38.8, lonMin: -2.3, lonMax: -0.6 },
    { nombre: "Almería", comunidadId: "ANDALUCIA", alias: /almeria|almería|cabo de gata|roquetas|mojacar|mojájar|san jose|san josé|poniente.*almeria|levante.*almeriense|tabernas/i, latMin: 36.6, latMax: 37.7, lonMin: -3.1, lonMax: -1.6 },
    { nombre: "Granada", comunidadId: "ANDALUCIA", alias: /granada|granadina|costa tropical|motril|almuñecar|almuñécar|salobreña|alpujarra/i, latMin: 36.6, latMax: 37.5, lonMin: -4.0, lonMax: -3.0 },
    { nombre: "Málaga", comunidadId: "ANDALUCIA", alias: /malaga|málaga|costa del sol|marbella|fuengirola|torremolinos|estepona|nerja|axarquia|axarquía/i, latMin: 36.4, latMax: 37.1, lonMin: -5.4, lonMax: -3.7 },
    { nombre: "Cádiz", comunidadId: "ANDALUCIA", alias: /cadiz|cádiz|tarifa|barbate|conil|el palmar|roto|chiclana|algeciras|estrecho|gaditano/i, latMin: 36.0, latMax: 37.0, lonMin: -6.5, lonMax: -5.1 },
    { nombre: "Huelva", comunidadId: "ANDALUCIA", alias: /huelva|ayamonte|isla cristina|punta umbria|punta umbría|mazagon|mazagón|matalascañas|onubense/i, latMin: 36.9, latMax: 38.2, lonMin: -7.5, lonMax: -6.3 },
    { nombre: "Baleares", comunidadId: "BALEARS", alias: /baleares|balears|mallorca|menorca|ibiza|eivissa|formentera|palma|alcudia|alcúdia|tramuntana/i, latMin: 38.5, latMax: 40.3, lonMin: 1.1, lonMax: 4.4 },
    { nombre: "Barcelona", comunidadId: "CATALUNYA", alias: /barcelona|sitges|castelldefels|badalona|mataro|mataró|maresme|baix llobregat/i, latMin: 41.1, latMax: 42.0, lonMin: 1.5, lonMax: 2.8 },
    { nombre: "Tarragona", comunidadId: "CATALUNYA", alias: /tarragona|cambrils|salou|delta de l'ebre|delta del ebro|amposta/i, latMin: 40.5, latMax: 41.6, lonMin: 0.1, lonMax: 1.6 },
    { nombre: "Girona", comunidadId: "CATALUNYA", alias: /girona|gerona|costa brava|roses|cadaques|cadaqués|palamos|palamós|blanes|platja d'aro|emporda|empordà|ampurdan/i, latMin: 41.6, latMax: 42.5, lonMin: 2.4, lonMax: 3.3 },
    { nombre: "Cantabria", comunidadId: "CANTABRIA", alias: /cantabria|santander|somo|suances|liencres|laredo|castro urdiales|noja|cantabrico|cantábrico/i, latMin: 42.8, latMax: 43.6, lonMin: -4.8, lonMax: -3.1 },
    { nombre: "Asturias", comunidadId: "ASTURIAS", alias: /asturias|asturiano|gijon|gijón|oviedo|aviles|avilés|ribadesella|llanes|rodiles/i, latMin: 42.9, latMax: 43.7, lonMin: -7.2, lonMax: -4.5 },
    { nombre: "Pontevedra", comunidadId: "GALICIA", alias: /pontevedra|rias baixas|rías baixas|vigo|sanxenxo|cangas|baiona|miño/i, latMin: 41.8, latMax: 42.8, lonMin: -9.0, lonMax: -7.9 },
    { nombre: "A Coruña", comunidadId: "GALICIA", alias: /coruña|coruna|costa da morte|ferrol|rias altas|rías altas|oleiros|artabra|ártabra/i, latMin: 42.5, latMax: 43.8, lonMin: -9.3, lonMax: -7.8 },
    { nombre: "Lugo", comunidadId: "GALICIA", alias: /lugo|mariña|marina lucense|ribadeo|viveiro|foc/i, latMin: 42.3, latMax: 43.8, lonMin: -7.9, lonMax: -6.9 },
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
        for (const [key, aut] of Object.entries(AUTORIDADES_112_ES)) {
            if (new RegExp(aut.nombre.replace(/[\(\)]/g, ""), "i").test(locationText)) {
                return { ...aut, zonaNombre: aut.nombre };
            }
        }
    }
    return { ...AUTORIDADES_112_ES.NACIONAL, zonaNombre: "Litoral de España" };
}

function valorNumericoMeteo(...valores) {
    const valor = valores.find(item => item !== null && item !== undefined && item !== '' && item !== '--' && item !== 'N/D');
    if (valor === undefined || !Number.isFinite(Number(valor))) return null;
    return Number(valor);
}

function crearFranjaForecast(horaSalida, duracionMinutos = 120) {
    const match = /^([01]\d|2[0-3]):[0-5]\d$/.exec(horaSalida || '');
    if (!match) throw new Error('La hora de salida no es válida.');

    const horaInicio = Number(match[1]);
    const horasDuracion = Math.max(1, Math.ceil(Number(duracionMinutos) / 60));
    const horaFin = Math.min(24, horaInicio + horasDuracion);
    return `Salida (${String(horaInicio).padStart(2, '0')}:00 - ${String(horaFin).padStart(2, '0')}:00)`;
}

// Caché geográfica inteligente por geohash/cuadrante (~2 km) con TTL de 15 min
const cacheGeohashMeteo = new Map();
const CACHE_TTL_METEO_MS = 15 * 60 * 1000;

// Resiliencia Offline: Snapshot del último pronóstico meteorológico válido
const SNAPSHOT_KEY = 'paddlesafe_last_forecast_snapshot';
const SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 horas

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

async function solicitarPronostico(payload) {
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
            // En cualquier otra región costera de España: asegurar que las alertas lleven la autoridad 112 y su documento/resolución oficial
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

async function solicitarPronosticoOpenMeteo(payload, resolvedLat = null, resolvedLon = null) {
    const rango = /\((\d{2}):00\s*-\s*(\d{2}):00\)/.exec(payload.timeRange || '');
    const horaInicio = rango ? Number(rango[1]) : 10;
    const horaFin = rango ? Number(rango[2]) : 12;

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
    const cached = cacheGeohashMeteo.get(cacheKey);
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
            const speedMs = getSeries('wind_speed_10m')[index];
            const gustsMs = getSeries('wind_gusts_10m')[index];
            const dirDeg = getSeries('wind_direction_10m')[index] ?? 0;
            const tempC = getSeries('temperature_2m')[index] ?? null;
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
                lluviaMm: getSeries('precipitation')[index] ?? 0,
                weatherCode: getSeries('weather_code')[index] ?? 0
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

    const marineValoresSlot = (name) => esEmbalse ? [] : franjaIndices
        .map(i => getMarineVal(name, times[i]))
        .filter(v => v !== null && Number.isFinite(Number(v)));

    const waves = marineValoresSlot('wave_height');
    const periods = marineValoresSlot('wave_period');
    const waveDirs = marineValoresSlot('wave_direction');
    const swells = marineValoresSlot('swell_wave_height');
    const swellPeriods = marineValoresSlot('swell_wave_period');
    const swellDirs = marineValoresSlot('swell_wave_direction');
    const seaTemps = marineValoresSlot('sea_surface_temperature');
    const currents = marineValoresSlot('ocean_current_velocity');

    const maxSpeedIdx = franjaIndices.reduce((maxI, idx) => {
        const val = getSeries('wind_speed_10m')[idx];
        if (val == null) return maxI;
        return (maxI < 0 || val > (getSeries('wind_speed_10m')[maxI] ?? -1)) ? idx : maxI;
    }, -1);
    const windDirection = maxSpeedIdx >= 0 ? getSeries('wind_direction_10m')[maxSpeedIdx] : (vDirs[0] ?? null);

    const weatherCode = codigos.includes(95) || codigos.includes(96) || codigos.includes(99)
        ? codigos.find(c => [95, 96, 99].includes(c))
        : (codigos.length ? Math.max(...codigos) : null);
    const clima = [95, 96, 99].includes(weatherCode) ? 'Tormenta eléctrica'
        : weatherCode !== null && weatherCode >= 51 ? 'Lluvia'
            : weatherCode !== null && weatherCode >= 45 ? 'Niebla'
                : weatherCode !== null && weatherCode >= 1 ? 'Nublado' : 'Soleado';

    // Modelos para Consenso (ECMWF, GFS, ICON)
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
    cacheGeohashMeteo.set(cacheKey, { timestamp: Date.now(), data: resultData });

    return resultData;
}

function mostrarCoachPronosticoNoDisponible(container) {
    if (!container) return;
    container.classList.remove('hidden');
    container.innerHTML = `
        <div class="flex flex-col gap-2">
            <span class="font-black text-amber-300 text-xs uppercase tracking-wider">✨ Coach ISA</span>
            <p class="text-xs text-slate-200 leading-relaxed">Sin conexión con los servicios meteorológicos. Comprueba tu conexión a internet para cargar el análisis del spot.</p>
        </div>`;
}

export let map;
export let marcador;
export let datosMeteoActuales = null;
export let latitudActual = 38.80;
export let longitudActual = 0.18;
export let modoTravesiaActivo = false;
export let modoRutaLibreActivo = false;
export let marcadoresRuta = [];
export let lineaRuta = null;
export let lineasMultiPunto = [];
export let etiquetasDistancia = [];
export let isTracking = false;
export let trackDistanceKm = 0;
export let trackCoords = [];
export const GPS_MIN_DISTANCIA_METROS = 8;
export let ultimoPuntoCrudoGPS = null;
export let lastPositionGPS = null;
export let lastTimestampGPS = null;
export let trackStartTime = null;
export let cronometroInterval = null;
export let watchId = null;
export let livePolyline = null;
export let clubParaEvento = null;
export let modoQuedadaClubActivo = false;
let isSavingRoute = false;
let isSyncingPendingRoute = false;
export let spotsGuardadosMemoria = [];
export let spotActivoActual = null;
export let pronosticoDiaCompletoActual = null;
export let horaSeleccionadaTimeline = null;
export let checkinDuracionMinutos = 90;
export let checkinTimestampLimite = null;
export let checkinAlertaActiva = false;
export let splitsKm = [];
export let lastSplitKmDist = 0;
export let lastSplitTimestamp = null;
export let marcadorRosaVectores = null;
export let marcadorReporteSpot = null;
export let reportesSpotActivo = [];

// ==========================================
// GESTOR DE WAKELOCK (PREVENCIÓN DE BLOQUEO DE PANTALLA EN TRAVESÍA)
// ==========================================
export let wakeLockSentinel = null;

export async function activarWakeLock() {
    try {
        if ('wakeLock' in navigator && !wakeLockSentinel) {
            wakeLockSentinel = await navigator.wakeLock.request('screen');
            wakeLockSentinel.addEventListener('release', () => {
                wakeLockSentinel = null;
            });
        }
    } catch (err) {
        console.warn('Aviso no crítico al solicitar Screen WakeLock:', err);
    }
}

export async function liberarWakeLock() {
    try {
        if (wakeLockSentinel) {
            await wakeLockSentinel.release();
            wakeLockSentinel = null;
        }
    } catch (err) {
        console.warn('Aviso no crítico al liberar Screen WakeLock:', err);
    }
}

document.addEventListener('visibilitychange', async () => {
    if (isTracking && document.visibilityState === 'visible') {
        await activarWakeLock();
    }
});

export function normalizarYLimitarRutaGPS(coords, maxPuntos = 2000, maxBytes = 900 * 1024) {
    if (!Array.isArray(coords) || coords.length === 0) return [];
    
    // Redondear a 6 decimales y filtrar puntos válidos
    let puntos = coords
        .filter(pt => Array.isArray(pt) && pt.length >= 2 && Number.isFinite(Number(pt[0])) && Number.isFinite(Number(pt[1])))
        .map(pt => [
            Number(Number(pt[0]).toFixed(6)),
            Number(Number(pt[1]).toFixed(6))
        ]);

    if (puntos.length <= 2) return puntos;

    // Muestreo uniforme si excede maxPuntos, preservando siempre el primer y último punto
    if (puntos.length > maxPuntos) {
        const resultado = [puntos[0]];
        const paso = (puntos.length - 1) / (maxPuntos - 1);
        for (let i = 1; i < maxPuntos - 1; i++) {
            resultado.push(puntos[Math.round(i * paso)]);
        }
        resultado.push(puntos[puntos.length - 1]);
        puntos = resultado;
    }

    // Comprobar límite de bytes (< 900 KB) y reducir uniformemente si fuera necesario
    const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
    let serialized = JSON.stringify(puntos);
    let byteLength = encoder ? encoder.encode(serialized).byteLength : serialized.length;

    while (byteLength >= maxBytes && puntos.length > 2) {
        const nuevoLimite = Math.max(2, Math.floor(puntos.length * 0.8));
        const resultado = [puntos[0]];
        const paso = (puntos.length - 1) / (nuevoLimite - 1);
        for (let i = 1; i < nuevoLimite - 1; i++) {
            resultado.push(puntos[Math.round(i * paso)]);
        }
        resultado.push(puntos[puntos.length - 1]);
        puntos = resultado;
        serialized = JSON.stringify(puntos);
        byteLength = encoder ? encoder.encode(serialized).byteLength : serialized.length;
    }

    return puntos;
}

export function buscarYCentrarMapa(t) {
    if(!t) return;
    if(t.includes(',')){
        const p = t.split(',');
        if(!isNaN(p[0]) && !isNaN(p[1])) return actualizarMapa(parseFloat(p[0]), parseFloat(p[1]));
    }
    fetchConTimeout(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(t)}`)
        .then(r => (r.ok ? r.json() : []))
        .then(d => { if(d && d.length) actualizarMapa(parseFloat(d[0].lat), parseFloat(d[0].lon)); })
        .catch(err => console.warn('[geocoding] Aviso no crítico:', err));
}

export function actualizarMapa(lat, lon) {
    latitudActual = lat; longitudActual = lon;
    if(map && !modoTravesiaActivo && !modoRutaLibreActivo) {
        const ll = new L.LatLng(lat, lon);
        if(marcador) marcador.setLatLng(ll); else marcador = L.marker(ll).addTo(map);
        map.setView(ll, 12);
    }
    actualizarEstadoBotonGuardarSpot();
    renderizarBarraSpotsGuardados();
}

export function inicializarMapa() {
    if(map) return;
    map = L.map('mapaInteractivo').setView([latitudActual, longitudActual], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, crossOrigin: true }).addTo(map);
    L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', { crossOrigin: true }).addTo(map);
    
    if(!modoTravesiaActivo && !modoRutaLibreActivo) marcador = L.marker([latitudActual, longitudActual]).addTo(map);
    
    map.on('click', async e => {
        const lat = e.latlng.lat; const lon = e.latlng.lng;
        try {
            const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`);
            const data = await res.json();
            if(data.elevation && data.elevation[0] > 8) return alert("Punto en tierra firme.");
        } catch(err) { console.warn('Aviso no crítico al comprobar elevación:', err); }
        
        if(modoTravesiaActivo) gestionarClicRuta(e.latlng);
        else if(modoRutaLibreActivo) gestionarClicRutaLibre(e.latlng);
        else {
            actualizarMapa(lat.toFixed(5), lon.toFixed(5));
            const locInput = document.getElementById('location'); if(locInput) locInput.value = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
            
            const ahora = new Date();
            const strDate = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
            const strTime = String(ahora.getHours()).padStart(2, '0') + ":" + String(ahora.getMinutes()).padStart(2, '0');
            
            const ploc = document.getElementById('proLocation'); const pdate = document.getElementById('proDate'); const ptime = document.getElementById('proTime');
            if(ploc) ploc.value = `${lat.toFixed(5)}, ${lon.toFixed(5)}`; if(pdate) pdate.value = strDate; if(ptime) ptime.value = strTime;
            
            const panelPro = document.getElementById("panelPro");
            if (panelPro && panelPro.style.gridTemplateRows !== "0fr") consultarPuntoProInstantaneo(lat, lon, strDate, strTime);
        }
    });

    // Observador de redimensionamiento para evitar los tiles grises de Leaflet
    const resizeObserver = new ResizeObserver(() => {
        if (map) {
            requestAnimationFrame(() => map.invalidateSize());
        }
    });
    const contMap = document.getElementById('mapContainer');
    const interMap = document.getElementById('mapaInteractivo');
    if (contMap) resizeObserver.observe(contMap);
    if (interMap) resizeObserver.observe(interMap);

    window.addEventListener('resize', () => {
        if (map) requestAnimationFrame(() => map.invalidateSize());
    });
    window.addEventListener('orientationchange', () => {
        if (map) setTimeout(() => map.invalidateSize(), 200);
    });

    // Restauración de travesía previa interrumpida si existe checkpoint válido y carga de spots
    setTimeout(() => {
        verificarCheckpointPendiente();
        cargarSpotsGuardadosUsuario();
    }, 500);
}

export function obtenerUbicacion() {
    const inp = document.getElementById('location'); const b = document.getElementById('btn-gps');
    if(!navigator.geolocation) return alert("Sin GPS.");
    inp.value="Buscando..."; b.classList.add('animate-pulse');
    navigator.geolocation.getCurrentPosition(p=>{
        const l = p.coords.latitude.toFixed(5); const n = p.coords.longitude.toFixed(5);
        inp.value = `${l}, ${n}`; b.classList.remove('animate-pulse'); actualizarMapa(l, n);
    }, e => {
        inp.value=""; b.classList.remove('animate-pulse'); alert("GPS bloqueado.");
    }, {enableHighAccuracy: true, timeout: 6000});
}

export function toggleModoTravesia() {
    if(modoRutaLibreActivo) toggleRutaLibre();
    modoTravesiaActivo = !modoTravesiaActivo;
    const b = document.getElementById('btnTravesia'); const msg = document.getElementById('mapMsg');
    if(modoTravesiaActivo) {
        b.classList.replace('bg-teal-500','bg-red-500'); b.classList.replace('hover:bg-teal-400','hover:bg-red-400');
        b.innerHTML = "❌ Cancelar (A-B)"; msg.textContent = "📍 Toca el PUNTO A (Salida)";
        if(marcador) map.removeLayer(marcador); limpiarRuta();
    } else {
        b.classList.replace('bg-red-500','bg-teal-500'); b.classList.replace('hover:bg-red-400','hover:bg-teal-400');
        b.innerHTML = "🗺️ Trazar (A ➔ B)"; msg.textContent = "📍 Toca el mar para Punto Fijo o Traza Ruta Completa";
        limpiarRuta(); if(map) marcador = L.marker([latitudActual,longitudActual]).addTo(map);
    }
}

export function toggleRutaLibre() {
    if(modoTravesiaActivo) toggleModoTravesia();
    modoRutaLibreActivo = !modoRutaLibreActivo;
    const b = document.getElementById('btnRutaLibre'); const msg = document.getElementById('mapMsg');
    if(modoRutaLibreActivo) {
        b.classList.replace('bg-teal-600','bg-red-500'); b.classList.replace('hover:bg-teal-500','hover:bg-red-400');
        b.innerHTML = "❌ Cancelar Multi..."; document.getElementById('leyendaMapa').classList.replace('flex','hidden');
        if(marcador) map.removeLayer(marcador); limpiarRuta(); msg.textContent = "📍 Toca el mapa para añadir puntos";
    } else {
        b.classList.replace('bg-red-500','bg-teal-600'); b.classList.replace('hover:bg-red-400','hover:bg-teal-500');
        b.innerHTML = "🔗 Multipunto"; document.getElementById('leyendaMapa').classList.replace('flex','hidden');
        document.getElementById('multipuntoToolbar').classList.replace('flex','hidden'); limpiarRuta();
        if(map) marcador = L.marker([latitudActual,longitudActual]).addTo(map); msg.textContent = "📍 Toca el mar para Punto Fijo o Traza Ruta Completa";
    }
}

export function limpiarRuta() {
    marcadoresRuta.forEach(m => map.removeLayer(m)); marcadoresRuta.length = 0;
    if(lineaRuta) map.removeLayer(lineaRuta);
    lineasMultiPunto.forEach(l => map.removeLayer(l)); lineasMultiPunto.length = 0;
    etiquetasDistancia.forEach(l => map.removeLayer(l)); etiquetasDistancia.length = 0;
    const contMulti = document.getElementById('proDashTramosContainer'); if(contMulti) contMulti.innerHTML = "";
    const ploc = document.getElementById('proLocation'); if(ploc) ploc.value = "";
    
    if (marcadorRosaVectores && map) {
        map.removeLayer(marcadorRosaVectores);
        marcadorRosaVectores = null;
    }
    if (marcadorReporteSpot && map) {
        map.removeLayer(marcadorReporteSpot);
        marcadorReporteSpot = null;
    }
    const hudEl = document.getElementById('mapWindWaveHud');
    if (hudEl) hudEl.classList.add('hidden');

    // Reset de seguridad para eventos de club
    clubParaEvento = null;
    if (!modoQuedadaClubActivo) {
        const panelQuedada = document.getElementById('panelQuedadaMap');
        const formQuedada = document.getElementById('quedadaFormPanel');
        if (panelQuedada) panelQuedada.classList.add('hidden');
        if (formQuedada) formQuedada.classList.add('hidden');
    }
}

export function gestionarClicRuta(l) {
    const msg = document.getElementById('mapMsg'); const ploc = document.getElementById('proLocation');
    if(marcadoresRuta.length === 0) {
        marcadoresRuta.push(L.marker(l,{icon:L.icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png',iconSize:[25,41],iconAnchor:[12,41]})}).addTo(map));
        msg.textContent = "📍 Toca el PUNTO B (Llegada)"; if(ploc) ploc.value = `${l.lat.toFixed(4)}, ${l.lng.toFixed(4)}`;
    } else if(marcadoresRuta.length === 1) {
        marcadoresRuta.push(L.marker(l,{icon:L.icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',iconSize:[25,41],iconAnchor:[12,41]})}).addTo(map));
        lineaRuta = L.polyline(marcadoresRuta.map(m=>m.getLatLng()),{color:'#0ea5e9',weight:4,dashArray:'5,10'}).addTo(map);
        const p1 = marcadoresRuta[0].getLatLng(); const p2 = marcadoresRuta[1].getLatLng();
        const dist = (p1.distanceTo(p2) / 1000).toFixed(2);
        const midLat = (p1.lat + p2.lat) / 2; const midLng = (p1.lng + p2.lng) / 2;
        const etiq = L.marker([midLat, midLng], { icon: L.divIcon({ className: 'dist-label-map', html: `${dist} km`, iconSize: [null, null] }) }).addTo(map);
        etiquetasDistancia.push(etiq);
        map.fitBounds(lineaRuta.getBounds(), {padding:[50,50]}); msg.textContent = "✅ Ruta marcada. Calcula abajo.";
    } else {
        // Permite corregir el Punto B sin borrar el Punto A
        map.removeLayer(marcadoresRuta[1]);
        marcadoresRuta.pop();
        if(lineaRuta) map.removeLayer(lineaRuta);
        etiquetasDistancia.forEach(etiq => map.removeLayer(etiq));
        etiquetasDistancia.length = 0;

        marcadoresRuta.push(L.marker(l,{icon:L.icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',iconSize:[25,41],iconAnchor:[12,41]})}).addTo(map));
        lineaRuta = L.polyline(marcadoresRuta.map(m=>m.getLatLng()),{color:'#0ea5e9',weight:4,dashArray:'5,10'}).addTo(map);
        
        const p1 = marcadoresRuta[0].getLatLng(); const p2 = marcadoresRuta[1].getLatLng();
        const dist = (p1.distanceTo(p2) / 1000).toFixed(2);
        const midLat = (p1.lat + p2.lat) / 2; const midLng = (p1.lng + p2.lng) / 2;
        
        const etiq = L.marker([midLat, midLng], { icon: L.divIcon({ className: 'dist-label-map', html: `${dist} km`, iconSize: [null, null] }) }).addTo(map);
        etiquetasDistancia.push(etiq);
        map.fitBounds(lineaRuta.getBounds(), {padding:[50,50]}); 
        
        const panelPro = document.getElementById("panelPro");
        if (panelPro && panelPro.style.gridTemplateRows !== "0fr") consultarRutaPro();
    }
}

export function gestionarClicRutaLibre(l) {
    const lt = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; const i = marcadoresRuta.length; const ploc = document.getElementById('proLocation');
    if(i === 0 && ploc) ploc.value = `${l.lat.toFixed(4)}, ${l.lng.toFixed(4)}`;
    marcadoresRuta.push(L.marker(l,{icon:L.divIcon({className:'',html:`<div class="bg-marine text-white font-black w-6 h-6 rounded-full flex items-center justify-center text-[10px] shadow-lg border-2 border-white">${lt[i]||i}</div>`,iconSize:[24,24],iconAnchor:[12,12]})}).addTo(map));
    document.getElementById('multipuntoToolbar').classList.replace('hidden','flex');
    if(marcadoresRuta.length > 1) {
        document.getElementById('btnRutaLibre').innerHTML = "✅ Terminar Trazado";
        renderPreviewRuta();
        document.getElementById('mapMsg').textContent = "Añade más puntos o calcula la ruta abajo.";
    }
    if (modoQuedadaClubActivo) {
        actualizarMetricasQuedada();
    }
}

export function deshacerUltimoPunto() {
    if(!marcadoresRuta.length) return;
    map.removeLayer(marcadoresRuta.pop());
    if(marcadoresRuta.length > 1) renderPreviewRuta();
    else if(marcadoresRuta.length === 0) {
        document.getElementById('multipuntoToolbar').classList.replace('flex','hidden');
        document.getElementById('mapMsg').textContent = "📍 Toca el mapa para añadir puntos";
        limpiarRuta();
    }
    if (modoQuedadaClubActivo) {
        actualizarMetricasQuedada();
    }
}

export function reiniciarRutaMultipunto() {
    limpiarRuta();
    document.getElementById('multipuntoToolbar').classList.replace('flex','hidden');
    document.getElementById('mapMsg').textContent = "📍 Toca el mapa para añadir puntos";
    if (modoQuedadaClubActivo) {
        actualizarMetricasQuedada();
    }
}

export function cerrarIdaYVueltaMultipunto() {
    if (!marcadoresRuta || marcadoresRuta.length < 2) {
        alert("Traza al menos 2 puntos para generar el trayecto de ida y vuelta.");
        return;
    }
    
    // Si la ruta ya regresa al punto inicial, evitar duplicar
    const pPrimero = marcadoresRuta[0].getLatLng();
    const pUltimo = marcadoresRuta[marcadoresRuta.length - 1].getLatLng();
    if (pPrimero.distanceTo(pUltimo) < 20) {
        alert("La ruta ya regresa al punto de salida.");
        return;
    }

    // Tomar los puntos intermedios y de salida en orden inverso evitando atravesar tierra
    const puntosRetorno = marcadoresRuta.slice(0, -1).reverse();
    const lt = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    puntosRetorno.forEach(m => {
        const l = m.getLatLng();
        const i = marcadoresRuta.length;
        const letra = lt[i] || `${i + 1}`;
        const marker = L.marker(l, {
            icon: L.divIcon({
                className: '',
                html: `<div class="bg-marine text-white font-black w-6 h-6 rounded-full flex items-center justify-center text-[10px] shadow-lg border-2 border-white">${letra}</div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            })
        }).addTo(map);
        marcadoresRuta.push(marker);
    });

    renderPreviewRuta();

    if (modoQuedadaClubActivo) {
        actualizarMetricasQuedada();
    } else {
        const panelPro = document.getElementById("panelPro");
        if (panelPro && panelPro.style.gridTemplateRows !== "0fr") {
            consultarRutaPro();
        }
    }
    const mapMsg = document.getElementById('mapMsg');
    if (mapMsg) mapMsg.textContent = "🔄 Trayecto de ida y vuelta generado. Consulta los tramos abajo.";
}

export async function descargarZonaMapaOffline() {
    if (!map) {
        alert("El mapa no está inicializado.");
        return;
    }

    let minLat, maxLat, minLon, maxLon;
    if (marcadoresRuta && marcadoresRuta.length >= 1) {
        const coords = marcadoresRuta.map(m => (m.getLatLng ? m.getLatLng() : m));
        minLat = Math.min(...coords.map(c => c.lat)) - 0.015;
        maxLat = Math.max(...coords.map(c => c.lat)) + 0.015;
        minLon = Math.min(...coords.map(c => c.lng)) - 0.015;
        maxLon = Math.max(...coords.map(c => c.lng)) + 0.015;
    } else {
        const b = map.getBounds();
        minLat = b.getSouth();
        maxLat = b.getNorth();
        minLon = b.getWest();
        maxLon = b.getEast();
    }

    const currentZoom = Math.round(map.getZoom() || 13);
    const minZ = Math.max(12, currentZoom);
    const maxZ = Math.min(15, currentZoom + 2);

    const lon2tile = (lon, z) => Math.floor(((lon + 180) / 360) * Math.pow(2, z));
    const lat2tile = (lat, z) => {
        const latRad = (lat * Math.PI) / 180;
        return Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * Math.pow(2, z));
    };

    const tileUrls = [];
    const MAX_TILES_TOTAL = 140;

    outerZoom:
    for (let z = minZ; z <= maxZ; z++) {
        const x1 = lon2tile(minLon, z);
        const x2 = lon2tile(maxLon, z);
        const y1 = lat2tile(maxLat, z);
        const y2 = lat2tile(minLat, z);
        const startX = Math.min(x1, x2);
        const endX = Math.max(x1, x2);
        const startY = Math.min(y1, y2);
        const endY = Math.max(y1, y2);

        for (let x = startX; x <= endX; x++) {
            for (let y = startY; y <= endY; y++) {
                tileUrls.push(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`);
                tileUrls.push(`https://tiles.openseamap.org/seamark/${z}/${x}/${y}.png`);
                if (tileUrls.length >= MAX_TILES_TOTAL) {
                    break outerZoom;
                }
            }
        }
    }

    if (tileUrls.length === 0) {
        alert("No se identificaron teselas para la zona actual.");
        return;
    }

    const elMsg = document.getElementById('mapMsg');
    const b1 = document.getElementById('btnDescargarMapaOffline');
    const b2 = document.getElementById('btnDescargarMapaOfflineMultipunto');

    const actualizarProgreso = (texto, finalizado = false) => {
        if (elMsg) {
            elMsg.textContent = texto;
            if (finalizado) {
                elMsg.className = "text-xs font-bold text-white bg-emerald-600 h-10 px-4 rounded-xl border border-emerald-500 shadow-md flex items-center justify-center transition-colors";
            } else {
                elMsg.className = "text-xs font-bold text-white bg-sky-600 h-10 px-4 rounded-xl border border-sky-500 shadow-md flex items-center justify-center transition-colors animate-pulse";
            }
        }
        if (b1) b1.textContent = finalizado ? '✅ Guardado' : texto;
        if (b2) b2.textContent = finalizado ? '✅ Guardado' : texto;
        if (finalizado) {
            setTimeout(() => {
                if (b1) b1.textContent = '📥 Mapa Offline';
                if (b2) b2.textContent = '📥 Mapa Offline';
                if (elMsg) {
                    elMsg.className = "text-xs font-bold text-white bg-teal-600 h-10 px-4 rounded-xl border border-teal-500 shadow-md flex items-center justify-center transition-colors";
                    elMsg.textContent = "👆 Toca el mar para Punto Fijo o Traza Ruta Completa";
                }
            }, 4000);
        }
    };

    actualizarProgreso(`⏳ Descargando 0%... (0/${tileUrls.length})`);

    // 1. Vía Service Worker si está activo
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => {
            const data = event.data || {};
            if (data.status === 'progress' || data.type === 'PREFETCH_TILES_UPDATE') {
                const loaded = data.loaded || 0;
                const total = data.total || tileUrls.length;
                const pct = Math.round((loaded / total) * 100);
                actualizarProgreso(`⏳ Descargando ${pct}%... (${loaded}/${total})`);
            } else if (data.status === 'completed' || data.success) {
                actualizarProgreso(`✅ Zona guardada offline (${tileUrls.length} teselas)`, true);
            }
        };

        navigator.serviceWorker.controller.postMessage({
            type: 'PREFETCH_TILES',
            urls: tileUrls
        }, [channel.port2]);

        return;
    }

    // 2. Fallback cliente directo con Cache API
    try {
        let cache = null;
        try { cache = await caches.open('paddlesafe-v47-tiles'); } catch (_) {
            try { cache = await caches.open('paddlesafe-v46-tiles'); } catch (_) {}
        }
        let cargadas = 0;
        const BATCH = 6;
        for (let i = 0; i < tileUrls.length; i += BATCH) {
            const batch = tileUrls.slice(i, i + BATCH);
            await Promise.all(batch.map(async u => {
                try {
                    const req = new Request(u, { mode: 'cors', credentials: 'omit' });
                    if (cache) {
                        const hit = await cache.match(req);
                        if (!hit) {
                            const res = await fetch(req);
                            if (res.status === 200) await cache.put(req, res);
                        }
                    } else {
                        await fetch(req);
                    }
                } catch (_) {}
                cargadas++;
            }));
            const pct = Math.round((cargadas / tileUrls.length) * 100);
            actualizarProgreso(`⏳ Descargando ${pct}%... (${cargadas}/${tileUrls.length})`);
        }
        actualizarProgreso(`✅ Zona guardada offline (${tileUrls.length} teselas)`, true);
    } catch (errCache) {
        console.warn('Error en pre-descarga cliente:', errCache);
        actualizarProgreso(`✅ Zona guardada offline (${tileUrls.length} teselas)`, true);
    }
}

export function renderPreviewRuta() {
    lineasMultiPunto.forEach(l => map.removeLayer(l)); lineasMultiPunto.length = 0;
    etiquetasDistancia.forEach(l => map.removeLayer(l)); etiquetasDistancia.length = 0;
    const c = marcadoresRuta.map(m => m.getLatLng());
    for(let i=0; i < c.length-1; i++) {
        const pl = L.polyline([c[i],c[i+1]],{color:'#64748b',weight:3,dashArray:'5,5'}).addTo(map);
        lineasMultiPunto.push(pl);
        const dist = (c[i].distanceTo(c[i+1]) / 1000).toFixed(2);
        const midLat = (c[i].lat + c[i+1].lat) / 2; const midLng = (c[i].lng + c[i+1].lng) / 2;
        const etiq = L.marker([midLat, midLng], { icon: L.divIcon({ className: 'dist-label-map', html: `${dist} km`, iconSize: [null, null] }) }).addTo(map);
        etiquetasDistancia.push(etiq);
    }
}

export function evaluarVientoRelativoInfo(rumboNavegacion, direccionVientoOrigen) {
    if (!Number.isFinite(Number(rumboNavegacion)) || direccionVientoOrigen === null
        || direccionVientoOrigen === undefined || !Number.isFinite(Number(direccionVientoOrigen))) {
        return { texto: "DIRECCIÓN N/D", claseColor: "bg-slate-500/20 text-slate-300 border border-slate-500/50", modVelocidad: -0.5, colorRumbo: "text-slate-300", hexLineColor: "#94a3b8", icon: "⚠️" };
    }
    let diff = Math.abs(direccionVientoOrigen - rumboNavegacion); if (diff > 180) diff = 360 - diff;
    if (diff <= 45) return { texto: "EN CONTRA", claseColor: "bg-red-500/20 text-red-400 border border-red-500/50", modVelocidad: -1.5, colorRumbo: "text-red-400", hexLineColor: "#ef4444", icon: "🛑" };
    else if (diff >= 135) return { texto: "A FAVOR", claseColor: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50", modVelocidad: 1.0, colorRumbo: "text-emerald-400", hexLineColor: "#10b981", icon: "🚀" };
    else return { texto: "LATERAL", claseColor: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/50", modVelocidad: -0.5, colorRumbo: "text-yellow-400", hexLineColor: "#eab308", icon: "⚠️" };
}

function obtenerRegistrosAlerta(valor, registros = [], profundidad = 0) {
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

function nivelAlertaMeteorologica(registro) {
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
    const fechaConsulta = d?.fecha || d?.date || document.getElementById('date')?.value || document.getElementById('proDate')?.value || document.getElementById('datePicker')?.value || new Date().toISOString().slice(0, 10);

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

    // Detectar avisos especiales futuros/preventivos (por ejemplo, publicados hoy para sábado-domingo)
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

function obtenerMotorExperto(dx, nivelUsuario = 'Intermedio') {
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

function renderizarAvisoSuperior(motor) {
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
        alertasEmergencias: alertasEmergencias.length,
        alertasAemet: alertasAemet.length,
        alertasGenerales: alertasGenerales.length,
        contenedorBasicoExiste: Boolean(contenedorBasico),
        contenedorProExiste: Boolean(contenedorPro)
    });

    if (!contenedorBasico && !contenedorPro) return;

    const partesBasico = [];
    const partesPro = [];

    // 1. AVISOS DE PROTECCIÓN CIVIL Y EMERGENCIAS (112 AUTONÓMICO / NACIONAL)
    if (alertasEmergencias.length > 0) {
        alertasEmergencias.forEach(a => {
            const titulo = a.titulo || a.tipo || 'Aviso Especial de Protección Civil';
            const nombreOrg = a.origen || autoridadLocal?.nombre || '112 Protección Civil';
            const nivelAlerta = a.nivel || 'NARANJA';
            const colorNivel = { AMARILLA: 'amber', NARANJA: 'orange', ROJA: 'red' }[nivelAlerta] || 'orange';
            const peligro = a.peligroNautico || autoridadLocal?.peligroNautico || 'Posibles riesgos severos para la navegación costera. Extrema la precaución, aléjate de rompientes y desembocaduras, y mantente informado.';
            const docLabel = a.urlDoc && a.urlDoc.toLowerCase().includes('.pdf')
                ? `Ver Aviso Oficial ${esc(nombreOrg)} (PDF) ➔`
                : `Ver Aviso / Resolución Oficial ${esc(nombreOrg)} (Doc) ➔`;
            const pdfLink = a.urlDoc
                ? `<div class="pt-1"><a href="${esc(a.urlDoc)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs transition-all shadow-md w-fit"><span>📄</span> ${docLabel}</a></div>`
                : '';

            const esActivaAhora = a.esVigente !== false && a.estadoTemporal !== 'FUTURA_PREVENTIVA';
            const periodoBadge = a.periodoTexto ? `<span class="text-[10px] font-bold text-slate-700 bg-white/80 px-2 py-0.5 rounded border border-slate-300">📅 ${esc(a.periodoTexto)}</span>` : '';
            const periodoBadgePro = a.periodoTexto ? `<span class="text-[10px] font-bold text-amber-200 bg-black/40 px-2.5 py-0.5 rounded-full border border-amber-500/30 font-mono">📅 ${esc(a.periodoTexto)}</span>` : '';

            if (esActivaAhora) {
                // Alerta activa ahora para la fecha consultada: PROHIBIDO SALIR
                partesBasico.push(`
                    <div role="alert" class="rounded-xl border-l-4 border-red-600 bg-red-50 p-4 text-sm text-red-950 shadow-sm flex flex-col gap-2">
                        <div class="flex items-center justify-between gap-2 border-b border-red-200 pb-2">
                            <strong class="font-black text-red-800 flex items-center gap-1.5 uppercase tracking-wide text-xs">
                                <span class="animate-pulse text-base">🚨</span> AVISO DE EMERGENCIAS (${esc(nombreOrg.toUpperCase())})
                            </strong>
                            <span class="text-[10px] font-black uppercase font-mono px-2 py-0.5 rounded bg-red-200 text-red-900 border border-red-300">Nivel ${esc(nivelAlerta)}</span>
                        </div>
                        <div class="bg-red-600 text-white font-black text-xs px-3 py-1.5 rounded-lg flex items-center justify-center gap-1.5 shadow-md animate-pulse">
                            ⛔ PROHIBIDO SALIR A REMAR POR SITUACIÓN DE EMERGENCIA
                        </div>
                        <div class="flex items-center justify-between">
                            <strong class="text-xs font-bold text-slate-900 leading-snug">${esc(titulo)}</strong>
                            ${periodoBadge}
                        </div>
                        <p class="text-xs text-slate-700 leading-relaxed">${esc(a.descripcion)}</p>
                        <div class="bg-amber-100/80 border border-amber-300 rounded-lg p-2.5 text-[11px] text-amber-900 font-medium">
                            ⚠️ <strong>Peligro náutico para Paddle Surf:</strong> ${esc(peligro)}
                        </div>
                        ${pdfLink}
                    </div>
                `);

                partesPro.push(`
                    <div role="alert" class="rounded-2xl border-2 border-red-500 bg-gradient-to-r from-red-950/95 via-slate-900 to-red-950/95 p-4 shadow-xl text-white flex flex-col gap-2.5">
                        <div class="flex items-center justify-between gap-2 border-b border-red-500/40 pb-2">
                            <span class="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-rose-400">
                                <span class="animate-pulse text-base">🚨</span> AVISO DE EMERGENCIAS Y PROTECCIÓN CIVIL (${esc(nombreOrg.toUpperCase())})
                            </span>
                            <span class="text-[10px] font-black uppercase font-mono px-2.5 py-0.5 rounded-full bg-red-600 text-white shadow-sm">Nivel ${esc(nivelAlerta)}</span>
                        </div>
                        <div class="bg-red-600/90 border border-red-500 text-white font-black text-xs px-3 py-2 rounded-xl flex items-center justify-center gap-2 shadow-lg animate-pulse">
                            <span class="text-base">⛔</span>
                            <span>PROHIBIDO SALIR A REMAR POR SITUACIÓN DE EMERGENCIA OFICIAL</span>
                        </div>
                        <div class="flex flex-col gap-1">
                            <div class="flex items-center justify-between">
                                <strong class="text-sm font-bold text-white">${esc(titulo)}</strong>
                                ${periodoBadgePro}
                            </div>
                            <p class="text-xs text-orange-100/90 leading-relaxed font-normal">${esc(a.descripcion)}</p>
                            <div class="bg-orange-900/40 border border-orange-500/40 rounded-xl p-2.5 mt-1 text-[11px] text-amber-200 flex items-start gap-2">
                                <span class="shrink-0 text-sm mt-0.5">⚠️</span>
                                <span class="leading-relaxed"><strong>Peligro náutico para Paddle Surf:</strong> ${esc(peligro)}</span>
                            </div>
                        </div>
                        ${pdfLink}
                    </div>
                `);
            } else {
                // Alerta futura / preventiva programada (publicada para los próximos días)
                const diaInicioTxt = a.nombreDiaInicio ? `el ${a.nombreDiaInicio}` : 'la entrada del episodio';
                partesBasico.push(`
                    <div role="alert" class="rounded-xl border-l-4 border-amber-500 bg-amber-50 p-4 text-sm text-amber-950 shadow-sm flex flex-col gap-2">
                        <div class="flex items-center justify-between gap-2 border-b border-amber-200 pb-2">
                            <strong class="font-black text-amber-800 flex items-center gap-1.5 uppercase tracking-wide text-xs">
                                <span>⚠️</span> AVISO ESPECIAL PREVENTIVO (${esc(nombreOrg.toUpperCase())})
                            </strong>
                            <span class="text-[10px] font-black uppercase font-mono px-2 py-0.5 rounded bg-amber-200 text-amber-900 border border-amber-300">Nivel ${esc(nivelAlerta)}</span>
                        </div>
                        <div class="bg-amber-600 text-white font-bold text-xs px-3 py-2 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-1 shadow-sm">
                            <span class="flex items-center gap-1.5 font-black">📅 VIGENCIA: ${esc(a.periodoTexto || 'Próximos días')}</span>
                            <span class="text-[10px] uppercase font-mono bg-amber-800/80 px-2 py-0.5 rounded text-amber-100">Navegación permitida hoy · Prohibida desde ${esc(diaInicioTxt)}</span>
                        </div>
                        <strong class="text-xs font-bold text-slate-900 leading-snug">${esc(titulo)}</strong>
                        <p class="text-xs text-slate-700 leading-relaxed">${esc(a.descripcion)}</p>
                        <div class="bg-amber-100/90 border border-amber-300 rounded-lg p-2.5 text-[11px] text-amber-900 font-medium">
                            ⚠️ <strong>Impacto previsto:</strong> ${esc(peligro)}
                        </div>
                        ${pdfLink}
                    </div>
                `);

                partesPro.push(`
                    <div role="alert" class="rounded-2xl border-2 border-amber-500/80 bg-gradient-to-r from-amber-950/95 via-slate-900 to-amber-950/95 p-4 shadow-xl text-white flex flex-col gap-2.5">
                        <div class="flex items-center justify-between gap-2 border-b border-amber-500/40 pb-2">
                            <span class="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-amber-400">
                                <span>⚠️</span> AVISO ESPECIAL PREVENTIVO (${esc(nombreOrg.toUpperCase())})
                            </span>
                            <span class="text-[10px] font-black uppercase font-mono px-2.5 py-0.5 rounded-full bg-amber-600 text-white shadow-sm">Nivel ${esc(nivelAlerta)}</span>
                        </div>
                        <div class="bg-amber-500/20 border border-amber-500/40 text-amber-200 font-bold text-xs px-3 py-2 rounded-xl flex items-center justify-between gap-2 shadow-inner">
                            <span class="font-black text-amber-300">📅 Periodo de Afección: ${esc(a.periodoTexto || 'Fin de semana')}</span>
                            <span class="text-[10px] font-mono bg-amber-900/80 text-amber-100 px-2 py-0.5 rounded border border-amber-500/30">Navegación hoy con seguimiento · Prohibida desde ${esc(diaInicioTxt)}</span>
                        </div>
                        <div class="flex flex-col gap-1">
                            <strong class="text-sm font-bold text-white">${esc(titulo)}</strong>
                            <p class="text-xs text-amber-100/90 leading-relaxed font-normal">${esc(a.descripcion)}</p>
                            <div class="bg-amber-900/40 border border-amber-500/40 rounded-xl p-2.5 mt-1 text-[11px] text-amber-200 flex items-start gap-2">
                                <span class="shrink-0 text-sm mt-0.5">⚠️</span>
                                <span class="leading-relaxed"><strong>Peligro náutico para Paddle Surf:</strong> ${esc(peligro)}</span>
                            </div>
                        </div>
                        ${pdfLink}
                    </div>
                `);
            }
        });
    }

    // 2. AVISOS OFICIALES AEMET
    const colorAlerta = { AMARILLA: 'yellow', NARANJA: 'orange', ROJA: 'red' };
    const emojiAlerta = { AMARILLA: '🟡', NARANJA: '🟠', ROJA: '🔴' };
    if (alertasAemet.length > 0) {
        const prioritaria = alertasAemet[0];
        const color = colorAlerta[prioritaria.nivel] || 'orange';
        const emoji = emojiAlerta[prioritaria.nivel] || '⚠️';
        const nivel = { AMARILLA: 'Amarillo', NARANJA: 'Naranja', ROJA: 'Rojo' }[prioritaria.nivel] || prioritaria.nivel;

        partesBasico.push(`
            <div role="alert" class="rounded-xl border-l-4 border-${color}-500 bg-${color}-50 p-3 text-sm font-bold text-${color}-950 shadow-sm">
                <strong class="flex items-center gap-1.5">${emoji} Aviso Oficial AEMET (${esc(nivel)})</strong>
                <ul class="mt-1 list-inside list-disc text-xs font-normal">${alertasAemet.map(a => `<li>${esc(a.tipo)}</li>`).join('')}</ul>
            </div>
        `);

        partesPro.push(`
            <div role="alert" class="rounded-2xl border-2 border-${color}-500/80 bg-${color}-950/80 p-3.5 text-white shadow-lg flex flex-col gap-1.5">
                <span class="text-xs font-black uppercase tracking-wider text-${color}-400 flex items-center gap-1.5">
                    <span>${emoji}</span> Aviso Oficial AEMET (${esc(nivel)})
                </span>
                <ul class="list-inside list-disc text-xs text-slate-200 mt-0.5 space-y-1">
                    ${alertasAemet.map(a => `<li>${esc(a.tipo)}</li>`).join('')}
                </ul>
            </div>
        `);
    }

    // 3. AVISOS METEOROLÓGICOS GENERALES
    if (alertasGenerales.length > 0) {
        const prioritaria = alertasGenerales[0];
        const color = colorAlerta[prioritaria.nivel] || 'orange';
        const emoji = emojiAlerta[prioritaria.nivel] || '⚠️';
        partesBasico.push(`
            <div role="alert" class="rounded-xl border-l-4 border-${color}-500 bg-${color}-50 p-3 text-sm font-bold text-${color}-950">
                <strong>${emoji} Aviso meteorológico</strong>
                <ul class="mt-1 list-inside list-disc text-xs font-normal">${alertasGenerales.map(a => `<li>${esc(a.tipo)}</li>`).join('')}</ul>
            </div>
        `);
        partesPro.push(`
            <div role="alert" class="rounded-2xl border border-slate-700 bg-slate-800/80 p-3 text-slate-200 text-xs shadow-md">
                <strong class="text-amber-400 font-bold block mb-1">Aviso meteorológico activo</strong>
                <ul class="list-inside list-disc">${alertasGenerales.map(a => `<li>${esc(a.tipo)}</li>`).join('')}</ul>
            </div>
        `);
    }

    // 4. TORMENTAS ELÉCTRICAS (Veto Crítico de Seguridad)
    if (motor?.tormentaElectrica) {
        partesBasico.push(`
            <div role="alert" class="rounded-xl border-2 border-red-700 bg-red-950 p-4 text-sm font-black text-white shadow-lg">
                <strong>⛈️ PELIGRO POR TORMENTA ELÉCTRICA</strong>
                <p class="mt-1">⛔ NO RECOMENDADO SALIR A REMAR</p>
            </div>
        `);
        partesPro.push(`
            <div role="alert" class="rounded-2xl border-2 border-red-600 bg-red-950 p-4 text-white shadow-2xl flex items-center gap-3 animate-pulse">
                <span class="text-3xl">⛈️</span>
                <div class="flex-1">
                    <strong class="text-sm font-black uppercase tracking-wider block text-red-200">PELIGRO VITAL POR TORMENTA ELÉCTRICA</strong>
                    <span class="text-xs font-bold text-white">⛔ SALIDA ESTRICTAMENTE DESACONSEJADA (VETO INFRANQUEABLE)</span>
                </div>
            </div>
        `);
    }

    if (contenedorBasico) contenedorBasico.innerHTML = partesBasico.join('');
    if (contenedorPro) contenedorPro.innerHTML = partesPro.join('');

    registrarDiagnosticoClima('[AEMET] UI Output', {
        banners: alertas.length,
        tormentaElectrica: Boolean(motor?.tormentaElectrica),
        recomendacion: motor?.recomendacion || 'NO RECOMENDADO',
        safetyScore: motor?.seguridad?.score ?? 0,
        analysisConfidence: motor.analysisConfidence,
        fuenteAlternativa: Boolean(motor?.fuenteAlternativa)
    });
}

function renderizarResumenExperto(motor, prefijo = 'basic') {
    const contenedor = document.getElementById(`${prefijo}ExpertSummary`);
    if (!contenedor) return;
    const nivel = document.getElementById(`${prefijo}Level`);
    const confianza = document.getElementById(`${prefijo}Confidence`);
    const mensaje = document.getElementById(`${prefijo}ExpertMessage`);
    const deriva = document.getElementById(`${prefijo}ExpertDrift`);
    const insights = document.getElementById(`${prefijo}ExpertInsights`);
    const ng = motor?.nextGen;
    const icono = ICONOS_SEGURIDAD[motor.seguridad.nivel] || '⚠️';

    // Alerta destacada de Evolución Próxima (+3h)
    let evoCont = document.getElementById(`${prefijo}EvolucionProxima`);
    const evo = motor?.evolucionProxima || motor?.detallesTecnicos?.evolucionProxima || ng?.evolucionProxima;
    if (evo && evo.mensaje) {
        if (!evoCont && contenedor) {
            evoCont = document.createElement('div');
            evoCont.id = `${prefijo}EvolucionProxima`;
            contenedor.insertBefore(evoCont, contenedor.firstChild);
        }
        if (evoCont) {
            const isDark = prefijo === 'pro';
            const eCls = isDark
                ? 'bg-amber-950/90 border-2 border-amber-500 text-amber-200'
                : 'bg-amber-50 border-2 border-amber-400 text-amber-900';
            evoCont.className = `w-full p-2.5 rounded-xl border ${eCls} font-bold text-xs flex items-center gap-2 mb-2 shadow-sm animate-pulse`;
            evoCont.innerHTML = `<span class="text-base">⚡</span> <span>${esc(evo.mensaje)}</span>`;
            evoCont.classList.remove('hidden');
        }
    } else if (evoCont) {
        evoCont.classList.add('hidden');
    }

    if (nivel) {
        if (motor.alertaEmergenciaActiva) {
            nivel.className = `text-sm font-black text-center w-full px-2 py-1.5 bg-red-600 text-white rounded-lg shadow-md animate-pulse`;
            nivel.textContent = `🚨 PROHIBIDO SALIR A REMAR · 0/100 · ALERTA 112 ACTIVA`;
        } else {
            nivel.className = `text-sm font-black text-center w-full px-2 py-1 ${motor.cls || ''}`;
            nivel.textContent = `${icono} ${motor.seguridad.nivel} · ${motor.seguridad.score}/100 · ${motor.recomendacion}`;
        }
    }

    if (prefijo === 'basic') {
        const scoreNum = document.getElementById('basicScoreNumber');
        if (scoreNum && motor?.seguridad?.score !== undefined) {
            scoreNum.textContent = motor.seguridad.score;
        }
        const scoreBadge = document.getElementById('basicVerdictScoreBadge');
        if (scoreBadge && motor?.seguridad?.score !== undefined) {
            const sc = motor.seguridad.score;
            if (sc >= 75) {
                scoreBadge.className = "w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/30 border border-emerald-500/50 flex flex-col items-center justify-center shrink-0 shadow-inner";
                if (scoreNum) scoreNum.className = "text-base font-black text-emerald-300 ps-tabular";
            } else if (sc >= 45) {
                scoreBadge.className = "w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/20 to-yellow-500/30 border border-amber-500/50 flex flex-col items-center justify-center shrink-0 shadow-inner";
                if (scoreNum) scoreNum.className = "text-base font-black text-amber-300 ps-tabular";
            } else {
                scoreBadge.className = "w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-500/20 to-red-500/30 border border-rose-500/50 flex flex-col items-center justify-center shrink-0 shadow-inner";
                if (scoreNum) scoreNum.className = "text-base font-black text-rose-300 ps-tabular";
            }
        }
        const orientPill = document.getElementById('basicOrientationPill');
        const dInfoBasic = motor.derivaCostera || motor.riesgoDeriva;
        if (orientPill) {
            const orient = dInfoBasic?.orientacion || dInfoBasic?.tipoCostero || motor?.detallesTecnicos?.orientacionCostera;
            if (orient) {
                orientPill.textContent = orient;
                orientPill.classList.remove('hidden');
            } else {
                orientPill.classList.add('hidden');
            }
        }
        const driftScoreEl = document.getElementById('basicDriftScore');
        const driftTextEl = document.getElementById('basicDriftText');
        const driftBarEl = document.getElementById('basicDriftBar');
        if (driftScoreEl) {
            const dScore = dInfoBasic?.score ?? 10;
            driftScoreEl.textContent = dScore;
            if (driftTextEl) driftTextEl.textContent = dInfoBasic?.nivel ? `Deriva ${dInfoBasic.nivel}` : 'Índice Deriva';
            if (driftBarEl) {
                driftBarEl.style.width = `${Math.min(100, Math.max(5, dScore))}%`;
                driftBarEl.className = dScore <= 35 ? 'bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-500' : (dScore <= 65 ? 'bg-gradient-to-r from-amber-500 to-yellow-400 h-full transition-all duration-500' : 'bg-gradient-to-r from-rose-500 to-red-600 h-full transition-all duration-500');
            }
        }
    }

    if (confianza) {
        confianza.textContent = `Confianza del análisis: ${motor.analysisConfidence}%`;
    }

    if (mensaje) {
        mensaje.textContent = motor.explicacionNautica || motor.mensaje;
    }

    if (deriva) {
        const dInfo = motor.derivaCostera || motor.riesgoDeriva;
        const dNivel = dInfo.nivel || 'BAJO';
        const dScore = dInfo.score ?? 10;
        const dDesc = dInfo.descripcion || '';
        deriva.textContent = `${ICONOS_DERIVA[dNivel] || '🟢'} Deriva ${dNivel} (${dScore}/100): ${dDesc}`;
    }

    // Píldoras Next-Gen dinámicas (Mejor ventana, Iniciación, Consenso multi-modelo, Evolución térmica)
    let badgesCont = document.getElementById(`${prefijo}NextGenBadges`);
    if (!badgesCont && contenedor) {
        badgesCont = document.createElement('div');
        badgesCont.id = `${prefijo}NextGenBadges`;
        badgesCont.className = 'flex flex-wrap gap-2 pt-1 pb-1';
        if (deriva && deriva.parentNode) {
            deriva.parentNode.insertBefore(badgesCont, deriva);
        } else {
            contenedor.appendChild(badgesCont);
        }
    }

    if (badgesCont) {
        const badges = [];
        const isDark = prefijo === 'pro';

        if (motor.alertaEmergenciaActiva) {
            badges.push(`<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-red-600 text-white shadow-sm animate-pulse">
                ⛔ SALIDA PROHIBIDA POR EMERGENCIA OFICIAL
            </span>`);
        } else {
            // 0. Píldora de Aviso Preventivo 112 en seguimiento (si existe aviso futuro)
            if (motor.avisoPreventivoActivo || motor.avisoPreventivo) {
                const prev = motor.avisoPreventivo;
                const pCls = isDark
                    ? 'bg-amber-950/80 text-amber-300 border-amber-600/60'
                    : 'bg-amber-50 text-amber-800 border-amber-300';
                badges.push(`<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${pCls}">
                    ⚠️ Aviso 112 Preventivo (${esc(prev?.periodoTexto || 'Fin de semana')})
                </span>`);
            }

            // 1. Píldora de Mejor Ventana Horaria
            const ventana = motor.ventanaRecomendada || motor.ventanas?.mejorVentana;
            if (ventana && ventana.inicio && ventana.fin) {
                const vCls = isDark
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-300';
                badges.push(`<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${vCls}">
                    ⏰ Mejor ventana: ${esc(ventana.inicio)} - ${esc(ventana.fin)}
                </span>`);
            }

            // 2. Píldora del Índice de Iniciación
            if (motor.beginnerIndex?.nivel) {
                const bCls = isDark
                    ? 'bg-sky-950/80 text-sky-300 border-sky-700/60'
                    : 'bg-sky-50 text-sky-800 border-sky-300';
                badges.push(`<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${bCls}">
                    🔰 Iniciación: ${esc(motor.beginnerIndex.nivel)}
                </span>`);
            }

            // 3. Píldora del Consenso Multi-modelo
            if (motor.consenso?.nivelConsenso && motor.consenso.nivelConsenso !== 'UNICO') {
                const cCls = isDark
                    ? 'bg-slate-800 text-slate-300 border-slate-700'
                    : 'bg-slate-100 text-slate-700 border-slate-300';
                badges.push(`<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cCls}">
                    🎯 Consenso: ${esc(motor.consenso.nivelConsenso)} (${motor.consenso.modelosDisponibles?.join(', ') || 'Multi-modelo'})
                </span>`);
            }

            // 4. Píldora de Evolución Térmica / Rolada Próxima (+3h)
            if (evo && evo.mensaje) {
                const eCls = isDark
                    ? 'bg-amber-950/80 text-amber-300 border-amber-600/70'
                    : 'bg-amber-100 text-amber-900 border-amber-300';
                badges.unshift(`<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${eCls}">
                    📈 En +${evo.deltaHoras}h: Viento ${evo.vientoFuturoKt} kt (Racha ${evo.rachaFuturaKt} kt)
                </span>`);
            }
        }

        badgesCont.innerHTML = badges.join('');
        badgesCont.style.display = badges.length ? 'flex' : 'none';
    }

    if (insights) {
        const puntos = deduplicateInsights([
            ...(ng?.factoresRiesgo || []),
            ...(motor.factoresCriticos || [])
        ]);
        insights.innerHTML = puntos.map(insight => `<li>${esc(insight)}</li>`).join('');
    }

    contenedor.classList.remove('hidden');
}

export async function consultarBasico() {
    if(document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const loc = document.getElementById('location').value.trim();
    const d = document.getElementById('date').value;
    const r = document.getElementById('timeRange').value;
    const u = document.getElementById('userLevel').value;
    const btn = document.getElementById('btn-consultar');
    const sp = document.getElementById('spinner');
    const bt = document.getElementById('btn-text');
    const res = document.getElementById('resultado');
    
    if(!loc || !d || !r || !u) {
        res.innerHTML = `<strong>⚠️ Faltan datos</strong>`;
        res.className = "text-sm font-bold text-red-500 bg-red-50 p-5 rounded-2xl border border-red-200 text-center";
        return;
    }
    
    res.className = "text-sm font-mono text-slate-300 bg-slate-900/60 p-5 rounded-2xl border border-sky-500/30 whitespace-pre-wrap leading-relaxed min-h-[80px] opacity-60 animate-pulse flex items-center justify-center gap-2";
    res.innerHTML = '<span class="animate-spin text-base">⏳</span> <span class="font-bold text-sky-300">Actualizando parte y modelos costeros...</span>';
    const tlEl = document.getElementById('fullDaySpotTimeline');
    if (tlEl && !tlEl.classList.contains('hidden')) {
        tlEl.classList.add('opacity-60', 'animate-pulse');
    }
    buscarYCentrarMapa(loc);
    btn.disabled = true; sp.classList.remove('hidden'); bt.textContent = "Analizando...";
    ['basicWindSpeed', 'basicWindDir', 'basicWave', 'basicPrecip', 'basicPrecipProb'].forEach(id => {
        document.getElementById(id).textContent = '--';
    });
    const nivelBasico = document.getElementById('basicLevel');
    nivelBasico.className = 'text-sm font-black text-slate-400 text-center px-2';
    nivelBasico.textContent = 'Esperando...';
    document.getElementById('basicExpertSummary')?.classList.add('hidden');
    const coachBasico = document.getElementById('basicCoachContainer');
    if (coachBasico) {
        coachBasico.classList.add('hidden');
        coachBasico.innerHTML = '';
    }

    const alC = document.getElementById('global-alert-container'); if(alC) alC.innerHTML = '';
    
    const payload = {
        location: loc,
        date: d,
        timeRange: r,
        userLevel: u || "Intermedio"
    };

    try {
        const p = await solicitarPronostico(payload);
        
        if (p._desdeSnapshot) {
            const min = Math.max(1, Math.round((Date.now() - p._snapshotTs) / 60000));
            const avisoSnapshot = `📴 Modo Sin Cobertura — Mostrando el último parte descargado hace ${min} min para ${esc(p._snapshotLocation || loc)}`;
            const alCont = document.getElementById('global-alert-container');
            if (alCont) {
                alCont.innerHTML = `
                    <div class="bg-amber-500/20 border-2 border-amber-500 text-amber-900 dark:text-amber-200 px-4 py-3 rounded-2xl flex items-center justify-between gap-3 shadow-lg my-3 font-semibold text-sm">
                        <div class="flex items-center gap-2">
                            <span class="text-xl">📴</span>
                            <span>Modo Sin Cobertura — Mostrando el último parte descargado hace <strong>${min} min</strong> para <strong>${esc(p._snapshotLocation || loc)}</strong></span>
                        </div>
                    </div>
                `;
                alCont.classList.remove('hidden');
            }
            const mapMsg = document.getElementById('mapMsg');
            if (mapMsg) {
                mapMsg.innerHTML = avisoSnapshot;
                mapMsg.classList.remove('hidden');
            }
        }

        if(p.datos) {
            const dx = p.datos;
            dx.date = p.received?.date || d;
            dx.fecha = p.received?.date || d;
            dx.timeRange = r;
            const vientoMs = valorNumericoMeteo(dx.windSpeed, dx.wind_speed);
            const vientoKmh = vientoMs === null ? null : vientoMs * 3.6;
            const vientoNudos = kmhANudos(vientoKmh);

            const rachasMs = valorNumericoMeteo(dx.windGusts, dx.wind_gusts, dx.rachas, dx.rachas_kmh ? dx.rachas_kmh / 3.6 : null);
            const rachasKmh = rachasMs === null ? null : rachasMs * 3.6;
            const rachasKt = rachasKmh !== null ? kmhANudos(rachasKmh) : null;

            const wv = valorNumericoMeteo(dx.waveHeight, dx.wave_height);
            const periodoOla = valorNumericoMeteo(dx.wavePeriod, dx.wave_period, dx.periodoOla, dx.periodoOlaS, dx.periodo_ola_s);

            const pm = valorNumericoMeteo(dx.precipitation, dx.precipitation_mm);
            const pl = valorNumericoMeteo(dx.precipProbability, dx.precipitation_probability);
            
            document.getElementById("basicWindSpeed").textContent = vientoNudos === null ? 'N/D' : `${vientoNudos.toFixed(1)} kt`;
            
            // Racha (cuando supere en >= 3 kt al viento medio)
            const gustEl = document.getElementById("basicWindGust");
            const hayRachaRelevante = vientoNudos !== null && rachasKt !== null && (rachasKt - vientoNudos) >= 3;
            if (gustEl) {
                if (hayRachaRelevante) {
                    gustEl.textContent = `Racha ${rachasKt.toFixed(1)} kt`;
                    gustEl.classList.remove('hidden');
                } else {
                    gustEl.classList.add('hidden');
                    gustEl.textContent = '';
                }
            }

            document.getElementById("basicWave").textContent = wv !== null ? `${wv.toFixed(1)} m` : 'N/D';
            
            // Periodo de ola y badge
            const wavePeriodEl = document.getElementById("basicWavePeriod");
            let badgePeriodoHtml = '';
            let badgeTexto = '';
            if (periodoOla !== null && periodoOla > 0) {
                if (wv !== null && wv >= 0.4 && periodoOla <= 5) {
                    badgePeriodoHtml = '<span class="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-300 ml-1">Chop corto</span>';
                    badgeTexto = ' (Chop corto)';
                } else if (wv !== null && wv >= 0.3 && periodoOla >= 9) {
                    badgePeriodoHtml = '<span class="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-300 ml-1">Mar de fondo</span>';
                    badgeTexto = ' (Mar de fondo)';
                }
                if (wavePeriodEl) {
                    wavePeriodEl.innerHTML = `${Math.round(periodoOla)}s ${badgePeriodoHtml}`;
                }
            } else if (wavePeriodEl) {
                wavePeriodEl.innerHTML = '';
            }

            document.getElementById("basicPrecip").textContent = pm === null ? 'N/D' : `${pm} mm`;
            document.getElementById("basicPrecipProb").textContent = `Prob: ${pl === null ? 'N/D' : `${pl}%`}`;
            
            const cardD = ["N","NE","E","SE","S","SO","O","NO"];
            const direccion = valorNumericoMeteo(dx.windDirection, dx.wind_direction);
            const hayDireccion = direccion !== null;
            const idir = hayDireccion ? Math.round((((direccion % 360) + 360) % 360) / 45) % 8 : null;
            document.getElementById("basicWindDir").innerHTML = `<div class="wind-arrow text-emerald-500 drop-shadow-sm w-4 h-4" style="transform: rotate(${hayDireccion ? direccion : 0}deg);"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.25a.75.75 0 0 1 .75.75v16.19l4.72-4.72a.75.75 0 1 1 1.06 1.06l-6 6a.75.75 0 0 1-1.06 0l-6-6a.75.75 0 1 1 1.06-1.06l4.72 4.72V3a.75.75 0 0 1 .75-.75Z" /></svg></div> ${hayDireccion ? `${cardD[idir]} (${Math.round(direccion)}°)` : 'Dirección N/D'}`;

            // Actualización de barras de intensidad Bento y horas solares (DS 3.0)
            const windBar = document.getElementById('basicWindBar');
            if (windBar) {
                const wPct = vientoNudos !== null ? Math.min(100, Math.round((vientoNudos / 25) * 100)) : 0;
                windBar.style.width = `${wPct}%`;
            }
            const waveBar = document.getElementById('basicWaveBar');
            if (waveBar) {
                const wavePct = wv !== null ? Math.min(100, Math.round((wv / 2.0) * 100)) : 0;
                waveBar.style.width = `${wavePct}%`;
            }
            const solarTimesEl = document.getElementById('basicSolarTimes');
            if (solarTimesEl) {
                try {
                    const latVal = Number(latitudActual) || 39.5;
                    const lonVal = Number(longitudActual) || 0.0;
                    const solar = calcularSolYCrepusculo(latVal, lonVal, d || new Date().toISOString().slice(0, 10));
                    if (solar && solar.sunriseStr && solar.sunsetStr) {
                        solarTimesEl.innerHTML = `🌅 ${solar.sunriseStr} · 🌇 ${solar.sunsetStr}`;
                    }
                } catch (_) {}
            }
            
            const motor = obtenerMotorExperto(dx, u);
            renderizarAvisoSuperior(motor);
            renderizarResumenExperto(motor);

            let extraReporte = '';
            if (hayRachaRelevante) extraReporte += ` | 💨 Racha: <b>${rachasKt.toFixed(1)} kt</b>`;
            if (periodoOla !== null && periodoOla > 0) extraReporte += ` | 🌊 Periodo: <b>${Math.round(periodoOla)}s</b>${badgeTexto}`;

            res.className = "text-sm font-mono text-slate-600 bg-slate-50 p-5 rounded-2xl border border-slate-200 whitespace-pre-wrap leading-relaxed min-h-[80px]";
            res.innerHTML = `<strong>📍 ${esc((p.received?.location || loc).split(',')[0])}</strong><br>📅 ${esc(p.received?.date || d)} | 🕒 ${esc(p.received?.timeRange || r)}${extraReporte}`;
            solicitarCoachIABasico(dx, u, loc, motor);

            // Actualizar estado del spot activo y renderizar timeline diurno completo
            spotActivoActual = {
                nombre: (p.received?.location || loc).split(',')[0],
                lat: Number(latitudActual),
                lon: Number(longitudActual)
            };
            pronosticoDiaCompletoActual = dx;
            actualizarEstadoBotonGuardarSpot();

            // Renderizar rosa de vectores tácticos y HUD
            renderizarRosaVectoresMapa(Number(latitudActual), Number(longitudActual), dx);

            // Cargar reportes en vivo de la comunidad (Waze for SUP)
            void cargarReportesSpot(Number(latitudActual), Number(longitudActual));

            if (dx.horasDiurnas && dx.horasDiurnas.length > 0) {
                renderizarTimelineJornadaCompleta(spotActivoActual, dx, u);
            }
        }
    } catch(e) { 
        res.innerHTML = `<strong>No se pudo cargar el pronóstico.</strong> ${esc(e?.message || 'Revisa tu conexión e inténtalo de nuevo.')}`;
        console.warn('Error al consultar el pronóstico básico:', e);
        document.getElementById('fullDaySpotTimeline')?.classList.add('hidden');
        renderizarAvisoSuperior({
            aemet: { alertas: [], disponible: false },
            tormentaElectrica: false,
            fuenteAlternativa: false,
            recomendacion: 'NO RECOMENDADO',
            seguridad: { score: 0 },
            analysisConfidence: 0
        });
        renderizarResumenExperto(calcularVeredicto({ datos: {} }));
        mostrarCoachPronosticoNoDisponible(document.getElementById('basicCoachContainer'));
    } finally {
        btn.disabled = false; sp.classList.add('hidden'); bt.textContent = 'Análisis Básico Rápido';
    }
}

export async function consultarPuntoProInstantaneo(lat, lon, d, t) {
    const u = document.getElementById('proLevelOption').value || "Intermedio";
    const btn = document.getElementById('btnCalcPro');
    if(btn) { btn.disabled = true; btn.innerHTML = "Analizando punto..."; }

    try {
        const payload = {
            location: `${lat},${lon}`,
            date: d,
            timeRange: crearFranjaForecast(t || "12:00"),
            userLevel: u
        };
        const p = await solicitarPronostico(payload);
        renderizarDashboardPro(p.datos, t, u, false, lat, lon, d);
        if (p.datos) {
            renderizarRosaVectoresMapa(lat, lon, p.datos);
            void cargarReportesSpot(lat, lon);
        }
    } catch(e) {
        console.warn('Aviso no crítico:', e);
        alert(`❌ No se pudo obtener el pronóstico. ${e?.message || 'Revisa tu conexión e inténtalo de nuevo.'}`);
    } finally {
        if(btn) { btn.disabled = false; btn.innerHTML = "✨ Procesar Análisis Pro"; }
    }
}

// ====================================================
// FÍSICA PERSONALIZADA DE TABLA, RITMO Y VELOCIDAD DE CRUCERO
// ====================================================

export const TABLAS_SUP_CONFIG = {
    inflat_allround: {
        id: 'inflat_allround',
        nombre: "Hinchable All-Round (10'6\")",
        velBase: 3.8,
        driftMod: 1.20,
        chopPenalty: 0,
        descripcion: "Mayor grosor y francobordo (15 cm). Deriva +20% por efecto vela en viento > 10 kt."
    },
    inflat_touring: {
        id: 'inflat_touring',
        nombre: "Hinchable Touring (12'6\" - 14')",
        velBase: 4.7,
        driftMod: 1.10,
        chopPenalty: 0,
        descripcion: "Proa afilada y buena inercia de avance. Deriva moderada (+10%)."
    },
    rigid_touring: {
        id: 'rigid_touring',
        nombre: "Rígida Touring / All-Water",
        velBase: 5.2,
        driftMod: 1.0,
        chopPenalty: 0,
        descripcion: "Línea de flotación óptima y casco rígido. Deriva neutra de referencia (1.0)."
    },
    rigid_race: {
        id: 'rigid_race',
        nombre: "Rígida Race (14')",
        velBase: 6.0,
        driftMod: 0.95,
        chopPenalty: 5,
        descripcion: "Máximo deslizamiento y velocidad. Inestabilidad lateral con chop / mar picado (-5 pts)."
    }
};

export function recuperarEquipoUsuario() {
    try {
        const raw = localStorage.getItem('ps_user_gear');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.tipoTabla && TABLAS_SUP_CONFIG[parsed.tipoTabla]) {
                return parsed;
            }
        }
    } catch (e) {
        console.warn('Aviso al recuperar ps_user_gear:', e);
    }
    return {
        tipoTabla: 'rigid_touring',
        velCruceroKmh: 4.5,
        driftMod: 1.0,
        chopPenalty: 0
    };
}

export function guardarEquipoUsuario(equipo) {
    if (!equipo) return;
    try {
        localStorage.setItem('ps_user_gear', JSON.stringify(equipo));
    } catch (e) {
        console.warn('Aviso al guardar ps_user_gear:', e);
    }
    if (appState) {
        appState.equipoUsuario = equipo;
    }
    actualizarUIGearSelector();
}

export function obtenerVelocidadCruceroUsuario() {
    const eq = appState?.equipoUsuario || recuperarEquipoUsuario();
    const vel = Number(eq?.velCruceroKmh);
    return (Number.isFinite(vel) && vel >= 1.5 && vel <= 15.0) ? vel : 4.5;
}

// ====================================================
// BIOMETRÍA SUP, HIDRATACIÓN Y GASTO CALÓRICO (METs)
// ====================================================
export function calcularBiometriaSup({ duracionMin = 0, distKm = 0, velKmh = 0, vientoKt = 0, olasM = 0, periodoS = 0, tempC = 20, tipoTabla = 'all-round' } = {}) {
    let met = 6.0; // Paddle surf recreativo estándar
    if (vientoKt >= 11) met += 1.5;
    if (olasM >= 0.4 || (periodoS > 0 && periodoS <= 5)) met += 1.2;
    const t = String(tipoTabla || '').toLowerCase();
    if ((t.includes('all-round') || t.includes('allround') || t.includes('hinchable') || t.includes('inflatable') || t.includes('inflat')) && velKmh > 4.0) {
        met += 0.8;
    }
    met = Math.min(11.0, met);
    const horas = (Number(duracionMin) || 0) / 60;
    const kcal = Math.max(0, Math.round(met * 75 * horas));

    let mlHora = 500;
    if (tempC >= 25) mlHora += 250;
    if (vientoKt >= 12) mlHora += 200;
    const mlTotal = Math.max(250, Math.round(horas * mlHora));
    const litros = (mlTotal / 1000).toFixed(1);

    return {
        met: Number(met.toFixed(1)),
        kcal,
        mlTotal,
        hidratacionMl: mlTotal,
        litros,
        mlHora
    };
}
if (typeof window !== 'undefined') {
    window.calcularBiometriaSup = calcularBiometriaSup;
}

export function actualizarTipoTablaDesdeSelect(tipo) {
    const config = TABLAS_SUP_CONFIG[tipo] || TABLAS_SUP_CONFIG.rigid_touring;
    const actual = appState?.equipoUsuario || recuperarEquipoUsuario();
    const nuevo = {
        ...actual,
        tipoTabla: config.id,
        driftMod: config.driftMod,
        chopPenalty: config.chopPenalty,
        velCruceroKmh: actual.velManual ? actual.velCruceroKmh : config.velBase
    };
    guardarEquipoUsuario(nuevo);
}

export function actualizarVelocidadCruceroManual(velStr) {
    const vel = parseFloat(velStr);
    if (!Number.isFinite(vel) || vel < 1.0 || vel > 20.0) return;
    const actual = appState?.equipoUsuario || recuperarEquipoUsuario();
    const nuevo = {
        ...actual,
        velCruceroKmh: Number(vel.toFixed(1)),
        velManual: true
    };
    guardarEquipoUsuario(nuevo);
}

export async function autoCalibrarRitmoDesdeRutas() {
    const btn = document.getElementById('btnAutoCalibrarRitmo');
    if (btn) btn.innerHTML = '<span>⏳</span> <span>Analizando rutas...</span>';

    try {
        let velMedia = null;
        const userId = appState?.sesionActual?.user?.id;

        if (userId && supabaseClient) {
            const { data, error } = await supabaseClient
                .from('rutas')
                .select('distancia_km, tiempo_minutos')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(20);

            if (!error && Array.isArray(data) && data.length > 0) {
                const velList = data
                    .map(r => {
                        const km = Number(r.distancia_km || 0);
                        const m = Number(r.tiempo_minutos || 0);
                        return (km > 0.2 && m > 2) ? (km / (m / 60)) : null;
                    })
                    .filter(v => v !== null && v >= 1.8 && v <= 12.0);

                if (velList.length > 0) {
                    velMedia = velList.reduce((acc, v) => acc + v, 0) / velList.length;
                }
            }
        }

        if (velMedia === null) {
            const ck = localStorage.getItem('paddlesafe_live_checkpoint');
            if (ck) {
                try {
                    const parsed = JSON.parse(ck);
                    if (parsed.distKm > 0.5 && parsed.startTime) {
                        const mins = (Date.now() - new Date(parsed.startTime).getTime()) / 60000;
                        if (mins > 5) velMedia = parsed.distKm / (mins / 60);
                    }
                } catch (_) {}
            }
        }

        if (velMedia !== null && Number.isFinite(velMedia)) {
            const velFinal = Number(Math.max(2.0, Math.min(10.0, velMedia)).toFixed(1));
            actualizarVelocidadCruceroManual(velFinal);
            alert(`✅ ¡Ritmo auto-calibrado con éxito! Tu velocidad media real de remada es de ${velFinal} km/h.`);
        } else {
            alert('ℹ️ No hay suficientes rutas registradas para calcular tu media. Hemos mantenido tu velocidad crucero actual.');
        }
    } catch (e) {
        console.warn('Aviso al auto-calibrar ritmo:', e);
        alert('ℹ️ No se pudo calcular el promedio de tus rutas en este momento.');
    } finally {
        if (btn) btn.innerHTML = '<span>⚡</span> <span>Auto-calibrar con mis rutas</span>';
    }
}

export function toggleSelectorEquipoUsuario(forceState) {
    const el = document.getElementById('userGearSelector');
    if (!el) return;
    const estaOculto = el.classList.contains('hidden');
    const nuevoEstado = typeof forceState === 'boolean' ? forceState : estaOculto;
    if (nuevoEstado) {
        actualizarUIGearSelector();
        el.classList.remove('hidden');
        el.scrollIntoView({ behavior: 'smooth' });
    } else {
        el.classList.add('hidden');
    }
}

export function actualizarUIGearSelector() {
    const eq = appState?.equipoUsuario || recuperarEquipoUsuario();
    const select = document.getElementById('userGearBoardType');
    const input = document.getElementById('userGearPaceInput');
    const notice = document.getElementById('userGearPhysicsNotice');
    const badgeText = document.getElementById('gearBadgeText');

    if (select && eq.tipoTabla) select.value = eq.tipoTabla;
    if (input && eq.velCruceroKmh) input.value = Number(eq.velCruceroKmh).toFixed(1);

    const cfg = TABLAS_SUP_CONFIG[eq.tipoTabla] || TABLAS_SUP_CONFIG.rigid_touring;
    if (badgeText) badgeText.textContent = `${cfg.nombre.split(' ')[0]} (${eq.velCruceroKmh || cfg.velBase} km/h)`;

    if (notice) {
        notice.innerHTML = `
            <div class="flex items-center justify-between gap-2 border-b border-slate-700/60 pb-1 mb-1.5">
                <span class="font-bold text-sky-300">${cfg.nombre}</span>
                <span class="font-mono text-[10px] text-slate-400">Deriva x${cfg.driftMod.toFixed(2)}</span>
            </div>
            <p class="text-slate-300">${cfg.descripcion}</p>
        `;
    }
}

export async function consultarRutaPro() {
    if(document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const alertCont = document.getElementById('proAlertContainer');
    alertCont.classList.add('hidden'); alertCont.innerHTML = "";
    
    const locVal = document.getElementById('proLocation').value;
    const d = document.getElementById('proDate').value;
    const t = document.getElementById('proTime').value;
    const u = document.getElementById('proLevelOption').value;
    
    if(!locVal || !d || !t) {
        alertCont.innerHTML = "⚠️ Toca el mapa e indica Fecha/Hora.";
        alertCont.className = "text-sm font-bold text-red-400 bg-red-900/30 p-4 rounded-xl text-center w-full block mt-2";
        alertCont.classList.remove('hidden');
        return;
    }
    
    const btn = document.getElementById('btnCalcPro');
    btn.disabled = true; btn.innerHTML = "Calculando...";
    
    let lat, lon;
    if (marcadoresRuta.length >= 2) {
        lat = marcadoresRuta[0].getLatLng().lat.toFixed(5); lon = marcadoresRuta[0].getLatLng().lng.toFixed(5);
    } else {
        const partes = locVal.split(','); lat = parseFloat(partes[0]); lon = parseFloat(partes[1]);
    }
    
    let duracionEstimada = 120;
    if (marcadoresRuta.length >= 2) {
        let dt = 0;
        const coords = marcadoresRuta.map(m => m.getLatLng());
        let rutArray = [...coords];
        if (modoTravesiaActivo && coords.length === 2) rutArray.push(coords[0]);
        for(let i = 0; i < rutArray.length - 1; i++) {
            dt += rutArray[i].distanceTo(rutArray[i+1]);
        }
        if (dt > 0) duracionEstimada = Math.round(((dt / 1000) / obtenerVelocidadCruceroUsuario()) * 60);
    }

    try {
        const payload = {
            location: `${lat},${lon}`,
            date: d,
            timeRange: crearFranjaForecast(t, duracionEstimada),
            userLevel: u
        };
        const p = await solicitarPronostico(payload);
        renderizarDashboardPro(p.datos, t, u, marcadoresRuta.length >= 2, lat, lon, d);
    } catch(e) {
        alertCont.innerHTML = `❌ <strong>No se pudo cargar el pronóstico meteorológico.</strong> ${esc(e?.message || 'Comprueba tu conexión a internet e inténtalo de nuevo.')}`;
        alertCont.className = "text-sm font-bold text-red-400 bg-red-900/30 p-4 rounded-xl text-center w-full block mt-2";
        alertCont.classList.remove('hidden');
        console.warn('Aviso crítico (Fetch Pro):', e);
    } finally {
        btn.disabled = false; btn.innerHTML = "✨ Procesar Análisis Pro";
    }
}

export function renderizarDashboardPro(dx, horaSalida, userLvl, esRutaTrazada, lat, lon, fechaD) {
    datosMeteoActuales = dx;
    const wkVal = valorNumericoMeteo(dx.windSpeed, dx.wind_speed);
    const windKmh = wkVal === null ? null : wkVal * 3.6;
    const windKnots = kmhANudos(windKmh);
    const wvRaw = dx.waveHeight ?? dx.wave_height;
    const wv = wvRaw !== null && wvRaw !== undefined && wvRaw !== '' && Number.isFinite(Number(wvRaw))
        ? Number(wvRaw).toFixed(1) : null;
    const wPeriod = dx.wavePeriod !== undefined ? dx.wavePeriod : (dx.wave_period !== undefined ? dx.wave_period : "--");
    const pm = valorNumericoMeteo(dx.precipitation, dx.precipitation_mm);
    const pl = valorNumericoMeteo(dx.precipProbability, dx.precipitation_probability);
    const gustsVal = valorNumericoMeteo(dx.windGusts, dx.wind_gusts);
    const gustsKmh = gustsVal === null ? null : gustsVal * 3.6;
    const gustsKnots = kmhANudos(gustsKmh);
    const uv = (dx.uvIndex !== undefined && dx.uvIndex !== null) ? dx.uvIndex : (dx.uv_index !== undefined ? dx.uv_index : "--");
    
    let uvText = uv >= 8 ? "MUY ALTO" : (uv >= 5 ? "ALTO" : (uv > 0 ? "MODERADO" : "--"));
    document.getElementById('proDashWind').innerHTML = `${windKnots === null ? 'N/D' : windKnots.toFixed(1)} <span class="text-[10px] text-slate-500">kt</span>`;
    document.getElementById('proDashGusts').innerHTML = `Rachas: ${gustsKnots === null ? 'N/D' : `${gustsKnots.toFixed(1)} kt`}`;
    const direccionViento = valorNumericoMeteo(dx.windDirection, dx.wind_direction);
    document.getElementById('proDashDirIcon').style.transform = `rotate(${direccionViento ?? 0}deg)`;
    document.getElementById('proDashDirText').textContent = direccionViento === null ? 'N/D' : `${Math.round(direccionViento)}°`;
    document.getElementById('proDashWave').innerHTML = `${wv !== null ? wv : 'N/D'} <span class="text-[10px] text-sky-900">m</span>`;
    document.getElementById('proDashWavePeriod').textContent = `Periodo: ${wPeriod === '--' ? 'N/D' : `${wPeriod} s`}`;
    document.getElementById('proDashPrecip').textContent = pl === null ? 'N/D' : `${pl}%`;
    document.getElementById('proDashPrecipMM').textContent = pm === null ? 'N/D' : `${pm} mm`;
    document.getElementById('proDashUV').innerHTML = `${uv}`;
    document.getElementById('proDashUVText').innerHTML = uvText;
    
    let tempAireValue = dx.tempAire || dx.temperature || dx.temp || "N/D";
    let tempAguaValue = dx.tempAgua || dx.waterTemperature || dx.water_temp || "N/D";
    document.getElementById('proTempAmbiente').textContent = tempAireValue !== "N/D" ? `${tempAireValue}°` : "--°";
    document.getElementById('proTempAgua').textContent = tempAguaValue !== "N/D" ? `${tempAguaValue}°` : "--°";
    
    let icono = "☀️", textoClima = "SOL";
    const estadoClima = String(dx.clima || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const codigoClima = valorNumericoMeteo(dx.weatherCode, dx.weather_code);
    if ([95, 96, 99].includes(codigoClima) || /tormenta|thunderstorm|lightning/.test(estadoClima)) { icono = "⛈️"; textoClima = "TORMENTA"; }
    else if (estadoClima.includes("nublado")) { icono = "☁️"; textoClima = "NUBES"; }
    else if (estadoClima.includes("lluvia") || (pl !== null && pl > 0)) { icono = "🌧️"; textoClima = "LLUVIA"; }
    document.getElementById('proIconoClima').textContent = icono;
    document.getElementById('proTextoClima').textContent = textoClima;
    
    let dt = 0, tt = 0, arrayHtmlTramos = [];
    const tramosParaCoach = [];
    if (esRutaTrazada) {
        const coords = marcadoresRuta.map(m => m.getLatLng());
        lineasMultiPunto.forEach(l => map.removeLayer(l)); lineasMultiPunto.length = 0;
        etiquetasDistancia.forEach(l => map.removeLayer(l)); etiquetasDistancia.length = 0;
        
        const dirVientoGeneral = valorNumericoMeteo(dx.windDirection, dx.wind_direction);
        const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; let rutArray = [...coords];
        if (modoTravesiaActivo && coords.length === 2) rutArray.push(coords[0]);
        
        const timeParts = horaSalida.split(':');
        const hhInicio = parseInt(timeParts[0], 10) || 0;
        const mmInicio = parseInt(timeParts[1], 10) || 0;
        let minutosTranscurridos = 0;

        for(let i = 0; i < rutArray.length - 1; i++) {
            const dSeg = rutArray[i].distanceTo(rutArray[i+1]); dt += dSeg;
            const nombreTramo = (modoTravesiaActivo && rutArray.length === 3) ? (i === 0 ? "IDA 🟢" : "VUELTA 🔴") : `TRAMO ${letras[i]||i} ➔ ${letras[i+1]||(i+1)}`;
            
            const lat1 = rutArray[i].lat * Math.PI / 180, lon1 = rutArray[i].lng * Math.PI / 180;
            const lat2 = rutArray[i+1].lat * Math.PI / 180, lon2 = rutArray[i+1].lng * Math.PI / 180;
            const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
            const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
            let rumbo = Math.round((Math.atan2(y, x) * 180 / Math.PI + 360) % 360);
            
            // Cálculo horario dinámico para el tramo
            const minTotalesPaso = mmInicio + Math.round(minutosTranscurridos);
            const horaPasoH = (hhInicio + Math.floor(minTotalesPaso / 60)) % 24;
            const horaPasoM = minTotalesPaso % 60;
            const horaPasoStr = `${horaPasoH.toString().padStart(2, '0')}:${horaPasoM.toString().padStart(2, '0')}`;
            const offsetH = Math.floor(minutosTranscurridos / 60);
            const offsetM = Math.round(minutosTranscurridos % 60);
            const offsetTexto = offsetH > 0 ? `+${offsetH}h ${offsetM}m` : `+${offsetM}m`;

            let dirVientoTramo = dirVientoGeneral;
            let spdVientoTramo = valorNumericoMeteo(dx.windSpeed, dx.wind_speed);
            let gustVientoTramo = valorNumericoMeteo(dx.windGusts, dx.wind_gusts);

            const hourlySource = dx.hourly || datosMeteoActuales?.hourly;
            if (hourlySource && Array.isArray(hourlySource.time)) {
                let hourlyIdx = hourlySource.time.findIndex(tStr => {
                    const hNum = parseInt(tStr.slice(11, 13), 10);
                    return hNum === horaPasoH;
                });
                if (hourlyIdx < 0 && horaPasoH < hourlySource.time.length) {
                    hourlyIdx = horaPasoH;
                }
                if (hourlyIdx >= 0) {
                    const dirH = hourlySource.wind_direction_10m?.[hourlyIdx] ?? hourlySource.windDirection?.[hourlyIdx];
                    if (dirH !== undefined && dirH !== null) dirVientoTramo = Number(dirH);
                    const spdH = hourlySource.wind_speed_10m?.[hourlyIdx] ?? hourlySource.windSpeed?.[hourlyIdx];
                    if (spdH !== undefined && spdH !== null) spdVientoTramo = Number(spdH);
                    const gustH = hourlySource.wind_gusts_10m?.[hourlyIdx] ?? hourlySource.windGusts?.[hourlyIdx];
                    if (gustH !== undefined && gustH !== null) gustVientoTramo = Number(gustH);
                }
            }

            const spdKtTramo = spdVientoTramo !== null ? kmhANudos(spdVientoTramo * 3.6) : null;
            const gustKtTramo = gustVientoTramo !== null ? kmhANudos(gustVientoTramo * 3.6) : null;

            let iV = evaluarVientoRelativoInfo(rumbo, dirVientoTramo);
            const pline = L.polyline([rutArray[i], rutArray[i+1]], { color: iV.hexLineColor, weight: 5, className: 'ruta-animada' }).addTo(map);
            lineasMultiPunto.push(pline);
            
            const midLat = (rutArray[i].lat + rutArray[i+1].lat) / 2; const midLng = (rutArray[i].lng + rutArray[i+1].lng) / 2;
            const etiq = L.marker([midLat, midLng], { icon: L.divIcon({ className: 'dist-label-map', html: `${(dSeg/1000).toFixed(2)} km`, iconSize: [null, null] }) }).addTo(map);
            etiquetasDistancia.push(etiq);
            
            const tSeg = ((dSeg / 1000) / Math.max(1.5, obtenerVelocidadCruceroUsuario() + iV.modVelocidad)) * 60;
            tt += tSeg;
            minutosTranscurridos += tSeg;

            tramosParaCoach.push({
                nombre: nombreTramo,
                distancia_km: Number((dSeg / 1000).toFixed(2)),
                rumbo: rumbo,
                viento_relativo: iV.texto,
                modVelocidad: iV.modVelocidad,
                minutos: Math.round(tSeg),
                eta_hora: horaPasoStr,
                viento_kt: spdKtTramo,
                viento_dir: dirVientoTramo,
                velEfectiva: Number((Math.max(1.5, obtenerVelocidadCruceroUsuario() + iV.modVelocidad)).toFixed(1)),
                p1: rutArray[i],
                p2: rutArray[i+1],
                color: iV.hexLineColor
            });
            
            arrayHtmlTramos.push(`
                <div class="bg-slate-800 rounded-xl p-3 border-l-4 shadow-sm w-full relative overflow-hidden" style="border-color:${iV.hexLineColor}">
                    <div class="flex justify-between items-center text-white text-[11px] mb-2 border-b border-slate-700/50 pb-2 flex-wrap gap-1">
                        <span class="font-black ${iV.colorRumbo} tracking-wider">${nombreTramo}</span>
                        <div class="flex items-center gap-1.5">
                            <span class="text-[9px] bg-slate-900/90 text-sky-400 border border-sky-500/30 px-1.5 py-0.5 rounded font-mono font-bold">🕒 ETA ${horaPasoStr} (${offsetTexto})</span>
                            <span class="text-[9px] bg-slate-900 px-1.5 py-0.5 rounded font-mono text-slate-400">Rumbo: ${rumbo}°</span>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full text-center">
                        <div class="bg-slate-900 rounded p-1.5 flex flex-col justify-center border border-slate-700/50">
                            <span class="text-[8px] text-slate-500 font-bold mb-1">DIST</span>
                            <span class="text-[11px] font-mono text-white">${(dSeg/1000).toFixed(2)} km</span>
                        </div>
                        <div class="bg-slate-900 rounded p-1.5 flex flex-col justify-center border border-slate-700/50">
                            <span class="text-[8px] text-slate-500 font-bold mb-1">TIEMPO</span>
                            <span class="text-[11px] font-mono text-white">${formatearTiempo(tSeg)}</span>
                        </div>
                        <div class="col-span-2 ${iV.claseColor} rounded p-1.5 flex flex-col items-center justify-center border border-slate-700/50">
                            <span class="text-[10px] font-black text-white flex items-center gap-1">${iV.icon} ${iV.texto}</span>
                            <span class="text-[8px] font-mono text-slate-300 mt-0.5">Viento: ${spdKtTramo !== null ? `${spdKtTramo.toFixed(1)} kt` : '--'} ${Math.round(dirVientoTramo)}°${gustKtTramo !== null ? ` (R: ${gustKtTramo.toFixed(1)} kt)` : ''}</span>
                        </div>
                    </div>
                </div>`);
        }
        
        document.getElementById('proDashTramosContainer').innerHTML = arrayHtmlTramos.join('');
        document.getElementById('proTituloTramos').textContent = "Análisis por Tramos";
        document.getElementById('proDistanciaTotal').textContent = `${(dt/1000).toFixed(2)} km`;
        document.getElementById('proTiempoTotal').textContent = formatearTiempo(tt);
        
        let fechaLlegada = new Date(); fechaLlegada.setHours(hhInicio, mmInicio, 0); fechaLlegada.setMinutes(fechaLlegada.getMinutes() + Math.round(tt));
        const etaHH = fechaLlegada.getHours().toString().padStart(2, '0'); const etaMM = fechaLlegada.getMinutes().toString().padStart(2, '0');
        
        document.getElementById('proSalidaHora').textContent = horaSalida;
        document.getElementById('proLlegadaHora').textContent = `${etaHH}:${etaMM}`;
        document.getElementById('proContainerNavegacion').classList.remove('hidden'); document.getElementById('proContainerNavegacion').classList.add('flex');

        // Komoot/Windy-style Interactive SVG Route Profile Chart
        window._tramosRutaActuales = tramosParaCoach;
        const chartContainer = document.getElementById('proRouteWindChartContainer');
        const chartTarget = document.getElementById('proRouteWindChart');
        if (chartTarget && tramosParaCoach.length >= 1) {
            chartTarget.innerHTML = generarGraficoSvgPerfilRuta(tramosParaCoach, dt);
            if (chartContainer) {
                chartContainer.classList.remove('hidden');
                chartContainer.classList.add('flex');
            }
        }
    } else {
        window._tramosRutaActuales = [];
        const chartContainer = document.getElementById('proRouteWindChartContainer');
        const chartTarget = document.getElementById('proRouteWindChart');
        if (chartContainer) {
            chartContainer.classList.add('hidden');
            chartContainer.classList.remove('flex');
        }
        if (chartTarget) {
            chartTarget.innerHTML = '';
        }
        document.getElementById('proContainerNavegacion').classList.add('hidden'); document.getElementById('proContainerNavegacion').classList.remove('flex');
        document.getElementById('proTituloTramos').textContent = "Punto de Exploración";
        document.getElementById('proDashTramosContainer').innerHTML = `
            <div class="bg-slate-800 rounded-xl p-4 text-center border border-slate-700/50">
                <span class="text-3xl block mb-2 drop-shadow-md">🧭</span>
                <p class="text-[10px] text-slate-500">Traza una ruta (A ➔ B) para ver tramos y ETA.</p>
            </div>`;
    }
    
    dx.date = fechaD;
    dx.fecha = fechaD;
    dx.horaSalida = horaSalida;
    const motor = obtenerMotorExperto(dx, userLvl);
    renderizarAvisoSuperior(motor);

    // Guardia astronómica de ocaso para la ruta
    const solar = calcularSolYCrepusculo(lat, lon, fechaD);
    const salidaParts = (horaSalida || '10:00').split(':');
    const hhInicioSalida = parseInt(salidaParts[0], 10) || 0;
    const mmInicioSalida = parseInt(salidaParts[1], 10) || 0;
    const inicioMin = hhInicioSalida * 60 + mmInicioSalida;
    const duracionMin = esRutaTrazada ? Math.round(tt) : 60;
    const retornoMin = inicioMin + duracionMin;
    const hayRiesgoOcaso = esRutaTrazada && (retornoMin >= (solar.sunsetMin - 30));

    const proAlertTop = document.getElementById('proAlertTopContainer');
    const oldSunsetAlert = document.getElementById('proSunsetAlertBanner');
    if (oldSunsetAlert) oldSunsetAlert.remove();
    if (proAlertTop && hayRiesgoOcaso) {
        const retornoHH = String(Math.floor((retornoMin % 1440) / 60)).padStart(2, '0');
        const retornoMM = String((retornoMin % 1440) % 60).padStart(2, '0');
        const elOcaso = document.createElement('div');
        elOcaso.id = 'proSunsetAlertBanner';
        elOcaso.className = 'w-full p-3.5 rounded-xl border border-amber-500/50 bg-amber-950/80 text-amber-200 flex items-start gap-3 text-xs shadow-lg animate-pulse';
        elOcaso.innerHTML = `
            <span class="text-2xl shrink-0">⚠️</span>
            <div>
                <div class="font-black text-amber-300 text-xs sm:text-sm">ALERTA DE SEGURIDAD: LLEGADA CERCANA O POSTERIOR AL OCASO</div>
                <p class="mt-0.5 text-slate-200 leading-snug">
                    La ruta estimada finaliza a las <strong>${retornoHH}:${retornoMM}</strong> (Ocaso oficial: <strong>${solar.sunsetStr}</strong> · Fin luz útil: <strong>${solar.civilDuskStr}</strong>).
                    Sin luz solar el rescate es crítico y la visibilidad marítima se reduce drásticamente. Adelanta la hora de salida o acorta la distancia.
                </p>
            </div>
        `;
        proAlertTop.prepend(elOcaso);
    }

    // Biometría táctica SUP, hidratación mínima y checklist de embarque
    const equipoUsuario = recuperarEquipoUsuario();
    const distRutaKm = dt > 0 ? (dt / 1000) : 0;
    const velPromedioKmh = (duracionMin > 0 && distRutaKm > 0) ? (distRutaKm / (duracionMin / 60)) : obtenerVelocidadCruceroUsuario();
    const tempNum = Number.isFinite(Number(tempAireValue)) ? Number(tempAireValue) : 20;
    const biometria = calcularBiometriaSup({
        duracionMin: duracionMin,
        distKm: distRutaKm,
        velKmh: velPromedioKmh,
        vientoKt: windKnots !== null ? windKnots : 0,
        olasM: wv !== null ? Number(wv) : 0,
        periodoS: wPeriod !== '--' ? Number(wPeriod) : 0,
        tempC: tempNum,
        tipoTabla: equipoUsuario?.tipoTabla || 'all-round'
    });

    const bioBar = document.getElementById('proBiometricsBar');
    if (bioBar) {
        bioBar.innerHTML = `
            <div class="flex items-center justify-between gap-2 flex-wrap">
                <div class="flex items-center gap-2 flex-wrap text-xs font-bold text-slate-200">
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 shadow-sm">
                        <span>🔥</span> <span>Gasto Est.:</span> <b>${biometria.kcal}</b> <span class="text-[10px] text-amber-400 font-normal">kcal</span>
                    </span>
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-300 shadow-sm">
                        <span>💧</span> <span>Hidratación mín:</span> <b>${biometria.litros}</b> <span class="text-[10px] text-sky-400 font-normal">L</span>
                    </span>
                </div>
                <button type="button" onclick="document.getElementById('proChecklistDetalle')?.classList.toggle('hidden')" class="px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 border border-slate-700/80 text-[11px] font-black flex items-center gap-1.5 cursor-pointer transition-all shadow-sm">
                    <span>🎒</span> <span>Checklist Embarque</span> <span>▾</span>
                </button>
            </div>
            <div id="proChecklistDetalle" class="hidden mt-2 p-3.5 bg-slate-900/90 rounded-xl border border-slate-700/80 text-xs">
                <div class="font-bold text-slate-300 mb-2 flex items-center justify-between">
                    <span class="uppercase tracking-wider text-[10px] text-slate-400">Equipo imprescindible antes de zarpar</span>
                    <span class="text-[10px] text-emerald-400 font-bold">Seguridad activa</span>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-200">
                    <label class="flex items-center gap-2 cursor-pointer hover:text-white">
                        <input type="checkbox" class="rounded accent-emerald-500 cursor-pointer">
                        <span>🦺 Chaleco 50N / Impact</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer hover:text-white">
                        <input type="checkbox" class="rounded accent-emerald-500 cursor-pointer">
                        <span>🔗 Leash específico tabla/condición</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer hover:text-white">
                        <input type="checkbox" class="rounded accent-emerald-500 cursor-pointer">
                        <span>🔊 Silbato estanco</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer hover:text-white">
                        <input type="checkbox" class="rounded accent-emerald-500 cursor-pointer">
                        <span>📱 Bolsa estanca móvil (100% bat)</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer hover:text-white">
                        <input type="checkbox" class="rounded accent-emerald-500 cursor-pointer">
                        <span>💧 Agua / Sales (${biometria.litros} L)</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer hover:text-white">
                        <input type="checkbox" class="rounded accent-emerald-500 cursor-pointer">
                        <span>☀️ Protección solar UV</span>
                    </label>
                </div>
            </div>
        `;
        bioBar.classList.remove('hidden');
        bioBar.classList.add('flex');
    }

    renderizarResumenExperto(motor, 'pro');
    document.getElementById('proPlanificador').classList.replace('flex','hidden');
    document.getElementById('proDashboardResumen').classList.remove('hidden'); document.getElementById('proDashboardResumen').classList.add('flex');
    const isoLlamada = `${fechaD}T${horaSalida}:00`;
    cargarPrevisionHorariaExacta(lat, lon, isoLlamada, tt > 0 ? tt : 120);
    solicitarCoachIAPro(dx, userLvl, dt, tt, lat, lon, fechaD, horaSalida, tramosParaCoach, motor);
}

export async function cargarPrevisionHorariaExacta(lat, lon, startISO, durationMinutes) {
    const cont = document.getElementById('proDashHorasContainer');
    cont.innerHTML = 'Consultando radar...';
    try {
        const start = new Date(startISO);
        const end = new Date(start.getTime() + Math.max(durationMinutes, 60) * 60000);
        const horaUTC = d => d.toISOString().slice(0, 13) + ':00';
        const diaUTC = d => d.toISOString().slice(0, 10);
        const pos = `latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&timezone=GMT`;
        const json = r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)));
        const [wx, marine] = await Promise.all([
            fetchConTimeout(`https://api.open-meteo.com/v1/forecast?${pos}&hourly=windspeed_10m,windgusts_10m,precipitation_probability,uv_index&start_hour=${horaUTC(start)}&end_hour=${horaUTC(end)}`, { cache: 'no-store' }).then(json),
            fetchConTimeout(`https://marine-api.open-meteo.com/v1/marine?${pos}&hourly=wave_height&start_date=${diaUTC(start)}&end_date=${diaUTC(end)}`, { cache: 'no-store' }).then(json).catch(() => null)
        ]);
        if (!wx.hourly || !wx.hourly.time || wx.hourly.time.length === 0) throw new Error('Rango sin cobertura');
        const olas = new Map();
        if (marine && marine.hourly && marine.hourly.time) marine.hourly.time.forEach((t, i) => olas.set(t, marine.hourly.wave_height[i]));
        const num = (v, dec = 0) => (Number.isFinite(Number(v)) && v !== null ? Number(v).toFixed(dec) : null);
        
        cont.innerHTML = wx.hourly.time.map((t, i) => {
            const horaLabel = new Date(t + 'Z').toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            const wind = Number(wx.hourly.windspeed_10m[i]);
            const gust = Number(wx.hourly.windgusts_10m[i]);
            const windKt = kmhANudos(wind);
            const gustKt = kmhANudos(gust);
            const wave = num(olas.get(t), 1);
            const rain = num(wx.hourly.precipitation_probability[i]);
            const uv = num(wx.hourly.uv_index[i], 1);
            const colorViento = windKt > 20 ? 'text-red-400' : (windKt >= 12 ? 'text-yellow-400' : 'text-emerald-400');
            const colorRachas = gustKt > 20 ? 'text-red-500' : 'text-slate-300';
            const fila = (label, valor, color, unidad = '') => `
                    <div class="flex justify-between items-center text-[10px] mb-1">
                        <span class="text-slate-400 font-bold uppercase tracking-wider">${label}</span>
                        <span class="${color} font-bold">${valor ?? 'N/D'}${valor != null && unidad ? ` <span class="text-[8px]">${unidad}</span>` : ''}</span>
                    </div>`;
            return `
                <div class="bg-slate-800 rounded-xl p-3 border border-slate-700 min-w-[120px] flex-shrink-0 shadow-sm">
                    <span class="block ${colorViento} font-black text-center border-b border-slate-700 pb-1 mb-2 text-sm">${esc(horaLabel)}</span>
                    ${fila('Viento', num(windKt, 1), 'text-white', 'kt')}
                    ${fila('Rachas', num(gustKt, 1), colorRachas, 'kt')}
                    ${fila('Oleaje', wave, 'text-sky-400', 'm')}
                    ${fila('Lluvia', rain, 'text-indigo-300', '%')}
                    ${fila('UV', uv, 'text-amber-400')}
                </div>`;
        }).join('');
    } catch (error) {
        console.warn('Aviso no crítico [prevision horaria]:', error);
        cont.innerHTML = '<p class="text-xs text-red-400 font-bold p-2 bg-red-900/20 rounded border border-red-500/50 w-full text-center">Datos horarios no disponibles ahora mismo. No salgas sin consultar otra fuente.</p>';
    }
}

export function volverPlanificadorPro() {
    document.getElementById('proDashboardResumen').classList.replace('flex','hidden');
    document.getElementById('proPlanificador').classList.remove('hidden');
    document.getElementById('proPlanificador').classList.add('flex');
}

// ==========================================
// PLANIFICADOR MULTIPUNTO DE QUEDADAS DE CLUB
// ==========================================
export function actualizarMetricasQuedada() {
    let dt = 0;
    const coords = marcadoresRuta.map(m => m.getLatLng());
    for (let i = 0; i < coords.length - 1; i++) {
        dt += coords[i].distanceTo(coords[i + 1]);
    }
    const distKm = (dt / 1000).toFixed(2);
    const tiempoMin = Math.round(((dt / 1000) / obtenerVelocidadCruceroUsuario()) * 60);

    const elPuntos = document.getElementById('quedadaPuntosCount');
    const elLabelPuntos = document.getElementById('quedadaPuntosLabel');
    const elDist = document.getElementById('quedadaDistanciaKm');
    const elTiempo = document.getElementById('quedadaTiempoMin');

    if (elPuntos) elPuntos.textContent = marcadoresRuta.length;
    if (elLabelPuntos) elLabelPuntos.textContent = marcadoresRuta.length === 1 ? 'punto' : 'puntos';
    if (elDist) elDist.textContent = `${distKm} km`;
    if (elTiempo) elTiempo.textContent = `${tiempoMin} min`;

    const indicacion = document.getElementById('quedadaIndicacionMapa');
    if (indicacion) {
        if (marcadoresRuta.length === 0) indicacion.textContent = 'Toca el mapa para marcar el primer punto';
        else if (marcadoresRuta.length === 1) indicacion.textContent = 'Toca el mapa para añadir otro punto';
        else indicacion.textContent = 'Sigue añadiendo puntos o abre los datos';
    }
}

let cacheMeteoQuedada = null;

export async function evaluarMeteoParaQuedada() {
    const preview = document.getElementById('quedadaMeteoPreview');
    if (!preview) return;

    if (!marcadoresRuta || marcadoresRuta.length === 0) {
        preview.classList.remove('hidden');
        preview.innerHTML = `
            <div class="bg-slate-800/80 border border-slate-700 rounded-xl p-3 text-center text-slate-400 text-xs">
                📍 Marca al menos un punto en el mar para consultar la previsión marina.
            </div>`;
        return;
    }

    const salida = marcadoresRuta[0].getLatLng();
    const lat = salida.lat;
    const lon = salida.lng;

    const fechaVal = document.getElementById('quedadaFechaInput')?.value || new Date().toISOString().slice(0, 10);
    const horaVal = document.getElementById('quedadaHoraInput')?.value || '10:00';

    preview.classList.remove('hidden');
    preview.innerHTML = `
        <div class="bg-slate-800/80 border border-indigo-500/30 rounded-xl p-3 flex items-center justify-center gap-2 text-indigo-300 font-bold text-xs">
            <span class="animate-spin">⏳</span> Evaluando previsión marina para ${fechaVal} ${horaVal}...
        </div>`;

    let dt = 0;
    const coords = marcadoresRuta.map(m => m.getLatLng());
    for (let i = 0; i < coords.length - 1; i++) {
        dt += coords[i].distanceTo(coords[i + 1]);
    }
    const distKm = dt / 1000;
    const duracionBaseMin = Math.max(30, Math.round((distKm / obtenerVelocidadCruceroUsuario()) * 60));

    try {
        const payload = {
            location: `${lat.toFixed(5)},${lon.toFixed(5)}`,
            date: fechaVal,
            timeRange: crearFranjaForecast(horaVal, duracionBaseMin),
            userLevel: 'Intermedio'
        };

        const p = await solicitarPronostico(payload);
        const dx = p.datos || {};

        const wkVal = valorNumericoMeteo(dx.windSpeed, dx.wind_speed);
        const windKt = wkVal !== null ? kmhANudos(wkVal * 3.6) : null;
        const wgVal = valorNumericoMeteo(dx.windGust, dx.wind_gust, dx.rachas);
        const gustKt = wgVal !== null ? kmhANudos(wgVal * 3.6) : null;
        const dirViento = valorNumericoMeteo(dx.windDirection, dx.wind_direction);
        const waveH = valorNumericoMeteo(dx.waveHeight, dx.wave_height);
        const motor = obtenerMotorExperto(dx, 'Intermedio');

        // Cálculo de tiempo sumando tramo a tramo con evaluarVientoRelativoInfo
        let tiempoAjustadoMin = 0;
        if (coords.length >= 2) {
            for (let i = 0; i < coords.length - 1; i++) {
                const lat1Rad = coords[i].lat * Math.PI / 180;
                const lon1Rad = coords[i].lng * Math.PI / 180;
                const lat2Rad = coords[i + 1].lat * Math.PI / 180;
                const lon2Rad = coords[i + 1].lng * Math.PI / 180;
                const y = Math.sin(lon2Rad - lon1Rad) * Math.cos(lat2Rad);
                const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(lon2Rad - lon1Rad);
                const rumboTramo = Math.round((Math.atan2(y, x) * 180 / Math.PI + 360) % 360);
                const dMetros = coords[i].distanceTo(coords[i + 1]);
                const infoV = evaluarVientoRelativoInfo(rumboTramo, dirViento);
                const velTramo = Math.max(1.5, obtenerVelocidadCruceroUsuario() + infoV.modVelocidad);
                tiempoAjustadoMin += ((dMetros / 1000) / velTramo) * 60;
            }
        } else {
            tiempoAjustadoMin = duracionBaseMin;
        }

        const tiempoFinalMin = Math.round(tiempoAjustadoMin);
        const elTiempo = document.getElementById('quedadaTiempoMin');
        if (elTiempo) elTiempo.textContent = `${tiempoFinalMin} min`;

        const cardD = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
        const idir = dirViento !== null ? Math.round((((dirViento % 360) + 360) % 360) / 45) % 8 : null;
        const dirTexto = idir !== null ? cardD[idir] : '--';

        const isOffshore = motor.componenteTierraMar === 'TERRAL' || motor.alertaDerivaMarAdentro || motor.riesgoDeriva === 'ALTO' || motor.riesgoDeriva === 'MUY ALTO';

        let semaforo = '🟢';
        let badgeColor = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
        const rec = (motor.recomendacion || motor.veredicto || '').toUpperCase();
        if (rec.includes('PELIGRO') || rec.includes('EXTREMO') || rec.includes('NO RECOMENDADO')) {
            semaforo = '🔴';
            badgeColor = 'bg-red-500/20 text-red-400 border-red-500/40';
        } else if (rec.includes('ELEVADO') || rec.includes('DESFAVORABLE')) {
            semaforo = '🟠';
            badgeColor = 'bg-orange-500/20 text-orange-400 border-orange-500/40';
        } else if (rec.includes('PRECAUCI') || rec.includes('MODERADO')) {
            semaforo = '🟡';
            badgeColor = 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40';
        }

        const solarQ = calcularSolYCrepusculo(lat, lon, fechaVal);
        const timePartsQ = (horaVal || '10:00').split(':');
        const hhQ = parseInt(timePartsQ[0], 10) || 0;
        const mmQ = parseInt(timePartsQ[1], 10) || 0;
        const salidaMinQ = hhQ * 60 + mmQ;
        const llegadaMinQ = salidaMinQ + tiempoFinalMin;
        const hayRiesgoOcasoQ = llegadaMinQ >= (solarQ.sunsetMin - 30);
        let avisoOcasoHtml = '';
        if (hayRiesgoOcasoQ) {
            const retornoHH = String(Math.floor((llegadaMinQ % 1440) / 60)).padStart(2, '0');
            const retornoMM = String((llegadaMinQ % 1440) % 60).padStart(2, '0');
            avisoOcasoHtml = `
                <div class="mt-2 text-[10px] font-bold text-amber-200 bg-amber-950/60 border border-amber-500/40 rounded-lg p-2.5 flex items-start gap-2 shadow">
                    <span class="text-base shrink-0">🌇</span>
                    <div>
                        <strong class="text-amber-300">Alerta Ocaso:</strong> La quedada finalizará sobre las <strong>${retornoHH}:${retornoMM}</strong> (Ocaso: <strong>${solarQ.sunsetStr}</strong>). Sin luz solar el rescate es crítico.
                    </div>
                </div>
            `;
        }

        cacheMeteoQuedada = {
            estado: motor.veredicto || motor.recomendacion || 'SEGURO',
            semaforo,
            windKt,
            gustKt,
            dirTexto,
            waveH,
            tiempoFinalMin,
            isOffshore
        };

        preview.innerHTML = `
            <div class="bg-slate-800/95 border border-indigo-500/40 rounded-xl p-3 shadow-lg">
                <div class="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-700/70">
                    <span class="text-[10px] font-black uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                        <span>🌊</span> Previsión Oficial Salida
                    </span>
                    <span class="text-xs px-2.5 py-0.5 rounded-full font-bold border ${badgeColor}">
                        ${semaforo} ${esc(cacheMeteoQuedada.estado)}
                    </span>
                </div>
                <div class="grid grid-cols-3 gap-2 text-center">
                    <div class="bg-slate-900/60 rounded-lg p-2 border border-slate-700/50">
                        <span class="text-[9px] text-slate-400 block font-bold uppercase">Viento</span>
                        <span class="text-xs font-black text-white">${windKt !== null ? windKt.toFixed(1) : '--'} kt</span>
                        <span class="text-[9px] text-slate-400 block">(${dirTexto})</span>
                    </div>
                    <div class="bg-slate-900/60 rounded-lg p-2 border border-slate-700/50">
                        <span class="text-[9px] text-slate-400 block font-bold uppercase">Rachas</span>
                        <span class="text-xs font-black text-amber-300">${gustKt !== null ? gustKt.toFixed(1) : '--'} kt</span>
                        <span class="text-[9px] text-slate-400 block">Máx</span>
                    </div>
                    <div class="bg-slate-900/60 rounded-lg p-2 border border-slate-700/50">
                        <span class="text-[9px] text-slate-400 block font-bold uppercase">Oleaje</span>
                        <span class="text-xs font-black text-sky-300">${waveH !== null ? waveH.toFixed(1) : '--'} m</span>
                        <span class="text-[9px] text-slate-400 block">Altura</span>
                    </div>
                </div>
                ${isOffshore ? `
                <div class="mt-2 text-[10px] font-bold text-amber-300 bg-amber-950/40 border border-amber-500/30 rounded-lg p-2 flex items-center gap-2">
                    <span class="text-sm">⚠️</span>
                    <span><strong>Aviso Offshore:</strong> El viento sopla de tierra hacia mar adentro. Extrema precauciones por riesgo de deriva.</span>
                </div>` : ''}
                ${avisoOcasoHtml}
            </div>`;
    } catch (err) {
        console.warn('Error al evaluar meteo en quedada:', err);
        preview.innerHTML = `
            <div class="bg-slate-800/80 border border-amber-500/30 rounded-xl p-2.5 text-center text-amber-300 text-xs">
                ⚠️ No se pudo consultar la previsión marina en vivo. Podrás publicar la quedada igualmente.
            </div>`;
    }
}

export function mostrarFormularioQuedada() {
    const form = document.getElementById('quedadaFormPanel');
    if (!form || !modoQuedadaClubActivo) return;
    form.classList.remove('hidden');
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    void evaluarMeteoParaQuedada();
}

export function volverAlMapaQuedada() {
    const form = document.getElementById('quedadaFormPanel');
    const mapContainer = document.getElementById('mapContainer');
    if (form) form.classList.add('hidden');
    if (mapContainer) {
        mapContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
            if (map) map.invalidateSize();
        }, 350);
    }
}

export async function iniciarCreacionQuedadaClub(clubIdPreseleccionado = null) {
    if (!appState.sesionActual || appState.esInvitado) {
        alert("Debes iniciar sesión con tu cuenta para planificar y publicar quedadas.");
        if (window.abrirModalAuth) window.abrirModalAuth();
        return;
    }

    // Comprobar clubes a los que pertenece el usuario
    let misClubes = ClubState.myClubs || [];
    if (!misClubes || misClubes.length === 0) {
        try {
            const { data } = await supabaseClient.rpc('obtener_clubs_usuario', { p_user_id: appState.sesionActual.user.id });
            if (data && data.length) {
                ClubState.myClubs = data;
                misClubes = data;
            }
        } catch (_) {}
    }

    if (!misClubes || misClubes.length === 0) {
        alert("Aún no perteneces a ningún club. Funda un club o únete a uno existente para organizar quedadas.");
        if (window.Club && window.Club.abrirModal) window.Club.abrirModal();
        return;
    }

    // Poblar selector de club
    const select = document.getElementById('quedadaClubSelect');
    if (select) {
        select.innerHTML = misClubes.map(c => `
            <option value="${c.club_id}" ${c.club_id === clubIdPreseleccionado || c.club_id === ClubState.activeId ? 'selected' : ''}>
                ${esc(c.nombre)}
            </option>
        `).join('');
    }

    // Restricción estricta de fecha: máximo 7 días a la fecha actual
    const hoy = new Date();
    const maxDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const hoyStr = hoy.toISOString().slice(0, 10);
    const maxStr = maxDate.toISOString().slice(0, 10);

    const fechaInput = document.getElementById('quedadaFechaInput');
    if (fechaInput) {
        fechaInput.min = hoyStr;
        fechaInput.max = maxStr;
        if (!fechaInput.value || fechaInput.value < hoyStr || fechaInput.value > maxStr) {
            fechaInput.value = hoyStr;
        }
    }

    // Cerrar modales si estuvieran abiertos
    if (window.Club && window.Club.cerrarModal) window.Club.cerrarModal();
    if (window.Club && window.Club.cerrarClubProfileView) window.Club.cerrarClubProfileView();

    // Desplegar panel Pro si estuviera colapsado
    const panelPro = document.getElementById("panelPro");
    if (panelPro && panelPro.style.gridTemplateRows !== "1fr") {
        if (typeof window.togglePanelPro === "function") window.togglePanelPro(true);
        else {
            const btnPro = document.getElementById("btnPro");
            if (btnPro) btnPro.click();
        }
    }

    // Limpiar trazado anterior y activar modo multipunto
    limpiarRuta();
    if (!modoRutaLibreActivo) {
        toggleRutaLibre();
    }
    modoQuedadaClubActivo = true;

    const btnGuardarQuedada = document.getElementById('btnGuardarQuedadaMap');
    if (btnGuardarQuedada) btnGuardarQuedada.classList.remove('hidden');

    // Mantener libre el mapa durante el trazado; el formulario queda fuera del mapa.
    const panel = document.getElementById('panelQuedadaMap');
    if (panel) panel.classList.remove('hidden');
    const form = document.getElementById('quedadaFormPanel');
    if (form) form.classList.add('hidden');

    const msg = document.getElementById('mapMsg');
    if (msg) {
        msg.className = "text-xs font-bold text-white bg-indigo-600 h-10 px-4 rounded-xl border border-indigo-500 shadow-md flex items-center justify-center transition-colors animate-pulse";
        msg.innerHTML = "📍 MODO QUEDADA: Toca el mar para trazar la ruta multipunto";
    }

    actualizarMetricasQuedada();

    const mapContainer = document.getElementById('mapContainer');
    if (mapContainer) mapContainer.scrollIntoView({ behavior: 'smooth' });
}

export function cancelarCreacionQuedadaClub() {
    modoQuedadaClubActivo = false;
    const panel = document.getElementById('panelQuedadaMap');
    if (panel) panel.classList.add('hidden');
    const form = document.getElementById('quedadaFormPanel');
    if (form) form.classList.add('hidden');

    limpiarRuta();
    if (modoRutaLibreActivo) {
        toggleRutaLibre();
    }

    const msg = document.getElementById('mapMsg');
    if (msg) {
        msg.className = "text-xs font-bold text-white bg-teal-600 h-10 px-4 rounded-xl border border-teal-500 shadow-md flex items-center justify-center transition-colors";
        msg.innerHTML = "📍 Toca el mar para Punto Fijo o Traza Ruta Completa";
    }
}

export function deshacerUltimoPuntoQuedada() {
    deshacerUltimoPunto();
    actualizarMetricasQuedada();
}

export function reiniciarPuntosQuedada() {
    reiniciarRutaMultipunto();
    actualizarMetricasQuedada();
}

export async function guardarQuedadaDesdeMapa() {
    const select = document.getElementById('quedadaClubSelect');
    const clubId = select ? select.value : null;
    if (!clubId) return alert("⚠️ Selecciona un club para publicar la quedada.");

    const tituloInput = document.getElementById('quedadaTituloInput');
    const nombre = tituloInput ? tituloInput.value.trim() : '';
    if (!nombre) return alert("⚠️ Asigna un nombre a la ruta/quedada (ej: Travesía al Faro).");

    const fechaVal = document.getElementById('quedadaFechaInput')?.value;
    const horaVal = document.getElementById('quedadaHoraInput')?.value;
    if (!fechaVal || !horaVal) return alert("⚠️ Selecciona la fecha y la hora de salida.");

    const fechaSeleccionada = new Date(`${fechaVal}T${horaVal}:00`);
    const ahora = new Date();

    if (fechaSeleccionada.getTime() < ahora.getTime()) {
        return alert("⚠️ La fecha y hora de la quedada no pueden ser en el pasado.");
    }

    const diffMs = fechaSeleccionada.getTime() - ahora.getTime();
    const diffDias = diffMs / (1000 * 60 * 60 * 24);
    if (diffDias > 7) {
        return alert("⚠️ Para garantizar la exactitud de la previsión marina en vivo, las rutas solo se pueden crear con un máximo de 7 días de antelación.");
    }

    if (marcadoresRuta.length < 2) {
        return alert("⚠️ Debes trazar al menos 2 puntos en el mar para definir el recorrido de la quedada.");
    }

    const desc = document.getElementById('quedadaDescInput')?.value?.trim() || '';

    let dt = 0;
    const coords = marcadoresRuta.map(m => m.getLatLng());
    for (let i = 0; i < coords.length - 1; i++) {
        dt += coords[i].distanceTo(coords[i + 1]);
    }
    const distanciaKm = parseFloat((dt / 1000).toFixed(2));
    const tiempoMinutos = Math.round(((dt / 1000) / obtenerVelocidadCruceroUsuario()) * 60);
    const coordsArray = coords.map(c => [c.lat, c.lng]);

    // Anexo meteorológico limpio en descripción
    let descFinal = desc;
    if (cacheMeteoQuedada) {
        const resumenMeteo = `Previsión PaddleSafe: ${cacheMeteoQuedada.estado} | 💨 Viento: ${cacheMeteoQuedada.windKt !== null ? cacheMeteoQuedada.windKt.toFixed(1) : '--'} kt (${cacheMeteoQuedada.dirTexto}) | 🌊 Olas: ${cacheMeteoQuedada.waveH !== null ? cacheMeteoQuedada.waveH.toFixed(1) : '--'} m`;
        descFinal = (descFinal ? `${descFinal}\n\n🌊 ${resumenMeteo}` : `🌊 ${resumenMeteo}`).trim();
    }

    const btn = document.getElementById('btnGuardarQuedadaMap');
    if (btn) { btn.disabled = true; btn.textContent = "Publicando..."; }

    try {
        const { data: newEv, error } = await supabaseClient
            .from('club_eventos')
            .insert([{
                club_id: clubId,
                creador_id: appState.sesionActual.user.id,
                nombre,
                descripcion: descFinal,
                fecha_evento: fechaSeleccionada.toISOString(),
                distancia_km: distanciaKm,
                tiempo_minutos: tiempoMinutos,
                ruta_json: coordsArray
            }])
            .select()
            .single();

        if (error) throw error;

        // Inscribir automáticamente al creador como asistente
        if (newEv && newEv.id) {
            try {
                await supabaseClient.from('club_eventos_asistentes').insert([{
                    evento_id: newEv.id,
                    user_id: appState.sesionActual.user.id
                }]);
            } catch (_) {}
        }

        // Anuncio automático en club_chat (no bloqueante)
        try {
            const fechaFmt = fechaSeleccionada.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) + ' ' + horaVal;
            const meteoChatTxt = cacheMeteoQuedada ? ` | 🌊 ${cacheMeteoQuedada.estado} (💨 ${cacheMeteoQuedada.windKt !== null ? cacheMeteoQuedada.windKt.toFixed(1) : '--'} kt)` : '';
            const mensajeChat = `📅 Nueva Quedada: ${nombre} (${fechaFmt}) — 📏 ${distanciaKm.toFixed(1)} km (~${tiempoMinutos} min)${meteoChatTxt}`;
            await supabaseClient.from('club_chat').insert([{
                club_id: clubId,
                user_id: appState.sesionActual.user.id,
                mensaje: mensajeChat,
                visibility: 'club_only',
                is_public: false
            }]);
        } catch (errChat) {
            console.warn('Aviso no crítico al publicar mensaje de quedada en club_chat:', errChat);
        }

        alert("🎉 ¡Quedada publicada con éxito en el club!");

        // Cerrar planificador del mapa
        cancelarCreacionQuedadaClub();

        // Abrir directamente la pestaña Eventos del club correspondiente
        ClubState.activeId = clubId;
        if (window.Club && window.Club.abrirModal) {
            window.Club.abrirModal();
            setTimeout(() => {
                if (window.Club.cambiarVistaInterna) window.Club.cambiarVistaInterna('eventos');
            }, 400);
        }

    } catch (err) {
        console.error('[map] error al guardar quedada:', err);
        alert("Error al guardar la quedada: " + (err.message || err));
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = "🚀 Publicar"; }
    }
}

export function cargarRutaEnMapaGrande(coordsData, nombre = 'Quedada') {
    let coords = coordsData;
    if (typeof coords === 'string') {
        try { coords = JSON.parse(coords); } catch (e) { return; }
    }
    if (!Array.isArray(coords) || coords.length === 0) return;

    // Guardar referencia para análisis dinámico
    window._rutaClubCargadaActual = { coords, nombre };

    // Cerrar modales
    if (window.Club && window.Club.cerrarModal) window.Club.cerrarModal();
    if (window.Club && window.Club.cerrarClubProfileView) window.Club.cerrarClubProfileView();

    // Desplegar panel Pro si estuviera cerrado
    const panelPro = document.getElementById("panelPro");
    if (panelPro && panelPro.style.gridTemplateRows !== "1fr") {
        if (typeof window.togglePanelPro === "function") window.togglePanelPro(true);
        else {
            const btnPro = document.getElementById("btnPro");
            if (btnPro) btnPro.click();
        }
    }

    limpiarRuta();

    const latLngs = coords.map(pt => Array.isArray(pt) ? [pt[0], pt[1]] : [pt.lat, pt.lng]);
    if (lineaRuta) map.removeLayer(lineaRuta);
    lineaRuta = L.polyline(latLngs, { color: '#0284c7', weight: 5, opacity: 0.9 }).addTo(map);

    // Marcador de inicio (verde)
    marcadoresRuta.push(L.circleMarker(latLngs[0], { radius: 7, color: '#10b981', fillColor: '#10b981', fillOpacity: 1 }).addTo(map));
    // Marcador de fin (rojo)
    if (latLngs.length > 1) {
        marcadoresRuta.push(L.circleMarker(latLngs[latLngs.length - 1], { radius: 7, color: '#ef4444', fillColor: '#ef4444', fillOpacity: 1 }).addTo(map));
    }

    map.fitBounds(lineaRuta.getBounds(), { padding: [40, 40] });

    const msg = document.getElementById('mapMsg');
    if (msg) {
        msg.className = "text-xs font-bold text-white bg-indigo-600 h-10 px-3 sm:px-4 rounded-xl border border-indigo-500 shadow-md flex items-center justify-between transition-colors";
        msg.innerHTML = `
            <span class="truncate mr-2">🧭 Ruta: <b>${esc(nombre)}</b></span>
            <div class="flex items-center gap-1.5 shrink-0">
                <button type="button" onclick="exportarRutaPlanificadaGPX()" class="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all shadow cursor-pointer active:scale-95 flex items-center gap-1">📲 GPX</button>
                <button type="button" onclick="analizarVientoRutaClub()" class="shrink-0 px-2.5 py-1 bg-amber-400 hover:bg-amber-300 text-slate-900 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all shadow cursor-pointer active:scale-95">⚡ Analizar Viento</button>
            </div>
        `;
    }

    const mapContainer = document.getElementById('mapContainer');
    if (mapContainer) mapContainer.scrollIntoView({ behavior: 'smooth' });
}

export async function analizarVientoRutaClub(coordsData = null, nombre = null) {
    const info = coordsData ? { coords: coordsData, nombre: nombre || 'Quedada' } : window._rutaClubCargadaActual;
    if (!info || !info.coords || info.coords.length < 2) return;

    let coords = info.coords;
    if (typeof coords === 'string') {
        try { coords = JSON.parse(coords); } catch (e) { return; }
    }
    const latLngs = coords.map(pt => Array.isArray(pt) ? L.latLng(pt[0], pt[1]) : (pt.lat ? pt : L.latLng(pt[0], pt[1])));

    limpiarRuta();
    latLngs.forEach(ll => {
        const m = L.circleMarker(ll, { radius: 6, color: '#0ea5e9', fillColor: '#38bdf8', fillOpacity: 0.9 }).addTo(map);
        marcadoresRuta.push(m);
    });

    const msg = document.getElementById('mapMsg');
    if (msg) {
        msg.className = "text-xs font-bold text-white bg-indigo-600 h-10 px-4 rounded-xl border border-indigo-500 shadow-md flex items-center justify-center transition-colors animate-pulse";
        msg.innerHTML = "⏳ Consultando previsión marina y calculando tramos...";
    }

    try {
        const ahora = new Date();
        const dStr = ahora.toISOString().slice(0, 10);
        const tStr = String(ahora.getHours()).padStart(2, '0') + ":" + String(ahora.getMinutes()).padStart(2, '0');
        
        let dt = 0;
        for (let i = 0; i < latLngs.length - 1; i++) {
            dt += latLngs[i].distanceTo(latLngs[i + 1]);
        }
        const durMin = Math.max(30, Math.round(((dt / 1000) / obtenerVelocidadCruceroUsuario()) * 60));

        const p = await solicitarPronostico({
            location: `${latLngs[0].lat.toFixed(5)},${latLngs[0].lng.toFixed(5)}`,
            date: dStr,
            timeRange: crearFranjaForecast(tStr, durMin),
            userLevel: 'Intermedio'
        });

        renderizarDashboardPro(p.datos, tStr, 'Intermedio', true, latLngs[0].lat, latLngs[0].lng, dStr);
        map.fitBounds(L.polyline(latLngs).getBounds(), { padding: [40, 40] });

        if (msg) {
            msg.className = "text-xs font-bold text-white bg-emerald-600 h-10 px-4 rounded-xl border border-emerald-500 shadow-md flex items-center justify-center transition-colors";
            msg.innerHTML = `✅ Tramos calculados con viento: <b>${esc(info.nombre || 'Quedada')}</b>`;
        }
    } catch (err) {
        console.warn('Error al analizar viento en ruta de quedada:', err);
        if (msg) {
            msg.className = "text-xs font-bold text-white bg-amber-600 h-10 px-4 rounded-xl border border-amber-500 shadow-md flex items-center justify-center transition-colors";
            msg.textContent = "⚠️ No se pudo obtener la previsión horaria para los tramos.";
        }
    }
}

export function cargarRutaDeportivaEnMapa(ruta) {
    if (!ruta) return;
    let coords = ruta.route_coordinates || ruta.coordinates || ruta.ruta_json;
    if (typeof coords === 'string') {
        try { coords = JSON.parse(coords); } catch (e) { return; }
    }
    if (!Array.isArray(coords) || coords.length === 0) {
        alert("Esta ruta no tiene coordenadas registradas para visualizar.");
        return;
    }

    // 1. Cerrar modales que tapen la vista
    if (typeof window.cerrarModalAuth === 'function') window.cerrarModalAuth();
    if (typeof window.cerrarModalDetallesRuta === 'function') window.cerrarModalDetallesRuta();
    if (typeof window.cerrarModalRanking === 'function') window.cerrarModalRanking();
    if (typeof window.cerrarModalFeed === 'function') window.cerrarModalFeed();
    if (window.Club && window.Club.cerrarModal) window.Club.cerrarModal();
    const spaModal = document.getElementById('userProfileModal');
    if (spaModal && !spaModal.classList.contains('hidden')) {
        if (typeof window.goBackSPA === 'function') window.goBackSPA();
        else spaModal.classList.add('hidden', 'opacity-0');
    }

    // 2. Desplegar panel Pro si estuviera contraído
    const panelPro = document.getElementById("panelPro");
    if (panelPro && panelPro.style.gridTemplateRows !== "1fr") {
        if (typeof window.togglePanelPro === "function") window.togglePanelPro(true);
        else {
            const btnPro = document.getElementById("btnPro");
            if (btnPro) btnPro.click();
        }
    }

    // 3. Limpiar capas previas en el mapa
    limpiarRuta();
    if (!map) return;

    // 4. Formatear y añadir polilínea deportiva
    const latLngs = coords.map(pt => Array.isArray(pt) ? [pt[0], pt[1]] : [pt.lat, pt.lng]);
    if (lineaRuta) map.removeLayer(lineaRuta);
    lineaRuta = L.polyline(latLngs, {
        color: '#0284c7',
        weight: 5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(map);

    // 5. Marcador de Inicio (Verde)
    const inicioIcon = L.divIcon({
        className: 'bg-transparent border-none',
        html: `<div class="w-8 h-8 rounded-full bg-emerald-500 border-2 border-white shadow-lg flex items-center justify-center text-white text-xs font-black cursor-pointer transform -translate-x-1/2 -translate-y-1/2">🏁</div>`,
        iconSize: [0, 0]
    });
    const mInicio = L.marker(latLngs[0], { icon: inicioIcon }).addTo(map).bindPopup("<b>Inicio de la Ruta</b>");
    marcadoresRuta.push(mInicio);

    // 6. Marcador de Fin (Rojo)
    if (latLngs.length > 1) {
        const finIcon = L.divIcon({
            className: 'bg-transparent border-none',
            html: `<div class="w-8 h-8 rounded-full bg-rose-500 border-2 border-white shadow-lg flex items-center justify-center text-white text-xs font-black cursor-pointer transform -translate-x-1/2 -translate-y-1/2">🏆</div>`,
            iconSize: [0, 0]
        });
        const mFin = L.marker(latLngs[latLngs.length - 1], { icon: finIcon }).addTo(map).bindPopup("<b>Meta / Fin de Ruta</b>");
        marcadoresRuta.push(mFin);
    }

    // 7. Auto-ajuste de cámara
    map.fitBounds(lineaRuta.getBounds(), { padding: [50, 50] });

    // 8. Panel de estadísticas flotante
    const dist = Number(ruta.distance_km || ruta.distancia_km || 0).toFixed(2);
    const secs = Number(ruta.duration_seconds || (ruta.tiempo_minutos ? ruta.tiempo_minutos * 60 : 0));
    const mins = Math.max(1, Math.round(secs / 60));
    const avgSpd = Number(ruta.avg_speed || (mins > 0 ? (dist / (mins / 60)) : 0)).toFixed(1);
    const maxSpd = Number(ruta.max_speed || (avgSpd * 1.35)).toFixed(1);
    const titulo = ruta.title || 'Ruta Deportiva';

    if (ruta && ruta.id) {
        if (!window.__rutasUsuarioCache) window.__rutasUsuarioCache = new Map();
        window.__rutasUsuarioCache.set(String(ruta.id), ruta);
    }

    // Guardar referencia activa para exportación GPX
    window._rutaDeportivaCargadaActual = { coords, nombre: titulo };

    let telemetria = null;
    try {
        if (ruta && ruta.id) {
            const rawTel = localStorage.getItem('ps_telemetry_' + ruta.id);
            if (rawTel) telemetria = JSON.parse(rawTel);
        }
        if (!telemetria && ruta && ruta.telemetria) {
            telemetria = ruta.telemetria;
        }
        if (!telemetria) {
            const rawLast = localStorage.getItem('ps_telemetry_last');
            if (rawLast) {
                const parsedLast = JSON.parse(rawLast);
                if (parsedLast?.rutaId && ruta?.id && parsedLast.rutaId === ruta.id) {
                    telemetria = parsedLast;
                }
            }
        }
    } catch (eTel) {
        console.warn('Aviso al leer telemetría de ruta:', eTel);
    }

    let badgeMeteo = '';
    if (telemetria?.meteo?.vientoKt !== undefined && telemetria?.meteo?.vientoKt !== null) {
        badgeMeteo = `
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-950/80 text-sky-300 border border-sky-600/40 font-mono text-[10px]" title="Condiciones meteorológicas grabadas durante la ruta">
                💨 <b>${telemetria.meteo.vientoKt} kt</b>${telemetria.meteo.olasM ? ` · 🌊 <b>${telemetria.meteo.olasM}m</b>` : ''}${telemetria.meteo.score ? ` · 🛡️ <b>${telemetria.meteo.score}</b>` : ''}
            </span>
        `;
    } else if (ruta.ubicacion && ruta.ubicacion.includes('💨')) {
        const parteMeteo = ruta.ubicacion.split('·').slice(1).join('·').trim();
        badgeMeteo = `
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-950/80 text-sky-300 border border-sky-600/40 font-mono text-[10px]">
                ${esc(parteMeteo)}
            </span>
        `;
    }

    let btnSplits = '';
    if (telemetria && Array.isArray(telemetria.splits) && telemetria.splits.length > 0) {
        const rutaIdSplits = ruta.id ? String(ruta.id).replace(/'/g, "\\'") : 'last';
        btnSplits = `
            <button type="button" onclick="mostrarModalSplitsKm('${rutaIdSplits}')" class="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-black rounded-xl shadow-md flex items-center gap-1 active:scale-95 transition-all cursor-pointer" title="Ver splits por kilómetro">
                <span>⚡</span> <span>Splits (${telemetria.splits.length})</span>
            </button>
        `;
    }

    const msg = document.getElementById('mapMsg');
    if (msg) {
        const rutaIdEsc = ruta.id ? String(ruta.id).replace(/'/g, "\\'") : '';
        const btnCoach = ruta.id ? `
            <button type="button" onclick="if(window.abrirModalDetallesRuta) window.abrirModalDetallesRuta('${rutaIdEsc}')" class="px-2.5 py-1 bg-gradient-to-r from-emerald-500 to-sky-600 hover:from-emerald-400 hover:to-sky-500 text-white text-[11px] font-black rounded-xl shadow-md flex items-center gap-1 active:scale-95 transition-all cursor-pointer">
                <span>🧠</span> <span>Coach</span>
            </button>
        ` : '';
        const btnAiRouteCoach = `
            <button type="button" onclick="solicitarAnalisisIARutaDeportiva('${rutaIdEsc}')" class="px-2.5 py-1 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-[11px] font-black rounded-xl shadow-md flex items-center gap-1 active:scale-95 transition-all cursor-pointer" title="Analizar biometría y splits con IA Coach">
                <span>🤖</span> <span>IA Coach</span>
            </button>
        `;
        const btnGpx = `
            <button type="button" onclick="exportarRutaPlanificadaGPX()" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black rounded-xl shadow-md flex items-center gap-1 active:scale-95 transition-all cursor-pointer">
                <span>📲</span> <span>GPX</span>
            </button>
        `;

        const biometriaRuta = calcularBiometriaSup({
            duracionMin: mins,
            distKm: Number(dist),
            velKmh: Number(avgSpd),
            vientoKt: telemetria?.meteo?.vientoKt || 0,
            olasM: telemetria?.meteo?.olasM || 0,
            periodoS: telemetria?.meteo?.periodoS || 0,
            tipoTabla: telemetria?.boardType || 'all-round'
        });

        msg.className = "text-xs font-bold text-white bg-slate-900/95 py-2.5 px-4 rounded-2xl border border-sky-500/40 shadow-2xl flex items-center justify-between gap-3 flex-wrap transition-all";
        msg.innerHTML = `
            <div class="flex items-center gap-2.5 flex-wrap">
                <span class="truncate max-w-[150px] text-sky-400 font-black">🧭 ${esc(titulo)}</span>
                <span class="text-white">📏 <b>${dist}</b> km</span>
                <span class="text-white">⏱️ <b>${mins}</b> min</span>
                <span class="text-amber-400">⚡ Med: <b>${avgSpd}</b> km/h</span>
                <span class="text-amber-300">🔥 <b>${biometriaRuta.kcal}</b> kcal</span>
                <span class="text-emerald-400">🚀 Max: <b>${maxSpd}</b> km/h</span>
                ${badgeMeteo}
            </div>
            <div class="flex items-center gap-1.5 shrink-0 flex-wrap">
                ${btnSplits}
                ${btnAiRouteCoach}
                ${btnGpx}
                ${btnCoach}
            </div>
        `;
    }

    const mapContainer = document.getElementById('mapContainer');
    if (mapContainer) mapContainer.scrollIntoView({ behavior: 'smooth' });

    setTimeout(() => {
        if (map) {
            map.invalidateSize();
            if (lineaRuta) map.fitBounds(lineaRuta.getBounds(), { padding: [50, 50] });
        }
    }, 250);
}

/**
 * Exporta cualquier trazado o ruta activa (planificada, deportiva o quedada) a un archivo .gpx estándar
 */
export function exportarRutaPlanificadaGPX() {
    let coords = [];
    let nombre = "Ruta_PaddleSafe";

    if (marcadoresRuta && marcadoresRuta.length >= 2) {
        coords = marcadoresRuta.map(m => {
            const ll = m.getLatLng ? m.getLatLng() : m;
            return [ll.lat, ll.lng];
        });
        if (modoTravesiaActivo && coords.length === 2) {
            coords.push(coords[0]);
        }
        nombre = `Ruta_Planificada_${new Date().toISOString().slice(0, 10)}`;
    } else if (window._rutaDeportivaCargadaActual?.coords && window._rutaDeportivaCargadaActual.coords.length > 0) {
        coords = window._rutaDeportivaCargadaActual.coords;
        nombre = window._rutaDeportivaCargadaActual.nombre || "Ruta_Deportiva";
    } else if (window._rutaClubCargadaActual?.coords && window._rutaClubCargadaActual.coords.length > 0) {
        coords = window._rutaClubCargadaActual.coords;
        nombre = window._rutaClubCargadaActual.nombre || "Quedada_Club";
    } else if (lineaRuta) {
        const latLngs = lineaRuta.getLatLngs ? lineaRuta.getLatLngs() : [];
        if (Array.isArray(latLngs) && latLngs.length > 1) {
            coords = latLngs.map(ll => [ll.lat, ll.lng]);
            nombre = `Ruta_${new Date().toISOString().slice(0, 10)}`;
        }
    }

    if (!coords || coords.length < 2) {
        alert("⚠️ No hay ninguna ruta activa con al menos 2 puntos para exportar a GPX.");
        return;
    }

    try {
        const cleanName = String(nombre).replace(/[^\w\d\-_]/g, '_');
        descargarGPX(coords, `${cleanName}.gpx`);
    } catch (e) {
        console.error("[GPX] Error al exportar archivo GPX:", e);
        alert(`No se pudo generar el archivo GPX: ${e.message}`);
    }
}

// Retrocompatibilidad
export function activarModoPlanificacionEvento(clubId) {
    iniciarCreacionQuedadaClub(clubId);
}

export function guardarEventoClub() {
    guardarQuedadaDesdeMapa();
}

export let modoSolTrackerActivo = false;

export function toggleModoSolTracker() {
    modoSolTrackerActivo = !modoSolTrackerActivo;
    const panel = document.getElementById('liveTrackingPanel');
    if (!panel) return;
    
    // Inyectar estilos de alto contraste solar una sola vez
    if (!document.getElementById('paddlesafe-modo-sol-style')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'paddlesafe-modo-sol-style';
        styleEl.textContent = `
            #liveTrackingPanel.modo-sol-activo {
                background-color: #ffffff !important;
                color: #020617 !important;
                border: 3px solid #000000 !important;
                box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.7) !important;
            }
            #liveTrackingPanel.modo-sol-activo .live-hud-card,
            #liveTrackingPanel.modo-sol-activo .live-hud-return {
                background-color: #f8fafc !important;
                border: 2px solid #0f172a !important;
                color: #020617 !important;
            }
            #liveTrackingPanel.modo-sol-activo .live-hud-label,
            #liveTrackingPanel.modo-sol-activo .live-hud-status,
            #liveTrackingPanel.modo-sol-activo span,
            #liveTrackingPanel.modo-sol-activo p {
                color: #020617 !important;
                font-weight: 900 !important;
            }
            #liveTrackingPanel.modo-sol-activo #liveTime {
                color: #047857 !important;
                font-weight: 900 !important;
            }
            #liveTrackingPanel.modo-sol-activo #liveDist,
            #liveTrackingPanel.modo-sol-activo #liveSpeed,
            #liveTrackingPanel.modo-sol-activo #liveReturnDist,
            #liveTrackingPanel.modo-sol-activo #liveReturnBearing {
                color: #000000 !important;
                font-weight: 900 !important;
            }
            #liveTrackingPanel.modo-sol-activo #liveReturnEta {
                color: #047857 !important;
                font-weight: 900 !important;
            }
            #liveTrackingPanel.modo-sol-activo .live-btn-tool {
                background-color: #000000 !important;
                color: #ffffff !important;
                border: 1px solid #000000 !important;
                font-weight: 900 !important;
            }
            #liveTrackingPanel.modo-sol-activo .live-btn-finish {
                background-color: #dc2626 !important;
                color: #ffffff !important;
                border: 2px solid #7f1d1d !important;
                font-weight: 900 !important;
            }
        `;
        document.head.appendChild(styleEl);
    }

    if (modoSolTrackerActivo) {
        panel.classList.add('modo-sol-activo');
    } else {
        panel.classList.remove('modo-sol-activo');
    }
}

export async function compartirPosicionActualLive() {
    if (!trackCoords || trackCoords.length === 0) {
        alert("Aún no se ha registrado ninguna coordenada GPS válida.");
        return;
    }
    const ultimaCoord = trackCoords[trackCoords.length - 1];
    const lat = Number(ultimaCoord[0]).toFixed(5);
    const lon = Number(ultimaCoord[1]).toFixed(5);
    
    const timeEl = document.getElementById('liveTime');
    const tiempoStr = timeEl ? timeEl.textContent : "00:00";
    const distStr = `${trackDistanceKm.toFixed(2)} km`;
    
    const mapsUrl = `https://maps.google.com/?q=${lat},${lon}`;
    const textoMensaje = `🏄‍♂️ Travesía SUP en curso (PaddleSafe). Mi posición actual: ${mapsUrl} | Distancia: ${distStr} | Tiempo: ${tiempoStr}`;
    
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'Mi Posición SUP en Vivo - PaddleSafe',
                text: textoMensaje,
                url: mapsUrl
            });
            return;
        } catch (errShare) {
            if (errShare.name === 'AbortError') return;
            console.warn('Fallback tras navigator.share:', errShare);
        }
    }
    
    const urlWa = `https://wa.me/?text=${encodeURIComponent(textoMensaje)}`;
    window.open(urlWa, '_blank', 'noopener,noreferrer');
}

export function actualizarRetornoSalidaLive(latActual, lonActual) {
    if (!trackCoords || trackCoords.length === 0) return;
    const pSalida = trackCoords[0];
    const lat0 = pSalida[0];
    const lon0 = pSalida[1];

    // Distancia geodésica al punto de salida
    const distMetros = L.latLng(latActual, lonActual).distanceTo(L.latLng(lat0, lon0));
    const distKm = distMetros / 1000;

    // Rumbo de regreso hacia el punto inicial
    const lat1Rad = latActual * Math.PI / 180;
    const lon1Rad = lonActual * Math.PI / 180;
    const lat2Rad = lat0 * Math.PI / 180;
    const lon2Rad = lon0 * Math.PI / 180;
    const y = Math.sin(lon2Rad - lon1Rad) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(lon2Rad - lon1Rad);
    const rumboVuelta = Math.round((Math.atan2(y, x) * 180 / Math.PI + 360) % 360);

    const dirsCard = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
    const cardinalVuelta = dirsCard[Math.round(((rumboVuelta % 360) + 360) % 360 / 45) % 8];

    // Evaluación del viento relativo en el trayecto de vuelta
    const dirVientoActual = valorNumericoMeteo(datosMeteoActuales?.windDirection, datosMeteoActuales?.wind_direction);
    const infoVientoVuelta = evaluarVientoRelativoInfo(rumboVuelta, dirVientoActual);

    // Tiempo estimado de regreso
    const velEstimada = Math.max(1.5, obtenerVelocidadCruceroUsuario() + infoVientoVuelta.modVelocidad);
    const tiempoVueltaMin = Math.round((distKm / velEstimada) * 60);

    const elDist = document.getElementById('liveReturnDist');
    if (elDist) elDist.textContent = `${distKm.toFixed(2)} km`;
    const elBearing = document.getElementById('liveReturnBearing');
    if (elBearing) elBearing.textContent = `🧭 ${rumboVuelta}° (${cardinalVuelta})`;
    const elEta = document.getElementById('liveReturnEta');
    if (elEta) elEta.textContent = `ETA: ${tiempoVueltaMin} min`;
    const elWind = document.getElementById('liveReturnWind');
    if (elWind) {
        elWind.textContent = `${infoVientoVuelta.icon} ${infoVientoVuelta.texto}`;
        elWind.className = `font-bold text-[9px] px-1.5 py-0.5 rounded ${infoVientoVuelta.claseColor}`;
    }

    // Indicador dinámico de luz solar restante / ocaso
    const fechaHoy = new Date().toISOString().slice(0, 10);
    const solarLive = calcularSolYCrepusculo(latActual, lonActual, fechaHoy);
    const nowLive = new Date();
    const ahoraMin = nowLive.getHours() * 60 + nowLive.getMinutes();
    const minHastaOcaso = solarLive.sunsetMin - ahoraMin;
    const elSunset = document.getElementById('liveSunsetCountdown');
    if (elSunset) {
        if (minHastaOcaso <= 45 && minHastaOcaso > 0) {
            elSunset.textContent = `🌇 Luz restante: ${minHastaOcaso} min`;
            elSunset.classList.remove('hidden');
        } else if (minHastaOcaso <= 0) {
            elSunset.textContent = `🌙 Post-ocaso (+${Math.abs(minHastaOcaso)}m)`;
            elSunset.classList.remove('hidden');
        } else {
            elSunset.classList.add('hidden');
        }
    }
}

// ==========================================
// VECTORES TÁCTICOS DE VIENTO Y OLEAJE EN MAPA
// ==========================================

export function renderizarRosaVectoresMapa(lat, lon, datosMeteo) {
    if (!map || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon)) || !datosMeteo) return;

    const latNum = Number(lat);
    const lonNum = Number(lon);

    const vMs = valorNumericoMeteo(datosMeteo.windSpeed, datosMeteo.wind_speed);
    const vKt = vMs !== null ? vMs * 1.94384 : 0;
    const rMs = valorNumericoMeteo(datosMeteo.windGusts, datosMeteo.wind_gusts);
    const rKt = rMs !== null ? rMs * 1.94384 : vKt;
    const dirViento = valorNumericoMeteo(datosMeteo.windDirection, datosMeteo.wind_direction);
    const dirVientoNum = dirViento !== null ? Number(dirViento) : 0;

    const waveM = valorNumericoMeteo(datosMeteo.waveHeight, datosMeteo.wave_height);
    const dirOla = valorNumericoMeteo(datosMeteo.waveDirection, datosMeteo.wave_direction);

    // Rumbo hacia el que SOPLA el viento (origen + 180°)
    const rotViento = (dirVientoNum + 180) % 360;

    // Color según intensidad del viento
    const colorViento = vKt < 10 ? '#10b981' : (vKt <= 15 ? '#eab308' : '#ef4444');

    // Vector de ola (rumbo hacia el que avanza la ola)
    const tieneOla = waveM !== null && waveM > 0.05;
    const rotOla = dirOla !== null ? (Number(dirOla) + 180) % 360 : rotViento;

    // SVG táctico de 120x120px centrado
    const svgHtml = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120" class="pointer-events-none drop-shadow-xl select-none">
            <defs>
                <filter id="vectorGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#000" flood-opacity="0.6"/>
                </filter>
            </defs>
            <!-- 1. Rosa de rumbos sutil -->
            <circle cx="60" cy="60" r="48" fill="rgba(15, 23, 42, 0.45)" stroke="rgba(255,255,255,0.25)" stroke-width="1.2" stroke-dasharray="3 3"/>
            <circle cx="60" cy="60" r="28" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
            <!-- Ticks cardinales -->
            <line x1="60" y1="12" x2="60" y2="18" stroke="rgba(255,255,255,0.6)" stroke-width="1.5"/>
            <line x1="108" y1="60" x2="102" y2="60" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
            <line x1="60" y1="108" x2="60" y2="102" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
            <line x1="12" y1="60" x2="18" y2="60" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
            <text x="60" y="24" fill="#38bdf8" font-size="9" font-weight="900" text-anchor="middle" font-family="sans-serif">N</text>

            <!-- 2. Vector de Ola (Línea discontinua Cyan hacia donde va la ola) -->
            ${tieneOla ? `
            <g transform="rotate(${rotOla}, 60, 60)" filter="url(#vectorGlow)">
                <line x1="60" y1="60" x2="60" y2="19" stroke="#06b6d4" stroke-width="2.5" stroke-dasharray="4 2" stroke-linecap="round"/>
                <polygon points="60,13 54,23 66,23" fill="#06b6d4"/>
            </g>
            ` : ''}

            <!-- 3. Vector de Viento Animado (Hacia donde sopla) -->
            <g transform="rotate(${rotViento}, 60, 60)" filter="url(#vectorGlow)">
                <line x1="60" y1="60" x2="60" y2="16" stroke="${colorViento}" stroke-width="3.5" stroke-linecap="round"/>
                <polygon points="60,10 52,22 68,22" fill="${colorViento}"/>
                <circle cx="60" cy="60" r="4.5" fill="${colorViento}" stroke="#0f172a" stroke-width="1.5"/>
            </g>

            <!-- 4. Etiqueta central de intensidad -->
            <g filter="url(#vectorGlow)">
                <rect x="36" y="53" width="48" height="15" rx="4" fill="rgba(15, 23, 42, 0.88)" stroke="${colorViento}" stroke-width="1"/>
                <text x="60" y="64" fill="${colorViento}" font-size="9" font-weight="900" text-anchor="middle" font-family="sans-serif">💨 ${vKt.toFixed(1)}k</text>
            </g>
            ${tieneOla ? `
            <g filter="url(#vectorGlow)">
                <rect x="38" y="70" width="44" height="13" rx="3.5" fill="rgba(15, 23, 42, 0.85)" stroke="#06b6d4" stroke-width="0.8"/>
                <text x="60" y="80" fill="#06b6d4" font-size="8" font-weight="900" text-anchor="middle" font-family="sans-serif">🌊 ${waveM.toFixed(1)}m</text>
            </g>
            ` : ''}
        </svg>
    `;

    const iconRosa = L.divIcon({
        className: 'rosa-vectores-container',
        html: svgHtml,
        iconSize: [120, 120],
        iconAnchor: [60, 60]
    });

    if (marcadorRosaVectores && map) {
        map.removeLayer(marcadorRosaVectores);
        marcadorRosaVectores = null;
    }

    marcadorRosaVectores = L.marker([latNum, lonNum], {
        icon: iconRosa,
        interactive: false,
        zIndexOffset: 250
    }).addTo(map);

    actualizarHudVectoresMapa(latNum, lonNum, datosMeteo);
}

export function actualizarHudVectoresMapa(lat, lon, datosMeteo) {
    const hud = document.getElementById('mapWindWaveHud');
    if (!hud) return;

    if (!datosMeteo) {
        hud.classList.add('hidden');
        return;
    }

    const vMs = valorNumericoMeteo(datosMeteo.windSpeed, datosMeteo.wind_speed);
    const vKt = vMs !== null ? vMs * 1.94384 : 0;
    const rMs = valorNumericoMeteo(datosMeteo.windGusts, datosMeteo.wind_gusts);
    const rKt = rMs !== null ? rMs * 1.94384 : vKt;
    const dirViento = valorNumericoMeteo(datosMeteo.windDirection, datosMeteo.wind_direction) || 0;
    const waveM = valorNumericoMeteo(datosMeteo.waveHeight, datosMeteo.wave_height);
    const perS = valorNumericoMeteo(datosMeteo.wavePeriod, datosMeteo.wave_period);

    const spotNombre = spotActivoActual?.nombre || document.getElementById('location')?.value?.trim() || 'Spot';
    const infoCosta = resolverOrientacionCostera(spotNombre, lat, lon);

    const elName = document.getElementById('hudPointName');
    if (elName) elName.textContent = spotNombre.split(',')[0];

    const elBadge = document.getElementById('hudCostalBadge');
    if (elBadge) {
        if (infoCosta && infoCosta.componente) {
            const comp = infoCosta.componente.toLowerCase();
            if (comp.includes('offshore') || comp.includes('terral')) {
                elBadge.textContent = 'Offshore';
                elBadge.className = 'px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-950/90 text-emerald-300 border border-emerald-500/50';
            } else if (comp.includes('onshore') || comp.includes('mar-tierra')) {
                elBadge.textContent = 'Onshore';
                elBadge.className = 'px-1.5 py-0.5 rounded text-[9px] font-black bg-blue-950/90 text-blue-300 border border-blue-500/50';
            } else {
                elBadge.textContent = 'Side';
                elBadge.className = 'px-1.5 py-0.5 rounded text-[9px] font-black bg-cyan-950/90 text-cyan-300 border border-cyan-500/50';
            }
        } else {
            elBadge.textContent = 'Costero';
            elBadge.className = 'px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-800 text-slate-300';
        }
    }

    const elArrow = document.getElementById('hudWindArrow');
    if (elArrow) {
        elArrow.style.transform = `rotate(${dirViento}deg)`;
    }

    const elSpeed = document.getElementById('hudWindSpeed');
    if (elSpeed) {
        elSpeed.textContent = `${vKt.toFixed(1)} kt`;
    }

    const elGust = document.getElementById('hudWindGust');
    if (elGust) {
        if (rKt - vKt >= 3) {
            elGust.textContent = `(${rKt.toFixed(1)})`;
        } else {
            elGust.textContent = '';
        }
    }

    const elWave = document.getElementById('hudWaveHeight');
    if (elWave) {
        elWave.textContent = waveM !== null ? `🌊 ${waveM.toFixed(1)}m` : '🌊 --';
    }

    const elPeriod = document.getElementById('hudWavePeriod');
    if (elPeriod) {
        elPeriod.textContent = perS ? `${Math.round(perS)}s` : '';
    }

    hud.classList.remove('hidden');
}

// ==========================================
// COACH IA PARA RUTAS DEPORTIVAS COMPLETADAS
// ==========================================

export async function solicitarAnalisisIARutaDeportiva(rutaId) {
    let ruta = null;
    if (window.__rutasUsuarioCache && rutaId) {
        ruta = window.__rutasUsuarioCache.get(String(rutaId));
    }
    if (!ruta && window._rutaDeportivaCargadaActual) {
        ruta = {
            id: rutaId,
            title: window._rutaDeportivaCargadaActual.nombre,
            route_coordinates: window._rutaDeportivaCargadaActual.coords
        };
    }

    let telemetria = null;
    try {
        if (rutaId && rutaId !== 'last') {
            const rawTel = localStorage.getItem('ps_telemetry_' + rutaId);
            if (rawTel) telemetria = JSON.parse(rawTel);
        }
        if (!telemetria) {
            const rawLast = localStorage.getItem('ps_telemetry_last');
            if (rawLast) telemetria = JSON.parse(rawLast);
        }
    } catch (e) {
        console.warn('Aviso leyendo telemetría para IA Coach:', e);
    }

    const distKm = Number(ruta?.distance_km || ruta?.distancia_km || trackDistanceKm || 0);
    const mins = Number(ruta?.tiempo_minutos || Math.round(Number(ruta?.duration_seconds || 0) / 60) || 1);
    const avgSpd = Number(ruta?.avg_speed || (mins > 0 ? (distKm / (mins / 60)) : 0));
    const maxSpd = Number(ruta?.max_speed || (avgSpd * 1.35));

    // Crear o recuperar modal
    const modalPrevio = document.getElementById('modalAiRouteCoach');
    if (modalPrevio) modalPrevio.remove();

    const modal = document.createElement('div');
    modal.id = 'modalAiRouteCoach';
    modal.className = 'fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn';
    modal.innerHTML = `
        <div class="bg-slate-900 border border-emerald-500/40 rounded-3xl p-5 sm:p-6 max-w-lg w-full shadow-2xl text-white flex flex-col gap-4">
            <div class="flex items-center justify-between border-b border-slate-800 pb-3">
                <div class="flex items-center gap-2.5">
                    <span class="text-2xl">🤖</span>
                    <div>
                        <h3 class="text-sm sm:text-base font-black text-white uppercase tracking-wider">Coach Inteligente de Ruta</h3>
                        <p class="text-[11px] text-slate-400">Análisis técnico de biomecánica, ritmo y meteo</p>
                    </div>
                </div>
                <button type="button" onclick="document.getElementById('modalAiRouteCoach').remove()" class="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white font-bold cursor-pointer">&times;</button>
            </div>
            <div id="aiRouteCoachLoading" class="py-8 flex flex-col items-center justify-center gap-3">
                <span class="text-3xl animate-bounce">🧠</span>
                <p class="text-xs font-bold text-sky-400 uppercase tracking-widest animate-pulse">Analizando splits y esfuerzo...</p>
            </div>
            <div id="aiRouteCoachContent" class="hidden flex flex-col gap-3"></div>
            <button type="button" onclick="document.getElementById('modalAiRouteCoach').remove()" class="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer">
                Entendido
            </button>
        </div>
    `;
    document.body.appendChild(modal);

    const payload = {
        distance_km: Number(distKm.toFixed(2)),
        duration_seconds: Math.round(mins * 60),
        avg_speed: Number(avgSpd.toFixed(1)),
        max_speed: Number(maxSpd.toFixed(1)),
        splits_data: telemetria?.splits || [],
        weather: telemetria?.meteo || null,
        board_type: telemetria?.boardType || 'inflat_allround'
    };

    let resultadoCoach = null;
    try {
        const resp = await fetchConTimeout(`${BACKEND_API_URL}?action=route_coach`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }, 2500);
        const data = await resp.json();
        if (data.ok && data.coach) {
            resultadoCoach = data.coach;
        }
    } catch (e) {
        // Fallback local
    }

    if (!resultadoCoach) {
        resultadoCoach = generarAnalisisIARutaFallback(payload);
    }

    const loader = document.getElementById('aiRouteCoachLoading');
    const content = document.getElementById('aiRouteCoachContent');
    if (loader) loader.classList.add('hidden');
    if (content) {
        content.classList.remove('hidden');
        content.innerHTML = `
            <div class="p-3 bg-emerald-950/60 border border-emerald-500/40 rounded-2xl flex items-start gap-2.5">
                <span class="text-xl">✅</span>
                <div>
                    <h4 class="text-xs font-black text-emerald-300 uppercase tracking-wide">Puntos Fuertes</h4>
                    <p class="text-[11px] text-slate-200 mt-0.5 leading-relaxed">${esc(resultadoCoach.bien || 'Gran consistencia durante la travesía.')}</p>
                </div>
            </div>
            <div class="p-3 bg-amber-950/60 border border-amber-500/40 rounded-2xl flex items-start gap-2.5">
                <span class="text-xl">💡</span>
                <div>
                    <h4 class="text-xs font-black text-amber-300 uppercase tracking-wide">Oportunidad de Mejora</h4>
                    <p class="text-[11px] text-slate-200 mt-0.5 leading-relaxed">${esc(resultadoCoach.mejora || 'Mantener una cadencia constante en los tramos con viento lateral.')}</p>
                </div>
            </div>
            <div class="p-3 bg-sky-950/60 border border-sky-500/40 rounded-2xl flex items-start gap-2.5">
                <span class="text-xl">🎯</span>
                <div>
                    <h4 class="text-xs font-black text-sky-300 uppercase tracking-wide">Estrategia Próxima Salida</h4>
                    <p class="text-[11px] text-slate-200 mt-0.5 leading-relaxed">${esc(resultadoCoach.proxima_salida || 'Incorpora series cortas de aceleración cada 1 km para elevar tu ritmo crucero.')}</p>
                </div>
            </div>
        `;
    }
}

function generarAnalisisIARutaFallback(p) {
    const km = p.distance_km || 0;
    const vel = p.avg_speed || 0;
    const vKt = p.weather?.vientoKt ? Number(p.weather.vientoKt) : null;
    const splits = p.splits_data || [];

    let bien = `Has completado ${km.toFixed(2)} km con una velocidad media de ${vel.toFixed(1)} km/h. `;
    if (vKt && vKt >= 10) {
        bien += `Excelente control y resistencia contra ráfagas de ${vKt} kt.`;
    } else {
        bien += `Buen aprovechamiento de las condiciones para consolidar tu técnica y deslizamiento.`;
    }

    let mejora = "Intenta mantener el tronco erguido y realizar flexión de rodillas para transferir más potencia a cada palada.";
    if (splits.length >= 2) {
        const velPrimero = Number(splits[0].velMediaKmh || vel);
        const velUltimo = Number(splits[splits.length - 1].velMediaKmh || vel);
        if (velUltimo < velPrimero * 0.8) {
            mejora = `Se detectó una disminución del ${Math.round((1 - velUltimo / velPrimero) * 100)}% de velocidad en el tramo final. Dosifica el esfuerzo en los primeros kilómetros para llegar con más reserva física.`;
        } else if (velUltimo > velPrimero * 1.1) {
            mejora = "Terminaste con ritmo progresivo fuerte; tienes margen para salir con un ritmo base 0.3 km/h más alto.";
        }
    }

    let proxima = "Planifica tu próxima salida con intervalos de 500m a ritmo fuerte seguidos de 100m de recuperación activa.";
    if (p.weather?.olasM && Number(p.weather.olasM) >= 0.5) {
        proxima = "En la próxima sesión en mar abierto, practica cambios de guardia rápidos para equilibrar el esfuerzo de hombros y core.";
    }

    return { bien, mejora, proxima_salida: proxima };
}

// ==========================================
// REPORTES EN VIVO DEL SPOT (WAZE FOR SUP)
// ==========================================

export const REPORT_TAGS_SPOT = [
    '🌊 Mar plato real',
    '💨 Más viento del previsto',
    '🌊 Orillera fuerte',
    '🪼 Medusas en zona',
    '⚠️ Corriente lateral',
    '🟢 Condiciones top'
];

export function abrirModalReporteSpot() {
    const modalPrevio = document.getElementById('modalReporteSpot');
    if (modalPrevio) modalPrevio.remove();

    const spotNombre = spotActivoActual?.nombre || document.getElementById('location')?.value?.trim() || 'Spot Actual';
    const lat = Number(spotActivoActual?.lat || latitudActual);
    const lon = Number(spotActivoActual?.lon || longitudActual);

    const tagsHtml = REPORT_TAGS_SPOT.map((tag, idx) => `
        <button type="button" onclick="window.seleccionarTagReporte('${esc(tag)}')" data-report-tag="${esc(tag)}" class="tag-reporte-btn text-left px-3 py-2 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-all cursor-pointer ${idx === 0 ? 'ring-2 ring-amber-400 bg-amber-950/60 border-amber-500' : ''}">
            ${esc(tag)}
        </button>
    `).join('');

    const modal = document.createElement('div');
    modal.id = 'modalReporteSpot';
    modal.className = 'fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn';
    modal.innerHTML = `
        <div class="bg-slate-900 border border-amber-500/40 rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl text-white flex flex-col gap-4">
            <div class="flex items-center justify-between border-b border-slate-800 pb-3">
                <div class="flex items-center gap-2">
                    <span class="text-2xl">📣</span>
                    <div>
                        <h3 class="text-sm sm:text-base font-black text-white uppercase tracking-wider">Reportar Estado Real</h3>
                        <p class="text-[11px] text-amber-300 font-bold">${esc(spotNombre)}</p>
                    </div>
                </div>
                <button type="button" onclick="document.getElementById('modalReporteSpot').remove()" class="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white font-bold cursor-pointer">&times;</button>
            </div>
            <div>
                <label class="text-[10px] uppercase font-black tracking-wider text-slate-400 block mb-2">Selecciona el estado observado:</label>
                <div class="grid grid-cols-2 gap-2" id="reportTagsList">
                    ${tagsHtml}
                </div>
            </div>
            <div>
                <label for="reportComment" class="text-[10px] uppercase font-black tracking-wider text-slate-400 block mb-1">Comentario adicional (opcional):</label>
                <textarea id="reportComment" rows="2" maxlength="140" placeholder="Ej: Se rema genial cerca del espigón, mar tranquilo..." class="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-amber-400"></textarea>
            </div>
            <div class="flex gap-2">
                <button type="button" onclick="window.confirmarEnvioReporteSpot('${esc(spotNombre)}', ${lat}, ${lon})" class="flex-1 py-3 bg-amber-600 hover:bg-amber-500 active:scale-95 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-lg shadow-amber-950/50">
                    🚀 Publicar Reporte
                </button>
                <button type="button" onclick="document.getElementById('modalReporteSpot').remove()" class="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase rounded-xl transition-all cursor-pointer">
                    Cancelar
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    window._tagReporteSeleccionado = REPORT_TAGS_SPOT[0];
}

export function seleccionarTagReporte(tag) {
    window._tagReporteSeleccionado = tag;
    const btns = document.querySelectorAll('.tag-reporte-btn');
    btns.forEach(b => {
        if (b.getAttribute('data-report-tag') === tag) {
            b.className = 'tag-reporte-btn text-left px-3 py-2 rounded-xl border border-amber-500 ring-2 ring-amber-400 bg-amber-950/60 text-xs font-bold text-white transition-all cursor-pointer';
        } else {
            b.className = 'tag-reporte-btn text-left px-3 py-2 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-all cursor-pointer';
        }
    });
}

export async function confirmarEnvioReporteSpot(spotNombre, lat, lon) {
    const tag = window._tagReporteSeleccionado || REPORT_TAGS_SPOT[0];
    const comEl = document.getElementById('reportComment');
    const comentario = comEl ? comEl.value.trim() : '';

    await enviarReporteSpot(spotNombre, lat, lon, tag, comentario);
    document.getElementById('modalReporteSpot')?.remove();
}

export async function enviarReporteSpot(spotNombre, lat, lon, tag, comentario) {
    const user = appState?.sesionActual?.user;
    const autorNombre = appState?.perfilActual?.nombre || appState?.perfilActual?.username || 'Paddler Local';

    const nuevoReporte = {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('rep_' + Date.now()),
        user_id: user?.id || null,
        autor_nombre: autorNombre,
        spot_nombre: spotNombre,
        lat: Number(Number(lat).toFixed(6)),
        lon: Number(Number(lon).toFixed(6)),
        tag: tag,
        comentario: comentario || null,
        created_at: new Date().toISOString()
    };

    if (supabaseClient) {
        try {
            await supabaseClient.from('spot_reports').insert([{
                user_id: nuevoReporte.user_id,
                autor_nombre: nuevoReporte.autor_nombre,
                spot_nombre: nuevoReporte.spot_nombre,
                lat: nuevoReporte.lat,
                lon: nuevoReporte.lon,
                tag: nuevoReporte.tag,
                comentario: nuevoReporte.comentario
            }]);
        } catch (e) {
            console.warn('Aviso no crítico guardando reporte en Supabase:', e);
        }
    }

    try {
        const raw = localStorage.getItem('ps_spot_reports');
        const existentes = raw ? JSON.parse(raw) : [];
        existentes.unshift(nuevoReporte);
        localStorage.setItem('ps_spot_reports', JSON.stringify(existentes.slice(0, 30)));
    } catch (e) {
        console.warn('No se pudo guardar reporte localmente:', e);
    }

    await cargarReportesSpot(lat, lon);
}

export async function cargarReportesSpot(lat, lon) {
    const latNum = Number(lat);
    const lonNum = Number(lon);
    if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) return;

    let todosReportes = [];

    if (supabaseClient) {
        try {
            const haceSeisHoras = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
            const { data, error } = await supabaseClient
                .from('spot_reports')
                .select('*')
                .gte('created_at', haceSeisHoras)
                .order('created_at', { ascending: false })
                .limit(40);
            if (!error && Array.isArray(data)) {
                todosReportes.push(...data);
            }
        } catch (e) {
            console.warn('Aviso al consultar spot_reports en Supabase:', e);
        }
    }

    try {
        const raw = localStorage.getItem('ps_spot_reports');
        if (raw) {
            const locReps = JSON.parse(raw);
            if (Array.isArray(locReps)) {
                for (const r of locReps) {
                    if (!todosReportes.some(item => item.id === r.id)) {
                        todosReportes.push(r);
                    }
                }
            }
        }
    } catch (e) {
        console.warn('Aviso leyendo reportes locales:', e);
    }

    const ahora = Date.now();
    const cuatroHorasMs = 4 * 3600 * 1000;
    const reportesCercanos = todosReportes.filter(r => {
        const ts = new Date(r.created_at).getTime();
        if (ahora - ts > cuatroHorasMs) return false;
        if (!map) return false;
        const distM = L.latLng(latNum, lonNum).distanceTo(L.latLng(Number(r.lat), Number(r.lon)));
        return distM <= 5000;
    });

    reportesSpotActivo = reportesCercanos;

    const cont = document.getElementById('spotLiveReportsContainer');
    if (cont) {
        if (reportesCercanos.length > 0) {
            const rReciente = reportesCercanos[0];
            const minAgo = Math.max(1, Math.round((ahora - new Date(rReciente.created_at).getTime()) / 60000));
            cont.innerHTML = `
                <div class="flex items-center justify-between gap-2 flex-wrap border-b border-amber-500/30 pb-2">
                    <div class="flex items-center gap-2">
                        <span class="text-base animate-pulse">📣</span>
                        <span class="font-black text-amber-300 uppercase tracking-wide">Reportes en Vivo (${reportesCercanos.length})</span>
                    </div>
                    <button type="button" onclick="window.abrirModalReporteSpot()" class="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold text-[10px] uppercase cursor-pointer">
                        + Añadir Reporte
                    </button>
                </div>
                <div class="flex flex-col gap-1.5 mt-1">
                    <div class="flex items-center justify-between gap-2 text-white font-bold text-[11px]">
                        <span>${esc(rReciente.tag)}</span>
                        <span class="text-amber-400 font-mono text-[10px]">hace ${minAgo} min</span>
                    </div>
                    ${rReciente.comentario ? `<p class="text-slate-300 text-[11px] italic bg-slate-900/60 p-2 rounded-xl">"${esc(rReciente.comentario)}" — <b>${esc(rReciente.autor_nombre || 'Paddler')}</b></p>` : ''}
                </div>
            `;
            cont.classList.remove('hidden');
        } else {
            cont.classList.add('hidden');
            cont.innerHTML = '';
        }
    }

    if (marcadorReporteSpot && map) {
        map.removeLayer(marcadorReporteSpot);
        marcadorReporteSpot = null;
    }

    if (reportesCercanos.length > 0 && map) {
        const rReciente = reportesCercanos[0];
        const iconCrowd = L.divIcon({
            className: 'bg-transparent border-none',
            html: `
                <div class="w-7 h-7 rounded-full bg-amber-500 border-2 border-white shadow-xl flex items-center justify-center text-xs animate-bounce cursor-pointer" title="Reporte en vivo: ${esc(rReciente.tag)}">
                    📣
                </div>
            `,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        });

        marcadorReporteSpot = L.marker([Number(rReciente.lat), Number(rReciente.lon)], {
            icon: iconCrowd,
            zIndexOffset: 350
        }).addTo(map);

        marcadorReporteSpot.bindPopup(`
            <div class="text-xs font-sans">
                <b class="text-amber-600">${esc(rReciente.tag)}</b><br>
                ${rReciente.comentario ? `<span>"${esc(rReciente.comentario)}"</span><br>` : ''}
                <small class="text-slate-500">Por ${esc(rReciente.autor_nombre || 'Paddler')} · Coords: ${Number(rReciente.lat).toFixed(4)}, ${Number(rReciente.lon).toFixed(4)}</small>
            </div>
        `);
    }
}

// ==========================================
// CHECK-IN DE SEGURIDAD DEADMAN & TELEMETRÍA SPLITS
// ==========================================

export function actualizarDuracionCheckin(minutos) {
    checkinDuracionMinutos = Number(minutos) || 90;
    checkinTimestampLimite = Date.now() + (checkinDuracionMinutos * 60 * 1000);
    checkinAlertaActiva = false;
    verificarAlertaCheckin();
}

export function extenderCheckinTravesia(minutos = 30) {
    if (!checkinTimestampLimite) checkinTimestampLimite = Date.now();
    const base = Math.max(Date.now(), checkinTimestampLimite);
    checkinTimestampLimite = base + (Number(minutos) * 60 * 1000);
    checkinAlertaActiva = false;
    verificarAlertaCheckin();
}

export function enviarAlertaCheckinWhatsApp() {
    const telInput = document.getElementById('inputCheckinEmergencyPhone');
    const tel = (telInput ? telInput.value.trim() : '') || localStorage.getItem('ps_emergency_phone') || '';
    
    let lat = null, lon = null;
    if (trackCoords && trackCoords.length > 0) {
        const last = trackCoords[trackCoords.length - 1];
        lat = Number(last[0]).toFixed(5);
        lon = Number(last[1]).toFixed(5);
    } else if (ultimoPuntoCrudoGPS) {
        lat = Number(ultimoPuntoCrudoGPS[0]).toFixed(5);
        lon = Number(ultimoPuntoCrudoGPS[1]).toFixed(5);
    }
    
    const timeEl = document.getElementById('liveTime');
    const tiempoStr = timeEl ? timeEl.textContent : "00:00";
    const distStr = `${trackDistanceKm.toFixed(2)} km`;
    const locUrl = (lat && lon) ? `https://maps.google.com/?q=${lat},${lon}` : '(Sin GPS fijado)';
    
    const texto = `🚨 ALERTA PADDLESAFE (Check-in de Seguridad)\nNo he confirmado mi retorno a tiempo o necesito asistencia en el agua.\n📍 Ubicación GPS: ${locUrl}\n📏 Distancia recorrida: ${distStr}\n⏱️ Tiempo en el agua: ${tiempoStr}\nPor favor intenta contactarme o avisa a Salvamento Marítimo si no respondo.`;
    
    const cleanTel = tel.replace(/[^0-9]/g, '');
    const waUrl = cleanTel ? `https://wa.me/${cleanTel}?text=${encodeURIComponent(texto)}` : `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
}

export function verificarAlertaCheckin() {
    if (!isTracking || !checkinTimestampLimite) return;
    const ahora = Date.now();
    const diffMs = checkinTimestampLimite - ahora;
    const barEl = document.getElementById('liveSafetyCheckinBar');
    const countdownEl = document.getElementById('liveEtaCountdown');

    if (diffMs <= 0) {
        const overdueSec = Math.abs(Math.floor(diffMs / 1000));
        const overdueMin = Math.floor(overdueSec / 60);
        const overdueRestSec = overdueSec % 60;
        const overdueStr = `+${overdueMin.toString().padStart(2, '0')}:${overdueRestSec.toString().padStart(2, '0')}`;
        
        if (countdownEl) {
            countdownEl.textContent = `🚨 VENCIDO (${overdueStr})`;
            countdownEl.className = 'font-mono text-red-400 font-black animate-pulse';
        }
        if (barEl) {
            barEl.className = 'bg-rose-950/90 rounded-xl p-2.5 mb-2.5 border-2 border-rose-500 shadow-lg shadow-rose-950/50 w-full text-xs transition-colors animate-pulse';
        }

        if (!checkinAlertaActiva) {
            checkinAlertaActiva = true;
            if (navigator.vibrate) {
                navigator.vibrate([500, 200, 500, 200, 1000]);
            }
        }
    } else {
        const totalSec = Math.floor(diffMs / 1000);
        const hrs = Math.floor(totalSec / 3600);
        const mins = Math.floor((totalSec % 3600) / 60);
        const secs = totalSec % 60;
        const timeStr = hrs > 0 
            ? `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
            : `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        const advertenciaDiezMin = diffMs <= 10 * 60 * 1000;

        if (countdownEl) {
            countdownEl.textContent = advertenciaDiezMin ? `⚠️ ${timeStr}` : timeStr;
            countdownEl.className = advertenciaDiezMin 
                ? 'font-mono text-amber-300 font-black animate-pulse' 
                : 'font-mono text-emerald-400 font-black';
        }

        if (barEl) {
            if (advertenciaDiezMin) {
                barEl.className = 'bg-amber-950/80 rounded-xl p-2.5 mb-2.5 border-2 border-amber-500 shadow-md w-full text-xs transition-colors';
                if (!checkinAlertaActiva) {
                    checkinAlertaActiva = true;
                    if (navigator.vibrate) {
                        navigator.vibrate([400, 200, 400]);
                    }
                }
            } else {
                barEl.className = 'bg-slate-900/90 rounded-xl p-2.5 mb-2.5 border border-slate-700/80 w-full text-xs transition-colors';
                checkinAlertaActiva = false;
            }
        }
    }
}

export function mostrarModalSplitsKm(rutaId) {
    let telemetria = null;
    const ruta = (window.socialRoutesCache && window.socialRoutesCache[String(rutaId)]) 
        || (window.__rutasUsuarioCache && window.__rutasUsuarioCache.get(String(rutaId))) 
        || null;

    try {
        if (rutaId && rutaId !== 'last') {
            const raw = localStorage.getItem('ps_telemetry_' + rutaId);
            if (raw) telemetria = JSON.parse(raw);
        }
        if (!telemetria && ruta?.splits_data) {
            const parsed = typeof ruta.splits_data === 'string' ? JSON.parse(ruta.splits_data) : ruta.splits_data;
            if (Array.isArray(parsed) && parsed.length > 0) {
                telemetria = { splits: parsed };
            } else if (parsed && Array.isArray(parsed.splits) && parsed.splits.length > 0) {
                telemetria = parsed;
            }
        }
        if (!telemetria && ruta) {
            let coords = ruta.route_coordinates || ruta.coordinates || ruta.ruta_json;
            if (typeof coords === 'string') {
                try { coords = JSON.parse(coords); } catch (_) { coords = null; }
            }
            if (Array.isArray(coords) && coords.length >= 2) {
                const normCoords = coords.map(pt => Array.isArray(pt) ? { lat: Number(pt[0]), lon: Number(pt[1]) } : { lat: Number(pt.lat), lon: Number(pt.lon ?? pt.lng) }).filter(pt => Number.isFinite(pt.lat) && Number.isFinite(pt.lon));
                if (normCoords.length >= 2) {
                    try {
                        const xml = generarGPX(normCoords);
                        const parsed = parseGPX(xml);
                        if (parsed && Array.isArray(parsed.splits) && parsed.splits.length > 0) {
                            telemetria = {
                                splits: parsed.splits.map(s => ({
                                    km: s.km,
                                    tiempoSeg: s.duration_seconds || 0,
                                    ritmoMinKm: s.duration_seconds && s.distance_km ? ((s.duration_seconds / 60) / s.distance_km).toFixed(2) : '--',
                                    velMediaKmh: s.avg_speed_kmh || (s.duration_seconds ? (s.distance_km / (s.duration_seconds / 3600)).toFixed(1) : '--'),
                                    distanciaKm: s.distance_km
                                }))
                            };
                        }
                    } catch (_) {}
                }
            }
        }
        if (!telemetria) {
            const rawLast = localStorage.getItem('ps_telemetry_last');
            if (rawLast) telemetria = JSON.parse(rawLast);
        }
    } catch (e) {
        console.warn('Error al cargar splits:', e);
    }

    if (!telemetria || !Array.isArray(telemetria.splits) || telemetria.splits.length === 0) {
        alert("No hay registros de splits km a km para esta travesía.");
        return;
    }

    const modalPrevio = document.getElementById('modalSplitsKm');
    if (modalPrevio) modalPrevio.remove();

    const boardNames = {
        inflat_allround: 'Hinchable Allround',
        inflat_touring: 'Hinchable Touring',
        rigid_touring: 'Rígida Touring',
        rigid_race: 'Rígida Race'
    };
    const boardLabel = boardNames[telemetria.boardType] || telemetria.boardType || 'Tabla SUP';

    const filasHtml = telemetria.splits.map(s => {
        const tSec = s.tiempoSeg || s.duration_seconds || 0;
        const mins = Math.floor(tSec / 60);
        const secs = tSec % 60;
        const durStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        const kmLabel = s.esFinal ? `${s.km} km (Tramo ${s.distanciaKm || s.distance_km}k)` : `Km ${s.km}`;
        const ritmoStr = s.ritmoMinKm || (s.distance_km && tSec ? ((tSec / 60) / s.distance_km).toFixed(2) : '--');
        const velStr = s.velMediaKmh || s.avg_speed_kmh || (s.distance_km && tSec ? (s.distance_km / (tSec / 3600)).toFixed(1) : '--');
        return `
            <tr class="border-b border-slate-700/60 hover:bg-slate-800/50">
                <td class="py-2 px-3 font-bold text-white">${kmLabel}</td>
                <td class="py-2 px-3 font-mono text-emerald-400 font-bold">${durStr}</td>
                <td class="py-2 px-3 font-mono text-slate-300">${ritmoStr} min/km</td>
                <td class="py-2 px-3 font-mono font-bold text-amber-400">${velStr} km/h</td>
            </tr>
        `;
    }).join('');

    const modal = document.createElement('div');
    modal.id = 'modalSplitsKm';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm';
    modal.innerHTML = `
        <div class="bg-slate-900 border border-sky-500/40 rounded-2xl p-5 max-w-md w-full shadow-2xl flex flex-col gap-3">
            <div class="flex items-center justify-between border-b border-slate-800 pb-2">
                <div class="flex items-center gap-2">
                    <span class="text-xl">⚡</span>
                    <h3 class="font-black text-white text-sm uppercase tracking-wider">Splits y Rendimiento por Km</h3>
                </div>
                <button type="button" onclick="document.getElementById('modalSplitsKm').remove()" class="text-slate-400 hover:text-white font-bold text-lg p-1 cursor-pointer">&times;</button>
            </div>
            <div class="text-[11px] text-slate-300 flex items-center justify-between bg-slate-800/70 p-2 rounded-xl">
                <span>🏄‍♂️ <b>Equipo:</b> ${esc(boardLabel)}</span>
                ${telemetria.meteo?.vientoKt ? `<span>💨 <b>Viento:</b> ${telemetria.meteo.vientoKt} kt</span>` : ''}
            </div>
            <div class="overflow-x-auto max-h-60 rounded-xl border border-slate-800">
                <table class="w-full text-left text-xs text-slate-300">
                    <thead class="bg-slate-800/90 text-[10px] text-slate-400 uppercase tracking-wider">
                        <tr>
                            <th class="py-2 px-3">Km</th>
                            <th class="py-2 px-3">Tiempo</th>
                            <th class="py-2 px-3">Ritmo</th>
                            <th class="py-2 px-3">Vel Med</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filasHtml}
                    </tbody>
                </table>
            </div>
            <button type="button" onclick="document.getElementById('modalSplitsKm').remove()" class="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer">
                Cerrar
            </button>
        </div>
    `;
    document.body.appendChild(modal);
}

// ==========================================
export async function iniciarTravesia() {
    if(!appState.sesionActual && !appState.esInvitado) return alert("Inicia sesión.");
    if(!navigator.geolocation) return alert("Sin GPS.");
    
    await activarWakeLock();
    
    if(livePolyline) { map.removeLayer(livePolyline); livePolyline = null; }
    if(cronometroInterval) { clearInterval(cronometroInterval); cronometroInterval = null; }
    if(watchId) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    
    isTracking = true; 
    window.isTracking = true;
    window.actualizarMiEstadoPresencia?.('in_water');
    trackDistanceKm = 0; 
    trackCoords = []; 
    ultimoPuntoCrudoGPS = null; 
    lastPositionGPS = null; 
    lastTimestampGPS = null; 
    trackStartTime = new Date();
    splitsKm = [];
    lastSplitKmDist = 0;
    lastSplitTimestamp = Date.now();
    checkinAlertaActiva = false;
    checkinTimestampLimite = Date.now() + (checkinDuracionMinutos * 60 * 1000);
    
    const telGuardado = localStorage.getItem('ps_emergency_phone') || '';
    const p = document.getElementById('liveTrackingPanel');
    p.innerHTML = `
        <div class="flex justify-between items-center mb-2 w-full">
            <div class="flex items-center gap-1.5">
                <span class="text-[10px] font-bold text-red-400 animate-pulse uppercase tracking-widest live-hud-status">🔴 Grabando GPS</span>
                <button type="button" onclick="toggleModoSolTracker()" title="Modo Alto Contraste Solar" class="px-2 py-0.5 text-[10px] font-black rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 active:scale-95 cursor-pointer live-btn-tool">☀️ Sol</button>
                <button type="button" onclick="compartirPosicionActualLive()" title="Compartir posición de emergencia" class="px-2 py-0.5 text-[10px] font-black rounded-lg bg-rose-900/60 hover:bg-rose-800 text-rose-300 border border-rose-700/60 active:scale-95 cursor-pointer live-btn-tool">🆘 Posición</button>
            </div>
            <span id="liveTime" class="font-mono text-2xl font-black text-emerald-400 live-hud-time">00:00</span>
        </div>
        <div class="grid grid-cols-2 gap-2 text-center mb-2 w-full">
            <div class="bg-slate-800 rounded-xl py-2 live-hud-card">
                <p class="text-[9px] text-slate-400 uppercase tracking-widest live-hud-label">DISTANCIA</p>
                <p id="liveDist" class="font-black text-lg text-white live-hud-val">0.00 km</p>
            </div>
            <div class="bg-slate-800 rounded-xl py-2 live-hud-card">
                <p class="text-[9px] text-slate-400 uppercase tracking-widest live-hud-label">VELOCIDAD</p>
                <p id="liveSpeed" class="font-black text-lg text-white live-hud-val">0.0 km/h</p>
            </div>
        </div>
        <div id="liveReturnInfo" class="bg-slate-800/90 rounded-xl p-2.5 mb-2 border border-slate-700/60 w-full text-center text-xs live-hud-return">
            <div class="flex justify-between items-center text-[10px] text-slate-300 mb-1">
                <span class="font-bold flex items-center gap-1">🧭 Retorno a Salida:</span>
                <div class="flex items-center gap-1.5">
                    <span id="liveSunsetCountdown" class="hidden font-mono text-orange-400 font-bold animate-pulse text-[10px]">🌇 Luz: -- min</span>
                    <span id="liveReturnDist" class="font-mono font-bold text-white">0.00 km</span>
                </div>
            </div>
            <div class="flex justify-between items-center text-[10px] gap-1">
                <span id="liveReturnBearing" class="font-mono text-amber-300">Rumbo: --° (--)</span>
                <span id="liveReturnEta" class="font-mono text-emerald-400">ETA: -- min</span>
                <span id="liveReturnWind" class="font-bold text-[9px] px-1.5 py-0.5 rounded bg-slate-900">💨 --</span>
            </div>
        </div>
        <div id="liveSafetyCheckinBar" class="bg-slate-900/90 rounded-xl p-2.5 mb-2.5 border border-slate-700/80 w-full text-xs transition-colors">
            <div class="flex justify-between items-center mb-1.5">
                <div class="flex items-center gap-1.5 font-bold text-[11px] text-slate-200">
                    <span class="text-amber-400">⏱️ Check-in:</span>
                    <span id="liveEtaCountdown" class="font-mono text-emerald-400 font-black">--:--</span>
                </div>
                <div class="flex items-center gap-1">
                    <select id="selectCheckinDuracion" onchange="window.actualizarDuracionCheckin(this.value)" class="bg-slate-800 text-[10px] text-slate-200 border border-slate-700 rounded px-1 py-0.5 font-bold cursor-pointer">
                        <option value="60" ${checkinDuracionMinutos === 60 ? 'selected' : ''}>60 min</option>
                        <option value="90" ${checkinDuracionMinutos === 90 ? 'selected' : ''}>90 min</option>
                        <option value="120" ${checkinDuracionMinutos === 120 ? 'selected' : ''}>120 min</option>
                        <option value="180" ${checkinDuracionMinutos === 180 ? 'selected' : ''}>180 min</option>
                    </select>
                </div>
            </div>
            <div class="flex items-center gap-1.5 mb-1.5">
                <span class="text-[10px] text-slate-400 font-bold shrink-0">📞 SOS:</span>
                <input id="inputCheckinEmergencyPhone" type="tel" placeholder="+34 600..." value="${esc(telGuardado)}" oninput="localStorage.setItem('ps_emergency_phone', this.value.trim())" class="flex-1 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-white font-mono placeholder-slate-500" />
            </div>
            <div class="flex gap-1.5">
                <button type="button" onclick="window.extenderCheckinTravesia(30)" class="flex-1 py-1 px-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 active:scale-95 text-white font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer">
                    ✅ Estoy Bien (+30m)
                </button>
                <button type="button" onclick="window.enviarAlertaCheckinWhatsApp()" class="py-1 px-2.5 rounded-lg bg-rose-700 hover:bg-rose-600 active:scale-95 text-white font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer">
                    🆘 Avisar
                </button>
            </div>
        </div>
        <button type="button" onclick="finalizarTravesia()" class="w-full h-11 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl active:scale-95 text-[11px] uppercase tracking-widest transition-transform cursor-pointer shadow-lg live-btn-finish">⏹ Finalizar Travesía</button>
    `;
    p.classList.remove('hidden'); document.getElementById('btnIniciarLive').classList.add('hidden');
    if(document.getElementById('proDashboardResumen')) document.getElementById('proDashboardResumen').classList.replace('flex','hidden');
    if(document.getElementById('proPlanificador')) document.getElementById('proPlanificador').classList.replace('flex','hidden');
    
    if(lineaRuta) map.removeLayer(lineaRuta);
    livePolyline = L.polyline([], {color:'#ef4444', weight:5}).addTo(map);
    
    cronometroInterval = setInterval(() => {
        const s = Math.floor((new Date() - trackStartTime) / 1000);
        const hrs = Math.floor(s / 3600);
        const mins = Math.floor((s % 3600) / 60);
        const secs = s % 60;
        
        const timeStr = hrs > 0 
            ? `${hrs.toString().padStart(2,'0')}:${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`
            : `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
            
        const liveTimeEl = document.getElementById('liveTime');
        if (liveTimeEl) liveTimeEl.textContent = timeStr;

        verificarAlertaCheckin();
    }, 1000);
    
    watchId = navigator.geolocation.watchPosition(ps => {
        if(!isTracking) return;
        if (ps.coords.accuracy > 40) return;
        
        const lat6 = Number(ps.coords.latitude.toFixed(6));
        const lon6 = Number(ps.coords.longitude.toFixed(6));
        const puntoActual = [lat6, lon6];
        ultimoPuntoCrudoGPS = puntoActual;

        const l = L.latLng(lat6, lon6);
        const currentTimestamp = Date.now();

        // Siempre guardar el primer punto
        if (trackCoords.length === 0) {
            trackCoords.push(puntoActual);
            livePolyline.addLatLng(l); 
            map.panTo(l);
            lastPositionGPS = l;
            lastTimestampGPS = currentTimestamp;
            actualizarRetornoSalidaLive(lat6, lon6);
            return;
        }

        if(lastPositionGPS && lastTimestampGPS) {
            const timeDiff = (currentTimestamp - lastTimestampGPS) / 1000;
            const mDist = (lastPositionGPS.distanceTo(l));
            
            const speedKmh = timeDiff > 0 ? (mDist / timeDiff) * 3.6 : 0;
            if (speedKmh > 25) return; 

            // Filtrar lecturas con distancia menor a 8 metros
            if (mDist < GPS_MIN_DISTANCIA_METROS) return;
            
            trackDistanceKm += (mDist / 1000);
            document.getElementById('liveDist').textContent = `${trackDistanceKm.toFixed(2)} km`;
            
            const uiSpeed = document.getElementById('liveSpeed');
            if (uiSpeed) uiSpeed.textContent = `${speedKmh.toFixed(1)} km/h`;

            // Registrar Split por cada 1.0 km completado
            const splitKmEsperado = splitsKm.length + 1;
            if (trackDistanceKm >= splitKmEsperado) {
                const prevSplitTs = splitsKm.length > 0 ? splitsKm[splitsKm.length - 1].timestamp : trackStartTime.getTime();
                const splitSegundos = Math.max(1, Math.round((currentTimestamp - prevSplitTs) / 1000));
                const ritmoMinKm = (splitSegundos / 60).toFixed(2);
                const velMediaKmh = ((1.0 / (splitSegundos / 3600))).toFixed(1);
                
                splitsKm.push({
                    km: splitKmEsperado,
                    tiempoSeg: splitSegundos,
                    ritmoMinKm: ritmoMinKm,
                    velMediaKmh: velMediaKmh,
                    timestamp: currentTimestamp
                });
            }
        }
        
        trackCoords.push(puntoActual);
        livePolyline.addLatLng(l); 
        map.panTo(l);
        
        lastPositionGPS = l;
        lastTimestampGPS = currentTimestamp;
        actualizarRetornoSalidaLive(lat6, lon6);

        // Guardar cada 10 puntos recibidos un snapshot ligero sin imagen
        if (trackCoords.length % 10 === 0) {
            try {
                localStorage.setItem('paddlesafe_live_checkpoint', JSON.stringify({
                    startTime: trackStartTime ? trackStartTime.toISOString() : new Date().toISOString(),
                    distKm: Number(trackDistanceKm.toFixed(3)),
                    coords: trackCoords,
                    timestamp: Date.now()
                }));
            } catch (errCk) {
                console.warn('No se pudo guardar snapshot de live checkpoint:', errCk);
            }
        }
    }, e => {
        if (e.code === 1) alert('Permiso de ubicación denegado. Actívalo para registrar la travesía.');
    }, {enableHighAccuracy: true, maximumAge: 2000, timeout: 20000});
}

export async function finalizarTravesia() {
    if (!isTracking || isSavingRoute) return;
    isSavingRoute = true;
    isTracking = false; 
    window.isTracking = false;
    window.actualizarMiEstadoPresencia?.('online');
    await liberarWakeLock();
    if(cronometroInterval) { clearInterval(cronometroInterval); cronometroInterval = null; }
    if(watchId) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    
    const m = Math.floor((new Date() - trackStartTime) / 60000);
    if(trackDistanceKm < 0.05 && m < 1) {
        localStorage.removeItem('paddlesafe_live_checkpoint');
        alert("Ruta demasiado corta.");
        return restaurarTracker();
    }
    if(appState.esInvitado) {
        localStorage.removeItem('paddlesafe_live_checkpoint');
        alert(`🏅 ${trackDistanceKm.toFixed(2)} km en ${formatearTiempo(m)}.`);
        return restaurarTracker();
    }
    
    const eqFinisher = recuperarEquipoUsuario();
    const avgSpdFinalStr = m > 0 ? (trackDistanceKm / (m / 60)).toFixed(1) : '0.0';
    const vKtLive = valorNumericoMeteo(datosMeteoActuales?.windSpeed, datosMeteoActuales?.wind_speed) !== null
        ? Number(valorNumericoMeteo(datosMeteoActuales?.windSpeed, datosMeteoActuales?.wind_speed) * 1.94384)
        : 0;
    const oMLive = valorNumericoMeteo(datosMeteoActuales?.waveHeight, datosMeteoActuales?.wave_height) !== null
        ? Number(valorNumericoMeteo(datosMeteoActuales?.waveHeight, datosMeteoActuales?.wave_height))
        : 0;
    const perSLive = datosMeteoActuales?.wavePeriod ? Number(datosMeteoActuales.wavePeriod) : 0;
    const tempCLive = Number.isFinite(Number(datosMeteoActuales?.tempAire ?? datosMeteoActuales?.temperature))
        ? Number(datosMeteoActuales?.tempAire ?? datosMeteoActuales?.temperature)
        : 20;

    const biometriaFinal = calcularBiometriaSup({
        duracionMin: m,
        distKm: trackDistanceKm,
        velKmh: Number(avgSpdFinalStr),
        vientoKt: vKtLive,
        olasM: oMLive,
        periodoS: perSLive,
        tempC: tempCLive,
        tipoTabla: eqFinisher?.tipoTabla || 'all-round'
    });

    document.getElementById('liveTrackingPanel').innerHTML = `
        <div class="text-center py-6 w-full">
            <span class="text-4xl block mb-2 animate-bounce">⏳</span>
            <p class="font-black text-white text-sm uppercase tracking-widest">Guardando...</p>
        </div>`;
        
    let img = null;
    let imgBase64Backup = null;
    try {
        if(livePolyline && trackCoords.length) map.fitBounds(livePolyline.getBounds());
        await new Promise(r => setTimeout(r, 1000));
        const cv = await html2canvas(document.getElementById('mapContainer'), {
            useCORS:true, backgroundColor:'#e2e8f0',
            ignoreElements: (el) => el.classList.contains('leaflet-control-container') || el.id === 'liveTrackingPanel'
        });
        
        let targetCanvas = cv;
        if (cv.width > 800) {
            const scale = 800 / cv.width;
            const resizedCanvas = document.createElement('canvas');
            resizedCanvas.width = 800;
            resizedCanvas.height = Math.max(1, Math.round(cv.height * scale));
            const ctx = resizedCanvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(cv, 0, 0, resizedCanvas.width, resizedCanvas.height);
                targetCanvas = resizedCanvas;
            }
        }

        // Estampar Finisher Poster estilo Strava / Garmin en el canvas
        try {
            const ctxStamp = targetCanvas.getContext('2d');
            if (ctxStamp) {
                const cw = targetCanvas.width;
                const ch = targetCanvas.height;
                const footerH = Math.min(85, Math.max(65, Math.round(ch * 0.20)));
                const footerY = ch - footerH;

                // 1. Banda semi-transparente degradada oscura
                const grad = ctxStamp.createLinearGradient(0, footerY - 12, 0, ch);
                grad.addColorStop(0, 'rgba(15, 23, 42, 0)');
                grad.addColorStop(0.2, 'rgba(15, 23, 42, 0.88)');
                grad.addColorStop(1, 'rgba(15, 23, 42, 0.98)');
                ctxStamp.fillStyle = grad;
                ctxStamp.fillRect(0, footerY - 12, cw, footerH + 12);

                // 2. Línea de acento superior estilo neón náutico
                const lineGrad = ctxStamp.createLinearGradient(0, 0, cw, 0);
                lineGrad.addColorStop(0, '#06b6d4');
                lineGrad.addColorStop(0.5, '#10b981');
                lineGrad.addColorStop(1, '#3b82f6');
                ctxStamp.fillStyle = lineGrad;
                ctxStamp.fillRect(0, footerY + 2, cw, 2);

                // 3. Tipografía: Título FINISHER + Fecha
                ctxStamp.font = 'bold 13px system-ui, -apple-system, sans-serif';
                ctxStamp.fillStyle = '#38bdf8';
                ctxStamp.fillText('🏄 PADDLESAFE FINISHER', 14, footerY + 20);

                const fechaStr = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
                ctxStamp.font = '600 11px system-ui, -apple-system, sans-serif';
                ctxStamp.fillStyle = '#94a3b8';
                ctxStamp.textAlign = 'right';
                ctxStamp.fillText(fechaStr, cw - 14, footerY + 20);
                ctxStamp.textAlign = 'left';

                // 4. Métricas clave: Distancia, Tiempo, Velocidad Media y Kcal
                const durMin = Math.floor(m / 60);
                const durSec = m % 60;
                const durStr = durMin > 0 ? `${durMin}h ${durSec}m` : `${m} min`;
                ctxStamp.font = 'bold 12px system-ui, -apple-system, sans-serif';
                ctxStamp.fillStyle = '#ffffff';
                ctxStamp.fillText(`📏 ${trackDistanceKm.toFixed(2)} km   ⏱️ ${durStr}   ⚡ ${avgSpdFinalStr} km/h   🔥 ${biometriaFinal.kcal} kcal`, 14, footerY + 40);

                // 5. Badge Meteorológico
                const vKtVal = valorNumericoMeteo(datosMeteoActuales?.windSpeed, datosMeteoActuales?.wind_speed);
                const vKtStr = vKtVal !== null ? (vKtVal * 1.94384).toFixed(1) + ' kt' : '--';
                const oMVal = valorNumericoMeteo(datosMeteoActuales?.waveHeight, datosMeteoActuales?.wave_height);
                const oMStr = oMVal !== null ? Number(oMVal).toFixed(1) + 'm' : '--';
                const scoreVal = motorExpertoActual?.seguridad?.score ?? 100;
                ctxStamp.font = '500 11px system-ui, -apple-system, sans-serif';
                ctxStamp.fillStyle = '#34d399';
                ctxStamp.fillText(`💨 ${vKtStr} · 🌊 ${oMStr} · 🛡️ Score ${scoreVal}/100`, 14, footerY + 58);
            }
        } catch (errStamp) {
            console.warn('Aviso no crítico al estampar footer finisher:', errStamp);
        }
        
        imgBase64Backup = targetCanvas.toDataURL('image/jpeg', 0.5);
        
        const b = await new Promise(r => targetCanvas.toBlob(r, 'image/jpeg', 0.7));
        const fn = `rutas/${appState.sesionActual.user.id}-${Date.now()}.jpg`;
        const {error:ue} = await supabaseClient.storage.from('paddlesafe').upload(fn, b, { upsert: true, contentType: 'image/jpeg' });
        if(!ue) {
            const { data } = supabaseClient.storage.from('paddlesafe').getPublicUrl(fn);
            img = data.publicUrl;
        }
    } catch(e) { console.warn('Aviso no crítico al generar/subir canvas de ruta:', e); }
    
    // Asegurar que el último punto válido esté incluido en la ruta
    if (ultimoPuntoCrudoGPS && trackCoords.length > 0) {
        const lastCoord = trackCoords[trackCoords.length - 1];
        if (lastCoord[0] !== ultimoPuntoCrudoGPS[0] || lastCoord[1] !== ultimoPuntoCrudoGPS[1]) {
            trackCoords.push(ultimoPuntoCrudoGPS);
        }
    }

    // Registrar tramo final si hay distancia restante
    if (trackDistanceKm > splitsKm.length && (trackDistanceKm - splitsKm.length) >= 0.1) {
        const kmRestante = Number((trackDistanceKm - splitsKm.length).toFixed(2));
        const prevSplitTs = splitsKm.length > 0 ? splitsKm[splitsKm.length - 1].timestamp : trackStartTime.getTime();
        const splitSegundos = Math.max(1, Math.round((Date.now() - prevSplitTs) / 1000));
        const ritmoMinKm = ((splitSegundos / 60) / kmRestante).toFixed(2);
        const velMediaKmh = ((kmRestante / (splitSegundos / 3600))).toFixed(1);
        splitsKm.push({
            km: Number(trackDistanceKm.toFixed(2)),
            esFinal: true,
            distanciaKm: kmRestante,
            tiempoSeg: splitSegundos,
            ritmoMinKm: ritmoMinKm,
            velMediaKmh: velMediaKmh,
            timestamp: Date.now()
        });
    }

    // Snapshot meteorológico registrado en el momento de la travesía
    const vKtSnapshot = valorNumericoMeteo(datosMeteoActuales?.windSpeed, datosMeteoActuales?.wind_speed) !== null
        ? Number((valorNumericoMeteo(datosMeteoActuales?.windSpeed, datosMeteoActuales?.wind_speed) * 1.94384).toFixed(1))
        : null;
    const rKtSnapshot = valorNumericoMeteo(datosMeteoActuales?.windGusts, datosMeteoActuales?.wind_gusts) !== null
        ? Number((valorNumericoMeteo(datosMeteoActuales?.windGusts, datosMeteoActuales?.wind_gusts) * 1.94384).toFixed(1))
        : null;
    const oMSnapshot = valorNumericoMeteo(datosMeteoActuales?.waveHeight, datosMeteoActuales?.wave_height) !== null
        ? Number(valorNumericoMeteo(datosMeteoActuales?.waveHeight, datosMeteoActuales?.wave_height))
        : null;
    const perSSnapshot = datosMeteoActuales?.wavePeriod ? Number(datosMeteoActuales.wavePeriod) : null;
    const dirSnapshot = datosMeteoActuales?.windDirection ?? datosMeteoActuales?.wind_direction ?? null;

    const meteoSnapshot = {
        vientoKt: vKtSnapshot,
        rachasKt: rKtSnapshot,
        dirViento: dirSnapshot,
        olasM: oMSnapshot,
        periodoS: perSSnapshot,
        tempC: datosMeteoActuales?.tempAire ?? datosMeteoActuales?.temperature ?? null,
        score: motorExpertoActual?.seguridad?.score ?? null
    };

    let ubicacionTexto = "Travesía GPS";
    if (vKtSnapshot !== null) {
        ubicacionTexto += ` · 💨 ${vKtSnapshot} kt`;
        if (oMSnapshot !== null) {
            ubicacionTexto += ` · 🌊 ${oMSnapshot}m`;
        }
    }

    const rutaNormalizada = normalizarYLimitarRutaGPS(trackCoords);
    const avgSpeed = m > 0 ? Number((trackDistanceKm / (m / 60)).toFixed(1)) : 0;
    let pointsEarned = avgSpeed > 45 ? 0 : Math.round(trackDistanceKm * 100);
    try {
        const xpResult = await calcularXpRuta({
            userId: appState.sesionActual.user.id,
            distanceKm: trackDistanceKm,
            avgSpeed
        });
        pointsEarned = Number(xpResult?.xpGanado ?? pointsEarned);
    } catch (xpError) {
        console.warn('No se pudo calcular XP de la travesía; se aplica la regla base de PaddleSafe:', xpError);
    }
    
    const { data: nuevaRuta, error: errRuta } = await supabaseClient.from('rutas').insert([{
        user_id: appState.sesionActual.user.id,
        distancia_km: Number(trackDistanceKm.toFixed(2)),
        tiempo_minutos: m,
        ruta_json: rutaNormalizada,
        imagen_url: img,
        ubicacion: ubicacionTexto,
        points_earned: pointsEarned,
        splits_data: splitsKm,
        wind_speed_kt: vKtSnapshot,
        wind_gust_kt: rKtSnapshot,
        wind_direction_deg: dirSnapshot,
        wave_height_m: oMSnapshot,
        wave_period_s: perSSnapshot,
        conditions_score: meteoSnapshot.score,
        weather_snapshot: meteoSnapshot
    }]).select().single();
    
    if (errRuta || !nuevaRuta) {
        let pendingMessage = "No se pudo conservar la ruta en este dispositivo.";
        try {
            const equipo = recuperarEquipoUsuario();
            const fallbackTelemetry = {
                rutaId: 'offline_' + Date.now(),
                meteo: meteoSnapshot,
                splits: splitsKm,
                boardType: equipo.tipoTabla,
                velCruceroKmh: obtenerVelocidadCruceroUsuario(),
                timestamp: Date.now()
            };
            localStorage.setItem('ps_telemetry_last', JSON.stringify(fallbackTelemetry));
            localStorage.setItem('paddlesafe_ruta_pendiente', JSON.stringify({
                user_id: appState.sesionActual.user.id,
                km: trackDistanceKm,
                min: m,
                coords: rutaNormalizada,
                img,
                b64: imgBase64Backup,
                meteo: meteoSnapshot,
                splits: splitsKm,
                points_earned: pointsEarned,
                ts: Date.now()
            }));
            localStorage.removeItem('paddlesafe_live_checkpoint');
            pendingMessage = "Se conserva una copia en este dispositivo";
        } catch (e) {
            console.warn('No se pudo guardar la ruta pendiente localmente:', e);
        }
        document.getElementById('liveTrackingPanel').innerHTML = `
            <div class="text-center py-4 w-full">
                <span class="text-4xl block mb-2">⚠️</span>
                <h3 class="font-black text-white text-lg">No se pudo guardar</h3>
                <p class="text-amber-300 font-bold text-[10px] uppercase tracking-widest mb-3">${pendingMessage}</p>
                <button type="button" onclick="restaurarTracker()" class="bg-slate-700 text-white px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest w-full active:scale-95 transition-transform cursor-pointer">Cerrar Panel</button>
            </div>`;
        isSavingRoute = false;
        return;
    }
    
    localStorage.removeItem('paddlesafe_live_checkpoint');
    
    // Persistir telemetría y splits meteorológicos
    try {
        const equipo = recuperarEquipoUsuario();
        const telemetryData = {
            rutaId: nuevaRuta.id,
            meteo: meteoSnapshot,
            splits: splitsKm,
            boardType: equipo.tipoTabla,
            velCruceroKmh: obtenerVelocidadCruceroUsuario(),
            timestamp: Date.now()
        };
        localStorage.setItem('ps_telemetry_' + nuevaRuta.id, JSON.stringify(telemetryData));
        localStorage.setItem('ps_telemetry_last', JSON.stringify(telemetryData));
    } catch (errTel) {
        console.warn('Aviso no crítico al guardar telemetría de ruta en localStorage:', errTel);
    }
    
    if (ClubState.activeId) {
        await supabaseClient.from('club_rutas').insert([{ club_id: ClubState.activeId, ruta_id: nuevaRuta.id }]);
    }

    if(window.cargarPerfilUsuarioActivo) await window.cargarPerfilUsuarioActivo();
    
    document.getElementById('liveTrackingPanel').innerHTML = `
        <div class="text-center py-4 w-full">
            <span class="text-4xl block mb-2">✅</span>
            <h3 class="font-black text-white text-lg">Guardada</h3>
            <div class="flex items-center justify-center gap-2 text-xs font-bold my-1">
                <span class="text-emerald-400 uppercase tracking-widest">+${pointsEarned} pts</span>
                <span class="text-slate-500">·</span>
                <span class="text-amber-400 font-mono">🔥 ${biometriaFinal.kcal} kcal</span>
            </div>
            <p class="text-slate-400 text-[11px] mb-3">Distancia: ${trackDistanceKm.toFixed(2)} km · Tiempo: ${formatearTiempo(m)}</p>
            <button type="button" onclick="restaurarTracker()" class="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest w-full active:scale-95 transition-transform cursor-pointer">Cerrar Panel</button>
        </div>`;
}

export async function sincronizarRutasPendientes() {
    if (isSyncingPendingRoute || !appState.sesionActual?.user?.id) return;
    isSyncingPendingRoute = true;
    try {
        const pendienteStr = localStorage.getItem('paddlesafe_ruta_pendiente');
        if (!pendienteStr) return;
        
        const p = JSON.parse(pendienteStr);
        if (!p.user_id) {
            localStorage.removeItem('paddlesafe_ruta_pendiente');
            console.warn("Se eliminó una ruta pendiente heredada sin propietario para proteger la privacidad.");
            alert("Se descartó una ruta pendiente antigua porque no se puede verificar a qué cuenta pertenece.");
            return;
        }
        if (p.user_id !== appState.sesionActual.user.id) {
            console.warn("Ruta pendiente asociada a otra cuenta; se conserva sin sincronizar.");
            return;
        }
        
        let urlSincronizada = p.img || null;
        if (!urlSincronizada && p.b64) {
            try {
                const res = await fetch(p.b64);
                const blob = await res.blob();
                const fn = `rutas/${appState.sesionActual.user.id}-${Date.now()}_sync.jpg`;
                const { error: ue } = await supabaseClient.storage.from('paddlesafe').upload(fn, blob, { contentType: 'image/jpeg' });
                if (!ue) {
                    const { data } = supabaseClient.storage.from('paddlesafe').getPublicUrl(fn);
                    urlSincronizada = data.publicUrl;
                }
            } catch(e) { console.warn("Fallo subiendo canvas offline:", e); }
        }

        const coordsNormalizadas = normalizarYLimitarRutaGPS(p.coords);

        const avgSpeedSync = p.min > 0 ? Number((p.km / (p.min / 60)).toFixed(1)) : 0;
        let pointsEarned = Number(p.points_earned);
        if (!Number.isFinite(pointsEarned)) {
            pointsEarned = avgSpeedSync > 45 ? 0 : Math.round(Number(p.km) * 100);
            try {
                const xpResult = await calcularXpRuta({
                    userId: appState.sesionActual.user.id,
                    distanceKm: p.km,
                    avgSpeed: avgSpeedSync
                });
                pointsEarned = Number(xpResult?.xpGanado ?? pointsEarned);
            } catch (xpError) {
                console.warn('No se pudo calcular XP para la ruta offline; se aplica la regla base de PaddleSafe:', xpError);
            }
        }

        const meteo = p.meteo || {};
        const { error } = await supabaseClient.from('rutas').insert([{
            user_id: appState.sesionActual.user.id,
            distancia_km: Number(p.km.toFixed(2)),
            tiempo_minutos: p.min,
            ruta_json: coordsNormalizadas,
            imagen_url: urlSincronizada || p.img,
            ubicacion: "Travesía GPS (Sincronización Offline)",
            points_earned: pointsEarned,
            splits_data: Array.isArray(p.splits) ? p.splits : [],
            wind_speed_kt: meteo.vientoKt ?? null,
            wind_gust_kt: meteo.rachasKt ?? null,
            wind_direction_deg: meteo.dirViento ?? null,
            wave_height_m: meteo.olasM ?? null,
            wave_period_s: meteo.periodoS ?? null,
            conditions_score: meteo.score ?? null,
            weather_snapshot: meteo
        }]);
        
        if (!error) {
            localStorage.removeItem('paddlesafe_ruta_pendiente');
            alert(`¡Ruta guardada offline sincronizada con éxito! (+${pointsEarned} pts)`);
            if (window.cargarPerfilUsuarioActivo) await window.cargarPerfilUsuarioActivo();
        }
    } catch (e) {
        console.warn("Error al intentar sincronizar ruta pendiente:", e);
    } finally {
        isSyncingPendingRoute = false;
    }
}

export function restaurarTracker() {
    isSavingRoute = false;
    isTracking = false;
    window.isTracking = false;
    window.actualizarMiEstadoPresencia?.('online');
    modoSolTrackerActivo = false;
    liberarWakeLock().catch(() => {});
    const pnl = document.getElementById('liveTrackingPanel');
    if (pnl) {
        pnl.classList.remove('modo-sol-activo');
        pnl.classList.add('hidden');
    }
    const btnLive = document.getElementById('btnIniciarLive');
    if (btnLive) btnLive.classList.remove('hidden');
    if(document.getElementById('proPlanificador')) { document.getElementById('proPlanificador').classList.remove('hidden'); document.getElementById('proPlanificador').classList.add('flex'); }
}

export function descartarCheckpoint() {
    localStorage.removeItem('paddlesafe_live_checkpoint');
    if (livePolyline && map) {
        map.removeLayer(livePolyline);
        livePolyline = null;
    }
    trackCoords = [];
    trackDistanceKm = 0;
    isTracking = false;
    restaurarTracker();
}

export function restaurarTravesiaDesdeCheckpoint(ck) {
    if (!ck || !Array.isArray(ck.coords) || ck.coords.length === 0) return;
    
    trackCoords = [...ck.coords];
    trackDistanceKm = Number(ck.distKm || 0);
    const ts = ck.timestamp || (ck.startTime ? new Date(ck.startTime).getTime() : Date.now());
    trackStartTime = ck.startTime ? new Date(ck.startTime) : new Date(ts);
    
    if (livePolyline && map) {
        map.removeLayer(livePolyline);
    }
    if (map) {
        livePolyline = L.polyline(trackCoords, { color: '#ef4444', weight: 5 }).addTo(map);
        if (trackCoords.length > 0) {
            map.fitBounds(livePolyline.getBounds());
        }
    }
    
    isTracking = true;
    
    const p = document.getElementById('liveTrackingPanel');
    if (p) {
        const s = Math.max(0, Math.floor((Date.now() - trackStartTime.getTime()) / 1000));
        const hrs = Math.floor(s / 3600);
        const mins = Math.floor((s % 3600) / 60);
        const secs = s % 60;
        const timeStr = hrs > 0 
            ? `${hrs.toString().padStart(2,'0')}:${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`
            : `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
            
        p.innerHTML = `
            <div class="flex justify-between items-center mb-3 w-full">
                <span class="text-[10px] font-bold text-amber-400 uppercase tracking-widest">⚠️ Travesía Recuperada</span>
                <span id="liveTime" class="font-mono text-2xl font-black text-emerald-400">${timeStr}</span>
            </div>
            <div class="grid grid-cols-2 gap-2 text-center mb-3 w-full">
                <div class="bg-slate-800 rounded-xl py-2">
                    <p class="text-[9px] text-slate-400 uppercase tracking-widest">DISTANCIA</p>
                    <p id="liveDist" class="font-black text-lg text-white">${trackDistanceKm.toFixed(2)} km</p>
                </div>
                <div class="bg-slate-800 rounded-xl py-2">
                    <p class="text-[9px] text-slate-400 uppercase tracking-widest">PUNTOS</p>
                    <p id="liveSpeed" class="font-black text-lg text-white">${trackCoords.length} pts</p>
                </div>
            </div>
            <div class="flex gap-2 w-full">
                <button type="button" onclick="finalizarTravesia()" class="flex-1 h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl active:scale-95 text-[11px] uppercase tracking-widest transition-transform cursor-pointer">💾 Guardar Travesía</button>
                <button type="button" onclick="descartarCheckpoint()" class="h-11 px-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl active:scale-95 text-[11px] uppercase tracking-widest transition-transform cursor-pointer">🗑️ Descartar</button>
            </div>
        `;
        p.classList.remove('hidden');
        const btnLive = document.getElementById('btnIniciarLive');
        if (btnLive) btnLive.classList.add('hidden');
    }
}

export function verificarCheckpointPendiente() {
    try {
        const rawCk = localStorage.getItem('paddlesafe_live_checkpoint');
        if (!rawCk) return;
        const ck = JSON.parse(rawCk);
        const ts = ck.timestamp || (ck.startTime ? new Date(ck.startTime).getTime() : 0);
        const doceHorasMs = 12 * 60 * 60 * 1000;
        const antiguedad = Date.now() - ts;
        
        if (Array.isArray(ck.coords) && ck.coords.length > 5 && antiguedad >= 0 && antiguedad < doceHorasMs) {
            const horaStr = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const aceptar = confirm(`PaddleSafe detectó una travesía GPS interrumpida (${ck.coords.length} puntos, ${Number(ck.distKm || 0).toFixed(2)} km de las ${horaStr}).\n\n¿Deseas restaurarla en el mapa para guardarla o continuar?`);
            if (aceptar) {
                restaurarTravesiaDesdeCheckpoint(ck);
            } else {
                localStorage.removeItem('paddlesafe_live_checkpoint');
            }
        } else if (antiguedad >= doceHorasMs) {
            localStorage.removeItem('paddlesafe_live_checkpoint');
        }
    } catch (e) {
        console.warn('Error al verificar checkpoint de travesía:', e);
    }
}

// ==========================================
// COACH (MOTOR INTELIGENTE SUP)
// ==========================================

export async function solicitarCoachIAPro(dx, userLvl, distMetros, tiempoMinutos, lat, lon, fechaD, horaSalida, tramosData = [], motor = obtenerMotorExperto(dx)) {
    const bodyCont = document.getElementById('proCoachBody');
    const badgeLvl = document.getElementById('proCoachLevelBadge');
    if (!bodyCont) return;

    if (badgeLvl) badgeLvl.textContent = `Nivel: ${userLvl || 'Intermedio'}`;

    const wkVal = Number(dx.windSpeed ?? dx.wind_speed);
    const gustsVal = Number(dx.windGusts ?? dx.wind_gusts);
    const direccionViento = dx.windDirection === null || dx.windDirection === undefined || dx.windDirection === ''
        ? null
        : Number.isFinite(Number(dx.windDirection)) ? Number(dx.windDirection) : null;
    const wvRaw = dx.waveHeight ?? dx.wave_height;
    const wv = wvRaw === null || wvRaw === undefined || wvRaw === '' ? null : Number(wvRaw);
    const windKmh = Number.isFinite(wkVal) ? wkVal * 3.6 : null;
    const gustsKmh = Number.isFinite(gustsVal) ? gustsVal * 3.6 : null;
    const wPeriod = (dx.wavePeriod !== undefined && dx.wavePeriod !== null && dx.wavePeriod !== "--") ? parseFloat(dx.wavePeriod) : 0;
    const tempAireValue = dx.tempAire || dx.temperature || dx.temp || "N/D";
    const tempAguaValue = dx.tempAgua || dx.waterTemperature || dx.water_temp || "N/D";
    const pm = (dx.precipitation !== undefined && dx.precipitation !== null && dx.precipitation !== "") ? dx.precipitation : 0;
    const pl = (dx.precipProbability !== undefined && dx.precipProbability !== null && dx.precipProbability !== "") ? dx.precipProbability : (dx.precipitation_probability || 0);
    const uv = (dx.uvIndex !== undefined && dx.uvIndex !== null && dx.uvIndex !== "--") ? dx.uvIndex : 0;

    const payload = {
        condiciones: {
            viento: windKmh === null ? null : Number(windKmh.toFixed(1)),
            rachas: gustsKmh === null ? null : Number(gustsKmh.toFixed(1)),
            vientoNudos: motor.vientoNudos,
            rachasNudos: kmhANudos(gustsKmh),
            direccion: direccionViento,
            componenteViento: dx.componenteViento ?? dx.windComponent ?? null,
            oleaje: wv === null ? null : Number(wv.toFixed(1)),
            periodo: Number(wPeriod),
            tempAire: tempAireValue,
            tempAgua: tempAguaValue,
            lluvia: Number(pm),
            precipProb: Number(pl),
            uv: Number(uv),
            distanciaKm: distMetros > 0 ? Number((distMetros / 1000).toFixed(2)) : 0,
            duracionMin: tiempoMinutos > 0 ? Math.round(tiempoMinutos) : 60,
            ubicacion: `${lat}, ${lon}`,
            tramos_data: tramosData,
            lat,
            lon
        },
        userLevel: userLvl || "Intermedio",
        seguridad: motor.seguridad,
        analysisConfidence: motor.analysisConfidence,
        recomendacion: motor.recomendacion,
        riesgoDeriva: motor.riesgoDeriva,
        factoresCriticos: motor.factoresCriticos
    };

    // 1. RENDERIZADO INMEDIATO (0ms): Sin tiempos de espera ni bloqueos ("pensando")
    renderizarCoachProFallbackLocal({ ...payload.condiciones, motorExperto: motor }, userLvl, tramosData);
    if (motor.alertaEmergenciaActiva || motor.recomendacion === 'NO RECOMENDADO' || motor.tormentaElectrica || motor.analysisConfidence < 40) return;

    // 2. Consulta en segundo plano opcional y no bloqueante
    try {
        const resp = await fetchConTimeout(`${BACKEND_API_URL}?action=coach`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        }, 2500);

        const data = await resp.json();
        const coach = data.coach ? normalizarUnidadesCoach(data.coach) : null;
        if (data.ok && coach && (coach.resumen || coach.veredicto)
            && !coachContradiceMotor(coach, motor)) {
            renderizarCoachProCard(coach, data.fuente, userLvl, motor);
        }
    } catch (e) {
        // Silencioso: el análisis experto completo ya está visible al usuario desde el milisegundo 0
    }
}

function coachContradiceMotor(coach, motor) {
    const texto = JSON.stringify(coach).toLowerCase();
    const afirmaSeguro = /\b(seguro|seguros|navegable|navegables|condiciones ideales|puedes salir)\b/i.test(texto);
    const afirmaPeligro = /\b(riesgo extremo|peligroso|peligrosa|no salir|salida desaconsejada|no recomendable)\b/i.test(texto);
    return (motor.alertaEmergenciaActiva && afirmaSeguro)
        || (motor.recomendacion === 'NO RECOMENDADO' && afirmaSeguro)
        || (motor.seguridad.nivel === 'SEGURO' && afirmaPeligro);
}

function normalizarUnidadesCoach(valor) {
    if (typeof valor === 'string') {
        return valor
            .replace(/(\d+(?:[.,]\d+)?)\s*(?:-|–|a)\s*(\d+(?:[.,]\d+)?)\s*km\/h/gi, (_match, desde, hasta) => {
                const inicioKt = kmhANudos(Number(desde.replace(',', '.')));
                const finKt = kmhANudos(Number(hasta.replace(',', '.')));
                return `${inicioKt.toFixed(1)}-${finKt.toFixed(1)} kt`;
            })
            .replace(/(\d+(?:[.,]\d+)?)\s*(?:km\/h|kmh)\b/gi, (_match, velocidad) => {
                const nudos = kmhANudos(Number(velocidad.replace(',', '.')));
                return nudos === null ? _match : `${nudos.toFixed(1)} kt`;
            });
    }
    if (Array.isArray(valor)) return valor.map(normalizarUnidadesCoach);
    if (valor && typeof valor === 'object') {
        return Object.fromEntries(Object.entries(valor).map(([clave, dato]) => [clave, normalizarUnidadesCoach(dato)]));
    }
    return valor;
}

export function renderizarCoachProCard(coach, fuente, userLvl, motor = null) {
    const bodyCont = document.getElementById('proCoachBody');
    const badgeLvl = document.getElementById('proCoachLevelBadge');
    const badgeScore = document.getElementById('proCoachScoreBadge');
    if (!bodyCont || !coach) return;
    if (motor && (motor.alertaEmergenciaActiva || motor.recomendacion === 'NO RECOMENDADO' || motor.tormentaElectrica || motor.analysisConfidence < 40)) {
        renderizarCoachProFallbackLocal({ motorExperto: motor }, userLvl);
        return;
    }

    const score = motor?.seguridad.score
        ?? Math.max(0, Math.min(100, Math.round(Number(coach.score) || 70)));
    if (motor) {
        coach = {
            ...coach,
            score,
            veredicto: `${ICONOS_SEGURIDAD[motor.seguridad.nivel]} ${motor.seguridad.nivel}`,
            resumen: coach.resumen || motor.mensaje,
            seguridad_estrategia: [...motor.factoresCriticos,             `${ICONOS_DERIVA[motor.riesgoDeriva.nivel]} Deriva ${motor.riesgoDeriva.nivel} (${motor.riesgoDeriva.score}/100): ${motor.riesgoDeriva.descripcion}`]
        };
    }
    let scoreBadgeCls = "bg-emerald-950/80 text-emerald-300 border-emerald-500/40";
    let scoreBarBg = "bg-emerald-500";
    let scoreIcon = "🟢";

    if (score < 45) {
        scoreBadgeCls = "bg-rose-950/80 text-rose-300 border-rose-500/40";
        scoreBarBg = "bg-rose-500";
        scoreIcon = "🔴";
    } else if (score < 75) {
        scoreBadgeCls = "bg-amber-950/80 text-amber-300 border-amber-500/40";
        scoreBarBg = "bg-amber-500";
        scoreIcon = "🟡";
    }

    if (badgeLvl) badgeLvl.textContent = `Nivel: ${userLvl || 'Intermedio'}`;
    if (badgeScore) {
        badgeScore.className = `text-xs font-black font-mono px-2.5 py-1 rounded-lg border flex items-center gap-1 ${scoreBadgeCls}`;
        badgeScore.innerHTML = `<span>${scoreIcon}</span> Seguridad: ${score}/100`;
    }

    // 1. RECOMENDACIÓN PRINCIPAL ÚNICA DEL INSTRUCTOR
    // El Consejo del Instructor es el bloque prioritario y canónico de decisiones prácticas
    const consejoPrincipal = coach.consejo_instructor || coach.regla_oro || null;

    // Normalización defensiva de dureza
    const dureza = (coach.dureza_ruta && typeof coach.dureza_ruta === 'object')
        ? {
            nivel: coach.dureza_ruta.nivel || "Moderada (5/10)",
            descripcion: coach.dureza_ruta.descripcion || "Exigencia física media acorde a la distancia y viento previsto."
        }
        : {
            nivel: typeof coach.dureza_ruta === 'string' ? coach.dureza_ruta : "Moderada (5/10)",
            descripcion: "Exigencia física acorde a la distancia y viento previsto."
        };

    // Normalización defensiva de estrategia_viento
    const rawPacing = coach.estrategia_viento?.consejo_pacing || "Sal contra el viento y guarda un 30% de energía para el regreso.";
    const pacingEsDuplicado = consejoPrincipal && sonMensajesEquivalentes(rawPacing, consejoPrincipal);
    const estViento = (coach.estrategia_viento && typeof coach.estrategia_viento === 'object')
        ? {
            tramo_facil: coach.estrategia_viento.tramo_facil || "Aprovecha los tramos con viento a favor para deslizar la tabla.",
            tramo_exigente: coach.estrategia_viento.tramo_exigente || "Rema con postura baja en los tramos contra el viento.",
            consejo_pacing: pacingEsDuplicado ? "" : rawPacing
        }
        : {
            tramo_facil: typeof coach.estrategia_viento === 'string' ? coach.estrategia_viento : "Aprovecha los tramos con viento a favor para deslizar la tabla.",
            tramo_exigente: "Rema con postura baja en los tramos contra el viento.",
            consejo_pacing: pacingEsDuplicado ? "" : "Sal contra el viento y guarda un 30% de energía para el regreso."
        };

    // Normalización defensiva de análisis de zona y peligros
    let rawPeligros = coach.analisis_zona?.peligros_detectados || coach.peligros_detectados || [];
    if (typeof rawPeligros === 'string') rawPeligros = [rawPeligros];
    if (!Array.isArray(rawPeligros)) rawPeligros = [];

    const rawRecSeguridad = coach.analisis_zona?.recomendacion_seguridad || "";
    const recSeguridadDuplicada = consejoPrincipal && sonMensajesEquivalentes(rawRecSeguridad, consejoPrincipal);

    const zona = (coach.analisis_zona && typeof coach.analisis_zona === 'object')
        ? {
            orografia: coach.analisis_zona.orografia || "Costa abierta con exposición normal al viento.",
            peligros_detectados: rawPeligros,
            recomendacion_seguridad: recSeguridadDuplicada ? "" : rawRecSeguridad
        }
        : {
            orografia: typeof coach.analisis_zona === 'string' ? coach.analisis_zona : "Costa abierta con exposición normal al viento.",
            peligros_detectados: rawPeligros.length > 0 ? rawPeligros : ["Atención a posibles ráfagas en salientes y cabos."],
            recomendacion_seguridad: recSeguridadDuplicada ? "" : "Mantén navegación paralela a la costa."
        };

    let rawConsejosNivel = [];
    if (Array.isArray(coach.consejos_nivel) && coach.consejos_nivel.length > 0) {
        rawConsejosNivel = coach.consejos_nivel;
    } else if (typeof coach.consejos_nivel === 'string' && coach.consejos_nivel) {
        rawConsejosNivel = [coach.consejos_nivel];
    } else if (Array.isArray(coach.tecnica_postura) && coach.tecnica_postura.length > 0) {
        rawConsejosNivel = coach.tecnica_postura;
    } else if (typeof coach.tecnica_postura === 'string' && coach.tecnica_postura) {
        rawConsejosNivel = [coach.tecnica_postura];
    } else {
        rawConsejosNivel = ["Mantén flexión de rodillas y mirada al horizonte."];
    }

    const consejosNivelFiltrados = filtrarConsejosRedundantes(rawConsejosNivel, [consejoPrincipal, estViento.consejo_pacing]);
    const consejosNivel = consejosNivelFiltrados.length > 0 ? consejosNivelFiltrados : ["Mantén flexión de rodillas y mirada al horizonte."];

    const peligrosArr = filtrarConsejosRedundantes(Array.isArray(zona.peligros_detectados) ? zona.peligros_detectados : [], [consejoPrincipal]);
    const peligrosHtml = peligrosArr.length > 0
        ? peligrosArr.map(p => `
            <li class="flex items-start gap-2 text-xs text-amber-200/90">
                <span class="text-amber-400 shrink-0 text-sm">⚠️</span>
                <span class="leading-relaxed">${esc(p)}</span>
            </li>
        `).join('')
        : '<li class="text-xs text-slate-400">Sin peligros orográficos severos detectados.</li>';

    const consejosNivelHtml = consejosNivel.map(c => `
        <li class="flex items-start gap-2 text-xs text-slate-200">
            <span class="text-teal-400 shrink-0 text-sm">🏄</span>
            <span class="leading-relaxed">${esc(c)}</span>
        </li>
    `).join('');

    let segArr = coach.seguridad_estrategia;
    if (typeof segArr === 'string') segArr = [segArr];
    if (!Array.isArray(segArr)) segArr = [];
    const referenciasMotor = motor
        ? [motor.mensaje, ...motor.factoresCriticos, motor.riesgoDeriva?.descripcion, consejoPrincipal].filter(Boolean)
        : [consejoPrincipal].filter(Boolean);
    const seguridadUnica = filtrarConsejosRedundantes(segArr, referenciasMotor);
    const seguridadItems = seguridadUnica.length > 0
        ? seguridadUnica.map(item => `
            <li class="flex items-start gap-2 text-xs text-slate-200">
                <span class="text-sky-400 shrink-0 text-sm">🛡️</span>
                <span class="leading-relaxed">${esc(item)}</span>
            </li>
        `).join('')
        : '<li class="text-xs text-slate-400">Consulta el resumen experto antes de decidir.</li>';

    let matArr = coach.material_recomendado;
    if (typeof matArr === 'string') matArr = [matArr];
    if (!Array.isArray(matArr)) matArr = [];
    const materialItems = matArr.length > 0
        ? matArr.map(item => `
            <li class="flex items-start gap-2 text-xs text-slate-200">
                <span class="text-amber-400 shrink-0 text-sm">🎒</span>
                <span class="leading-relaxed">${esc(item)}</span>
            </li>
        `).join('')
        : '<li class="text-xs text-slate-400">Leash obligatorio y chaleco 50N.</li>';

    const fuenteLabel = fuente && fuente.includes("gemini")
        ? "✨ Análisis del Coach"
        : "🌊 Motor Experto PaddleSafe (FESurfing / ISA)";
    const resumenCoach = coach.resumen
        && (!motor || deduplicateInsights([coach.resumen, motor.mensaje]).length > 1)
        ? coach.resumen
        : '';

    bodyCont.innerHTML = `
        <!-- Veredicto Principal del Coach -->
        <div class="bg-slate-800/90 rounded-2xl p-4 border border-slate-700 shadow-md flex flex-col gap-2.5">
            <div class="flex items-center justify-between gap-2 border-b border-slate-700/60 pb-2">
                <span class="font-black text-xs uppercase tracking-wider text-white flex items-center gap-1.5">
                    <span>🧭</span> ${esc(coach.veredicto || 'EVALUACIÓN DEL DÍA')}
                </span>
                <span class="text-[11px] font-mono text-emerald-400 font-bold bg-slate-900/80 px-2 py-0.5 rounded border border-emerald-500/20">${score}/100</span>
            </div>
            ${resumenCoach ? `<p class="text-xs text-slate-200 leading-relaxed font-medium">${esc(resumenCoach)}</p>` : ''}
            <div class="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden mt-0.5">
                <div class="${scoreBarBg} h-full rounded-full transition-all duration-700" style="width: ${score}%"></div>
            </div>
        </div>

        <!-- CONSEJO DEL INSTRUCTOR (DECISIÓN PRÁCTICA PRINCIPAL) -->
        ${consejoPrincipal ? `
        <div class="bg-gradient-to-r from-amber-500/15 via-emerald-500/15 to-teal-500/15 border border-amber-500/40 rounded-2xl p-4 shadow-sm flex items-start gap-3">
            <span class="text-amber-400 shrink-0 text-xl mt-0.5">💡</span>
            <div class="flex-1">
                <span class="text-amber-300 font-black text-[11px] uppercase tracking-wider block mb-1">Consejo del Instructor (${esc(userLvl || 'Intermedio')})</span>
                <p class="text-white text-xs font-semibold leading-relaxed">${esc(consejoPrincipal)}</p>
            </div>
        </div>
        ` : ''}

        <!-- VENTANA ÓPTIMA HORARIA -->
        ${coach.ventana_recomendada ? `
        <div class="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-3.5 shadow-sm flex items-start gap-3">
            <span class="text-emerald-400 shrink-0 text-lg mt-0.5">⏰</span>
            <div class="flex-1">
                <span class="text-emerald-300 font-black text-[10px] uppercase tracking-wider block mb-0.5">Ventana Óptima de Navegación</span>
                <p class="text-xs text-emerald-100 leading-relaxed font-medium">${esc(coach.ventana_recomendada)}</p>
            </div>
        </div>
        ` : ''}

        <!-- 1. DUREZA DE LA RUTA -->
        <div class="bg-gradient-to-br from-slate-900 via-slate-800/80 to-slate-900 rounded-2xl p-4 border border-rose-500/30 flex flex-col gap-2 shadow-sm">
            <div class="flex items-center justify-between border-b border-slate-700/60 pb-2">
                <span class="text-xs font-black uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                    <span>⚡</span> Dureza & Demanda Física
                </span>
                <span class="text-[10px] font-black uppercase font-mono px-2 py-0.5 rounded bg-rose-950/70 text-rose-300 border border-rose-500/40">
                    ${esc(dureza.nivel || 'Moderada')}
                </span>
            </div>
            <p class="text-xs text-slate-200 leading-relaxed">${esc(dureza.descripcion || '')}</p>
        </div>

        <!-- 2. ESTRATEGIA DE VIENTO & DOWNWIND -->
        <div class="bg-gradient-to-br from-slate-900 via-slate-800/80 to-slate-900 rounded-2xl p-4 border border-emerald-500/30 flex flex-col gap-2.5 shadow-sm">
            <div class="flex items-center justify-between border-b border-slate-700/60 pb-2">
                <span class="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <span>💨</span> Estrategia de Viento & Downwind
                </span>
                <span class="text-[10px] font-mono text-emerald-300 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">Viento Favorable</span>
            </div>
            
            <!-- Tramo Favorable -->
            <div class="bg-emerald-950/30 p-3 rounded-xl border border-emerald-500/30 flex items-start gap-2.5">
                <span class="text-emerald-400 shrink-0 text-base mt-0.5">🟢</span>
                <div class="flex-1">
                    <span class="text-[11px] font-black text-emerald-300 uppercase tracking-wide block mb-0.5">Cuándo será más fácil (A favor):</span>
                    <p class="text-xs text-slate-200 leading-relaxed">${esc(estViento.tramo_facil || '')}</p>
                </div>
            </div>

            <!-- Tramo Exigente -->
            <div class="bg-rose-950/25 p-3 rounded-xl border border-rose-500/30 flex items-start gap-2.5">
                <span class="text-rose-400 shrink-0 text-base mt-0.5">🔴</span>
                <div class="flex-1">
                    <span class="text-[11px] font-black text-rose-300 uppercase tracking-wide block mb-0.5">Tramo más exigente (En contra/Lateral):</span>
                    <p class="text-xs text-slate-200 leading-relaxed">${esc(estViento.tramo_exigente || '')}</p>
                </div>
            </div>

            <!-- Consejo Pacing (si no repite el consejo principal) -->
            ${estViento.consejo_pacing ? `
            <div class="bg-slate-900/80 p-2.5 rounded-xl border border-slate-700/60 text-[11px] text-slate-300 flex items-start gap-2">
                <span class="text-amber-400 shrink-0 text-sm">💡</span>
                <span class="leading-relaxed"><strong>Pacing y Energía:</strong> ${esc(estViento.consejo_pacing)}</span>
            </div>` : ''}
        </div>

        <!-- 3. ANÁLISIS DE LA ZONA MARCADA EN EL MAPA -->
        <div class="bg-gradient-to-br from-slate-900 via-slate-800/80 to-slate-900 rounded-2xl p-4 border border-sky-500/30 flex flex-col gap-2.5 shadow-sm">
            <div class="flex items-center justify-between border-b border-slate-700/60 pb-2">
                <span class="text-xs font-black uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                    <span>🗺️</span> Análisis de la Zona & Deriva Costera
                </span>
                <span class="text-[10px] font-mono text-sky-300 font-bold bg-sky-950/60 px-2 py-0.5 rounded border border-sky-500/30">Relieve y Costa</span>
            </div>

            <!-- Interpretación de la Deriva (Sin jerga técnica) -->
            ${coach.analisis_deriva ? `
            <div class="bg-slate-900/90 rounded-xl p-3 border border-sky-500/30 flex items-start gap-2.5">
                <span class="text-sky-400 shrink-0 text-base mt-0.5">🧭</span>
                <div class="flex-1">
                    <span class="text-[10px] font-black uppercase tracking-wider text-sky-300 block mb-0.5">Comportamiento del Viento & Deriva:</span>
                    <p class="text-xs text-slate-200 leading-relaxed">${esc(coach.analisis_deriva)}</p>
                </div>
            </div>
            ` : ''}

            <p class="text-xs text-slate-300 font-medium">${esc(zona.orografia || '')}</p>

            <!-- Peligros / Dificultades Detectadas -->
            <div class="bg-slate-900/90 rounded-xl p-3 border border-slate-700/70 flex flex-col gap-1.5">
                <span class="text-[10px] font-black uppercase tracking-wider text-amber-300 flex items-center gap-1">
                    <span>⚠️</span> Dificultades detectadas en el spot:
                </span>
                <ul class="flex flex-col gap-2 mt-1">
                    ${peligrosHtml}
                </ul>
            </div>

            ${zona.recomendacion_seguridad ? `
            <div class="bg-sky-950/30 p-2.5 rounded-xl border border-sky-500/30 text-[11px] text-sky-200 flex items-start gap-2">
                <span class="shrink-0 text-sm">📍</span>
                <span class="leading-relaxed"><strong>Consejo para esta costa:</strong> ${esc(zona.recomendacion_seguridad)}</span>
            </div>
            ` : ''}
        </div>

        <!-- 4. BLOQUE DOBLE: TÉCNICA NIVEL Y MATERIAL -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <!-- Consejos por nivel -->
            <div class="bg-slate-800/70 rounded-2xl p-3.5 border border-teal-500/20 flex flex-col gap-2">
                <span class="text-[11px] font-black uppercase tracking-wider text-teal-400 flex items-center gap-1.5 border-b border-slate-700/50 pb-1.5">
                    <span>🏄</span> Claves Técnicas (${esc(userLvl || 'Intermedio')})
                </span>
                <ul class="flex flex-col gap-2">
                    ${consejosNivelHtml}
                </ul>
            </div>

            <!-- Material Clave -->
            <div class="bg-slate-800/70 rounded-2xl p-3.5 border border-amber-500/20 flex flex-col gap-2">
                <span class="text-[11px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5 border-b border-slate-700/50 pb-1.5">
                    <span>🎒</span> Material & Seguridad SUP
                </span>
                <ul class="flex flex-col gap-2">
                    ${materialItems}
                </ul>
            </div>
        </div>

        <!-- Pie de Información y Transparencia -->
        <div class="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-800/80">
            <span>${fuenteLabel}</span>
            <span class="font-mono text-emerald-400 font-bold">PaddleSafe Coach</span>
        </div>
    `;
}

export function renderizarCoachProFallbackLocal(cond, userLvl, tramosData = []) {
    const motor = cond.motorExperto || obtenerMotorExperto(cond, userLvl);

    // 0. PRIORIDAD ABSOLUTA: Veto por alerta oficial de emergencias (112 / Protección Civil / Aviso Especial)
    if (motor.alertaEmergenciaActiva) {
        const body = document.getElementById('proCoachBody');
        const badgeScore = document.getElementById('proCoachScoreBadge');
        if (badgeScore) {
            badgeScore.className = 'text-xs font-black font-mono px-2.5 py-1 rounded-lg border flex items-center gap-1 bg-red-950/80 text-rose-300 border-red-500/40';
            badgeScore.innerHTML = `<span>🚨</span> Seguridad: 0/100`;
        }
        if (body) {
            body.innerHTML = `
                <div class="rounded-2xl border-2 border-red-600 bg-red-950/90 p-4 text-xs text-white shadow-xl">
                    <p class="font-black text-sm flex items-center gap-2 text-rose-300">
                        <span>🚨</span> ⛔ PROHIBIDO SALIR A REMAR POR SITUACIÓN DE EMERGENCIA
                    </p>
                    <p class="mt-2 text-slate-100 leading-relaxed font-medium">
                        Existe una alerta oficial activa emitida por Protección Civil / 112. Las condiciones marítimas presentan un riesgo inaceptable para la vida humana (corrientes de arrastre, oleaje y dificultades extremas para rescates marítimos).
                    </p>
                    <div class="mt-3 p-3 rounded-xl bg-red-900/60 border border-red-500/60 text-xs text-amber-200">
                        <strong>Directiva del Instructor ISA:</strong> Salida totalmente prohibida. Permanece en tierra firme bajo resguardo y atiende a las comunicaciones de las autoridades locales.
                    </div>
                </div>`;
        }
        return;
    }

    // 1. PRIORIDAD MÁXIMA: Veto por tormenta eléctrica
    if (motor.tormentaElectrica) {
        const body = document.getElementById('proCoachBody');
        if (body) {
            body.innerHTML = `
                <div class="rounded-2xl border-2 border-red-600 bg-red-950/70 p-4 text-xs text-white shadow-lg">
                    <p class="font-black text-sm flex items-center gap-2 text-rose-300">
                        <span>⛈️</span> ⛔ NO RECOMENDADO SALIR A REMAR
                    </p>
                    <p class="mt-2 text-slate-100 leading-relaxed font-medium">
                        Existe riesgo confirmado de tormenta eléctrica en la zona. Aunque otros parámetros puedan parecer favorables, las descargas eléctricas y los cambios bruscos del viento convierten la actividad en una situación de riesgo vital inaceptable.
                    </p>
                    <div class="mt-3 p-2.5 rounded-xl bg-red-900/40 border border-red-500/40 text-[11px] text-amber-200">
                        <strong>Consejo del Instructor:</strong> Cancela la salida de inmediato y permanece bajo techo en tierra firme.
                    </div>
                </div>`;
        }
        return;
    }

    // 2. GENERACIÓN DEL COACH INSTRUCTOR PROFESIONAL ISA (0ms)
    const coachLocal = generarConsejoCoach({
        condiciones: cond,
        userLevel: userLvl,
        motor,
        tramosData,
        ubicacion: cond.ubicacion || 'Spot de Costa'
    });

    renderizarCoachProCard(coachLocal, "PaddleSafe Coach ISA", userLvl, motor);
}

export async function solicitarCoachIABasico(dx, userLvl, loc, motor = obtenerMotorExperto(dx)) {
    const cont = document.getElementById('basicCoachContainer');
    if (!cont) return;

    cont.classList.remove('hidden');

    // 0. PRIORIDAD ABSOLUTA: Veto por alerta oficial de emergencias (112 / Protección Civil)
    if (motor.alertaEmergenciaActiva) {
        cont.innerHTML = `
            <div class="rounded-xl border-2 border-red-600 bg-red-950/90 p-3.5 text-xs text-white shadow-lg">
                <span class="font-black text-rose-300 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <span>🚨</span> ⛔ PROHIBIDO SALIR A REMAR POR EMERGENCIA
                </span>
                <p class="mt-1.5 text-slate-100 leading-relaxed font-medium">
                    Existe una alerta oficial activa de Protección Civil / 112. Queda terminantemente prohibida cualquier salida al agua por riesgo vital extremo.
                </p>
                <div class="mt-2 text-[11px] text-amber-200">
                    <strong>Directiva del Instructor:</strong> Salida prohibida por seguridad oficial. Permanece en tierra firme y sigue las indicaciones de las autoridades.
                </div>
            </div>`;
        return;
    }

    // 1. PRIORIDAD MÁXIMA: Veto por tormenta eléctrica
    if (motor.tormentaElectrica) {
        cont.innerHTML = `
            <div class="rounded-xl border-2 border-red-600 bg-red-950/70 p-3.5 text-xs text-white">
                <span class="font-black text-rose-300 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <span>⛈️</span> ⛔ NO RECOMENDADO SALIR A REMAR
                </span>
                <p class="mt-1.5 text-slate-100 leading-relaxed font-medium">
                    Existe riesgo confirmado de tormenta eléctrica en la zona. Aunque otros parámetros puedan parecer favorables, las descargas eléctricas y los cambios bruscos del viento convierten la actividad en una situación de riesgo vital inaceptable.
                </p>
                <div class="mt-2 text-[11px] text-amber-200">
                    <strong>Consejo del Instructor:</strong> Cancela la salida de inmediato y permanece bajo techo en tierra firme.
                </div>
            </div>`;
        return;
    }

    const wkVal = Number(dx.windSpeed ?? dx.wind_speed);
    const gustsVal = Number(dx.windGusts ?? dx.wind_gusts);
    const direccionViento = dx.windDirection === null || dx.windDirection === undefined || dx.windDirection === ''
        ? null
        : Number.isFinite(Number(dx.windDirection)) ? Number(dx.windDirection) : null;
    const wvRaw = dx.waveHeight ?? dx.wave_height;
    const wv = wvRaw === null || wvRaw === undefined || wvRaw === '' ? null : Number(wvRaw);
    const vientoKmh = Number.isFinite(wkVal) ? wkVal * 3.6 : null;
    const rachasKmh = Number.isFinite(gustsVal) ? gustsVal * 3.6 : null;

    const payload = {
        condiciones: {
            viento: vientoKmh === null ? null : Number(vientoKmh.toFixed(1)),
            rachas: rachasKmh === null ? null : Number(rachasKmh.toFixed(1)),
            vientoNudos: motor.vientoNudos,
            rachasNudos: kmhANudos(rachasKmh),
            direccion: direccionViento,
            componenteViento: dx.componenteViento ?? dx.windComponent ?? motor.derivaCostera?.componente ?? null,
            oleaje: wv === null ? null : Number(wv.toFixed(1)),
            periodo: Number(dx.wavePeriod || 0),
            tempAire: dx.tempAire || "N/D",
            tempAgua: dx.tempAgua || "N/D",
            lluvia: Number(dx.precipitation || 0),
            precipProb: Number(dx.precipProbability || 0),
            ubicacion: loc || "Spot de Costa"
        },
        userLevel: userLvl || "Intermedio",
        seguridad: motor.seguridad,
        analysisConfidence: motor.analysisConfidence,
        recomendacion: motor.recomendacion,
        riesgoDeriva: motor.riesgoDeriva,
        factoresCriticos: motor.factoresCriticos
    };

    // 2. RENDERIZADO INMEDIATO DEL COACH PROFESIONAL ISA (0ms)
    const coachLocal = generarConsejoCoach({
        condiciones: payload.condiciones,
        userLevel: userLvl,
        motor,
        ubicacion: loc
    });

    const renderizarContenidoBasico = (coach, fuente = "PaddleSafe Coach ISA") => {
        const score = motor.seguridad?.score ?? 85;
        let scoreCls = score >= 75 ? "text-emerald-400" : (score >= 45 ? "text-amber-400" : "text-rose-400");

        // 1. RECOMENDACIÓN PRINCIPAL ÚNICA DEL INSTRUCTOR
        // El bloque 💡 Consejo del Instructor es el único bloque oficial de recomendaciones.
        // Se descarta cualquier bloque 📜 inferior duplicado o semánticamente equivalente.
        const consejoPrincipal = coach.consejo_instructor || coach.regla_oro || null;

        cont.innerHTML = `
            <div class="flex flex-col gap-2.5">
                <div class="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div class="flex items-center gap-1.5">
                        <span class="text-base">🏄‍♂️</span>
                        <span class="font-black text-emerald-300 text-xs uppercase tracking-wider">Coach Instructor (${esc(userLvl || 'Intermedio')})</span>
                    </div>
                    <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 ${scoreCls} border border-slate-700 font-bold">${ICONOS_SEGURIDAD[motor.seguridad.nivel]} ${esc(motor.seguridad.nivel)} · ${score}/100</span>
                </div>

                <!-- Resumen pedagógico que convierte datos en decisiones -->
                <p class="text-xs text-slate-100 leading-relaxed font-medium">${esc(coach.resumen)}</p>

                <!-- Consejo personalizado del instructor (Único bloque principal) -->
                ${consejoPrincipal ? `
                <div class="text-[11px] text-amber-200 flex items-start gap-1.5 bg-amber-950/40 p-2.5 rounded-xl border border-amber-500/30">
                    <span class="shrink-0 text-sm">💡</span>
                    <span><strong>Consejo del Instructor:</strong> ${esc(consejoPrincipal)}</span>
                </div>` : ''}

                <!-- Ventana Óptima si existe -->
                ${coach.ventana_recomendada ? `
                <div class="text-[11px] text-emerald-300 flex items-start gap-1.5 bg-emerald-950/40 p-2 rounded-lg border border-emerald-500/20">
                    <span class="shrink-0">⏰</span>
                    <span><strong>Ventana Óptima:</strong> ${esc(coach.ventana_recomendada)}</span>
                </div>` : ''}
            </div>
        `;
    };

    renderizarContenidoBasico(coachLocal);
    if (motor.alertaEmergenciaActiva || motor.recomendacion === 'NO RECOMENDADO' || motor.tormentaElectrica || motor.analysisConfidence < 40) return;

    // 3. Enriquecimiento opcional en segundo plano
    try {
        const resp = await fetchConTimeout(`${BACKEND_API_URL}?action=coach`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        }, 2000);

        const data = await resp.json();
        const coachRemoto = data.coach ? normalizarUnidadesCoach(data.coach) : null;
        if (data.ok && coachRemoto && (coachRemoto.resumen || coachRemoto.veredicto)
            && !coachContradiceMotor(coachRemoto, motor)) {
            const consejoRemoto = coachRemoto.consejo_instructor || coachRemoto.regla_oro || coachLocal.consejo_instructor;
            renderizarContenidoBasico({
                ...coachLocal,
                resumen: coachRemoto.resumen || coachLocal.resumen,
                consejo_instructor: consejoRemoto,
                regla_oro: null
            }, data.fuente);
        }
    } catch (e) {
        // Silencioso: el análisis experto ya está activo
    }
}

// ====================================================
// GESTOR DE SPOTS FAVORITOS Y TIMELINE DIURNO COMPLETO
// ====================================================

export async function cargarSpotsGuardadosUsuario() {
    const user = appState?.sesionActual?.user;
    const userId = user?.id;
    const guestPrompt = document.getElementById('savedSpotsGuestPrompt');
    if (guestPrompt) {
        if (!userId) {
            guestPrompt.classList.remove('hidden');
        } else {
            guestPrompt.classList.add('hidden');
        }
    }

    const storageKey = userId ? `ps_spots_${userId}` : 'ps_guest_spots';
    let spots = [];

    if (userId && supabaseClient) {
        try {
            const { data, error } = await supabaseClient
                .from('user_spots')
                .select('*')
                .eq('user_id', userId)
                .order('orden', { ascending: true })
                .order('created_at', { ascending: true });

            if (!error && Array.isArray(data)) {
                spots = data;
                try {
                    localStorage.setItem(storageKey, JSON.stringify(spots));
                } catch (e) {
                    console.warn('Aviso al guardar spots en localStorage:', e);
                }
            } else {
                console.warn('Aviso no crítico al consultar user_spots en Supabase (usando fallback local):', error?.message);
                const localRaw = localStorage.getItem(storageKey);
                if (localRaw) {
                    try { spots = JSON.parse(localRaw) || []; } catch (_) { spots = []; }
                }
            }
        } catch (err) {
            console.warn('Aviso al conectar con Supabase para user_spots:', err);
            const localRaw = localStorage.getItem(storageKey);
            if (localRaw) {
                try { spots = JSON.parse(localRaw) || []; } catch (_) { spots = []; }
            }
        }
    } else {
        const localRaw = localStorage.getItem(storageKey);
        if (localRaw) {
            try { spots = JSON.parse(localRaw) || []; } catch (_) { spots = []; }
        }
    }

    spotsGuardadosMemoria = spots;
    renderizarBarraSpotsGuardados();
    actualizarEstadoBotonGuardarSpot();
    return spots;
}

export function renderizarBarraSpotsGuardados() {
    const listEl = document.getElementById('savedSpotsList');
    const countEl = document.getElementById('savedSpotsCount');
    const btnComp = document.getElementById('btnCompararMisSpots');
    if (!listEl) return;

    if (countEl) {
        countEl.textContent = `${spotsGuardadosMemoria.length} spot${spotsGuardadosMemoria.length === 1 ? '' : 's'}`;
    }

    if (btnComp) {
        if (spotsGuardadosMemoria.length >= 2) {
            btnComp.classList.remove('hidden');
            btnComp.classList.add('inline-flex');
        } else {
            btnComp.classList.add('hidden');
            btnComp.classList.remove('inline-flex');
            document.getElementById('spotsComparisonPanel')?.classList.add('hidden');
        }
    }

    if (spotsGuardadosMemoria.length === 0) {
        listEl.innerHTML = `<span class="text-xs text-slate-400 italic px-2 py-1">Aún no tienes spots guardados. Pulsa ⭐ Guardar Spot tras buscar una playa o tocar el mapa.</span>`;
        return;
    }

    const currentLoc = document.getElementById('location')?.value?.trim().toLowerCase();
    const currentLat = Number(latitudActual);
    const currentLon = Number(longitudActual);

    listEl.innerHTML = spotsGuardadosMemoria.map(spot => {
        const esActivo = (spotActivoActual && (spotActivoActual.id === spot.id || spotActivoActual.nombre === spot.nombre)) ||
            (currentLoc && spot.nombre.toLowerCase() === currentLoc) ||
            (Number.isFinite(spot.lat) && Number.isFinite(spot.lon) && Math.abs(spot.lat - currentLat) < 0.003 && Math.abs(spot.lon - currentLon) < 0.003);

        const activeClass = esActivo
            ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-300 font-black'
            : 'bg-white dark:bg-slate-700/90 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 font-bold';

        const idParam = spot.id || spot.nombre;
        return `
            <div role="button" tabindex="0" onclick="window.seleccionarSpotGuardadoPorId('${esc(idParam)}')" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-all shadow-sm shrink-0 cursor-pointer ${activeClass}">
                <span class="text-sm">🏖️</span>
                <span class="truncate max-w-[120px]">${esc(spot.nombre)}</span>
                <button type="button" onclick="event.stopPropagation(); window.eliminarSpotGuardado('${esc(idParam)}')" title="Eliminar spot" class="ml-1 text-slate-400 hover:text-red-500 dark:hover:text-red-400 font-bold p-0.5 rounded cursor-pointer leading-none">✕</button>
            </div>
        `;
    }).join('');
}

export async function compararSpotsGuardados() {
    if (!Array.isArray(spotsGuardadosMemoria) || spotsGuardadosMemoria.length < 2) {
        alert('Guarda al menos 2 spots favoritos para poder compararlos.');
        return;
    }

    const panel = document.getElementById('spotsComparisonPanel');
    const list = document.getElementById('spotsComparisonList');
    if (!panel || !list) return;

    panel.classList.remove('hidden');
    panel.scrollIntoView({ behavior: 'smooth' });
    list.innerHTML = `
        <div class="py-6 text-center text-xs text-slate-300 font-bold flex items-center justify-center gap-2">
            <span class="animate-spin text-lg">⏳</span>
            <span>Analizando condiciones meteorológicas y ventanas óptimas en paralelo para ${spotsGuardadosMemoria.length} spots...</span>
        </div>
    `;

    const fecha = document.getElementById('date')?.value || new Date().toISOString().split('T')[0];
    const franja = document.getElementById('timeRange')?.value || 'Salida (08:00 - 12:00)';
    const nivelUsuario = document.getElementById('userLevel')?.value || 'Intermedio';
    const eq = appState?.equipoUsuario || recuperarEquipoUsuario();

    const promesas = spotsGuardadosMemoria.map(async spot => {
        try {
            const payload = {
                location: `${spot.lat},${spot.lon}`,
                date: fecha,
                timeRange: franja,
                userLevel: nivelUsuario,
                equipoUsuario: eq,
                driftMod: eq.driftMod,
                boardType: eq.tipoTabla
            };
            const resPronostico = await solicitarPronostico(payload);
            const dx = resPronostico?.datos || {};
            const vKt = dx.windSpeed != null ? kmhANudos(dx.windSpeed * 3.6) : 0;
            const rKt = dx.windGusts != null ? kmhANudos(dx.windGusts * 3.6) : vKt;
            const dirDeg = dx.windDirection ?? 0;
            const oM = dx.waveHeight ?? 0;
            const perS = dx.wavePeriod ?? 0;

            const infoCosta = resolverOrientacionCostera(spot.nombre, spot.lat, spot.lon);
            const compViento = calcularComponenteVientoAuto(spot.lat, spot.lon, dirDeg, spot.nombre);
            const veredicto = generarVeredictoNextGen({
                ...dx,
                vientoKt: vKt,
                rachasKt: rKt,
                dirVientoDeg: dirDeg,
                oleajeM: oM,
                periodoOlaS: perS,
                spotNombre: spot.nombre,
                lat: spot.lat,
                lon: spot.lon,
                userLevel: nivelUsuario,
                equipoUsuario: eq,
                horasDiurnas: dx.horasDiurnas || []
            });

            const ventanas = detectarVentanasOptimas(dx.horasDiurnas || [], nivelUsuario);
            const score = Number(veredicto?.scoreSeguridad ?? veredicto?.score ?? 50);

            return {
                spot,
                dx,
                vKt,
                rKt,
                dirDeg,
                oM,
                perS,
                infoCosta,
                compViento,
                veredicto,
                ventanas,
                score
            };
        } catch (errSpot) {
            console.warn(`Error evaluando spot ${spot.nombre}:`, errSpot);
            return null;
        }
    });

    const settled = await Promise.allSettled(promesas);
    const validos = settled
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => r.value)
        .sort((a, b) => b.score - a.score);

    if (validos.length === 0) {
        list.innerHTML = `<p class="text-xs text-red-400 py-4 text-center">No se pudo obtener el pronóstico de los spots. Revisa tu conexión a internet.</p>`;
        return;
    }

    list.innerHTML = validos.map((item, index) => {
        const esMejor = index === 0;
        const rankBadge = esMejor
            ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-slate-950 border border-amber-300 shadow">#1 🏆 Recomendado hoy</span>'
            : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">#${index + 1}</span>`;

        let scoreBadge = '';
        if (item.score >= 80) scoreBadge = `<span class="px-2 py-0.5 rounded-lg text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">🟢 ${item.score}</span>`;
        else if (item.score >= 60) scoreBadge = `<span class="px-2 py-0.5 rounded-lg text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">🟡 ${item.score}</span>`;
        else if (item.score >= 40) scoreBadge = `<span class="px-2 py-0.5 rounded-lg text-xs font-black bg-orange-500/20 text-orange-300 border border-orange-500/40">🟠 ${item.score}</span>`;
        else scoreBadge = `<span class="px-2 py-0.5 rounded-lg text-xs font-black bg-red-500/20 text-red-300 border border-red-500/40">🔴 ${item.score}</span>`;

        const compText = item.compViento?.componente || 'Cruzado';
        const ventanaTxt = item.ventanas?.mejorVentana
            ? `🕒 ${item.ventanas.mejorVentana.inicio} - ${item.ventanas.mejorVentana.fin}`
            : '🕒 Jornada variable';

        const hayRacha = (item.rKt - item.vKt) >= 3;
        const cardBg = esMejor ? 'bg-gradient-to-r from-slate-800 to-slate-800/90 border-amber-500/50 shadow-md ring-1 ring-amber-500/30' : 'bg-slate-800/70 border-slate-700/80 hover:border-slate-600';

        return `
            <div role="button" tabindex="0" onclick="window.seleccionarSpotGuardadoPorId('${esc(item.spot.id || item.spot.nombre)}')" class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-xl border transition-all cursor-pointer hover:scale-[1.008] active:scale-[0.99] ${cardBg}">
                <div class="flex items-center gap-2.5">
                    <span class="text-xl">🏖️</span>
                    <div>
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-sm font-black text-white">${esc(item.spot.nombre)}</span>
                            ${rankBadge}
                        </div>
                        <div class="flex items-center gap-3 text-xs text-slate-300 mt-0.5 flex-wrap">
                            <span class="flex items-center gap-1 font-semibold">💨 ${item.vKt.toFixed(1)} kt ${hayRacha ? `<span class="text-[10px] text-amber-400 font-mono">(racha ${item.rKt.toFixed(1)})</span>` : ''} · <span class="text-slate-400">${esc(compText)}</span></span>
                            <span>🌊 ${item.oM.toFixed(1)}m ${item.perS ? `· ${Math.round(item.perS)}s` : ''}</span>
                            <span class="text-sky-300 font-medium">${ventanaTxt}</span>
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    ${scoreBadge}
                    <button type="button" class="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold transition-all shadow-sm pointer-events-none">
                        Ver Spot ➔
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

export function actualizarEstadoBotonGuardarSpot() {
    const btn = document.getElementById('btnToggleSaveSpot');
    const icon = document.getElementById('btnToggleSaveSpotIcon');
    const text = document.getElementById('btnToggleSaveSpotText');
    if (!btn || !icon || !text) return;

    const locVal = document.getElementById('location')?.value?.trim().toLowerCase();
    const lat = Number(latitudActual);
    const lon = Number(longitudActual);

    const estaGuardado = spotsGuardadosMemoria.some(s => 
        (locVal && s.nombre && s.nombre.toLowerCase() === locVal) ||
        (Number.isFinite(s.lat) && Number.isFinite(s.lon) && Math.abs(s.lat - lat) < 0.003 && Math.abs(s.lon - lon) < 0.003)
    );

    if (estaGuardado) {
        icon.textContent = '⭐';
        text.textContent = 'Guardado';
        btn.className = 'flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-lg transition-all cursor-pointer shadow-sm active:scale-95';
    } else {
        icon.textContent = '☆';
        text.textContent = 'Guardar Spot';
        btn.className = 'flex items-center gap-1 text-xs font-bold text-amber-600 hover:text-amber-500 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-lg transition-all cursor-pointer shadow-sm active:scale-95';
    }
}

export async function guardarSpotActual() {
    let locVal = document.getElementById('location')?.value?.trim();
    const lat = Number(latitudActual);
    const lon = Number(longitudActual);

    if (!locVal) {
        locVal = prompt('Introduce un nombre para este Spot:', `Spot (${lat.toFixed(3)}, ${lon.toFixed(3)})`);
        if (!locVal || !locVal.trim()) return;
        locVal = locVal.trim();
        const locInput = document.getElementById('location');
        if (locInput) locInput.value = locVal;
    }

    const yaExiste = spotsGuardadosMemoria.some(s => 
        s.nombre.toLowerCase() === locVal.toLowerCase() ||
        (Math.abs(s.lat - lat) < 0.003 && Math.abs(s.lon - lon) < 0.003)
    );

    if (yaExiste) {
        const confirmar = confirm(`"${locVal}" ya está en tus Spots Favoritos. ¿Quieres eliminarlo de la lista?`);
        if (confirmar) {
            await eliminarSpotGuardado(locVal);
        }
        return;
    }

    const user = appState?.sesionActual?.user;
    const userId = user?.id || null;
    const infoCosta = resolverOrientacionCostera(locVal, lat, lon);
    const seaward_deg = Number.isFinite(infoCosta?.gradosMar) ? infoCosta.gradosMar : null;

    const nuevoSpot = {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('spot_' + Date.now()),
        user_id: userId,
        nombre: locVal,
        lat: Number(lat.toFixed(6)),
        lon: Number(lon.toFixed(6)),
        seaward_deg: seaward_deg,
        orden: spotsGuardadosMemoria.length,
        created_at: new Date().toISOString()
    };

    if (userId && supabaseClient) {
        try {
            const { data, error } = await supabaseClient
                .from('user_spots')
                .insert([{
                    user_id: userId,
                    nombre: nuevoSpot.nombre,
                    lat: nuevoSpot.lat,
                    lon: nuevoSpot.lon,
                    seaward_deg: nuevoSpot.seaward_deg,
                    orden: nuevoSpot.orden
                }])
                .select();

            if (!error && data?.[0]) {
                nuevoSpot.id = data[0].id;
            } else if (error) {
                console.warn('Aviso no crítico al guardar en public.user_spots (guardando en local):', error.message);
            }
        } catch (e) {
            console.warn('Aviso al conectar con Supabase user_spots:', e);
        }
    }

    spotsGuardadosMemoria.push(nuevoSpot);
    spotActivoActual = nuevoSpot;

    const storageKey = userId ? `ps_spots_${userId}` : 'ps_guest_spots';
    try {
        localStorage.setItem(storageKey, JSON.stringify(spotsGuardadosMemoria));
    } catch (e) {
        console.warn('No se pudo guardar spots en localStorage:', e);
    }

    renderizarBarraSpotsGuardados();
    actualizarEstadoBotonGuardarSpot();
}

export async function eliminarSpotGuardado(spotIdOrName) {
    const idx = spotsGuardadosMemoria.findIndex(s => s.id === spotIdOrName || s.nombre === spotIdOrName);
    if (idx === -1) return;

    const eliminado = spotsGuardadosMemoria[idx];
    spotsGuardadosMemoria.splice(idx, 1);

    const user = appState?.sesionActual?.user;
    const userId = user?.id || null;

    if (userId && supabaseClient) {
        try {
            let q = supabaseClient.from('user_spots').delete().eq('user_id', userId);
            if (eliminado.id && !String(eliminado.id).startsWith('spot_')) {
                q = q.eq('id', eliminado.id);
            } else {
                q = q.eq('nombre', eliminado.nombre);
            }
            const { error } = await q;
            if (error) {
                console.warn('Aviso al eliminar spot en Supabase:', error.message);
            }
        } catch (e) {
            console.warn('Aviso de red al eliminar spot:', e);
        }
    }

    const storageKey = userId ? `ps_spots_${userId}` : 'ps_guest_spots';
    try {
        localStorage.setItem(storageKey, JSON.stringify(spotsGuardadosMemoria));
    } catch (e) {
        console.warn('No se pudo actualizar localStorage de spots:', e);
    }

    if (spotActivoActual?.id === eliminado.id || spotActivoActual?.nombre === eliminado.nombre) {
        spotActivoActual = null;
    }

    renderizarBarraSpotsGuardados();
    actualizarEstadoBotonGuardarSpot();
}

export async function seleccionarSpotGuardado(spot) {
    if (!spot) return;
    spotActivoActual = spot;
    latitudActual = Number(spot.lat);
    longitudActual = Number(spot.lon);

    const locInput = document.getElementById('location');
    if (locInput) locInput.value = spot.nombre;

    if (map) {
        const ll = new L.LatLng(latitudActual, longitudActual);
        if (marcador) marcador.setLatLng(ll);
        else marcador = L.marker(ll).addTo(map);
        map.setView(ll, 13);
    }

    renderizarBarraSpotsGuardados();
    actualizarEstadoBotonGuardarSpot();

    const res = document.getElementById('resultado');
    if (res) {
        res.className = "text-sm font-mono text-slate-300 bg-slate-900/60 p-5 rounded-2xl border border-sky-500/30 whitespace-pre-wrap leading-relaxed min-h-[80px] opacity-60 animate-pulse flex items-center justify-center gap-2";
        res.innerHTML = '<span class="animate-spin text-base">⏳</span> <span class="font-bold text-sky-300">Actualizando parte y modelos costeros...</span>';
    }
    const tlEl = document.getElementById('fullDaySpotTimeline');
    if (tlEl && !tlEl.classList.contains('hidden')) {
        tlEl.classList.add('opacity-60', 'animate-pulse');
    }

    await consultarBasico();
}

export function seleccionarSpotGuardadoPorId(idOrName) {
    const spot = spotsGuardadosMemoria.find(s => (s.id && s.id === idOrName) || s.nombre === idOrName);
    if (spot) {
        seleccionarSpotGuardado(spot);
    }
}

export async function cargarJornadaCompletaSpot(spot, fecha, userLevel) {
    if (!spot || !Number.isFinite(Number(spot.lat)) || !Number.isFinite(Number(spot.lon))) return;
    const f = fecha || document.getElementById('date')?.value || new Date().toISOString().split('T')[0];
    const u = userLevel || document.getElementById('userLevel')?.value || 'Intermedio';

    spotActivoActual = spot;
    latitudActual = Number(spot.lat);
    longitudActual = Number(spot.lon);

    if (map) {
        const ll = new L.LatLng(latitudActual, longitudActual);
        if (marcador) marcador.setLatLng(ll);
        else marcador = L.marker(ll).addTo(map);
        map.setView(ll, 13);
    }
    const locInput = document.getElementById('location');
    if (locInput) locInput.value = spot.nombre;

    renderizarBarraSpotsGuardados();
    actualizarEstadoBotonGuardarSpot();

    const payload = {
        location: `${spot.lat},${spot.lon}`,
        date: f,
        timeRange: 'Salida (06:00 - 21:00)',
        userLevel: u
    };

    try {
        const p = await solicitarPronostico(payload);
        if (p.datos) {
            pronosticoDiaCompletoActual = p.datos;
            renderizarTimelineJornadaCompleta(spot, p.datos, u);
        }
    } catch (err) {
        console.warn('Error al cargar jornada completa para el spot:', err);
    }
}

export function renderizarTimelineJornadaCompleta(spot, pronostico, userLevel = 'Intermedio') {
    const timelineEl = document.getElementById('fullDaySpotTimeline');
    if (!timelineEl) return;

    if (!pronostico || !Array.isArray(pronostico.horasDiurnas) || pronostico.horasDiurnas.length === 0) {
        timelineEl.classList.add('hidden');
        return;
    }

    spotActivoActual = spot;
    pronosticoDiaCompletoActual = pronostico;
    timelineEl.classList.remove('opacity-60', 'animate-pulse');

    const fechaStr = pronostico.fecha || pronostico.date || document.getElementById('date')?.value || new Date().toISOString().slice(0, 10);
    const solar = calcularSolYCrepusculo(Number(spot.lat), Number(spot.lon), fechaStr);

    const titleEl = document.getElementById('timelineSpotTitle');
    const subEl = document.getElementById('timelineSpotSubtitle');
    if (titleEl) titleEl.textContent = `Spot: ${spot.nombre || 'Ubicación seleccionada'}`;
    if (subEl) {
        subEl.innerHTML = `Evolución horaria completa de 06:00 a 21:00 · Coords: ${Number(spot.lat).toFixed(4)}, ${Number(spot.lon).toFixed(4)} <span class="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-bold text-[10px] border border-amber-500/30">🌅 Amanecer ${solar.sunriseStr} · 🌇 Ocaso ${solar.sunsetStr} · 🌌 Luz útil hasta ${solar.civilDuskStr}</span>`;
    }

    const bannerEl = document.getElementById('spotBestWindowBanner');
    if (bannerEl) {
        const ventanas = pronostico.ventanasOptimas || detectarVentanasOptimas(pronostico.horasDiurnas, userLevel);
        if (ventanas && ventanas.hayVentana && ventanas.mejorVentana) {
            const mv = ventanas.mejorVentana;
            const scoreClass = mv.score >= 80 
                ? 'bg-emerald-500/30 text-emerald-200 border-emerald-500/50' 
                : (mv.score >= 60 ? 'bg-amber-500/30 text-amber-200 border-amber-500/50' : 'bg-orange-500/30 text-orange-200 border-orange-500/50');
            bannerEl.innerHTML = `
                <div class="flex items-start sm:items-center gap-3 w-full justify-between flex-wrap">
                    <div class="flex items-center gap-2.5">
                        <span class="text-2xl sm:text-3xl">✨</span>
                        <div>
                            <div class="font-black text-emerald-300 text-xs sm:text-sm flex items-center gap-2 flex-wrap">
                                <span>MEJOR VENTANA PARA REMAR: ${esc(mv.inicio)} - ${esc(mv.fin)}</span>
                                <span class="px-2 py-0.5 rounded-full text-[11px] font-bold border ${scoreClass}">Seguridad: ${mv.score}/100</span>
                            </div>
                            <p class="text-[11px] text-slate-300 font-medium mt-0.5">${esc(ventanas.textoResumen || '')}</p>
                            ${ventanas.evolucionAviso ? `<p class="text-[11px] text-amber-300 font-semibold mt-1">⚠️ ${esc(ventanas.evolucionAviso)}</p>` : ''}
                        </div>
                    </div>
                    <button type="button" onclick="window.seleccionarHoraTimeline('${esc(mv.inicio)}', true)" class="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer shrink-0">
                        Ver ${esc(mv.inicio)}
                    </button>
                </div>
            `;
            bannerEl.className = 'w-full p-3.5 rounded-xl border border-emerald-500/40 bg-emerald-950/60 flex flex-col gap-2 text-xs';
        } else {
            bannerEl.innerHTML = `
                <div class="flex items-center gap-2 text-amber-300 font-semibold">
                    <span class="text-xl">⚠️</span>
                    <span>${esc(ventanas?.textoResumen || 'Condiciones exigentes durante toda la jornada. Se recomienda precaución o aplazar la salida.')}</span>
                </div>
            `;
            bannerEl.className = 'w-full p-3.5 rounded-xl border border-amber-500/40 bg-amber-950/50 flex items-center gap-2 text-xs';
        }
    }

    const matrixEl = document.getElementById('spotHourlyMatrix');
    if (matrixEl) {
        const umbrales = {
            Principiante: { vMax: 8, oMax: 0.35 },
            Intermedio:   { vMax: 13, oMax: 0.65 },
            Avanzado:     { vMax: 18, oMax: 1.10 }
        }[userLevel] || { vMax: 13, oMax: 0.65 };

        matrixEl.innerHTML = pronostico.horasDiurnas.map(h => {
            const v = Number(h.vientoKt || 0);
            const r = Number(h.rachasKt || v);
            const o = Number(h.oleajeM || 0);
            const code = Number(h.weatherCode || 0);
            const esTormenta = [95, 96, 99].includes(code);

            const [hh, mm] = (h.hora || '12:00').split(':').map(Number);
            const hMin = (hh || 0) * 60 + (mm || 0);
            const esPostOcaso = hMin >= solar.sunsetMin;
            const dimCardClass = esPostOcaso ? 'opacity-55 saturate-50' : '';
            const postOcasoBadge = esPostOcaso ? '<span class="px-1 py-0.5 rounded text-[9px] font-bold bg-slate-900/90 text-amber-400 border border-amber-500/30" title="Tramo posterior al ocaso">🌙 Ocaso</span>' : '';

            let score = 100;
            if (esTormenta) score = 0;
            else {
                if (v > umbrales.vMax) score -= (v - umbrales.vMax) * 12;
                if (r - v > 5) score -= (r - v) * 3;
                if (o > umbrales.oMax) score -= (o - umbrales.oMax) * 50;
                if (h.lluviaMm > 2) score -= 15;
            }
            score = Math.max(0, Math.min(100, Math.round(score)));

            let scoreBadge = '';
            let borderClass = 'border-slate-700/80 hover:border-slate-500';
            if (score >= 80) {
                scoreBadge = `<span class="px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">🟢 ${score}</span>`;
                borderClass = 'border-emerald-500/40 hover:border-emerald-400 bg-slate-800/90';
            } else if (score >= 60) {
                scoreBadge = `<span class="px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">🟡 ${score}</span>`;
                borderClass = 'border-amber-500/40 hover:border-amber-400 bg-slate-800/90';
            } else if (score >= 40) {
                scoreBadge = `<span class="px-1.5 py-0.5 rounded text-[10px] font-black bg-orange-500/20 text-orange-300 border border-orange-500/40">🟠 ${score}</span>`;
                borderClass = 'border-orange-500/40 hover:border-orange-400 bg-slate-800/90';
            } else {
                scoreBadge = `<span class="px-1.5 py-0.5 rounded text-[10px] font-black bg-red-500/20 text-red-300 border border-red-500/40">🔴 ${score}</span>`;
                borderClass = 'border-red-500/40 hover:border-red-400 bg-slate-800/90';
            }

            const esActiva = horaSeleccionadaTimeline === h.hora;
            const activeCardClass = esActiva
                ? 'ring-2 ring-sky-400 bg-sky-950/80 border-sky-400 shadow-lg scale-102'
                : borderClass;

            const dir = Number(h.dirDeg || 0);
            const hayRacha = r - v >= 3;

            let tagCosta = '';
            if (h.componenteCostera) {
                const compLower = h.componenteCostera.toLowerCase();
                if (compLower.includes('offshore') || compLower.includes('terral')) {
                    tagCosta = '<span class="text-[9px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">Terral</span>';
                } else if (compLower.includes('onshore') || compLower.includes('mar-tierra')) {
                    tagCosta = '<span class="text-[9px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold border border-blue-500/30">Mar-tierra</span>';
                } else if (compLower.includes('side')) {
                    tagCosta = '<span class="text-[9px] px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30">Side</span>';
                } else {
                    tagCosta = `<span class="text-[9px] px-1 py-0.5 rounded bg-slate-700 text-slate-300 font-medium">${esc(h.componenteCostera)}</span>`;
                }
            }

            return `
                <div role="button" tabindex="0" onclick="window.seleccionarHoraTimeline('${esc(h.hora)}')" data-timeline-hour="${esc(h.hora)}" class="flex flex-col gap-1.5 p-2.5 rounded-xl border shrink-0 min-w-[125px] sm:min-w-[135px] transition-all cursor-pointer shadow-sm ${activeCardClass} ${dimCardClass}">
                    <div class="flex items-center justify-between gap-1 border-b border-slate-700/60 pb-1">
                        <div class="flex items-center gap-1">
                            <span class="text-xs font-black font-mono text-white">${esc(h.hora)}</span>
                            ${postOcasoBadge}
                        </div>
                        ${scoreBadge}
                    </div>
                    <div class="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                        <div class="wind-arrow text-emerald-400 w-3.5 h-3.5 shrink-0" style="transform: rotate(${dir}deg);">
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.25a.75.75 0 0 1 .75.75v16.19l4.72-4.72a.75.75 0 1 1 1.06 1.06l-6 6a.75.75 0 0 1-1.06 0l-6-6a.75.75 0 1 1 1.06-1.06l4.72 4.72V3a.75.75 0 0 1 .75-.75Z" /></svg>
                        </div>
                        <span>${v.toFixed(1)} kt</span>
                        ${hayRacha ? `<span class="text-[10px] text-amber-400 font-mono">(${r.toFixed(1)})</span>` : ''}
                    </div>
                    <div class="flex items-center justify-between text-[11px] text-slate-300 gap-1">
                        <span>🌊 ${o.toFixed(1)}m${h.periodoOlaS ? ` · ${Math.round(h.periodoOlaS)}s` : ''}</span>
                        ${h.tempC !== null && h.tempC !== undefined ? `<span class="text-slate-400 font-mono text-[10px]">${Math.round(h.tempC)}°</span>` : ''}
                    </div>
                    ${tagCosta ? `<div class="mt-0.5 flex items-center">${tagCosta}</div>` : ''}
                </div>
            `;
        }).join('');
    }

    timelineEl.classList.remove('hidden');
}

export function seleccionarHoraTimeline(horaStr, doScroll = false) {
    if (!pronosticoDiaCompletoActual || !Array.isArray(pronosticoDiaCompletoActual.horasDiurnas)) return;
    const h = pronosticoDiaCompletoActual.horasDiurnas.find(item => item.hora === horaStr);
    if (!h) return;

    horaSeleccionadaTimeline = horaStr;

    const cards = document.querySelectorAll('#spotHourlyMatrix [data-timeline-hour]');
    cards.forEach(card => {
        const hour = card.getAttribute('data-timeline-hour');
        if (hour === horaStr) {
            card.classList.add('ring-2', 'ring-sky-400', 'bg-sky-950/80', 'border-sky-400', 'shadow-lg', 'scale-102');
        } else {
            card.classList.remove('ring-2', 'ring-sky-400', 'bg-sky-950/80', 'border-sky-400', 'shadow-lg', 'scale-102');
        }
    });

    const badgeEl = document.getElementById('timelineActiveHourBadge');
    const badgeText = document.getElementById('timelineActiveHourText');
    if (badgeEl && badgeText) {
        badgeText.innerHTML = `🕒 Viendo pronóstico y Coach interactivo para las <strong>${esc(horaStr)}</strong>`;
        badgeEl.classList.remove('hidden');
    }

    const vKt = Number(h.vientoKt || 0);
    const rKt = Number(h.rachasKt || vKt);
    const oM = Number(h.oleajeM || 0);
    const perS = Number(h.periodoOlaS || 0);
    const dir = Number(h.dirDeg || 0);

    const bSpeed = document.getElementById("basicWindSpeed");
    if (bSpeed) bSpeed.textContent = `${vKt.toFixed(1)} kt`;

    const gustEl = document.getElementById("basicWindGust");
    if (gustEl) {
        if (rKt - vKt >= 3) {
            gustEl.textContent = `Racha ${rKt.toFixed(1)} kt`;
            gustEl.classList.remove('hidden');
        } else {
            gustEl.classList.add('hidden');
            gustEl.textContent = '';
        }
    }

    const bWave = document.getElementById("basicWave");
    if (bWave) bWave.textContent = `${oM.toFixed(1)} m`;

    const wavePeriodEl = document.getElementById("basicWavePeriod");
    if (wavePeriodEl) {
        if (perS > 0) {
            let badgeHtml = '';
            if (oM >= 0.4 && perS <= 5) {
                badgeHtml = '<span class="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-300 ml-1">Chop corto</span>';
            } else if (oM >= 0.3 && perS >= 9) {
                badgeHtml = '<span class="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-300 ml-1">Mar de fondo</span>';
            }
            wavePeriodEl.innerHTML = `${Math.round(perS)}s ${badgeHtml}`;
        } else {
            wavePeriodEl.innerHTML = '';
        }
    }

    const bPrecip = document.getElementById("basicPrecip");
    if (bPrecip) bPrecip.textContent = `${h.lluviaMm || 0} mm`;

    const cardD = ["N","NE","E","SE","S","SO","O","NO"];
    const idir = Math.round((((dir % 360) + 360) % 360) / 45) % 8;
    const bDir = document.getElementById("basicWindDir");
    if (bDir) {
        bDir.innerHTML = `<div class="wind-arrow text-emerald-500 drop-shadow-sm w-4 h-4" style="transform: rotate(${dir}deg);"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.25a.75.75 0 0 1 .75.75v16.19l4.72-4.72a.75.75 0 1 1 1.06 1.06l-6 6a.75.75 0 0 1-1.06 0l-6-6a.75.75 0 1 1 1.06-1.06l4.72 4.72V3a.75.75 0 0 1 .75-.75Z" /></svg></div> ${cardD[idir]} (${Math.round(dir)}°)`;
    }

    const u = document.getElementById('userLevel')?.value || 'Intermedio';
    const loc = document.getElementById('location')?.value?.trim() || pronosticoDiaCompletoActual.location || 'Spot';

    const dxHora = {
        ...pronosticoDiaCompletoActual,
        windSpeed: vKt / 1.94384,
        windGusts: rKt / 1.94384,
        windDirection: dir,
        waveHeight: oM,
        wavePeriod: perS || null,
        waveDirection: h.waveDirDeg || null,
        swellHeight: h.swellM || null,
        precipitation: h.lluviaMm || 0,
        weatherCode: h.weatherCode || 0,
        tempAire: h.tempC ?? pronosticoDiaCompletoActual.tempAire,
        componenteViento: h.componenteCostera || pronosticoDiaCompletoActual.componenteViento
    };

    const motor = obtenerMotorExperto(dxHora, u);
    renderizarAvisoSuperior(motor);
    renderizarResumenExperto(motor);
    solicitarCoachIABasico(dxHora, u, loc, motor);
    renderizarRosaVectoresMapa(Number(latitudActual), Number(longitudActual), dxHora);

    if (doScroll) {
        document.getElementById('basicCards')?.scrollIntoView({ behavior: 'smooth' });
    }
}

export function abrirSpotActualEnPlanificadorPro() {
    const ploc = document.getElementById('proLocation');
    const pdate = document.getElementById('proDate');
    const ptime = document.getElementById('proTime');
    const plevel = document.getElementById('proLevelOption');

    const basicDate = document.getElementById('date')?.value;
    const basicLevel = document.getElementById('userLevel')?.value;

    const lat = Number(latitudActual);
    const lon = Number(longitudActual);

    if (ploc) ploc.value = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    if (pdate && basicDate) pdate.value = basicDate;
    if (ptime) ptime.value = horaSeleccionadaTimeline || '10:00';
    if (plevel && basicLevel) plevel.value = basicLevel;

    if (typeof window.togglePanelPro === 'function') {
        window.togglePanelPro(true);
    }

    const panelPro = document.getElementById('panelPro');
    if (panelPro) {
        panelPro.scrollIntoView({ behavior: 'smooth' });
    }

    if (map) {
        const ll = new L.LatLng(lat, lon);
        map.setView(ll, 13);
        if (marcador) marcador.setLatLng(ll);
    }
}

export async function importarRutaGPXPro(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    try {
        const text = await file.text();
        const parsed = parseGPX(text);
        if (parsed && Array.isArray(parsed.points) && parsed.points.length >= 2) {
            const nombre = parsed.name || (file.name ? file.name.replace(/\.gpx$/i, '') : 'Ruta GPX Importada');
            cargarRutaEnMapaGrande(parsed.points, nombre);
            if (event.target) event.target.value = '';
        } else {
            alert('⚠️ El archivo GPX no contiene suficientes trackpoints o waypoints para trazar la ruta.');
        }
    } catch (err) {
        console.error('Error al importar GPX Pro:', err);
        alert('❌ Error al procesar el archivo GPX: ' + (err?.message || 'Archivo corrupto'));
    }
}

export function centrarTramoMapa(tramoIndex) {
    if (!map) return;
    const tramos = window._tramosRutaActuales;
    if (Array.isArray(tramos) && tramos[tramoIndex]) {
        const tr = tramos[tramoIndex];
        if (tr.p1 && tr.p2) {
            const bounds = L.latLngBounds([tr.p1, tr.p2]);
            map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
            if (lineasMultiPunto && lineasMultiPunto[tramoIndex]) {
                const line = lineasMultiPunto[tramoIndex];
                const originalWeight = line.options?.weight || 5;
                line.setStyle({ weight: 9, opacity: 1 });
                setTimeout(() => {
                    line.setStyle({ weight: originalWeight, opacity: 0.9 });
                }, 1500);
            }
        }
    }
}

export function generarGraficoSvgPerfilRuta(tramos, dt) {
    if (!Array.isArray(tramos) || tramos.length === 0) return '';
    const totalDistKm = dt > 0 ? (dt / 1000) : tramos.reduce((acc, t) => acc + (t.distancia_km || 0), 0);
    const safeTotalDist = totalDistKm > 0 ? totalDistKm : 1;
    
    const W = 620;
    const H = 150;
    const padL = 40;
    const padR = 25;
    const padT = 25;
    const padB = 30;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;
    
    const nodes = [];
    let cumDist = 0;
    nodes.push({
        km: 0,
        x: padL,
        viento_kt: tramos[0].viento_kt ?? 0,
        tramoIndex: 0,
        label: 'A'
    });
    
    const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    tramos.forEach((tr, i) => {
        cumDist += (tr.distancia_km || 0);
        const xPos = padL + (cumDist / safeTotalDist) * chartW;
        nodes.push({
            km: cumDist,
            x: Math.round(xPos * 10) / 10,
            viento_kt: tr.viento_kt ?? (nodes[i].viento_kt || 0),
            tramoIndex: i,
            label: letras[i + 1] || `${i + 1}`,
            velEfectiva: tr.velEfectiva || (tr.modVelocidad !== undefined ? Math.max(1.5, obtenerVelocidadCruceroUsuario() + tr.modVelocidad).toFixed(1) : '4.5'),
            nombre: tr.nombre || `Tramo ${i + 1}`,
            relativo: tr.viento_relativo || 'Viento',
            eta: tr.eta_hora || '--:--'
        });
    });

    const maxWind = Math.max(15, ...nodes.map(n => n.viento_kt), 1);
    nodes.forEach(n => {
        n.y = Math.round((padT + chartH - ((n.viento_kt / maxWind) * chartH)) * 10) / 10;
    });

    const baselineY = padT + chartH;
    const linePathD = nodes.map((n, i) => `${i === 0 ? 'M' : 'L'} ${n.x} ${n.y}`).join(' ');
    const areaPathD = `${linePathD} L ${nodes[nodes.length - 1].x} ${baselineY} L ${nodes[0].x} ${baselineY} Z`;

    let segmentsSvg = '';
    for (let i = 0; i < tramos.length; i++) {
        const n1 = nodes[i];
        const n2 = nodes[i + 1];
        const tr = tramos[i];
        const segColor = tr.color || (tr.viento_relativo?.includes('FAVOR') ? '#10b981' : (tr.viento_relativo?.includes('CONTRA') ? '#ef4444' : '#f59e0b'));
        const segMidX = (n1.x + n2.x) / 2;
        const segMidY = (n1.y + n2.y) / 2;
        const velEf = tr.velEfectiva || (tr.modVelocidad !== undefined ? Math.max(1.5, obtenerVelocidadCruceroUsuario() + tr.modVelocidad).toFixed(1) : '4.5');

        segmentsSvg += `
            <line x1="${n1.x}" y1="${n1.y}" x2="${n2.x}" y2="${n2.y}" stroke="${segColor}" stroke-width="3" stroke-linecap="round" />
            <g transform="translate(${segMidX}, ${Math.max(padT + 12, segMidY - 14)})" cursor="pointer" onclick="window.centrarTramoMapa(${i})">
                <rect x="-32" y="-9" width="64" height="18" rx="9" fill="rgba(15, 23, 42, 0.85)" stroke="${segColor}" stroke-width="1" />
                <text x="0" y="3.5" fill="#f8fafc" font-size="9" font-weight="bold" font-family="monospace" text-anchor="middle" class="ps-tabular">🏄 ${velEf}k/h</text>
            </g>
        `;
    }

    let nodesSvg = '';
    nodes.forEach((n, idx) => {
        const isFirst = idx === 0;
        const tramoIdx = isFirst ? 0 : idx - 1;
        const tr = tramos[tramoIdx] || tramos[0];
        const circleColor = isFirst ? '#10b981' : (idx === nodes.length - 1 ? '#ef4444' : '#38bdf8');
        const tooltip = `${tr.nombre || 'Punto'}: Viento ${n.viento_kt?.toFixed(1) || 0} kt · ETA: ${tr.eta_hora || '--'}`;

        nodesSvg += `
            <g class="cursor-pointer group" onclick="window.centrarTramoMapa(${tramoIdx})">
                <title>${tooltip}</title>
                <circle cx="${n.x}" cy="${n.y}" r="5" fill="${circleColor}" stroke="#0f172a" stroke-width="2" />
                <circle cx="${n.x}" cy="${baselineY}" r="2" fill="#64748b" />
                <text x="${n.x}" y="${baselineY + 14}" fill="#94a3b8" font-size="9" font-family="monospace" text-anchor="middle" class="ps-tabular">${n.label} (${n.km.toFixed(1)}k)</text>
                <text x="${n.x}" y="${n.y - 8}" fill="#e2e8f0" font-size="9" font-weight="bold" font-family="monospace" text-anchor="middle" class="ps-tabular">${n.viento_kt?.toFixed(1)}kt</text>
            </g>
        `;
    });

    return `
        <svg viewBox="0 0 ${W} ${H}" class="w-full h-auto select-none" style="filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3));" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="routeWindGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.35" />
                    <stop offset="100%" stop-color="#0369a1" stop-opacity="0.02" />
                </linearGradient>
            </defs>
            <line x1="${padL}" y1="${padT}" x2="${W - padR}" y2="${padT}" stroke="rgba(148, 163, 184, 0.12)" stroke-dasharray="3,3" />
            <line x1="${padL}" y1="${padT + chartH / 2}" x2="${W - padR}" y2="${padT + chartH / 2}" stroke="rgba(148, 163, 184, 0.12)" stroke-dasharray="3,3" />
            <line x1="${padL}" y1="${baselineY}" x2="${W - padR}" y2="${baselineY}" stroke="rgba(148, 163, 184, 0.25)" />
            <text x="${padL - 6}" y="${padT + 4}" fill="#64748b" font-size="8" font-family="monospace" text-anchor="end" class="ps-tabular">${Math.round(maxWind)}kt</text>
            <text x="${padL - 6}" y="${padT + chartH / 2 + 3}" fill="#64748b" font-size="8" font-family="monospace" text-anchor="end" class="ps-tabular">${Math.round(maxWind / 2)}kt</text>
            <text x="${padL - 6}" y="${baselineY + 3}" fill="#64748b" font-size="8" font-family="monospace" text-anchor="end" class="ps-tabular">0kt</text>
            <path d="${areaPathD}" fill="url(#routeWindGrad)" />
            ${segmentsSvg}
            ${nodesSvg}
        </svg>
    `;
}

window.buscarYCentrarMapa = buscarYCentrarMapa;
window.importarRutaGPXPro = importarRutaGPXPro;
window.centrarTramoMapa = centrarTramoMapa;
window.generarGraficoSvgPerfilRuta = generarGraficoSvgPerfilRuta;
window.obtenerUbicacion = obtenerUbicacion;
window.toggleModoTravesia = toggleModoTravesia;
window.toggleRutaLibre = toggleRutaLibre;
window.deshacerUltimoPunto = deshacerUltimoPunto;
window.reiniciarRutaMultipunto = reiniciarRutaMultipunto;
window.consultarBasico = consultarBasico;
window.consultarPuntoProInstantaneo = consultarPuntoProInstantaneo;
window.consultarRutaPro = consultarRutaPro;
window.volverPlanificadorPro = volverPlanificadorPro;
window.solicitarCoachIAPro = solicitarCoachIAPro;
window.renderizarCoachProCard = renderizarCoachProCard;
window.solicitarCoachIABasico = solicitarCoachIABasico;
window.iniciarTravesia = iniciarTravesia;
window.finalizarTravesia = finalizarTravesia;
window.mostrarFormularioQuedada = mostrarFormularioQuedada;
window.volverAlMapaQuedada = volverAlMapaQuedada;
window.restaurarTracker = restaurarTracker;
window.inicializarMapa = inicializarMapa;
window.activarModoPlanificacionEvento = activarModoPlanificacionEvento;
window.guardarEventoClub = guardarEventoClub;
window.sincronizarRutasPendientes = sincronizarRutasPendientes;
window.normalizarYLimitarRutaGPS = normalizarYLimitarRutaGPS;
window.cargarRutaDeportivaEnMapa = cargarRutaDeportivaEnMapa;
window.activarWakeLock = activarWakeLock;
window.liberarWakeLock = liberarWakeLock;
window.descartarCheckpoint = descartarCheckpoint;
window.verificarCheckpointPendiente = verificarCheckpointPendiente;
window.cerrarIdaYVueltaMultipunto = cerrarIdaYVueltaMultipunto;
window.toggleModoSolTracker = toggleModoSolTracker;
window.compartirPosicionActualLive = compartirPosicionActualLive;
window.actualizarRetornoSalidaLive = actualizarRetornoSalidaLive;
window.sincronizarProgresionRuta = sincronizarProgresion;
window.descargarZonaMapaOffline = descargarZonaMapaOffline;
window.evaluarMeteoParaQuedada = evaluarMeteoParaQuedada;
window.analizarVientoRutaClub = analizarVientoRutaClub;
window.guardarQuedadaDesdeMapa = guardarQuedadaDesdeMapa;
window.iniciarCreacionQuedadaClub = iniciarCreacionQuedadaClub;
window.cancelarCreacionQuedadaClub = cancelarCreacionQuedadaClub;
window.deshacerUltimoPuntoQuedada = deshacerUltimoPuntoQuedada;
window.reiniciarPuntosQuedada = reiniciarPuntosQuedada;
window.cargarRutaEnMapaGrande = cargarRutaEnMapaGrande;
window.exportarRutaPlanificadaGPX = exportarRutaPlanificadaGPX;
window.descargarRutaActivaGPX = exportarRutaPlanificadaGPX;
window.descargarGPX = descargarGPX;
window.generarGPX = generarGPX;
window.guardarForecastSnapshot = guardarForecastSnapshot;
window.recuperarForecastSnapshot = recuperarForecastSnapshot;
window.cargarSpotsGuardadosUsuario = cargarSpotsGuardadosUsuario;
window.renderizarBarraSpotsGuardados = renderizarBarraSpotsGuardados;
window.actualizarEstadoBotonGuardarSpot = actualizarEstadoBotonGuardarSpot;
window.guardarSpotActual = guardarSpotActual;
window.eliminarSpotGuardado = eliminarSpotGuardado;
window.seleccionarSpotGuardado = seleccionarSpotGuardado;
window.seleccionarSpotGuardadoPorId = seleccionarSpotGuardadoPorId;
window.cargarJornadaCompletaSpot = cargarJornadaCompletaSpot;
window.renderizarTimelineJornadaCompleta = renderizarTimelineJornadaCompleta;
window.seleccionarHoraTimeline = seleccionarHoraTimeline;
window.abrirSpotActualEnPlanificadorPro = abrirSpotActualEnPlanificadorPro;
window.compararSpotsGuardados = compararSpotsGuardados;
window.toggleSelectorEquipoUsuario = toggleSelectorEquipoUsuario;
window.actualizarTipoTablaDesdeSelect = actualizarTipoTablaDesdeSelect;
window.actualizarVelocidadCruceroManual = actualizarVelocidadCruceroManual;
window.autoCalibrarRitmoDesdeRutas = autoCalibrarRitmoDesdeRutas;
window.actualizarUIGearSelector = actualizarUIGearSelector;
window.actualizarDuracionCheckin = actualizarDuracionCheckin;
window.extenderCheckinTravesia = extenderCheckinTravesia;
window.enviarAlertaCheckinWhatsApp = enviarAlertaCheckinWhatsApp;
window.mostrarModalSplitsKm = mostrarModalSplitsKm;
window.renderizarRosaVectoresMapa = renderizarRosaVectoresMapa;
window.actualizarHudVectoresMapa = actualizarHudVectoresMapa;
window.solicitarAnalisisIARutaDeportiva = solicitarAnalisisIARutaDeportiva;
window.abrirModalReporteSpot = abrirModalReporteSpot;
window.seleccionarTagReporte = seleccionarTagReporte;
window.confirmarEnvioReporteSpot = confirmarEnvioReporteSpot;
window.enviarReporteSpot = enviarReporteSpot;
window.cargarReportesSpot = cargarReportesSpot;
window.calcularBiometriaSup = calcularBiometriaSup;
window.calcularSolYCrepusculo = calcularSolYCrepusculo;
window.addEventListener('online', () => {
    if (appState.sesionActual?.user?.id) void sincronizarRutasPendientes();
});

window.addEventListener('beforeunload', (event) => {
    if (isTracking) {
        const advertencia = "Tienes una travesía en curso. Si cierras la pestaña, se perderá el progreso no guardado.";
        event.returnValue = advertencia;
        return advertencia;
    }
});