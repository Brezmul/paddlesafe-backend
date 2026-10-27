// ==============================================================================
// js/gpxParser.js - PARSER GPX / TCX INDEPENDIENTE Y LIGERO (ZERO DEPENDENCIES)
// Compatible con Navegadores (DOMParser) y Entornos Node.js / Serverless
// ==============================================================================

const EARTH_RADIUS_METERS = 6371000; // Radio medio de la Tierra en metros
const SUP_MAX_REALISTIC_SPEED_KMH = 32.0; // Umbral máximo físico creíble para SUP / Paddle Surf (8.89 m/s)
const SUP_DEFAULT_ESTIMATED_PACE_MS = 1.25; // 4.5 km/h = 1.25 m/s ritmo base medio en agua

/**
 * Calcula la distancia ortodrómica en metros entre dos coordenadas (Fórmula de Haversine)
 * @param {number} lat1 
 * @param {number} lon1 
 * @param {number} lat2 
 * @param {number} lon2 
 * @returns {number} Distancia en metros
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLon = (lon2 - lon1) * toRad;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_METERS * c;
}

/**
 * Extrae los trackpoints [lat, lon, time, ele] usando DOMParser en navegador
 * o expresiones regulares optimizadas si se ejecuta en Node.js sin DOM.
 * Soporta estándares GPX (<trkpt>, <rtept>, <wpt>) y Garmin TCX (<Trackpoint>).
 * @param {string} xmlString 
 * @returns {{points: Array<{lat: number, lon: number, time: number|null, ele: number}>, hasRealTimestamps: boolean}}
 */
function extractTrackpoints(xmlString) {
    if (!xmlString || typeof xmlString !== "string" || xmlString.trim().length === 0) {
        throw new Error("El archivo está vacío o no es un archivo de texto válido.");
    }

    const points = [];

    // 1. Entorno Navegador con DOMParser nativo
    if (typeof DOMParser !== "undefined") {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "application/xml");

        // Detección defensiva de errores XML en distintos motores de navegador
        const parserErrorNode =
            xmlDoc.querySelector("parsererror") ||
            (xmlDoc.getElementsByTagName("parsererror").length > 0 ? xmlDoc.getElementsByTagName("parsererror")[0] : null) ||
            (xmlDoc.documentElement && xmlDoc.documentElement.nodeName.toLowerCase() === "parsererror" ? xmlDoc.documentElement : null);

        if (parserErrorNode) {
            throw new Error("El archivo no es un archivo GPX/TCX/XML válido o está corrupto.");
        }

        // A. Intentar extraer puntos GPX (trkpt -> rtept -> wpt)
        let nodes = xmlDoc.querySelectorAll("trkpt");
        if (!nodes || nodes.length === 0) {
            nodes = xmlDoc.querySelectorAll("rtept");
        }
        if (!nodes || nodes.length === 0) {
            nodes = xmlDoc.querySelectorAll("wpt");
        }

        if (nodes && nodes.length > 0) {
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                const lat = parseFloat(node.getAttribute("lat"));
                const lon = parseFloat(node.getAttribute("lon"));
                if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;

                const timeEl = node.querySelector("time");
                let time = null;
                if (timeEl && timeEl.textContent && timeEl.textContent.trim()) {
                    const parsedTime = new Date(timeEl.textContent.trim()).getTime();
                    if (!Number.isNaN(parsedTime) && parsedTime > 0) time = parsedTime;
                }

                const eleEl = node.querySelector("ele");
                const ele = (eleEl && eleEl.textContent && Number.isFinite(parseFloat(eleEl.textContent.trim())))
                    ? parseFloat(eleEl.textContent.trim())
                    : 0.0;

                points.push({ lat, lon, time, ele });
            }
        } else {
            // B. Intentar extraer puntos Garmin TCX (<Trackpoint>)
            const tcxNodes = xmlDoc.querySelectorAll("Trackpoint");
            if (tcxNodes && tcxNodes.length > 0) {
                for (let i = 0; i < tcxNodes.length; i++) {
                    const node = tcxNodes[i];
                    const latEl = node.querySelector("LatitudeDegrees");
                    const lonEl = node.querySelector("LongitudeDegrees");
                    if (!latEl || !lonEl) continue;

                    const lat = parseFloat(latEl.textContent.trim());
                    const lon = parseFloat(lonEl.textContent.trim());
                    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;

                    const timeEl = node.querySelector("Time");
                    let time = null;
                    if (timeEl && timeEl.textContent && timeEl.textContent.trim()) {
                        const parsedTime = new Date(timeEl.textContent.trim()).getTime();
                        if (!Number.isNaN(parsedTime) && parsedTime > 0) time = parsedTime;
                    }

                    const eleEl = node.querySelector("AltitudeMeters");
                    const ele = (eleEl && eleEl.textContent && Number.isFinite(parseFloat(eleEl.textContent.trim())))
                        ? parseFloat(eleEl.textContent.trim())
                        : 0.0;

                    points.push({ lat, lon, time, ele });
                }
            }
        }

        const hasRealTimestamps = points.filter(p => p.time !== null).length >= Math.max(2, Math.floor(points.length * 0.3));
        return { points, hasRealTimestamps };
    }

    // 2. Entorno Node.js / Serverless sin dependencias (Fast Regex Parser Defensivo)
    // Comprobación de integridad mínima de etiquetas XML
    const lowerXml = xmlString.toLowerCase();
    const isGpx = lowerXml.includes('<gpx') || lowerXml.includes('<trk') || lowerXml.includes('<trkpt') || lowerXml.includes('<rtept');
    const isTcx = lowerXml.includes('<trainingcenterdatabase') || lowerXml.includes('<trackpoint');

    if (!isGpx && !isTcx) {
        throw new Error("El archivo no es un archivo GPX/TCX/XML válido o está corrupto.");
    }

    if (isGpx) {
        // Regex para capturar atributos lat/lon en cualquier orden (lat...lon o lon...lat)
        const trkptRegex = /<(?:trkpt|rtept|wpt)\s+[^>]*?(?:lat=["']([^"']+)["'][^>]*?lon=["']([^"']+)["']|lon=["']([^"']+)["'][^>]*?lat=["']([^"']+)["'])[^>]*>([\s\S]*?)<\/(?:trkpt|rtept|wpt)>/gi;
        const timeRegex = /<time>([^<]+)<\/time>/i;
        const eleRegex = /<ele>([^<]+)<\/ele>/i;

        let match;
        while ((match = trkptRegex.exec(xmlString)) !== null) {
            const lat = parseFloat(match[1] || match[4]);
            const lon = parseFloat(match[2] || match[3]);
            const innerContent = match[5] || '';

            if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
                const timeMatch = timeRegex.exec(innerContent);
                let time = null;
                if (timeMatch && timeMatch[1]) {
                    const parsedTime = new Date(timeMatch[1].trim()).getTime();
                    if (!Number.isNaN(parsedTime) && parsedTime > 0) time = parsedTime;
                }

                const eleMatch = eleRegex.exec(innerContent);
                const ele = (eleMatch && eleMatch[1] && Number.isFinite(parseFloat(eleMatch[1].trim())))
                    ? parseFloat(eleMatch[1].trim())
                    : 0.0;

                points.push({ lat, lon, time, ele });
            }
        }
    }

    if (points.length === 0 && isTcx) {
        const tcxRegex = /<Trackpoint[\s\S]*?<\/Trackpoint>/gi;
        const latRegex = /<LatitudeDegrees>([^<]+)<\/LatitudeDegrees>/i;
        const lonRegex = /<LongitudeDegrees>([^<]+)<\/LongitudeDegrees>/i;
        const timeRegex = /<Time>([^<]+)<\/Time>/i;
        const eleRegex = /<AltitudeMeters>([^<]+)<\/AltitudeMeters>/i;

        let tcxMatch;
        while ((tcxMatch = tcxRegex.exec(xmlString)) !== null) {
            const block = tcxMatch[0];
            const latM = latRegex.exec(block);
            const lonM = lonRegex.exec(block);
            if (!latM || !lonM) continue;

            const lat = parseFloat(latM[1].trim());
            const lon = parseFloat(lonM[1].trim());
            if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
                const timeM = timeRegex.exec(block);
                let time = null;
                if (timeM && timeM[1]) {
                    const parsedTime = new Date(timeM[1].trim()).getTime();
                    if (!Number.isNaN(parsedTime) && parsedTime > 0) time = parsedTime;
                }

                const eleM = eleRegex.exec(block);
                const ele = (eleM && eleM[1] && Number.isFinite(parseFloat(eleM[1].trim())))
                    ? parseFloat(eleM[1].trim())
                    : 0.0;

                points.push({ lat, lon, time, ele });
            }
        }
    }

    const hasRealTimestamps = points.filter(p => p.time !== null).length >= Math.max(2, Math.floor(points.length * 0.3));
    return { points, hasRealTimestamps };
}

/**
 * Parsea el contenido XML de un archivo .gpx o .tcx y devuelve telemetría, splits y desnivel
 * con filtrado anti-glitch de GPS y reconstrucción suave de tiempos si faltan marcas de tiempo.
 * @param {string} gpxXmlContent - Contenido en texto del archivo .gpx o .tcx
 * @returns {Object} Objeto con coordenadas, distancia, duración, velocidades, splits y desnivel
 */
export function parseGPX(gpxXmlContent) {
    if (!gpxXmlContent || typeof gpxXmlContent !== "string") {
        throw new Error("El contenido del archivo GPX está vacío o no es un string válido.");
    }

    const { points: rawPoints, hasRealTimestamps } = extractTrackpoints(gpxXmlContent);

    if (rawPoints.length < 2) {
        throw new Error("El archivo GPX/TCX no contiene suficientes puntos de navegación (mínimo 2).");
    }

    // Reconstruir marcas temporales sintéticas si el track carece de marcas <time>
    if (!hasRealTimestamps) {
        const baseTime = (rawPoints[0].time && !Number.isNaN(rawPoints[0].time)) ? rawPoints[0].time : (Date.now() - 3600000);
        let accumulatedMetersEst = 0;
        rawPoints[0].time = baseTime;
        for (let i = 1; i < rawPoints.length; i++) {
            const d = haversineDistance(rawPoints[i - 1].lat, rawPoints[i - 1].lon, rawPoints[i].lat, rawPoints[i].lon);
            accumulatedMetersEst += d;
            const deltaSec = Math.max(1, Math.round(d / SUP_DEFAULT_ESTIMATED_PACE_MS));
            rawPoints[i].time = rawPoints[i - 1].time + (deltaSec * 1000);
        }
    }

    const coordinates = [];
    let totalDistanceMeters = 0;
    let totalElevationGainM = 0;
    const speedSamplesKmh = [];

    // Tramos por kilómetro (Splits)
    const splits = [];
    let currentSplitKm = 1;
    let splitDistanceMeters = 0;
    let splitStartTime = rawPoints[0].time;

    // Guardar primer punto
    coordinates.push([Number(rawPoints[0].lat.toFixed(6)), Number(rawPoints[0].lon.toFixed(6))]);

    for (let i = 1; i < rawPoints.length; i++) {
        const prev = rawPoints[i - 1];
        const curr = rawPoints[i];

        // Distancia incremental con Haversine
        const segmentDistMeters = haversineDistance(prev.lat, prev.lon, curr.lat, curr.lon);

        // Desnivel positivo acumulado (filtrando ruido barométrico inferior a 0.8m o picos > 80m en 1 paso)
        const dEle = curr.ele - prev.ele;
        if (dEle > 0.8 && dEle < 80) {
            totalElevationGainM += dEle;
        }

        // Filtrado anti-glitch de saltos de GPS inverosímiles (pérdida de señal / teleportación)
        let deltaSeconds = 0;
        let instantSpeedKmh = 0;
        let esSaltoInvalido = false;

        if (curr.time && prev.time) {
            deltaSeconds = (curr.time - prev.time) / 1000;
            if (deltaSeconds > 0 && deltaSeconds < 600) {
                instantSpeedKmh = (segmentDistMeters / deltaSeconds) * 3.6;
                // Si la velocidad calculada excede la velocidad máxima física posible en SUP (> 32 km/h)
                // se trata de una pérdida de cobertura GPS con rebote satelital.
                if (instantSpeedKmh > SUP_MAX_REALISTIC_SPEED_KMH) {
                    esSaltoInvalido = true;
                }
            }
        }

        // Si es un salto irreal por pérdida de señal, no acumular la distancia ficticia del salto satelital
        if (esSaltoInvalido) {
            // Se conserva la coordenada por continuidad visual pero sin inflar distancia ni métricas
            coordinates.push([Number(curr.lat.toFixed(6)), Number(curr.lon.toFixed(6))]);
            continue;
        }

        coordinates.push([Number(curr.lat.toFixed(6)), Number(curr.lon.toFixed(6))]);
        totalDistanceMeters += segmentDistMeters;
        splitDistanceMeters += segmentDistMeters;

        // Registrar muestra de velocidad válida (ignorando micro-ruido estacionario < 0.5m)
        if (deltaSeconds > 0 && segmentDistMeters >= 0.5 && instantSpeedKmh > 0.2 && instantSpeedKmh <= SUP_MAX_REALISTIC_SPEED_KMH) {
            speedSamplesKmh.push(instantSpeedKmh);
        }

        // Registrar split al alcanzar cada kilómetro completo
        const kmAcumulado = totalDistanceMeters / 1000;
        if (kmAcumulado >= currentSplitKm) {
            const splitKm = Number((splitDistanceMeters / 1000).toFixed(2));
            let splitDurationSec = 0;
            if (curr.time && splitStartTime) {
                splitDurationSec = Math.max(1, Math.round((curr.time - splitStartTime) / 1000));
            }

            const splitAvgSpeed = splitDurationSec > 0 
                ? Number((splitKm / (splitDurationSec / 3600)).toFixed(2)) 
                : 0;

            splits.push({
                km: currentSplitKm,
                distance_km: splitKm,
                duration_seconds: splitDurationSec,
                avg_speed_kmh: Math.min(splitAvgSpeed, SUP_MAX_REALISTIC_SPEED_KMH)
            });

            currentSplitKm++;
            splitDistanceMeters = 0;
            splitStartTime = curr.time;
        }
    }

    // Split final residual si supera 150 metros
    if (splitDistanceMeters >= 150) {
        const splitKm = Number((splitDistanceMeters / 1000).toFixed(2));
        const lastPointTime = rawPoints[rawPoints.length - 1].time;
        let splitDurationSec = 0;
        if (lastPointTime && splitStartTime) {
            splitDurationSec = Math.max(1, Math.round((lastPointTime - splitStartTime) / 1000));
        }
        const splitAvgSpeed = splitDurationSec > 0 
            ? Number((splitKm / (splitDurationSec / 3600)).toFixed(2)) 
            : 0;

        splits.push({
            km: currentSplitKm,
            distance_km: splitKm,
            duration_seconds: splitDurationSec,
            avg_speed_kmh: Math.min(splitAvgSpeed, SUP_MAX_REALISTIC_SPEED_KMH)
        });
    }

    // Distancia total en km
    const totalDistanceKm = Number((totalDistanceMeters / 1000).toFixed(2));

    // Tiempo total en segundos
    const startTime = rawPoints[0].time;
    const endTime = rawPoints[rawPoints.length - 1].time;
    let totalDurationSeconds = 0;
    if (startTime && endTime && endTime > startTime) {
        totalDurationSeconds = Math.round((endTime - startTime) / 1000);
    }

    // Velocidad media general
    let avgSpeedKmh = 0;
    if (totalDurationSeconds > 0 && totalDistanceKm > 0) {
        avgSpeedKmh = Number((totalDistanceKm / (totalDurationSeconds / 3600)).toFixed(2));
    } else if (splits.length > 0) {
        avgSpeedKmh = Number((splits.reduce((acc, s) => acc + s.avg_speed_kmh, 0) / splits.length).toFixed(2));
    }

    // Velocidad máxima con filtrado estricto de picos de ruido (percentil 98, acotada al límite físico de SUP)
    let maxSpeedKmh = avgSpeedKmh;
    if (speedSamplesKmh.length > 0) {
        speedSamplesKmh.sort((a, b) => a - b);
        const p98Index = Math.min(speedSamplesKmh.length - 1, Math.floor(speedSamplesKmh.length * 0.98));
        maxSpeedKmh = Math.min(SUP_MAX_REALISTIC_SPEED_KMH, Number(speedSamplesKmh[p98Index].toFixed(2)));
    }

    return {
        coordinates,
        total_distance_km: totalDistanceKm,
        total_duration_seconds: totalDurationSeconds,
        avg_speed_kmh: avgSpeedKmh,
        max_speed_kmh: maxSpeedKmh,
        total_elevation_gain_m: Number(totalElevationGainM.toFixed(1)),
        hasRealTimestamps,
        splits,
        startTime,
        endTime,
        // Aliases para compatibilidad con la tabla user_routes y vistas legadas
        distance_km: totalDistanceKm,
        duration_seconds: totalDurationSeconds,
        avg_speed: avgSpeedKmh,
        max_speed: maxSpeedKmh,
        elevation_gain_m: Number(totalElevationGainM.toFixed(1)),
        route_coordinates: coordinates,
        splits_data: splits
    };
}

function escapeXml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Genera un string XML GPX 1.1 estándar válido a partir de un array de coordenadas
 * @param {Array<[lat, lon]|{lat, lon/lng, time?, ele?}>} coords 
 * @param {Object} metadata 
 * @returns {string} XML GPX 1.1
 */
export function generarGPX(coords = [], metadata = {}) {
    if (!Array.isArray(coords) || coords.length === 0) {
        throw new Error("No hay coordenadas para generar el archivo GPX.");
    }

    const nombre = metadata.nombre || metadata.name || "Ruta PaddleSafe";
    const descripcion = metadata.descripcion || metadata.desc || "Track generado por PaddleSafe";
    const autor = metadata.autor || "PaddleSafe App";
    const ahoraIso = new Date().toISOString();
    const tiempoBase = metadata.startTime ? new Date(metadata.startTime) : new Date();

    let acumuladoMetros = 0;
    const VELOCIDAD_ESTIMADA_MS = (metadata.velocidadKmh || 4.5) / 3.6;

    const puntosNormalizados = [];
    for (let i = 0; i < coords.length; i++) {
        const pt = coords[i];
        let lat, lon, time = null, ele = 0;

        if (Array.isArray(pt)) {
            lat = Number(pt[0]);
            lon = Number(pt[1]);
        } else if (typeof pt === 'object' && pt !== null) {
            lat = Number(pt.lat ?? pt.latitude);
            lon = Number(pt.lon ?? pt.lng ?? pt.longitude);
            time = pt.time || pt.timestamp || null;
            ele = Number(pt.ele ?? pt.elevation ?? 0);
        }

        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

        if (i > 0 && puntosNormalizados.length > 0) {
            const ant = puntosNormalizados[puntosNormalizados.length - 1];
            acumuladoMetros += haversineDistance(ant.lat, ant.lon, lat, lon);
        }

        if (!time) {
            const segundosEstimados = Math.round(acumuladoMetros / VELOCIDAD_ESTIMADA_MS);
            time = new Date(tiempoBase.getTime() + segundosEstimados * 1000).toISOString();
        } else if (typeof time === 'number') {
            time = new Date(time).toISOString();
        }

        puntosNormalizados.push({ lat, lon, time, ele });
    }

    const trkptsXml = puntosNormalizados.map(p => 
        `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">
        <ele>${p.ele.toFixed(1)}</ele>
        <time>${p.time}</time>
      </trkpt>`
    ).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="${escapeXml(autor)} - https://paddlesafe.app" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(nombre)}</name>
    <desc>${escapeXml(descripcion)}</desc>
    <time>${ahoraIso}</time>
  </metadata>
  <trk>
    <name>${escapeXml(nombre)}</name>
    <type>PADDLEBOARDING</type>
    <trkseg>
${trkptsXml}
    </trkseg>
  </trk>
</gpx>`;
}

/**
 * Dispara la descarga en navegador de un archivo .gpx válido
 * @param {Array} coords 
 * @param {string} nombreArchivo 
 */
export function descargarGPX(coords = [], nombreArchivo = "ruta_paddlesafe.gpx") {
    if (!nombreArchivo.toLowerCase().endsWith(".gpx")) {
        nombreArchivo += ".gpx";
    }
    const cleanName = nombreArchivo.replace(/[\\/:*?"<>|]/g, '_');
    const xml = generarGPX(coords, { nombre: cleanName.replace(/\.gpx$/i, '') });
    const blob = new Blob([xml], { type: 'application/gpx+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = cleanName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default parseGPX;
