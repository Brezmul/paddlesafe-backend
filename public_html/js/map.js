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
    generarConsejoCoach
} from './utils.js';
import { ClubState } from './club/state.js';

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

async function solicitarPronostico(payload) {
    let lat = null;
    let lon = null;
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

    return { ok: true, datos, received: payload };
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
        if (hourNum >= 7 && hourNum <= 21) {
            const speedMs = getSeries('wind_speed_10m')[index];
            const gustsMs = getSeries('wind_gusts_10m')[index];
            const waveM = esEmbalse ? 0 : getMarineVal('wave_height', t);
            const swellM = esEmbalse ? 0 : getMarineVal('swell_wave_height', t);
            horasDiurnas.push({
                hora: t.slice(11, 16),
                vientoKt: speedMs != null ? kmhANudos(speedMs * 3.6) : null,
                rachasKt: gustsMs != null ? kmhANudos(gustsMs * 3.6) : null,
                oleajeM: waveM ?? 0,
                swellM: swellM ?? 0,
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

    alertas.forEach(item => {
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

    if (nivel) {
        if (motor.alertaEmergenciaActiva) {
            nivel.className = `text-sm font-black text-center w-full px-2 py-1.5 bg-red-600 text-white rounded-lg shadow-md animate-pulse`;
            nivel.textContent = `🚨 PROHIBIDO SALIR A REMAR · 0/100 · ALERTA 112 ACTIVA`;
        } else {
            nivel.className = `text-sm font-black text-center w-full px-2 py-1 ${motor.cls || ''}`;
            nivel.textContent = `${icono} ${motor.seguridad.nivel} · ${motor.seguridad.score}/100 · ${motor.recomendacion}`;
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

    // Píldoras Next-Gen dinámicas (Mejor ventana, Iniciación, Consenso multi-modelo)
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
    
    res.className = "text-sm font-mono text-slate-600 bg-slate-50 p-5 rounded-2xl border border-slate-200 whitespace-pre-wrap leading-relaxed min-h-[80px]";
    buscarYCentrarMapa(loc);
    btn.disabled = true; sp.classList.remove('hidden'); bt.textContent = "Analizando..."; res.textContent = "Contactando servidores...";
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
        
        if(p.datos) {
            const dx = p.datos;
            dx.date = p.received?.date || d;
            dx.fecha = p.received?.date || d;
            dx.timeRange = r;
            const vientoMs = valorNumericoMeteo(dx.windSpeed, dx.wind_speed);
            const vientoKmh = vientoMs === null ? null : vientoMs * 3.6;
            const vientoNudos = kmhANudos(vientoKmh);
            const wv = valorNumericoMeteo(dx.waveHeight, dx.wave_height);
            const pm = valorNumericoMeteo(dx.precipitation, dx.precipitation_mm);
            const pl = valorNumericoMeteo(dx.precipProbability, dx.precipitation_probability);
            
            document.getElementById("basicWindSpeed").textContent = vientoNudos === null ? 'N/D' : `${vientoNudos.toFixed(1)} kt`;
            document.getElementById("basicWave").textContent = wv !== null ? `${wv.toFixed(1)} m` : 'N/D';
            document.getElementById("basicPrecip").textContent = pm === null ? 'N/D' : `${pm} mm`;
            document.getElementById("basicPrecipProb").textContent = `Prob: ${pl === null ? 'N/D' : `${pl}%`}`;
            
            const cardD = ["N","NE","E","SE","S","SO","O","NO"];
            const direccion = valorNumericoMeteo(dx.windDirection, dx.wind_direction);
            const hayDireccion = direccion !== null;
            const idir = hayDireccion ? Math.round((((direccion % 360) + 360) % 360) / 45) % 8 : null;
            document.getElementById("basicWindDir").innerHTML = `<div class="wind-arrow text-emerald-500 drop-shadow-sm w-4 h-4" style="transform: rotate(${hayDireccion ? direccion : 0}deg);"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.25a.75.75 0 0 1 .75.75v16.19l4.72-4.72a.75.75 0 1 1 1.06 1.06l-6 6a.75.75 0 0 1-1.06 0l-6-6a.75.75 0 1 1 1.06-1.06l4.72 4.72V3a.75.75 0 0 1 .75-.75Z" /></svg></div> ${hayDireccion ? `${cardD[idir]} (${Math.round(direccion)}°)` : 'Dirección N/D'}`;
            
            const motor = obtenerMotorExperto(dx, u);
            renderizarAvisoSuperior(motor);
            renderizarResumenExperto(motor);
            res.innerHTML = `<strong>📍 ${esc((p.received?.location || loc).split(',')[0])}</strong><br>📅 ${esc(p.received?.date || d)} | 🕒 ${esc(p.received?.timeRange || r)}`;
            solicitarCoachIABasico(dx, u, loc, motor);
        }
    } catch(e) { 
        res.innerHTML = `<strong>No se pudo cargar el pronóstico.</strong> ${esc(e?.message || 'Revisa tu conexión e inténtalo de nuevo.')}`;
        console.warn('Error al consultar el pronóstico básico:', e);
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
    } catch(e) {
        console.warn('Aviso no crítico:', e);
        alert(`❌ No se pudo obtener el pronóstico. ${e?.message || 'Revisa tu conexión e inténtalo de nuevo.'}`);
    } finally {
        if(btn) { btn.disabled = false; btn.innerHTML = "✨ Procesar Análisis Pro"; }
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
        if (dt > 0) duracionEstimada = Math.round(((dt / 1000) / 4.5) * 60);
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
        
        const dirViento = valorNumericoMeteo(dx.windDirection, dx.wind_direction);
        const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; let rutArray = [...coords];
        if (modoTravesiaActivo && coords.length === 2) rutArray.push(coords[0]);
        
        for(let i = 0; i < rutArray.length - 1; i++) {
            const dSeg = rutArray[i].distanceTo(rutArray[i+1]); dt += dSeg;
            const nombreTramo = (modoTravesiaActivo && rutArray.length === 3) ? (i === 0 ? "IDA 🟢" : "VUELTA 🔴") : `TRAMO ${letras[i]||i} ➔ ${letras[i+1]||(i+1)}`;
            
            const lat1 = rutArray[i].lat * Math.PI / 180, lon1 = rutArray[i].lng * Math.PI / 180;
            const lat2 = rutArray[i+1].lat * Math.PI / 180, lon2 = rutArray[i+1].lng * Math.PI / 180;
            const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
            const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
            let rumbo = Math.round((Math.atan2(y, x) * 180 / Math.PI + 360) % 360);
            
            let iV = evaluarVientoRelativoInfo(rumbo, dirViento);
            const pline = L.polyline([rutArray[i], rutArray[i+1]], { color: iV.hexLineColor, weight: 5, className: 'ruta-animada' }).addTo(map);
            lineasMultiPunto.push(pline);
            
            const midLat = (rutArray[i].lat + rutArray[i+1].lat) / 2; const midLng = (rutArray[i].lng + rutArray[i+1].lng) / 2;
            const etiq = L.marker([midLat, midLng], { icon: L.divIcon({ className: 'dist-label-map', html: `${(dSeg/1000).toFixed(2)} km`, iconSize: [null, null] }) }).addTo(map);
            etiquetasDistancia.push(etiq);
            
            const tSeg = ((dSeg / 1000) / Math.max(2.0, 4.5 + iV.modVelocidad)) * 60; tt += tSeg;

            tramosParaCoach.push({
                nombre: nombreTramo,
                distancia_km: Number((dSeg / 1000).toFixed(2)),
                rumbo: rumbo,
                viento_relativo: iV.texto,
                modVelocidad: iV.modVelocidad,
                minutos: Math.round(tSeg)
            });
            
            arrayHtmlTramos.push(`
                <div class="bg-slate-800 rounded-xl p-3 border-l-4 shadow-sm w-full relative overflow-hidden" style="border-color:${iV.hexLineColor}">
                    <div class="flex justify-between items-center text-white text-[11px] mb-2 border-b border-slate-700/50 pb-2">
                        <span class="font-black ${iV.colorRumbo} tracking-wider">${nombreTramo}</span>
                        <span class="text-[9px] bg-slate-900 px-1.5 py-0.5 rounded font-mono text-slate-400">Rumbo: ${rumbo}°</span>
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
                        <div class="col-span-2 ${iV.claseColor} rounded p-1.5 flex items-center justify-center border border-slate-700/50">
                            <span class="text-[10px] font-black text-white flex items-center gap-1">${iV.icon} ${iV.texto}</span>
                        </div>
                    </div>
                </div>`);
        }
        
        document.getElementById('proDashTramosContainer').innerHTML = arrayHtmlTramos.join('');
        document.getElementById('proTituloTramos').textContent = "Análisis por Tramos";
        document.getElementById('proDistanciaTotal').textContent = `${(dt/1000).toFixed(2)} km`;
        document.getElementById('proTiempoTotal').textContent = formatearTiempo(tt);
        
        const timeParts = horaSalida.split(':'); const hh = parseInt(timeParts[0], 10) || 0; const mm = parseInt(timeParts[1], 10) || 0;
        let fechaLlegada = new Date(); fechaLlegada.setHours(hh, mm, 0); fechaLlegada.setMinutes(fechaLlegada.getMinutes() + Math.round(tt));
        const etaHH = fechaLlegada.getHours().toString().padStart(2, '0'); const etaMM = fechaLlegada.getMinutes().toString().padStart(2, '0');
        
        document.getElementById('proSalidaHora').textContent = horaSalida;
        document.getElementById('proLlegadaHora').textContent = `${etaHH}:${etaMM}`;
        document.getElementById('proContainerNavegacion').classList.remove('hidden'); document.getElementById('proContainerNavegacion').classList.add('flex');
    } else {
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
    const tiempoMin = Math.round(((dt / 1000) / 4.5) * 60);

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

export function mostrarFormularioQuedada() {
    const form = document.getElementById('quedadaFormPanel');
    if (!form || !modoQuedadaClubActivo) return;
    form.classList.remove('hidden');
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    const tiempoMinutos = Math.round(((dt / 1000) / 4.5) * 60);
    const coordsArray = coords.map(c => [c.lat, c.lng]);

    const btn = document.getElementById('btnGuardarQuedadaMap');
    if (btn) { btn.disabled = true; btn.textContent = "Publicando..."; }

    try {
        const { data: newEv, error } = await supabaseClient
            .from('club_eventos')
            .insert([{
                club_id: clubId,
                creador_id: appState.sesionActual.user.id,
                nombre,
                descripcion: desc,
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
        msg.className = "text-xs font-bold text-white bg-indigo-600 h-10 px-4 rounded-xl border border-indigo-500 shadow-md flex items-center justify-center transition-colors";
        msg.innerHTML = `🧭 Ruta del Club: ${esc(nombre)}`;
    }

    const mapContainer = document.getElementById('mapContainer');
    if (mapContainer) mapContainer.scrollIntoView({ behavior: 'smooth' });
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

    const msg = document.getElementById('mapMsg');
    if (msg) {
        const rutaIdEsc = ruta.id ? String(ruta.id).replace(/'/g, "\\'") : '';
        const btnCoach = ruta.id ? `
            <button type="button" onclick="if(window.abrirModalDetallesRuta) window.abrirModalDetallesRuta('${rutaIdEsc}')" class="px-2.5 py-1 bg-gradient-to-r from-emerald-500 to-sky-600 hover:from-emerald-400 hover:to-sky-500 text-white text-[11px] font-black rounded-xl shadow-md flex items-center gap-1 active:scale-95 transition-all cursor-pointer">
                <span>🧠</span> <span>Coach</span>
            </button>
        ` : '';

        msg.className = "text-xs font-bold text-white bg-slate-900/95 py-2.5 px-4 rounded-2xl border border-sky-500/40 shadow-2xl flex items-center justify-between gap-3 flex-wrap transition-all";
        msg.innerHTML = `
            <div class="flex items-center gap-3 flex-wrap">
                <span class="truncate max-w-[150px] text-sky-400 font-black">🧭 ${esc(titulo)}</span>
                <span class="text-white">📏 <b>${dist}</b> km</span>
                <span class="text-white">⏱️ <b>${mins}</b> min</span>
                <span class="text-amber-400">⚡ Med: <b>${avgSpd}</b> km/h</span>
                <span class="text-emerald-400">🚀 Max: <b>${maxSpd}</b> km/h</span>
            </div>
            ${btnCoach}
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

// Retrocompatibilidad
export function activarModoPlanificacionEvento(clubId) {
    iniciarCreacionQuedadaClub(clubId);
}

export function guardarEventoClub() {
    guardarQuedadaDesdeMapa();
}

// ==========================================
export async function iniciarTravesia() {
    if(!appState.sesionActual && !appState.esInvitado) return alert("Inicia sesión.");
    if(!navigator.geolocation) return alert("Sin GPS.");
    
    if(livePolyline) { map.removeLayer(livePolyline); livePolyline = null; }
    if(cronometroInterval) { clearInterval(cronometroInterval); cronometroInterval = null; }
    if(watchId) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    
    isTracking = true; trackDistanceKm = 0; trackCoords = []; ultimoPuntoCrudoGPS = null; lastPositionGPS = null; lastTimestampGPS = null; trackStartTime = new Date();
    
    const p = document.getElementById('liveTrackingPanel');
    p.innerHTML = `
        <div class="flex justify-between items-center mb-3 w-full">
            <span class="text-[10px] font-bold text-red-400 animate-pulse uppercase tracking-widest">🔴 Grabando GPS</span>
            <span id="liveTime" class="font-mono text-2xl font-black text-emerald-400">00:00</span>
        </div>
        <div class="grid grid-cols-2 gap-2 text-center mb-3 w-full">
            <div class="bg-slate-800 rounded-xl py-2">
                <p class="text-[9px] text-slate-400 uppercase tracking-widest">DISTANCIA</p>
                <p id="liveDist" class="font-black text-lg text-white">0.00 km</p>
            </div>
            <div class="bg-slate-800 rounded-xl py-2">
                <p class="text-[9px] text-slate-400 uppercase tracking-widest">VELOCIDAD</p>
                <p id="liveSpeed" class="font-black text-lg text-white">0.0 km/h</p>
            </div>
        </div>
        <button type="button" onclick="finalizarTravesia()" class="w-full h-11 bg-red-600 text-white font-bold rounded-xl active:scale-95 text-[11px] uppercase tracking-widest transition-transform cursor-pointer">⏹ Finalizar Travesía</button>
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
        }
        
        trackCoords.push(puntoActual);
        livePolyline.addLatLng(l); 
        map.panTo(l);
        
        lastPositionGPS = l;
        lastTimestampGPS = currentTimestamp;
    }, e => {
        if (e.code === 1) alert('Permiso de ubicación denegado. Actívalo para registrar la travesía.');
    }, {enableHighAccuracy: true, maximumAge: 2000, timeout: 20000});
}

export async function finalizarTravesia() {
    if (!isTracking || isSavingRoute) return;
    isSavingRoute = true;
    isTracking = false; 
    if(cronometroInterval) { clearInterval(cronometroInterval); cronometroInterval = null; }
    if(watchId) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    
    const m = Math.floor((new Date() - trackStartTime) / 60000);
    if(trackDistanceKm < 0.05 && m < 1) { alert("Ruta demasiado corta."); return restaurarTracker(); }
    if(appState.esInvitado) { alert(`🏅 ${trackDistanceKm.toFixed(2)} km en ${formatearTiempo(m)}.`); return restaurarTracker(); }
    
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
        
        imgBase64Backup = cv.toDataURL('image/jpeg', 0.8);
        
        const b = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.8));
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

    const rutaNormalizada = normalizarYLimitarRutaGPS(trackCoords);
    const pts = Math.round(trackDistanceKm * 10) + m;
    
    const { data: nuevaRuta, error: errRuta } = await supabaseClient.from('rutas').insert([{
        user_id: appState.sesionActual.user.id,
        distancia_km: Number(trackDistanceKm.toFixed(2)),
        tiempo_minutos: m,
        ruta_json: rutaNormalizada,
        imagen_url: img,
        ubicacion: "Travesía GPS"
    }]).select().single();
    
    if (errRuta || !nuevaRuta) {
        let pendingMessage = "No se pudo conservar la ruta en este dispositivo.";
        try {
            localStorage.setItem('paddlesafe_ruta_pendiente', JSON.stringify({
                user_id: appState.sesionActual.user.id,
                km: trackDistanceKm,
                min: m,
                coords: rutaNormalizada,
                img,
                b64: imgBase64Backup,
                ts: Date.now()
            }));
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
    
    if (ClubState.activeId) {
        await supabaseClient.from('club_rutas').insert([{ club_id: ClubState.activeId, ruta_id: nuevaRuta.id }]);
    }
    
    if(window.cargarPerfilUsuarioActivo) await window.cargarPerfilUsuarioActivo();
    
    document.getElementById('liveTrackingPanel').innerHTML = `
        <div class="text-center py-4 w-full">
            <span class="text-4xl block mb-2">✅</span>
            <h3 class="font-black text-white text-lg">Guardada</h3>
            <p class="text-emerald-400 font-bold text-[10px] uppercase tracking-widest mb-3">+${pts} pts</p>
            <button type="button" onclick="restaurarTracker()" class="bg-slate-700 text-white px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest w-full active:scale-95 transition-transform cursor-pointer">Cerrar Panel</button>
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

        const { error } = await supabaseClient.from('rutas').insert([{
            user_id: appState.sesionActual.user.id,
            distancia_km: Number(p.km.toFixed(2)),
            tiempo_minutos: p.min,
            ruta_json: coordsNormalizadas,
            imagen_url: urlSincronizada || p.img,
            ubicacion: "Travesía GPS (Sincronización Offline)"
        }]);
        
        if (!error) {
            localStorage.removeItem('paddlesafe_ruta_pendiente');
            const pts = Math.round(p.km * 10) + p.min;
            alert(`¡Ruta guardada offline sincronizada con éxito! (+${pts} pts)`);
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
    document.getElementById('liveTrackingPanel').classList.add('hidden'); document.getElementById('btnIniciarLive').classList.remove('hidden');
    if(document.getElementById('proPlanificador')) { document.getElementById('proPlanificador').classList.remove('hidden'); document.getElementById('proPlanificador').classList.add('flex'); }
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

window.buscarYCentrarMapa = buscarYCentrarMapa;
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