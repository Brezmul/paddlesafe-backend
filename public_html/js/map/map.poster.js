// ==============================================================================
// PADDLESAFE NEXT-GEN - FINISHER POSTER GENERATOR (map.poster.js)
// HTML5 Canvas 2D telemetry stamper in finisher style.
// Extracted from map.js under Strangler Fig architecture.
// ==============================================================================

/**
 * Formatea una duración en minutos a formato legible "Xh Ym" o "X min".
 * @param {number} minutos
 * @returns {string}
 */
export function formatearDuracionPoster(minutos) {
    const m = Math.max(0, Math.round(Number(minutos) || 0));
    const durMin = Math.floor(m / 60);
    const durSec = m % 60;
    return durMin > 0 ? `${durMin}h ${durSec}m` : `${m} min`;
}

/**
 * Redimensiona un canvas base manteniendo la relación de aspecto si supera el ancho máximo.
 * @param {HTMLCanvasElement} cv Canvas origen
 * @param {number} maxDimension Ancho máximo permitido (default 800)
 * @returns {HTMLCanvasElement} Canvas escalado o el original si era menor
 */
export function escalarCanvasSiExcede(cv, maxDimension = 800) {
    if (!cv || typeof document === 'undefined') return cv;
    if (cv.width <= maxDimension) return cv;

    const scale = maxDimension / cv.width;
    const resizedCanvas = document.createElement('canvas');
    resizedCanvas.width = maxDimension;
    resizedCanvas.height = Math.max(1, Math.round(cv.height * scale));
    const ctx = resizedCanvas.getContext('2d');
    if (ctx) {
        ctx.drawImage(cv, 0, 0, resizedCanvas.width, resizedCanvas.height);
        return resizedCanvas;
    }
    return cv;
}

/**
 * Normaliza y extrae las coordenadas reales de la ruta activa según el estado del mapa
 * (puntos de tracking GPS en vivo, waypoints de ruta A-B o Multipunto, o polilínea existente).
 * 
 * @param {Object} [mapRuntime]
 * @param {Array} [fallbackCoords]
 * @returns {Array<[number, number]>} Array de pares [latitud, longitud] numéricos y válidos
 */
export function extraerCoordenadasRuta(mapRuntime = {}, fallbackCoords = null) {
    const coordsRaw = [];

    // 1. Fallback explícito o suministrado directamente
    if (Array.isArray(fallbackCoords) && fallbackCoords.length >= 2) {
        coordsRaw.push(...fallbackCoords);
    }
    // 2. Trackcoords del live GPS
    else if (Array.isArray(mapRuntime?.trackCoords) && mapRuntime.trackCoords.length >= 2) {
        coordsRaw.push(...mapRuntime.trackCoords);
    }
    // 3. Marcadores de ruta A-B o Multipunto
    else if (Array.isArray(mapRuntime?.marcadoresRuta) && mapRuntime.marcadoresRuta.length >= 2) {
        coordsRaw.push(...mapRuntime.marcadoresRuta);
    }
    // 4. Polilíneas activas en el mapa
    else if (mapRuntime?.lineaRuta && typeof mapRuntime.lineaRuta.getLatLngs === 'function') {
        const lls = mapRuntime.lineaRuta.getLatLngs();
        coordsRaw.push(...(Array.isArray(lls[0]) ? lls.flat() : lls));
    }
    else if (mapRuntime?.livePolyline && typeof mapRuntime.livePolyline.getLatLngs === 'function') {
        const lls = mapRuntime.livePolyline.getLatLngs();
        coordsRaw.push(...(Array.isArray(lls[0]) ? lls.flat() : lls));
    }

    const norm = [];
    for (const p of coordsRaw) {
        if (!p) continue;
        let lat, lon;
        if (typeof p.getLatLng === 'function') {
            const ll = p.getLatLng();
            lat = Number(ll.lat);
            lon = Number(ll.lng);
        } else if (Array.isArray(p) && p.length >= 2) {
            lat = Number(p[0]);
            lon = Number(p[1]);
        } else if (typeof p === 'object') {
            lat = Number(p.lat ?? p.latitude);
            lon = Number(p.lng ?? p.lon ?? p.longitude);
        }
        if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
            norm.push([lat, lon]);
        }
    }

    return norm;
}

/**
 * Prepara el mapa Leaflet antes de capturar el póster finisher:
 *  - Si hay ruta trazada (2 o más puntos):
 *      1. Oculta / remueve la roseta superpuesta (marcadorRosaVectores) para que no tape el recorrido.
 *      2. Dibuja la polilínea con estilo visible y limpio.
 *      3. Ajusta el encuadre (fitBounds) centrado en toda la ruta con el padding adecuado.
 *  - Si es spot único (< 2 puntos):
 *      Mantiene la roseta táctica centrada en el spot.
 * 
 * @param {Object} params
 * @param {Object} [params.currentMap] Instancia del mapa Leaflet
 * @param {Object} [params.mapRuntime] Estado en ejecución del mapa
 * @param {Array} [params.coordsRuta] Coordenadas precalculadas de la ruta
 * @returns {Object} Resultado del encuadre y estado de ruta
 */
export function prepararMapaPosterFinisher({ currentMap, mapRuntime, coordsRuta = null } = {}) {
    const puntos = (Array.isArray(coordsRuta) && coordsRuta.length >= 2)
        ? coordsRuta
        : extraerCoordenadasRuta(mapRuntime);

    const esRuta = Array.isArray(puntos) && puntos.length >= 2;

    if (esRuta && currentMap) {
        // 1. Ocultar / remover la roseta superpuesta para que no obstruya el trazado
        if (mapRuntime?.marcadorRosaVectores) {
            try { currentMap.removeLayer(mapRuntime.marcadorRosaVectores); } catch (_) {}
            mapRuntime.marcadorRosaVectores = null;
        }

        // 2. Dibujar polilínea con estilo visible, deportivo y limpio
        if (mapRuntime?.posterPolyline) {
            try { currentMap.removeLayer(mapRuntime.posterPolyline); } catch (_) {}
            mapRuntime.posterPolyline = null;
        }

        let polylineTarget = mapRuntime?.livePolyline;
        if (!polylineTarget || (Array.isArray(mapRuntime?.trackCoords) && mapRuntime.trackCoords.length < 2)) {
            if (typeof L !== 'undefined' && typeof L.polyline === 'function') {
                mapRuntime.posterPolyline = L.polyline(puntos, {
                    color: '#0284c7', // Cyan náutico deportivo
                    weight: 6,
                    opacity: 0.95,
                    lineJoin: 'round',
                    lineCap: 'round',
                    className: 'poster-track-polyline'
                }).addTo(currentMap);
                polylineTarget = mapRuntime.posterPolyline;
            }
        } else if (polylineTarget && typeof polylineTarget.setStyle === 'function') {
            polylineTarget.setStyle({
                color: '#0284c7',
                weight: 6,
                opacity: 0.95,
                lineJoin: 'round',
                lineCap: 'round'
            });
        }

        // 3. Encuadre del mapa (fitBounds) centrado con padding simétrico adecuado
        let bounds = null;
        if (polylineTarget && typeof polylineTarget.getBounds === 'function') {
            bounds = polylineTarget.getBounds();
            if (typeof currentMap.fitBounds === 'function') {
                currentMap.fitBounds(bounds, { padding: [50, 50], animate: false });
            }
        }

        return {
            esRuta: true,
            puntos,
            bounds,
            polyline: polylineTarget,
            rosetaRemovida: true
        };
    }

    // Spot único (< 2 puntos): mantener roseta centrada en el spot
    if (mapRuntime?.marcadorRosaVectores && currentMap) {
        try {
            const rosetaCenter = mapRuntime.marcadorRosaVectores.getLatLng();
            if (typeof currentMap.setView === 'function') {
                currentMap.setView(rosetaCenter, Math.max(currentMap.getZoom ? currentMap.getZoom() : 14, 14), { animate: false });
            }
        } catch (_) {}
    }

    return {
        esRuta: false,
        puntos: [],
        rosetaRemovida: false
    };
}

/**
 * Dibuja un trazado de polilínea vectorial 2D directamente en el contexto Canvas,
 * garantizando que la ruta esté visible con glow y puntos de salida/llegada.
 * 
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {Array<[number, number]>} coords
 * @param {Object} [options]
 */
export function dibujarTrazadoRutaEnCanvas(ctx, width, height, coords = [], options = {}) {
    if (!ctx || !Array.isArray(coords) || coords.length < 2) return;

    const footerH = options.footerH || Math.min(85, Math.max(65, Math.round(height * 0.20)));
    const drawH = height - footerH;
    const padding = options.padding || 35;

    let minLat = Infinity, maxLat = -Infinity;
    let minLon = Infinity, maxLon = -Infinity;

    for (const [lat, lon] of coords) {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
    }

    let latSpan = maxLat - minLat;
    let lonSpan = maxLon - minLon;
    if (latSpan <= 0.000001) latSpan = 0.0001;
    if (lonSpan <= 0.000001) lonSpan = 0.0001;

    const midLat = (minLat + maxLat) / 2;
    const cosLat = Math.cos((midLat * Math.PI) / 180);
    const geoW = lonSpan * Math.max(0.1, Math.abs(cosLat));
    const geoH = latSpan;

    const usableW = width - (padding * 2);
    const usableH = drawH - (padding * 2);

    const scaleX = usableW / geoW;
    const scaleY = usableH / geoH;
    const scale = Math.min(scaleX, scaleY);

    const offsetX = (width - (geoW * scale)) / 2;
    const offsetY = (drawH - (geoH * scale)) / 2;

    const project = ([lat, lon]) => {
        const x = offsetX + ((lon - minLon) * Math.max(0.1, Math.abs(cosLat)) * scale);
        const y = offsetY + ((maxLat - lat) * scale);
        return [x, y];
    };

    ctx.save();

    // 1. Glow exterior de la línea
    ctx.strokeStyle = options.glowColor || 'rgba(2, 132, 199, 0.4)';
    ctx.lineWidth = (options.lineWidth || 5) + 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const [startX, startY] = project(coords[0]);
    ctx.moveTo(startX, startY);
    for (let i = 1; i < coords.length; i++) {
        const [px, py] = project(coords[i]);
        ctx.lineTo(px, py);
    }
    ctx.stroke();

    // 2. Línea principal deportiva
    ctx.strokeStyle = options.color || '#0284c7';
    ctx.lineWidth = options.lineWidth || 5;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    for (let i = 1; i < coords.length; i++) {
        const [px, py] = project(coords[i]);
        ctx.lineTo(px, py);
    }
    ctx.stroke();

    // 3. Hito de salida (verde)
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(startX, startY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 4. Hito de llegada (ámbar/rojo)
    const [endX, endY] = project(coords[coords.length - 1]);
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(endX, endY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
}

/**
 * Estampa la banda Finisher en el canvas 2D con telemetría de travesía.
 * Soporta tanto un CanvasRenderingContext2D como un elemento HTMLCanvasElement como primer parámetro.
 * 
 * @param {CanvasRenderingContext2D|HTMLCanvasElement} ctxOrCanvas
 * @param {number} [width]
 * @param {number} [height]
 * @param {Object} [telemetryData]
 * @param {number} [telemetryData.duracionMinutos] Minutos totales
 * @param {number} [telemetryData.trackDistanceKm] Distancia recorrida en km
 * @param {string|number} [telemetryData.avgSpdFinalStr] Velocidad media km/h
 * @param {number} [telemetryData.kcal] Calorías quemadas
 * @param {string} [telemetryData.vientoKtStr] Velocidad del viento en nudos formateada
 * @param {string} [telemetryData.olasMStr] Altura de ola formateada
 * @param {number} [telemetryData.scoreSeguridad] Score de seguridad de 0 a 100
 * @param {string} [telemetryData.fechaStr] Cadena de fecha (opcional)
 * @param {Array} [telemetryData.coords] Array de waypoints/coordenadas de la ruta
 * @param {boolean} [telemetryData.dibujarRutaEnCanvas] Si dibuja el trazado vectorial en canvas (opcional)
 */
export function estamparPosterFinisherCanvas(ctxOrCanvas, width, height, telemetryData = {}) {
    try {
        let ctx = ctxOrCanvas;
        let cw = width;
        let ch = height;

        // Si se pasó un canvas en lugar de un contexto 2D
        if (ctxOrCanvas && typeof ctxOrCanvas.getContext === 'function') {
            ctx = ctxOrCanvas.getContext('2d');
            cw = width || ctxOrCanvas.width;
            ch = height || ctxOrCanvas.height;
        }

        if (!ctx) return;

        cw = cw || 800;
        ch = ch || 600;

        const footerH = Math.min(85, Math.max(65, Math.round(ch * 0.20)));
        const footerY = ch - footerH;

        // Opcional: Si se suministraron coordenadas y se solicita refuerzo vectorial en canvas
        const rutaCoords = telemetryData.coords || telemetryData.waypoints || telemetryData.coordsRuta;
        if (telemetryData.dibujarRutaEnCanvas && Array.isArray(rutaCoords) && rutaCoords.length >= 2) {
            dibujarTrazadoRutaEnCanvas(ctx, cw, ch, rutaCoords, { footerH });
        }

        // 1. Banda semi-transparente degradada oscura
        const grad = ctx.createLinearGradient(0, footerY - 12, 0, ch);
        grad.addColorStop(0, 'rgba(15, 23, 42, 0)');
        grad.addColorStop(0.2, 'rgba(15, 23, 42, 0.88)');
        grad.addColorStop(1, 'rgba(15, 23, 42, 0.98)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, footerY - 12, cw, footerH + 12);

        // 2. Línea de acento superior estilo neón náutico
        const lineGrad = ctx.createLinearGradient(0, 0, cw, 0);
        lineGrad.addColorStop(0, '#06b6d4');
        lineGrad.addColorStop(0.5, '#10b981');
        lineGrad.addColorStop(1, '#3b82f6');
        ctx.fillStyle = lineGrad;
        ctx.fillRect(0, footerY + 2, cw, 2);

        // 3. Tipografía: Título FINISHER + Fecha
        ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#38bdf8';
        ctx.fillText('🏄 PADDLESAFE FINISHER', 14, footerY + 20);

        const fechaStr = telemetryData.fechaStr
            || new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
        ctx.font = '600 11px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'right';
        ctx.fillText(fechaStr, cw - 14, footerY + 20);
        ctx.textAlign = 'left';

        // 4. Métricas clave: Distancia, Tiempo, Velocidad Media y Kcal
        const durStr = formatearDuracionPoster(telemetryData.duracionMinutos ?? telemetryData.m ?? 0);
        const distKm = Number(telemetryData.trackDistanceKm ?? telemetryData.distanciaKm ?? 0).toFixed(2);
        const avgSpd = String(telemetryData.avgSpdFinalStr ?? telemetryData.velocidadMediaKmh ?? '0.0');
        const kcal = Math.round(Number(telemetryData.kcal ?? telemetryData.biometriaFinal?.kcal ?? 0));

        ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`📏 ${distKm} km   ⏱️ ${durStr}   ⚡ ${avgSpd} km/h   🔥 ${kcal} kcal`, 14, footerY + 40);

        // 5. Badge Meteorológico
        const vKtStr = telemetryData.vientoKtStr ?? telemetryData.vKtStr ?? '--';
        const oMStr = telemetryData.olasMStr ?? telemetryData.oMStr ?? '--';
        const scoreVal = telemetryData.scoreSeguridad ?? telemetryData.scoreVal ?? 100;

        ctx.font = '500 11px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#34d399';
        ctx.fillText(`💨 ${vKtStr} · 🌊 ${oMStr} · 🛡️ Score ${scoreVal}/100`, 14, footerY + 58);
    } catch (errStamp) {
        console.warn('Aviso no crítico al estampar footer finisher:', errStamp);
    }
}

if (typeof window !== 'undefined') {
    window.formatearDuracionPoster = formatearDuracionPoster;
    window.escalarCanvasSiExcede = escalarCanvasSiExcede;
    window.extraerCoordenadasRuta = extraerCoordenadasRuta;
    window.prepararMapaPosterFinisher = prepararMapaPosterFinisher;
    window.dibujarTrazadoRutaEnCanvas = dibujarTrazadoRutaEnCanvas;
    window.estamparPosterFinisherCanvas = estamparPosterFinisherCanvas;
}
