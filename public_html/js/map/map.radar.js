// ==============================================================================
// PADDLESAFE NEXT-GEN - ADVANCED MARINE & METEOROLOGICAL RADAR 2.0 (map.radar.js)
// Full-Viewport 60FPS Canvas Radar Engine (Bilinear Scalar Heatmap + 750 Flow Streamlines)
// RainViewer Doppler (maxNativeZoom: 7, maxZoom: 19, opacity: 0.78)
// Sandwich Retina Labels Compatible + Collapsible Cockpit + Dynamic Color Scale
// ==============================================================================

import { mapRuntime } from './map.state.js';
import { resolverOrientacionCostera, kmhANudos } from '../utils.js';

/**
 * Escala cromática de intensidad de viento (Windy Color LUT for SUP)
 * Verde: 0-5 kt | Amarillo: 5-10 kt | Naranja: 10-15 kt | Rojo: >15 kt
 */
export function obtenerColorEscalaViento(nudos) {
    const k = Number(nudos) || 0;
    if (k < 5) return '#10b981'; // Verde esmeralda (óptimo SUP)
    if (k < 10) return '#f59e0b'; // Amarillo (favorable / brisa)
    if (k < 15) return '#f97316'; // Naranja (precaución)
    return '#ef4444'; // Rojo (>15 kt, riesgo para SUP)
}

/**
 * Escala cromática de partículas Windy para Stand Up Paddle (Canvas Engine):
 * 0 a 8 kt (Calma): Verde/Cian (#10b981 / #06b6d4)
 * 8 a 14 kt (Brisa): Amarillo/Ámbar (#eab308)
 * 14 a 20+ kt (Riesgo): Naranja/Rojo (#f97316 / #ef4444)
 */
export function obtenerColorParticulaViento(nudos) {
    const k = Number(nudos) || 0;
    if (k < 4) return '#06b6d4'; // Cian suave
    if (k < 8) return '#10b981'; // Verde óptimo SUP
    if (k < 14) return '#eab308'; // Amarillo / Ámbar
    if (k < 20) return '#f97316'; // Naranja
    return '#ef4444'; // Rojo
}

/**
 * Escala cromática de oleaje (Swell & Sea)
 * Verde: 0-0.5m | Amarillo: 0.5-1m | Naranja: 1-1.5m | Rojo: >1.5m
 */
export function obtenerColorEscalaOleaje(metros) {
    const m = Number(metros) || 0;
    if (m < 0.5) return '#10b981'; // Verde (mar llana)
    if (m < 1.0) return '#f59e0b'; // Amarillo (chop moderado)
    if (m < 1.5) return '#f97316'; // Naranja (mar picada)
    return '#ef4444'; // Rojo (>1.5 m rompiente)
}

/**
 * Escala cromática de lluvia y tormentas
 * Azul claro (<1mm/h) | Azul medio (1-4mm/h) | Azul oscuro (4-10mm/h) | Morado (>10mm/h o tormenta)
 */
export function obtenerColorEscalaLluvia(mmPorHora, codigoClima = 0) {
    const mm = Number(mmPorHora) || 0;
    const cod = Number(codigoClima) || 0;
    if ([95, 96, 99].includes(cod) || mm >= 10) return '#9333ea'; // Morado Tormenta
    if (mm >= 4) return '#1d4ed8'; // Azul oscuro
    if (mm >= 1) return '#0284c7'; // Azul medio
    if (mm > 0.1) return '#38bdf8'; // Azul claro
    return '#64748b'; // Sin precipitación
}

/**
 * Cálculo físico de Deriva Costera PaddleSafe
 * Combina viento sobre francobordo + arrastre Stokes de swell + corriente.
 * Retorna dirección neta (grados), velocidad (kt y m/min) y nivel de riesgo.
 */
export function calcularDerivaCosteraPaddle(vientoKt, vientoDirDeg, olaM, swellDirDeg, tipoTabla = 'inflat_allround') {
    const wKt = Math.max(0, Number(vientoKt) || 0);
    const wDir = Number(vientoDirDeg) || 0;
    const sM = Math.max(0, Number(olaM) || 0);
    const sDir = Number(swellDirDeg) || 0;

    // Coeficiente de rozamiento eólico según tipo de tabla SUP
    const tablaFactors = {
        inflat_allround: 0.040, // 4.0% de velocidad de viento por alto francobordo
        inflat_touring: 0.035,
        rigid_touring: 0.030,
        rigid_race: 0.025
    };
    const cWind = tablaFactors[tipoTabla] || 0.035;

    // Componente de viento (empuja HACIA dir + 180)
    const vientoHaciaRad = ((wDir + 180) % 360) * Math.PI / 180;
    const vWindDrift = wKt * cWind;
    const uWind = vWindDrift * Math.sin(vientoHaciaRad);
    const vWind = vWindDrift * Math.cos(vientoHaciaRad);

    // Componente de oleaje (arrastre de Stokes hacia la dirección a la que viajan las olas: dir + 180)
    const swellHaciaRad = ((sDir + 180) % 360) * Math.PI / 180;
    const vSwellDrift = sM * 0.25; // ~0.25 kt por cada metro de ola
    const uSwell = vSwellDrift * Math.sin(swellHaciaRad);
    const vSwell = vSwellDrift * Math.cos(swellHaciaRad);

    // Vector neto combinado
    const uNet = uWind + uSwell;
    const vNet = vWind + vSwell;

    const velocidadKt = Math.sqrt(uNet * uNet + vNet * vNet);
    let direccionDeg = (Math.atan2(uNet, vNet) * 180 / Math.PI + 360) % 360;

    // Evaluación del nivel de riesgo de deriva
    let nivelRiesgo = 'bajo';
    let colorRiesgo = '#a855f7'; // Morado suave
    if (velocidadKt >= 0.8) {
        nivelRiesgo = 'critico';
        colorRiesgo = '#ef4444'; // Rojo
    } else if (velocidadKt >= 0.5) {
        nivelRiesgo = 'alto';
        colorRiesgo = '#f97316'; // Naranja
    } else if (velocidadKt >= 0.25) {
        nivelRiesgo = 'moderado';
        colorRiesgo = '#c084fc'; // Morado
    }

    return {
        velocidadKt: Number(velocidadKt.toFixed(2)),
        velocidadMpm: Number((velocidadKt * 1852 / 60).toFixed(1)), // metros por minuto
        direccionDeg: Math.round(direccionDeg),
        nivelRiesgo,
        colorRiesgo
    };
}

/**
 * Valoración rápida PaddleSafe en menos de 10 segundos
 * 🟢 Excelente | 🟡 Buena | 🟠 Precaución | 🔴 No recomendable
 */
export function calcularValoracionRapidaPaddleSafe({
    vientoKt = 0,
    vientoOffshore = false,
    olaM = 0,
    derivaKt = 0,
    precipMm = 0,
    weatherCode = 0
}) {
    const k = Number(vientoKt) || 0;
    const o = Number(olaM) || 0;
    const d = Number(derivaKt) || 0;
    const p = Number(precipMm) || 0;
    const cod = Number(weatherCode) || 0;
    const esTormenta = [95, 96, 99].includes(cod) || p >= 8;

    // Reglas de descarte y peligro crítico (Rojo)
    if (k > 15 || o > 1.3 || (vientoOffshore && k > 10) || esTormenta || d > 0.8) {
        return {
            etiqueta: '🔴 No recomendable',
            nivel: 'no_recomendable',
            color: '#ef4444',
            bgClass: 'bg-rose-500/20 text-rose-300 border-rose-500/50',
            motivo: esTormenta ? 'Riesgo de tormenta' :
                    (vientoOffshore && k > 10) ? 'Viento terral peligroso (Offshore)' :
                    k > 15 ? 'Viento superior a 15 kt' :
                    o > 1.3 ? 'Oleaje rompiente excesivo' : 'Deriva marítima crítica'
        };
    }

    // Nivel de precaución (Naranja)
    if (k > 10 || o > 0.8 || (vientoOffshore && k > 7) || p > 2 || d > 0.45) {
        return {
            etiqueta: '🟠 Precaución',
            nivel: 'precaucion',
            color: '#f97316',
            bgClass: 'bg-amber-500/20 text-amber-300 border-amber-500/50',
            motivo: (vientoOffshore && k > 7) ? 'Viento offshore moderado' :
                    k > 10 ? 'Viento racheado 10-15 kt' :
                    o > 0.8 ? 'Mar de fondo picada' : 'Lluvia o deriva perceptible'
        };
    }

    // Nivel bueno (Amarillo)
    if (k > 5 || o > 0.4 || p > 0.2 || d > 0.25) {
        return {
            etiqueta: '🟡 Buena',
            nivel: 'buena',
            color: '#f59e0b',
            bgClass: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
            motivo: 'Condiciones favorables con ligera brisa'
        };
    }

    // Nivel óptimo (Verde)
    return {
        etiqueta: '🟢 Excelente',
        nivel: 'excelente',
        color: '#10b981',
        bgClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50',
        motivo: 'Mar llana, brisa suave y deriva mínima'
    };
}

/**
 * Genera el icono vectorial SVG para una flecha de viento
 */
export function generarSvgFlechaViento(nudos, dirDeg) {
    const color = obtenerColorEscalaViento(nudos);
    return `
        <div class="relative flex flex-col items-center justify-center pointer-events-none select-none -translate-x-1/2 -translate-y-1/2" style="width: 44px; height: 44px;">
            <div style="transform: rotate(${(Number(dirDeg) + 180) % 360}deg); transition: transform 0.2s ease;">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="10" fill="rgba(15, 23, 42, 0.75)" stroke="${color}" stroke-width="1.5" />
                    <path d="M12 4L16 11H13V19H11V11H8L12 4Z" fill="${color}" />
                </svg>
            </div>
            <span class="text-[9px] font-black font-mono leading-none px-1 py-0.5 rounded shadow" style="background: rgba(15, 23, 42, 0.85); color: ${color}; border: 1px solid ${color}40; margin-top: -3px;">
                ${Math.round(nudos)}k
            </span>
        </div>
    `;
}

/**
 * Genera el icono vectorial SVG para una flecha de oleaje / swell
 */
export function generarSvgFlechaOleaje(alturaM, swellDirDeg) {
    const color = obtenerColorEscalaOleaje(alturaM);
    return `
        <div class="relative flex flex-col items-center justify-center pointer-events-none select-none -translate-x-1/2 -translate-y-1/2" style="width: 44px; height: 44px;">
            <div style="transform: rotate(${(Number(swellDirDeg) + 180) % 360}deg); transition: transform 0.2s ease;">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="10" fill="rgba(15, 23, 42, 0.75)" stroke="${color}" stroke-width="1.5" stroke-dasharray="2 2" />
                    <path d="M7 14C9 11 11 11 12 13C13 15 15 15 17 12L16 11" stroke="${color}" stroke-width="2" stroke-linecap="round" />
                    <path d="M12 5L15 9H9L12 5Z" fill="${color}" />
                </svg>
            </div>
            <span class="text-[9px] font-black font-mono leading-none px-1 py-0.5 rounded shadow" style="background: rgba(15, 23, 42, 0.85); color: ${color}; border: 1px solid ${color}40; margin-top: -3px;">
                ${alturaM.toFixed(1)}m
            </span>
        </div>
    `;
}

/**
 * Genera el icono vectorial SVG para una flecha de deriva costera PaddleSafe
 */
export function generarSvgFlechaDeriva(velocidadKt, dirDeg, colorRiesgo) {
    return `
        <div class="relative flex flex-col items-center justify-center pointer-events-none select-none -translate-x-1/2 -translate-y-1/2" style="width: 48px; height: 48px;">
            <div style="transform: rotate(${dirDeg}deg); transition: transform 0.2s ease;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="11" fill="rgba(30, 10, 60, 0.85)" stroke="${colorRiesgo}" stroke-width="2" />
                    <path d="M12 3L17 12L12 9.5L7 12L12 3Z" fill="${colorRiesgo}" />
                    <path d="M12 9.5V20" stroke="${colorRiesgo}" stroke-width="2" stroke-linecap="round" />
                </svg>
            </div>
            <span class="text-[9px] font-black font-mono leading-none px-1.5 py-0.5 rounded shadow" style="background: rgba(30, 10, 60, 0.95); color: ${colorRiesgo}; border: 1px solid ${colorRiesgo}60; margin-top: -4px;">
                🧭 ${velocidadKt}k
            </span>
        </div>
    `;
}

// ==============================================================================
// MOTOR CANVAS RADAR 2.0 (HEATMAP ESCALAR + 750 PARTÍCULAS STREAMLINES A 60 FPS)
// ==============================================================================

const TOTAL_STREAMLINES_PARTICLES = 750;

/**
 * Inicializa el subsistema de doble lienzo canvas en radarCanvasPane (zIndex 450)
 */
function inicializarCanvasRadarEngine(mapInstance) {
    if (mapRuntime._radarCanvasInitialized && mapRuntime._radarCanvasHeatmap) return;

    let canvasPane = mapInstance.getPane('radarCanvasPane');
    if (!canvasPane) {
        canvasPane = mapInstance.createPane('radarCanvasPane');
        canvasPane.style.zIndex = '450';
        canvasPane.style.pointerEvents = 'none';
    }

    // 1. Canvas para Heatmap Escalar Bilinear
    let canvasHeatmap = document.getElementById('psRadarHeatmapCanvas');
    if (!canvasHeatmap) {
        canvasHeatmap = document.createElement('canvas');
        canvasHeatmap.id = 'psRadarHeatmapCanvas';
        canvasHeatmap.style.position = 'absolute';
        canvasHeatmap.style.top = '0';
        canvasHeatmap.style.left = '0';
        canvasHeatmap.style.pointerEvents = 'none';
        canvasPane.appendChild(canvasHeatmap);
    }

    // 2. Canvas para 750 Partículas Streamlines
    let canvasStreamlines = document.getElementById('psRadarStreamlinesCanvas');
    if (!canvasStreamlines) {
        canvasStreamlines = document.createElement('canvas');
        canvasStreamlines.id = 'psRadarStreamlinesCanvas';
        canvasStreamlines.style.position = 'absolute';
        canvasStreamlines.style.top = '0';
        canvasStreamlines.style.left = '0';
        canvasStreamlines.style.pointerEvents = 'none';
        canvasPane.appendChild(canvasStreamlines);
    }

    mapRuntime._radarCanvasHeatmap = canvasHeatmap;
    mapRuntime._radarCanvasStreamlines = canvasStreamlines;
    mapRuntime._radarCanvasInitialized = true;

    // Sincronización de dimensiones y posición con Leaflet
    const sincronizarDimensionesCanvas = () => {
        if (!mapInstance || !canvasHeatmap || !canvasStreamlines) return;
        const size = mapInstance.getSize();
        if (canvasHeatmap.width !== size.x || canvasHeatmap.height !== size.y) {
            canvasHeatmap.width = size.x;
            canvasHeatmap.height = size.y;
            canvasStreamlines.width = size.x;
            canvasStreamlines.height = size.y;
            reiniciarParticulasStreamlines(size.x, size.y);
        }
        const topLeft = mapInstance.containerPointToLayerPoint([0, 0]);
        L.DomUtil.setPosition(canvasHeatmap, topLeft);
        L.DomUtil.setPosition(canvasStreamlines, topLeft);
    };

    sincronizarDimensionesCanvas();

    if (!mapRuntime._radarCanvasSyncBound) {
        mapRuntime._radarCanvasSyncBound = true;
        mapInstance.on('move zoom viewreset', sincronizarDimensionesCanvas);
        mapInstance.on('resize', () => {
            sincronizarDimensionesCanvas();
            renderizarScalarHeatmap();
        });
    }
}

/**
 * Inicializa o resetea el array de 750 partículas de flujo vectorial
 */
function reiniciarParticulasStreamlines(w, h) {
    const width = w || 800;
    const height = h || 600;
    const particles = [];
    for (let i = 0; i < TOTAL_STREAMLINES_PARTICLES; i++) {
        particles.push({
            x: Math.random() * width,
            y: Math.random() * height,
            age: Math.floor(Math.random() * 80),
            maxAge: 40 + Math.floor(Math.random() * 50),
            speed: 1.2 + Math.random() * 2.2
        });
    }
    mapRuntime._radarParticles = particles;
}

/**
 * Dibuja el Heatmap Escalar continuo con la paleta Windy para Stand Up Paddle
 */
function renderizarScalarHeatmap() {
    const canvas = mapRuntime._radarCanvasHeatmap;
    const mapInstance = mapRuntime.map;
    if (!canvas || !mapInstance || !mapRuntime.radarActivo) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (mapRuntime.radarCapasActivas?.viento === false && mapRuntime.radarCapasActivas?.oleaje === false && mapRuntime.radarCapasActivas?.deriva === false) {
        return;
    }

    const windKt = mapRuntime._radarCurrentWindKt ?? 6;
    const waveM = mapRuntime._radarCurrentWaveM ?? 0.4;
    const derivaKt = mapRuntime._radarCurrentDerivaKt ?? 0.2;

    const centerPoint = mapInstance.latLngToContainerPoint(mapInstance.getCenter());
    const cx = Math.max(0, Math.min(w, centerPoint.x));
    const cy = Math.max(0, Math.min(h, centerPoint.y));
    const radius = Math.max(w, h) * 0.72;

    const grad = ctx.createRadialGradient(cx, cy, 25, cx, cy, radius);

    if (mapRuntime.radarCapasActivas?.viento !== false) {
        // Escala Windy para Viento SUP: <8kt esmeralda/cyan, 8-14kt ámbar, >14kt rosa/rojo
        if (windKt < 8) {
            grad.addColorStop(0, 'rgba(16, 185, 129, 0.28)');
            grad.addColorStop(0.45, 'rgba(6, 182, 212, 0.20)');
            grad.addColorStop(1, 'rgba(15, 23, 42, 0.04)');
        } else if (windKt < 14) {
            grad.addColorStop(0, 'rgba(245, 158, 11, 0.32)');
            grad.addColorStop(0.5, 'rgba(249, 115, 22, 0.24)');
            grad.addColorStop(1, 'rgba(15, 23, 42, 0.04)');
        } else {
            grad.addColorStop(0, 'rgba(239, 68, 68, 0.38)');
            grad.addColorStop(0.5, 'rgba(244, 63, 94, 0.26)');
            grad.addColorStop(1, 'rgba(15, 23, 42, 0.05)');
        }
    } else if (mapRuntime.radarCapasActivas?.oleaje !== false) {
        // Escala de Oleaje: 0-0.5m cyan/esmeralda, 0.5-1.2m ámbar, >1.2m rojo
        if (waveM < 0.5) {
            grad.addColorStop(0, 'rgba(6, 182, 212, 0.26)');
            grad.addColorStop(0.5, 'rgba(16, 185, 129, 0.18)');
            grad.addColorStop(1, 'rgba(15, 23, 42, 0.04)');
        } else if (waveM < 1.2) {
            grad.addColorStop(0, 'rgba(245, 158, 11, 0.30)');
            grad.addColorStop(0.5, 'rgba(217, 119, 6, 0.22)');
            grad.addColorStop(1, 'rgba(15, 23, 42, 0.04)');
        } else {
            grad.addColorStop(0, 'rgba(239, 68, 68, 0.36)');
            grad.addColorStop(0.5, 'rgba(220, 38, 38, 0.25)');
            grad.addColorStop(1, 'rgba(15, 23, 42, 0.05)');
        }
    } else if (mapRuntime.radarCapasActivas?.deriva !== false) {
        // Escala de Deriva Costera SUP (leeway 3% + Stokes 1.2%)
        if (derivaKt < 0.35) {
            grad.addColorStop(0, 'rgba(192, 132, 252, 0.28)');
            grad.addColorStop(0.5, 'rgba(168, 85, 247, 0.20)');
            grad.addColorStop(1, 'rgba(15, 23, 42, 0.04)');
        } else {
            grad.addColorStop(0, 'rgba(239, 68, 68, 0.36)');
            grad.addColorStop(0.5, 'rgba(168, 85, 247, 0.24)');
            grad.addColorStop(1, 'rgba(15, 23, 42, 0.05)');
        }
    }

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
}

/**
 * Loop de renderizado de 750 partículas a 60 FPS con requestAnimationFrame
 */
function renderizarStreamlinesLoop() {
    if (!mapRuntime.radarActivo) {
        mapRuntime._radarStreamlineFrame = null;
        return;
    }

    const canvas = mapRuntime._radarCanvasStreamlines;
    if (!canvas) {
        mapRuntime._radarStreamlineFrame = requestAnimationFrame(renderizarStreamlinesLoop);
        return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Desvanecimiento suave tipo estela de cometa Windy (destination-in con opacidad 0.93)
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.93)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';

    const particles = mapRuntime._radarParticles;
    if (!particles || particles.length === 0) {
        reiniciarParticulasStreamlines(w, h);
    }

    // Calcular dirección y velocidad del flujo dominante desde estado unificado
    const windDir = mapRuntime._radarCurrentWindDir ?? 45;
    const windKt = mapRuntime._radarCurrentWindKt ?? 6;
    const waveDir = mapRuntime._radarCurrentWaveDir ?? 60;
    const waveM = mapRuntime._radarCurrentWaveM ?? 0.4;
    const precipMm = mapRuntime._radarCurrentPrecipMm ?? 0;

    let flujoDeg = windDir;
    let colorTrazo = obtenerColorParticulaViento(windKt);

    const capas = mapRuntime.radarCapasActivas || { viento: true, lluvia: true, oleaje: true, deriva: true };

    if (capas.lluvia !== false && capas.viento === false && capas.oleaje === false && capas.deriva === false) {
        // En modo lluvia exclusivo: solo dibujar si precipitación real > 0 mm/h
        if (precipMm <= 0.05) {
            mapRuntime._radarStreamlineFrame = requestAnimationFrame(renderizarStreamlinesLoop);
            return;
        }
        flujoDeg = windDir;
        colorTrazo = '#38bdf8';
    } else if (capas.viento !== false) {
        flujoDeg = windDir;
        colorTrazo = obtenerColorParticulaViento(windKt);
    } else if (capas.oleaje !== false) {
        flujoDeg = waveDir;
        colorTrazo = obtenerColorEscalaOleaje(waveM);
    } else if (capas.deriva !== false) {
        flujoDeg = mapRuntime._radarCurrentDerivaDir ?? ((windDir + 180) % 360);
        colorTrazo = '#c084fc';
    }

    // Ángulo en coordenadas de pantalla (el flujo empuja hacia dir + 180)
    const angleRad = ((flujoDeg + 180) % 360) * Math.PI / 180;
    const vx = Math.sin(angleRad);
    const vy = -Math.cos(angleRad);

    const factorVelocidad = Math.max(0.4, Math.min(2.8, windKt * 0.18));

    ctx.strokeStyle = colorTrazo;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();

    const parts = mapRuntime._radarParticles;
    for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const oldX = p.x;
        const oldY = p.y;

        const spd = p.speed * factorVelocidad;
        p.x += vx * spd;
        p.y += vy * spd;
        p.age++;

        if (p.x < 0 || p.x > w || p.y < 0 || p.y > h || p.age > p.maxAge) {
            p.x = Math.random() * w;
            p.y = Math.random() * h;
            p.age = 0;
            p.maxAge = 40 + Math.floor(Math.random() * 50);
        } else {
            ctx.moveTo(oldX, oldY);
            ctx.lineTo(p.x, p.y);
        }
    }

    ctx.stroke();

    mapRuntime._radarStreamlineFrame = requestAnimationFrame(renderizarStreamlinesLoop);
}

/**
 * Inicia la animación fluida de partículas a 60 FPS
 */
function iniciarStreamlinesLoop() {
    if (mapRuntime._radarStreamlineFrame) {
        cancelAnimationFrame(mapRuntime._radarStreamlineFrame);
        mapRuntime._radarStreamlineFrame = null;
    }
    mapRuntime._radarStreamlineFrame = requestAnimationFrame(renderizarStreamlinesLoop);
}

/**
 * Detiene y limpia la animación de partículas y canvas
 */
function detenerStreamlinesLoop() {
    if (mapRuntime._radarStreamlineFrame) {
        cancelAnimationFrame(mapRuntime._radarStreamlineFrame);
        mapRuntime._radarStreamlineFrame = null;
    }
    if (mapRuntime._radarCanvasStreamlines) {
        const ctx = mapRuntime._radarCanvasStreamlines.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, mapRuntime._radarCanvasStreamlines.width, mapRuntime._radarCanvasStreamlines.height);
    }
    if (mapRuntime._radarCanvasHeatmap) {
        const ctx = mapRuntime._radarCanvasHeatmap.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, mapRuntime._radarCanvasHeatmap.width, mapRuntime._radarCanvasHeatmap.height);
    }
}

// ==============================================================================
// COCKPIT CONTROLS: COLAPSO Y LEYENDA DINÁMICA DE ESCALA DE COLOR
// ==============================================================================

/**
 * Alterna el colapso/despliegue del panel flotante de radar
 */
export function toggleColapsoRadarCockpit() {
    const panel = document.getElementById('radarCockpitPanel');
    const body = document.getElementById('radarCockpitBody');
    const icon = document.getElementById('iconCollapseRadarCockpit');
    const btn = document.getElementById('btnCollapseRadarCockpit');
    if (!panel) return;

    const estaColapsado = panel.classList.toggle('radar-collapsed');
    if (body) {
        body.classList.toggle('hidden', estaColapsado);
    }
    if (icon) {
        icon.style.transform = estaColapsado ? 'rotate(180deg)' : 'rotate(0deg)';
    }
    if (btn) {
        btn.setAttribute('aria-expanded', estaColapsado ? 'false' : 'true');
    }
}

/**
 * Actualiza la leyenda dinámica de escala continua de color en el Cockpit
 */
export function actualizarLeyendaEscalaRadar(tipo = 'viento') {
    const el = document.getElementById('radarColorScaleLegend');
    if (!el) return;

    const capas = mapRuntime.radarCapasActivas || { viento: true, lluvia: true, oleaje: true, deriva: true };
    let tipoEfectivo = tipo;

    if (!tipoEfectivo) {
        if (capas.viento) tipoEfectivo = 'viento';
        else if (capas.lluvia) tipoEfectivo = 'lluvia';
        else if (capas.oleaje) tipoEfectivo = 'oleaje';
        else if (capas.deriva) tipoEfectivo = 'deriva';
        else tipoEfectivo = 'viento';
    }

    const configs = {
        viento: {
            titulo: '💨 Viento (Seguridad SUP)',
            unidad: 'Nudos (kt)',
            gradiente: 'linear-gradient(to right, #10b981 0%, #06b6d4 30%, #f59e0b 65%, #ef4444 100%)',
            marcas: ['0 kt', '8 kt (Calma)', '14 kt (Brisa)', '20+ kt (Riesgo)']
        },
        oleaje: {
            titulo: '🌊 Oleaje / Swell',
            unidad: 'Metros (m)',
            gradiente: 'linear-gradient(to right, #06b6d4 0%, #10b981 30%, #f59e0b 65%, #ef4444 100%)',
            marcas: ['0 m (Plato)', '0.5 m (Chop)', '1.2 m (Oleaje)', '2.0+ m (Peligro)']
        },
        lluvia: {
            titulo: '🌧️ Lluvia Doppler',
            unidad: 'mm / hora',
            gradiente: 'linear-gradient(to right, #38bdf8 0%, #0284c7 35%, #1d4ed8 70%, #9333ea 100%)',
            marcas: ['0 mm', '1 mm (Débil)', '4 mm (Moderada)', '10+ mm (Tormenta)']
        },
        deriva: {
            titulo: '🧭 Deriva Neta Costera',
            unidad: 'Nudos / m/min',
            gradiente: 'linear-gradient(to right, #c084fc 0%, #a855f7 35%, #f97316 70%, #ef4444 100%)',
            marcas: ['0 kt', '0.25 kt', '0.50 kt (Alerta)', '0.80+ kt (Crítico)']
        }
    };

    const cfg = configs[tipoEfectivo] || configs.viento;

    el.innerHTML = `
        <div class="flex items-center justify-between text-[9px] font-bold text-slate-300">
            <span class="flex items-center gap-1">${cfg.titulo}</span>
            <span class="text-[9px] text-slate-400 font-mono">${cfg.unidad}</span>
        </div>
        <div class="w-full h-2 rounded-full overflow-hidden my-1 shadow-inner" style="background: ${cfg.gradiente};"></div>
        <div class="flex items-center justify-between text-[8px] font-mono text-slate-400">
            <span>${cfg.marcas[0]}</span>
            <span>${cfg.marcas[1]}</span>
            <span>${cfg.marcas[2]}</span>
            <span>${cfg.marcas[3]}</span>
        </div>
    `;
}

// ==============================================================================
// CICLO DE VIDA DEL MODO RADAR (ACTIVAR / DESACTIVAR / TOGGLES)
// ==============================================================================

/**
 * Activa el Modo Radar Táctico en el mapa
 */
export async function activarModoRadar() {
    mapRuntime.radarActivo = true;

    // 0. Exclusividad mutua con otros modos de trazado
    if (mapRuntime.modoTravesiaActivo && typeof window.toggleModoTravesia === 'function') {
        window.toggleModoTravesia();
    }
    if (mapRuntime.modoRutaLibreActivo && typeof window.toggleRutaLibre === 'function') {
        window.toggleRutaLibre();
    }
    if (mapRuntime.modoQuedadaClubActivo && typeof window.cancelarCreacionQuedadaClub === 'function') {
        window.cancelarCreacionQuedadaClub();
    }

    // 1. Mostrar Cockpit compacto y Bottom Bar del Radar
    const cockpit = document.getElementById('radarCockpitPanel');
    if (cockpit) {
        cockpit.classList.remove('hidden');
        cockpit.classList.remove('radar-collapsed');
        const body = document.getElementById('radarCockpitBody');
        if (body) body.classList.remove('hidden');
    }
    const bottomBar = document.getElementById('radarBottomBar');
    if (bottomBar) {
        bottomBar.classList.remove('hidden');
    }
    const hud = document.getElementById('mapWindWaveHud');
    if (hud) {
        hud.classList.add('hidden');
    }
    const toolbar = document.getElementById('multipuntoToolbar');
    if (toolbar) {
        toolbar.classList.replace('flex', 'hidden');
    }

    const mapInstance = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
    if (!mapInstance || typeof L === 'undefined') return;

    // 2. Inicializar los grupos de capas vectoriales de Leaflet si no existen
    if (!mapRuntime.radarWindGroup) mapRuntime.radarWindGroup = L.layerGroup().addTo(mapInstance);
    if (!mapRuntime.radarWaveGroup) mapRuntime.radarWaveGroup = L.layerGroup().addTo(mapInstance);
    if (!mapRuntime.radarDriftGroup) mapRuntime.radarDriftGroup = L.layerGroup().addTo(mapInstance);
    if (!mapRuntime.radarRainGroup) mapRuntime.radarRainGroup = L.layerGroup().addTo(mapInstance);

    // 3. Inicializar el motor dual Canvas en radarCanvasPane (zIndex 450)
    inicializarCanvasRadarEngine(mapInstance);
    if (mapRuntime._radarCanvasHeatmap) mapRuntime._radarCanvasHeatmap.style.display = 'block';
    if (mapRuntime._radarCanvasStreamlines) mapRuntime._radarCanvasStreamlines.style.display = 'block';

    // 4. Configurar capa Doppler de Lluvia en tiempo real con RainViewer (maxNativeZoom: 7, maxZoom: 19, opacity: 0.78)
    if (!mapRuntime.radarRainTile) {
        try {
            const rvRes = await fetch('https://api.rainviewer.com/public/weather-maps.json');
            if (rvRes.ok) {
                const rvData = await rvRes.json();
                const latestPath = rvData.radar?.past?.[rvData.radar.past.length - 1]?.path;
                if (latestPath) {
                    const host = rvData.host || 'https://tilecache.rainviewer.com';
                    mapRuntime.radarRainTile = L.tileLayer(`${host}${latestPath}/256/{z}/{x}/{y}/2/1_1.png`, {
                        maxNativeZoom: 7,
                        maxZoom: 19,
                        opacity: mapRuntime.radarOpacidad || 0.78,
                        zIndex: 350
                    });
                    if (mapRuntime.radarCapasActivas?.lluvia !== false) {
                        mapRuntime.radarRainTile.addTo(mapInstance);
                    }
                }
            }
        } catch (err) {
            console.warn('[radar] RainViewer no disponible temporalmente:', err);
        }
    } else if (mapRuntime.radarCapasActivas?.lluvia !== false && !mapInstance.hasLayer(mapRuntime.radarRainTile)) {
        mapRuntime.radarRainTile.addTo(mapInstance);
    }

    // 5. Iniciar animación de 750 partículas streamlines a 60 FPS
    iniciarStreamlinesLoop();

    // 6. Renderizar capas vectoriales y heatmap
    await actualizarCapasRadar();
    actualizarLeyendaEscalaRadar();

    // 7. Vincular evento de movimiento del mapa con debounce
    if (!mapRuntime._radarMoveBound) {
        mapRuntime._radarMoveBound = true;
        mapInstance.on('moveend', () => {
            if (mapRuntime.radarActivo) {
                actualizarCapasRadar();
            }
        });
    }
}

/**
 * Desactiva el Modo Radar y limpia las capas sobrepuestas
 */
export function desactivarModoRadar() {
    mapRuntime.radarActivo = false;

    // 1. Ocultar Cockpit y Bottom Bar del Radar
    const cockpit = document.getElementById('radarCockpitPanel');
    if (cockpit) cockpit.classList.add('hidden');
    const bottomBar = document.getElementById('radarBottomBar');
    if (bottomBar) bottomBar.classList.add('hidden');
    if (mapRuntime.datosMeteoActuales || mapRuntime.activeSpotData) {
        const hud = document.getElementById('mapWindWaveHud');
        if (hud) hud.classList.remove('hidden');
    }

    const mapInstance = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
    if (!mapInstance) return;

    // 2. Detener loop de partículas y limpiar lienzos canvas
    detenerStreamlinesLoop();
    if (mapRuntime._radarCanvasHeatmap) mapRuntime._radarCanvasHeatmap.style.display = 'none';
    if (mapRuntime._radarCanvasStreamlines) mapRuntime._radarCanvasStreamlines.style.display = 'none';

    // 3. Limpiar grupos de capas vectoriales
    if (mapRuntime.radarWindGroup) mapRuntime.radarWindGroup.clearLayers();
    if (mapRuntime.radarWaveGroup) mapRuntime.radarWaveGroup.clearLayers();
    if (mapRuntime.radarDriftGroup) mapRuntime.radarDriftGroup.clearLayers();
    if (mapRuntime.radarRainGroup) mapRuntime.radarRainGroup.clearLayers();

    // 4. Remover tile layer de RainViewer si estaba activo
    if (mapRuntime.radarRainTile && mapInstance.hasLayer(mapRuntime.radarRainTile)) {
        try { mapInstance.removeLayer(mapRuntime.radarRainTile); } catch (_) {}
    }
}

/**
 * Alterna individualmente una capa del Radar (viento, lluvia, oleaje, deriva)
 */
export function toggleCapaRadar(nombreCapa, forzarEstado = null) {
    if (!mapRuntime.radarCapasActivas) {
        mapRuntime.radarCapasActivas = { viento: true, lluvia: true, oleaje: true, deriva: true };
    }

    const estado = forzarEstado !== null ? Boolean(forzarEstado) : !mapRuntime.radarCapasActivas[nombreCapa];
    mapRuntime.radarCapasActivas[nombreCapa] = estado;

    // Actualizar estilo visual del botón
    const btnIdMap = {
        viento: 'btnRadarLayerWind',
        lluvia: 'btnRadarLayerRain',
        oleaje: 'btnRadarLayerWave',
        deriva: 'btnRadarLayerDrift'
    };
    const btn = document.getElementById(btnIdMap[nombreCapa]);
    if (btn) {
        if (estado) {
            btn.classList.add('ps-chip-active', 'active');
            btn.style.opacity = '1';
        } else {
            btn.classList.remove('ps-chip-active', 'active');
            btn.style.opacity = '0.45';
        }
    }

    const mapInstance = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
    if (!mapInstance) return;

    // Aplicar a Leaflet
    if (nombreCapa === 'viento' && mapRuntime.radarWindGroup) {
        if (estado) { if (!mapInstance.hasLayer(mapRuntime.radarWindGroup)) mapInstance.addLayer(mapRuntime.radarWindGroup); }
        else { if (mapInstance.hasLayer(mapRuntime.radarWindGroup)) mapInstance.removeLayer(mapRuntime.radarWindGroup); }
    } else if (nombreCapa === 'oleaje' && mapRuntime.radarWaveGroup) {
        if (estado) { if (!mapInstance.hasLayer(mapRuntime.radarWaveGroup)) mapInstance.addLayer(mapRuntime.radarWaveGroup); }
        else { if (mapInstance.hasLayer(mapRuntime.radarWaveGroup)) mapInstance.removeLayer(mapRuntime.radarWaveGroup); }
    } else if (nombreCapa === 'deriva' && mapRuntime.radarDriftGroup) {
        if (estado) { if (!mapInstance.hasLayer(mapRuntime.radarDriftGroup)) mapInstance.addLayer(mapRuntime.radarDriftGroup); }
        else { if (mapInstance.hasLayer(mapRuntime.radarDriftGroup)) mapInstance.removeLayer(mapRuntime.radarDriftGroup); }
    } else if (nombreCapa === 'lluvia') {
        if (mapRuntime.radarRainTile) {
            if (estado) { if (!mapInstance.hasLayer(mapRuntime.radarRainTile)) mapInstance.addLayer(mapRuntime.radarRainTile); }
            else { if (mapInstance.hasLayer(mapRuntime.radarRainTile)) mapInstance.removeLayer(mapRuntime.radarRainTile); }
        }
        if (mapRuntime.radarRainGroup) {
            if (estado) { if (!mapInstance.hasLayer(mapRuntime.radarRainGroup)) mapInstance.addLayer(mapRuntime.radarRainGroup); }
            else { if (mapInstance.hasLayer(mapRuntime.radarRainGroup)) mapInstance.removeLayer(mapRuntime.radarRainGroup); }
        }
    }

    // Actualizar heatmap y leyenda de color para la capa seleccionada
    renderizarScalarHeatmap();
    actualizarLeyendaEscalaRadar(nombreCapa);
}

/**
 * Ajusta la opacidad global de las capas tácticas del radar
 */
export function ajustarOpacidadRadar(nivelOpacidad = 1.0) {
    const op = Math.max(0.2, Math.min(1.0, Number(nivelOpacidad) || 1.0));
    mapRuntime.radarOpacidad = op;

    if (mapRuntime.radarRainTile && typeof mapRuntime.radarRainTile.setOpacity === 'function') {
        mapRuntime.radarRainTile.setOpacity(op * 0.78);
    }

    if (mapRuntime._radarCanvasHeatmap) {
        mapRuntime._radarCanvasHeatmap.style.opacity = String(op * 0.85);
    }
    if (mapRuntime._radarCanvasStreamlines) {
        mapRuntime._radarCanvasStreamlines.style.opacity = String(op);
    }

    const selector = '.ps-radar-vector-marker';
    document.querySelectorAll(selector).forEach(el => {
        el.style.opacity = String(op);
    });
}

/**
 * Actualiza la malla inteligente de vectores del radar sobre el área visible
 */
export async function actualizarCapasRadar(forzarLat = null, forzarLon = null) {
    if (!mapRuntime.radarActivo) return;

    const mapInstance = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
    if (!mapInstance || typeof L === 'undefined') return;

    const center = mapInstance.getCenter();
    const lat = Number(forzarLat !== null && forzarLat !== undefined ? forzarLat : (mapRuntime.latitudActual || center.lat));
    const lon = Number(forzarLon !== null && forzarLon !== undefined ? forzarLon : (mapRuntime.longitudActual || center.lng));

    // 1. Obtener pronóstico meteorológico y marino real para estas coordenadas
    let meteoData = null;
    let marineData = null;
    const fechaStr = new Date().toISOString().slice(0, 10);

    try {
        const [meteoRes, marineRes] = await Promise.allSettled([
            fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation,weather_code,temperature_2m&current_weather=true&start_date=${fechaStr}&end_date=${fechaStr}`),
            fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&hourly=wave_height,wave_period,wave_direction,swell_wave_direction&start_date=${fechaStr}&end_date=${fechaStr}`)
        ]);
        if (meteoRes.status === 'fulfilled' && meteoRes.value.ok) meteoData = await meteoRes.value.json();
        if (marineRes.status === 'fulfilled' && marineRes.value.ok) marineData = await marineRes.value.json();
    } catch (err) {
        console.warn('[radar] Error obteniendo datos para radar:', err);
    }

    // 2. Extraer valores centrales para la hora actual
    const horaActual = new Date().getHours();
    const idx = Math.min(horaActual, (meteoData?.hourly?.time?.length || 24) - 1);

    let windSpeedMs = meteoData?.hourly?.wind_speed_10m?.[idx];
    if (windSpeedMs === undefined || windSpeedMs === null) {
        windSpeedMs = meteoData?.current_weather?.windspeed ? (meteoData.current_weather.windspeed / 3.6) :
            (mapRuntime.datosMeteoActuales?.windSpeed ?? 2.5);
    }
    const windKt = kmhANudos(windSpeedMs * 3.6);

    let windDir = meteoData?.hourly?.wind_direction_10m?.[idx];
    if (windDir === undefined || windDir === null) {
        windDir = meteoData?.current_weather?.winddirection ?? (mapRuntime.datosMeteoActuales?.windDirection ?? 45);
    }

    const windGustsMs = meteoData?.hourly?.wind_gusts_10m?.[idx] ?? windSpeedMs;
    const windGustKt = kmhANudos(windGustsMs * 3.6);
    const precipMm = meteoData?.hourly?.precipitation?.[idx] ?? 0;
    const weatherCode = meteoData?.hourly?.weather_code?.[idx] ?? (meteoData?.current_weather?.weathercode ?? 0);
    const tempC = meteoData?.hourly?.temperature_2m?.[idx] ?? (meteoData?.current_weather?.temperature ?? 20);

    const waveHeight = marineData?.hourly?.wave_height?.[idx] ?? (mapRuntime.datosMeteoActuales?.waveHeight ?? 0.3);
    const wavePeriod = marineData?.hourly?.wave_period?.[idx] ?? (mapRuntime.datosMeteoActuales?.wavePeriod ?? 4.0);
    const waveDir = marineData?.hourly?.swell_wave_direction?.[idx] ?? marineData?.hourly?.wave_direction?.[idx] ?? windDir;

    // Orientación costera y sesgo de viento
    const infoCosta = resolverOrientacionCostera(lat, lon);
    const seawardDeg = infoCosta?.seawardDeg || 0;
    const vientoOffshore = infoCosta?.esCosta && Math.abs(((windDir - seawardDeg + 540) % 360) - 180) < 45;

    // Deriva costera PaddleSafe
    const tipoTabla = mapRuntime.equipoUsuario?.tipoTabla || 'inflat_allround';
    const deriva = calcularDerivaCosteraPaddle(windKt, windDir, waveHeight, waveDir, tipoTabla);

    // 3. Valoración Rápida 10-Segundos
    const valoracion = calcularValoracionRapidaPaddleSafe({
        vientoKt: windKt,
        vientoOffshore,
        olaM: waveHeight,
        derivaKt: deriva.velocidadKt,
        precipMm,
        weatherCode
    });

    // Guardar telemetría en Fuente Única de Verdad (activeSpotData)
    mapRuntime.activeSpotData = {
        lat,
        lon,
        windSpeedMs,
        windKt,
        windGustKt,
        windDir,
        windBlowsToDeg: (windDir + 180) % 360,
        waveHeightM: waveHeight,
        wavePeriodS: wavePeriod,
        waveDir,
        waveBlowsToDeg: (waveDir + 180) % 360,
        precipMm,
        weatherCode,
        tempC,
        vientoOffshore,
        infoCosta,
        deriva,
        valoracion
    };

    mapRuntime.datosMeteoActuales = {
        ...(mapRuntime.datosMeteoActuales || {}),
        lat,
        lon,
        windSpeed: windSpeedMs,
        wind_speed: windSpeedMs,
        windGusts: windGustsMs,
        wind_gusts: windGustsMs,
        windDirection: windDir,
        wind_direction: windDir,
        waveHeight,
        wave_height: waveHeight,
        wavePeriod,
        wave_period: wavePeriod,
        waveDirection: waveDir,
        wave_direction: waveDir,
        precipitation: precipMm,
        weatherCode,
        weather_code: weatherCode,
        temperature: tempC,
        tempAire: tempC
    };

    mapRuntime.latitudActual = lat;
    mapRuntime.longitudActual = lon;

    // Guardar telemetría en estado reactivo para Canvas Engine
    mapRuntime._radarCurrentWindKt = windKt;
    mapRuntime._radarCurrentWindDir = windDir;
    mapRuntime._radarCurrentWaveM = waveHeight;
    mapRuntime._radarCurrentWaveDir = waveDir;
    mapRuntime._radarCurrentDerivaKt = deriva.velocidadKt;
    mapRuntime._radarCurrentDerivaDir = deriva.direccionDeg;
    mapRuntime._radarCurrentPrecipMm = precipMm;

    // 4. Actualizar Inspector del Cockpit y Bottom Bar
    const verdictBadge = document.getElementById('radarVerdictBadge');
    if (verdictBadge) {
        verdictBadge.textContent = valoracion.etiqueta;
        verdictBadge.className = `px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${valoracion.bgClass}`;
    }

    const subtitleEl = document.getElementById('radarVerdictSubtitle');
    if (subtitleEl) {
        subtitleEl.textContent = valoracion.motivo;
    }

    const coordsEl = document.getElementById('radarInspectorCoords');
    if (coordsEl) coordsEl.textContent = `📍 ${lat.toFixed(3)}, ${lon.toFixed(3)}`;

    const biasEl = document.getElementById('radarInspectorBias');
    if (biasEl) {
        biasEl.textContent = vientoOffshore ? '⚠️ Viento Terral (Offshore)' : infoCosta.esCosta ? 'Costero (Onshore/Side)' : 'Aguas protegidas';
        biasEl.className = vientoOffshore ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold';
    }

    const windEl = document.getElementById('radarInspectorWind');
    if (windEl) windEl.textContent = `${windKt.toFixed(1)} kt (${windDir}°)`;

    const waveEl = document.getElementById('radarInspectorWave');
    if (waveEl) waveEl.textContent = `${waveHeight.toFixed(2)} m (${waveDir}°)`;

    const rainEl = document.getElementById('radarInspectorRain');
    if (rainEl) rainEl.textContent = `${precipMm.toFixed(1)} mm/h (${precipMm > 0 ? 'Precipitación' : 'Despejado'})`;

    const driftEl = document.getElementById('radarInspectorDrift');
    if (driftEl) driftEl.textContent = `${deriva.velocidadKt} kt (${deriva.direccionDeg}°) / ${deriva.velocidadMpm} m/min`;

    // Sincronizar marcador de vectores sobre el mapa con datos reales
    if (typeof window.renderizarRosaVectoresMapa === 'function') {
        window.renderizarRosaVectoresMapa(lat, lon, mapRuntime.datosMeteoActuales);
    }

    // 5. Renderizar Heatmap continuo en Canvas
    renderizarScalarHeatmap();

    // 6. Limpiar capas vectoriales estáticas antiguas (eliminación de la cuadrícula 3x3 artificial)
    if (mapRuntime.radarWindGroup) mapRuntime.radarWindGroup.clearLayers();
    if (mapRuntime.radarWaveGroup) mapRuntime.radarWaveGroup.clearLayers();
    if (mapRuntime.radarDriftGroup) mapRuntime.radarDriftGroup.clearLayers();

    ajustarOpacidadRadar(mapRuntime.radarOpacidad || 1.0);
}

// Auto-registro global en window.* para Leaflet, bindings de eventos y compatibilidad E2E
if (typeof window !== 'undefined') {
    window.activarModoRadar = activarModoRadar;
    window.desactivarModoRadar = desactivarModoRadar;
    window.toggleCapaRadar = toggleCapaRadar;
    window.ajustarOpacidadRadar = ajustarOpacidadRadar;
    window.actualizarCapasRadar = actualizarCapasRadar;
    window.calcularDerivaCosteraPaddle = calcularDerivaCosteraPaddle;
    window.calcularValoracionRapidaPaddleSafe = calcularValoracionRapidaPaddleSafe;
    window.toggleColapsoRadarCockpit = toggleColapsoRadarCockpit;
    window.actualizarLeyendaEscalaRadar = actualizarLeyendaEscalaRadar;
}
