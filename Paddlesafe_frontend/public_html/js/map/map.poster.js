// ==============================================================================
// PADDLESAFE NEXT-GEN - FINISHER POSTER GENERATOR (map.poster.js)
// HTML5 Canvas 2D telemetry stamper in Strava / Garmin finisher style.
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
 * Estampa la banda Finisher estilo Strava / Garmin en el canvas 2D con telemetría de travesía.
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

