// ==============================================================================
// PADDLESAFE NEXT-GEN - MOTOR GEOGRÁFICO Y DERIVA COSTERA (coastal.js)
// Determina automáticamente la orientación de la costa, el vector de viento
// (offshore/onshore/side-shore) y el Índice de Deriva PaddleSafe sin configuración manual.
// ==============================================================================

import { diferenciaAngular } from './consensus.js';

/**
 * Base de datos de rumbos a mar abierto (ángulo normal perpendicular a la costa, hacia el mar)
 * para spots clave de España e islas.
 */
const SPOTS_CONOCIDOS = [
    // Alicante / Costa Blanca
    { match: /santa pola|tabarca/i, seaward: 135, type: 'mar_abierto' },
    { match: /campello|el campello|muchavista/i, seaward: 110, type: 'mar_abierto' },
    { match: /postiguet|playa de san juan|playa san juan|alicante/i, seaward: 130, type: 'mar_abierto' },
    { match: /altea|albir/i, seaward: 90, type: 'bahia_protegida' },
    { match: /denia|dénia|les marines/i, seaward: 45, type: 'mar_abierto' },
    { match: /javea|xàbia|arenal|granadella/i, seaward: 90, type: 'mar_abierto' },
    { match: /torrevieja|la mata|guardamar/i, seaward: 90, type: 'mar_abierto' },
    { match: /calpe|moraira/i, seaward: 110, type: 'mar_abierto' },

    // Valencia / Castellón
    { match: /valencia|malvarrosa|patacona|saler/i, seaward: 90, type: 'mar_abierto' },
    { match: /cullera|gandia|oliva/i, seaward: 80, type: 'mar_abierto' },
    { match: /castellon|benicassim|oropesa|peñiscola/i, seaward: 100, type: 'mar_abierto' },

    // Cantabria / Asturias / País Vasco
    { match: /somo|loredo|pedreña|santander/i, seaward: 350, type: 'mar_abierto' },
    { match: /suances|los locos/i, seaward: 340, type: 'mar_abierto' },
    { match: /liencres|valdearenas/i, seaward: 340, type: 'mar_abierto' },
    { match: /laredo|castro urdiales|noja|santoña/i, seaward: 0, type: 'mar_abierto' },
    { match: /gijon|gijón|san lorenzo|roces/i, seaward: 10, type: 'mar_abierto' },
    { match: /salinas|aviles|luanco/i, seaward: 350, type: 'mar_abierto' },
    { match: /ribadesella|llanes/i, seaward: 0, type: 'mar_abierto' },
    { match: /zarautz|sopelana|mundaka|san sebastian|la concha/i, seaward: 350, type: 'mar_abierto' },

    // Cataluña
    { match: /barceloneta|bogatell|barcelona|mar bella/i, seaward: 130, type: 'mar_abierto' },
    { match: /sitges|vilanova|castelldefels/i, seaward: 150, type: 'mar_abierto' },
    { match: /tossa|lloret|blanes|platja d'aro/i, seaward: 120, type: 'mar_abierto' },
    { match: /roses|cadaques|empuriabrava|costa brava/i, seaward: 100, type: 'mar_abierto' },

    // Andalucía / Estrecho
    { match: /tarifa|valdevaqueros|los lances/i, seaward: 220, type: 'mar_abierto' },
    { match: /cadiz|cádiz|cortadura|victoria/i, seaward: 250, type: 'mar_abierto' },
    { match: /conil|palmar|el palmar|canos de meca/i, seaward: 240, type: 'mar_abierto' },
    { match: /malaga|málaga|marbella|torremolinos|fuengirola/i, seaward: 170, type: 'mar_abierto' },
    { match: /almeria|almería|cabo de gata|san jose/i, seaward: 150, type: 'mar_abierto' },
    { match: /huelva|punta umbria|mazagon/i, seaward: 190, type: 'mar_abierto' },

    // Baleares
    { match: /palma|can pastilla|el arenal/i, seaward: 200, type: 'bahia_protegida' },
    { match: /alcudia|pollensa|pollença/i, seaward: 60, type: 'bahia_protegida' },
    { match: /ibiza|eivissa|playa d'en bossa|san antonio/i, seaward: 180, type: 'mar_abierto' },
    { match: /formentera|illetes/i, seaward: 270, type: 'mar_abierto' },
    { match: /menorca|fornells|ciutadella|mahon/i, seaward: 30, type: 'mar_abierto' },

    // Galicia
    { match: /vigo|samil|cangas|baiona/i, seaward: 260, type: 'bahia_protegida' },
    { match: /coruna|coruña|riera|raxo|sanxenxo/i, seaward: 270, type: 'bahia_protegida' },

    // Embalses y aguas interiores
    { match: /pantano|embalse|lago|entrepeñas|buendia|iznajar|alange|valmayor/i, seaward: null, type: 'embalse_interior' }
];

/**
 * Heurística geográfica geodésica para coordenadas en la Península Ibérica y archipiélagos
 */
function estimarRumboCosteroGeodesico(lat, lon) {
    if (lat === null || lon === null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        return 90; // Default Este
    }

    // Aguas interiores identificadas por coordenadas interiores distantes de la costa (>40 km)
    // Meseta Norte y Sur:
    if (lat >= 39.0 && lat <= 42.4 && lon >= -5.6 && lon <= -1.8) {
        return null;
    }
    // Valle del Ebro interior:
    if (lat >= 41.2 && lat <= 42.4 && lon >= -2.0 && lon <= 0.1) {
        return null;
    }
    // Extremadura interior:
    if (lat >= 38.5 && lat <= 40.2 && lon >= -7.2 && lon <= -5.5) {
        return null;
    }
    // Andalucía interior:
    if (lat >= 37.4 && lat <= 38.3 && lon >= -5.0 && lon <= -2.8) {
        return null;
    }

    // Costa Norte (Cantábrico y Galicia Norte): mira al Norte (0°)
    if (lat >= 43.3 && lon >= -8.0 && lon <= -1.7) return 0;
    
    // Costa Ártabra y Costa da Morte (Noroeste): mira al Noroeste (315°)
    if (lat >= 42.9 && lat <= 43.8 && lon <= -8.8) return 315;

    // Rías Baixas (Pontevedra, Vigo, Ría de Arousa): mira al Oeste-Suroeste (260°)
    if (lat >= 41.9 && lat <= 42.9 && lon <= -8.6) return 260;

    // Portugal Norte y Centro: mira al Oeste (270°)
    if (lat >= 37.0 && lat <= 41.9 && lon <= -8.5) return 270;

    // Portugal Algarve: mira al Sur (180°)
    if (lat >= 36.9 && lat <= 37.3 && lon >= -9.0 && lon <= -7.4) return 180;

    // Costa de la Luz / Golfo de Cádiz (Huelva, Cádiz): mira al Suroeste (220°)
    if (lat <= 37.3 && lon >= -7.4 && lon <= -5.8) return 220;

    // Estrecho de Gibraltar (Tarifa, Algeciras): mira al Suroeste-Sur (200°)
    if (lat >= 35.9 && lat <= 36.3 && lon >= -5.8 && lon <= -5.3) return 200;

    // Costa del Sol (Málaga, Marbella) y Costa Tropical (Granada): mira al Sur (175°)
    if (lat >= 36.3 && lat <= 36.8 && lon >= -5.3 && lon <= -3.0) return 175;

    // Costa de Almería (Cabo de Gata, Levante almeriense): mira al Sureste (135°)
    if (lat >= 36.6 && lat <= 37.4 && lon >= -3.0 && lon <= -1.7) return 135;

    // Costa Cálida (Murcia, Mazarrón, Águilas, Cartagena, Mar Menor): mira al Sureste-Este (115°)
    if (lat >= 37.3 && lat <= 37.9 && lon >= -1.7 && lon <= -0.6) return 115;

    // Costa Blanca Sur (Torrevieja, Guardamar, Santa Pola, Alicante): mira al Este-Sureste (120°)
    if (lat >= 37.9 && lat <= 38.4 && lon >= -0.7 && lon <= -0.3) return 120;

    // Costa Blanca Norte (Campello, Benidorm, Altea, Calpe, Jávea): mira al Este (90°)
    if (lat >= 38.4 && lat <= 38.8 && lon >= -0.3 && lon <= 0.25) return 90;

    // Cabo de la Nao / Denia / Gandía / Golfo de Valencia: mira al Este-Noreste (80°)
    if (lat >= 38.8 && lat <= 39.7 && lon >= -0.4 && lon <= 0.3) return 80;

    // Costa del Azahar (Castellón, Benicàssim, Peñíscola): mira al Este-Sureste (105°)
    if (lat >= 39.7 && lat <= 40.6 && lon >= -0.1 && lon <= 0.6) return 105;

    // Delta del Ebro: promedio Este (90°)
    if (lat >= 40.6 && lat <= 40.9 && lon >= 0.5 && lon <= 0.9) return 90;

    // Costa Daurada y Costa de Barcelona (Salou, Tarragona, Barcelona): mira al Sureste (135°)
    if (lat >= 40.9 && lat <= 41.6 && lon >= 0.9 && lon <= 2.6) return 135;

    // Costa Brava (Blanes, Tossa, Palamós, Begur, Roses, Cadaqués): mira al Este (100°)
    if (lat >= 41.6 && lat <= 42.5 && lon >= 2.6 && lon <= 3.3) return 100;

    // Baleares:
    if (lat >= 38.5 && lat <= 40.3 && lon >= 1.1 && lon <= 4.5) {
        if (lon >= 3.7) return lat >= 40.0 ? 0 : 180; // Menorca
        if (lon >= 2.3 && lon < 3.7) return lat >= 39.7 ? 45 : 200; // Mallorca
        return 140; // Ibiza / Formentera
    }

    // Canarias:
    if (lat >= 27.5 && lat <= 29.5 && lon >= -18.2 && lon <= -13.3) {
        if (lon >= -14.5) return 90; // Fuerteventura / Lanzarote
        return lat >= 28.3 ? 0 : 180; // Tenerife / Gran Canaria
    }

    return 90;
}

/**
 * Resuelve la orientación costera de un spot (soporta (nombreSpot, lat, lon) o (lat, lon, nombreSpot))
 */
export function resolverOrientacionCostera(arg1 = '', arg2 = null, arg3 = null) {
    let nombreSpot = '';
    let lat = null;
    let lon = null;

    if (typeof arg1 === 'number') {
        lat = arg1;
        lon = typeof arg2 === 'number' ? arg2 : null;
        nombreSpot = typeof arg3 === 'string' ? arg3 : '';
    } else {
        nombreSpot = typeof arg1 === 'string' ? arg1 : '';
        lat = typeof arg2 === 'number' ? arg2 : null;
        lon = typeof arg3 === 'number' ? arg3 : null;
    }

    const spotNormalizado = String(nombreSpot || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    // 1. Si contiene palabras clave de embalse o lago, clasificar de inmediato como interior
    if (/embalse|pantano|lago|laguna|rio|río|presa|reservoir|lake/i.test(spotNormalizado)) {
        return {
            seawardDeg: null,
            esCosta: false,
            esEmbalse: true,
            tipoEntorno: 'embalse_interior',
            fuente: 'deteccion_interior'
        };
    }

    // 2. Buscar en catálogo curado de costa
    const match = SPOTS_CONOCIDOS.find(s => s.match.test(spotNormalizado));
    if (match) {
        const esEmb = match.type === 'embalse_interior';
        return {
            seawardDeg: match.seaward,
            esCosta: !esEmb,
            esEmbalse: esEmb,
            tipoEntorno: match.type,
            fuente: 'catalogo_spots'
        };
    }

    // 3. Fallback a geodesia costera de alta precisión
    const seawardGeo = estimarRumboCosteroGeodesico(lat, lon);
    const esInterior = seawardGeo === null;
    return {
        seawardDeg: seawardGeo,
        esCosta: !esInterior,
        esEmbalse: esInterior,
        tipoEntorno: esInterior ? 'embalse_interior' : 'mar_abierto',
        fuente: 'geodesia_coordenadas'
    };
}

export function calcularComponenteVientoAuto(...args) {
    let dirVientoDeg = null;
    let seawardDeg = null;

    if (args.length === 2 && (typeof args[0] === 'number' || args[0] === null) && (typeof args[1] === 'number' || args[1] === null)) {
        dirVientoDeg = args[0];
        seawardDeg = args[1];
    } else {
        let lat = null, lon = null, spot = '';
        if (typeof args[0] === 'number' && typeof args[1] === 'number' && typeof args[2] === 'number') {
            lat = args[0];
            lon = args[1];
            dirVientoDeg = args[2];
            spot = typeof args[3] === 'string' ? args[3] : '';
        } else if (typeof args[0] === 'number') {
            dirVientoDeg = args[0];
            if (typeof args[1] === 'number' && typeof args[2] === 'number') {
                lat = args[1];
                lon = args[2];
                spot = typeof args[3] === 'string' ? args[3] : '';
            }
        }
        const costa = resolverOrientacionCostera(lat, lon, spot);
        seawardDeg = costa?.seawardDeg ?? null;
    }

    if (dirVientoDeg === null || seawardDeg === null || !Number.isFinite(dirVientoDeg) || !Number.isFinite(seawardDeg)) {
        return {
            componente: 'desconocida',
            anguloRelativo: null,
            descripcion: 'Orientación costera no aplicable (aguas interiores o sin referencia de costa).'
        };
    }

    // El viento sopla HACIA: (dirVientoDeg + 180) % 360
    // Mar abierto apunta hacia: seawardDeg
    // Diferencia angular entre hacia dónde sopla el viento y mar abierto:
    const haciaDondeSopla = (dirVientoDeg + 180) % 360;
    const diff = diferenciaAngular(haciaDondeSopla, seawardDeg);

    // Si el viento sopla en la misma dirección que mar abierto (diff <= 55°): OFFSHORE
    if (diff <= 55) {
        return {
            componente: 'offshore',
            anguloRelativo: Math.round(diff),
            descripcion: 'Viento offshore (terral): sopla de tierra hacia mar abierto. Riesgo de deriva.'
        };
    }

    // Si el viento sopla en dirección contraria a mar abierto (diff >= 125°): ONSHORE
    if (diff >= 125) {
        return {
            componente: 'onshore',
            anguloRelativo: Math.round(diff),
            descripcion: 'Viento onshore: sopla desde el mar hacia la orilla. Menor deriva mar adentro.'
        };
    }

    // Si el viento sopla lateral a la costa (55° < diff < 125°): SIDE-SHORE
    return {
        componente: 'side-shore',
        anguloRelativo: Math.round(diff),
        descripcion: 'Viento side-shore: sopla paralelo a la orilla. Provoca deriva lateral a lo largo de la costa.'
    };
}

/**
 * Calcula el Índice de Deriva PaddleSafe
 */
export function calcularIndiceDerivaPaddleSafe({
    vientoKt = 0,
    rachasKt = 0,
    oleajeM = 0,
    componente = 'side-shore',
    esCosta = true
}) {
    if (!esCosta) {
        let scoreInterior = Math.min(60, Math.round((vientoKt * 2.5) + (rachasKt * 1.2)));
        let nivelInterior = scoreInterior > 40 ? 'Moderado' : 'Bajo';
        return {
            score: scoreInterior,
            nivel: nivelInterior,
            descripcion: `Aguas interiores: deriva controlada por orillas (${nivelInterior.toLowerCase()}). Viento de ${vientoKt} kt.`
        };
    }

    let score = 10;
    if (vientoKt >= 20) score += 60;
    else if (vientoKt >= 15) score += 45;
    else if (vientoKt >= 10) score += 30;
    else if (vientoKt >= 6) score += 15;

    const deltaRacha = Math.max(0, rachasKt - vientoKt);
    if (deltaRacha >= 8) score += 15;
    else if (deltaRacha >= 4) score += 8;

    if (oleajeM >= 1.5) score += 20;
    else if (oleajeM >= 0.8) score += 10;

    if (componente === 'offshore') {
        score += 25;
    } else if (componente === 'onshore') {
        score = Math.max(5, score - 15);
    } else if (componente === 'side-shore') {
        score += 10;
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    let nivel = 'Bajo';
    if (score >= 75) nivel = 'Muy Alto';
    else if (score >= 50) nivel = 'Alto';
    else if (score >= 25) nivel = 'Moderado';

    let descripcion = componente === 'offshore'
        ? `Riesgo ${nivel.toLowerCase()}: el viento offshore (${vientoKt} kt) aleja de la costa. Extrema la precaución.`
        : componente === 'onshore'
            ? `Riesgo ${nivel.toLowerCase()}: viento onshore hacia tierra; retorno seguro a la orilla facilitado.`
            : `Riesgo ${nivel.toLowerCase()}: viento lateral (${vientoKt} kt) desplazando paralelamente a costa.`;

    return { score, nivel, descripcion, componente };
}
