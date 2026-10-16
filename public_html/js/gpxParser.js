// ==============================================================================
// js/gpxParser.js - PARSER GPX INDEPENDIENTE Y LIGERO (ZERO DEPENDENCIES)
// Compatible con Navegadores (DOMParser) y Entornos Node.js / Serverless
// ==============================================================================

const EARTH_RADIUS_METERS = 6371000; // Radio medio de la Tierra en metros

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
 * Extrae los trackpoints [lat, lon, time] usando DOMParser en navegador
 * o expresiones regulares optimizadas si se ejecuta en Node.js sin DOM.
 * @param {string} xmlString 
 * @returns {Array<{lat: number, lon: number, time: number|null}>}
 */
function extractTrackpoints(xmlString) {
    const points = [];

    // 1. Entorno Navegador con DOMParser nativo
    if (typeof DOMParser !== "undefined") {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "application/xml");
        
        if (xmlDoc.querySelector("parsererror")) {
            throw new Error("El archivo no es un archivo GPX/XML válido o está corrupto.");
        }

        let nodes = xmlDoc.querySelectorAll("trkpt");
        if (!nodes || nodes.length === 0) {
            nodes = xmlDoc.querySelectorAll("rtept"); // Soporte secundario para rutas
        }

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const lat = parseFloat(node.getAttribute("lat"));
            const lon = parseFloat(node.getAttribute("lon"));
            if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;

            const timeEl = node.querySelector("time");
            const time = timeEl ? new Date(timeEl.textContent.trim()).getTime() : null;
            points.push({ lat, lon, time });
        }
        return points;
    }

    // 2. Entorno Node.js / Serverless sin dependencias (Fast Regex Parser)
    const trkptRegex = /<(?:trkpt|rtept)\s+[^>]*lat=["']([^"']+)["'][^>]*lon=["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:trkpt|rtept)>/gi;
    const timeRegex = /<time>([^<]+)<\/time>/i;

    let match;
    while ((match = trkptRegex.exec(xmlString)) !== null) {
        const lat = parseFloat(match[1]);
        const lon = parseFloat(match[2]);
        const innerContent = match[3];

        if (Number.isFinite(lat) && Number.isFinite(lon)) {
            const timeMatch = timeRegex.exec(innerContent);
            const time = timeMatch ? new Date(timeMatch[1].trim()).getTime() : null;
            points.push({ lat, lon, time });
        }
    }

    return points;
}

/**
 * Parsea el contenido XML de un archivo .gpx y devuelve telemetría y splits
 * @param {string} gpxXmlContent - Contenido en texto del archivo .gpx
 * @returns {Object} Objeto con coordenadas, distancia, duración, velocidades y splits
 */
export function parseGPX(gpxXmlContent) {
    if (!gpxXmlContent || typeof gpxXmlContent !== "string") {
        throw new Error("El contenido del archivo GPX está vacío o no es un string válido.");
    }

    const rawPoints = extractTrackpoints(gpxXmlContent);

    if (rawPoints.length < 2) {
        throw new Error("El archivo GPX no contiene suficientes puntos de navegación (mínimo 2).");
    }

    const coordinates = [];
    let totalDistanceMeters = 0;
    let speedSamplesKmh = [];

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

        coordinates.push([Number(curr.lat.toFixed(6)), Number(curr.lon.toFixed(6))]);

        // Distancia incremental con Haversine
        const segmentDistMeters = haversineDistance(prev.lat, prev.lon, curr.lat, curr.lon);
        totalDistanceMeters += segmentDistMeters;
        splitDistanceMeters += segmentDistMeters;

        // Velocidad entre puntos
        if (curr.time && prev.time) {
            const deltaSeconds = (curr.time - prev.time) / 1000;
            if (deltaSeconds > 0 && deltaSeconds < 300) {
                const instantSpeedKmh = (segmentDistMeters / deltaSeconds) * 3.6;
                // Descartar errores de satélite inverosímiles (> 85 km/h)
                if (instantSpeedKmh < 85) {
                    speedSamplesKmh.push(instantSpeedKmh);
                }
            }
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
                avg_speed_kmh: splitAvgSpeed
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
            avg_speed_kmh: splitAvgSpeed
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
    const avgSpeedKmh = totalDurationSeconds > 0
        ? Number((totalDistanceKm / (totalDurationSeconds / 3600)).toFixed(2))
        : (splits.length > 0 
            ? Number((splits.reduce((acc, s) => acc + s.avg_speed_kmh, 0) / splits.length).toFixed(2)) 
            : 0);

    // Velocidad máxima con filtrado de picos de ruido (percentil 98)
    let maxSpeedKmh = avgSpeedKmh;
    if (speedSamplesKmh.length > 0) {
        speedSamplesKmh.sort((a, b) => a - b);
        const p98Index = Math.min(speedSamplesKmh.length - 1, Math.floor(speedSamplesKmh.length * 0.98));
        maxSpeedKmh = Number(speedSamplesKmh[p98Index].toFixed(2));
    }

    return {
        coordinates,
        total_distance_km: totalDistanceKm,
        total_duration_seconds: totalDurationSeconds,
        avg_speed_kmh: avgSpeedKmh,
        max_speed_kmh: maxSpeedKmh,
        splits,
        startTime,
        endTime,
        // Aliases para compatibilidad con la tabla user_routes
        distance_km: totalDistanceKm,
        duration_seconds: totalDurationSeconds,
        avg_speed: avgSpeedKmh,
        max_speed: maxSpeedKmh,
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

