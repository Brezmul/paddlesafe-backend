// ==============================================================================
// PADDLESAFE NEXT-GEN - MAP AI & LOCAL HEURISTIC COACH (map.coach.js)
// Specialized marine & sports intelligence coach routines for PaddleSafe map.
// Extracted from map.js under Strangler Fig architecture.
// ==============================================================================

import { BACKEND_API_URL } from '../config.js';
import {
    fetchConTimeout,
    esc,
    kmhANudos,
    deduplicateInsights,
    sonMensajesEquivalentes,
    filtrarConsejosRedundantes,
    generarConsejoCoach
} from '../utils.js';
import { mapRuntime } from './map.state.js';

export const ICONOS_SEGURIDAD = {
    'SEGURO': '🟢',
    'PRECAUCIÓN': '🟡',
    'RIESGO ELEVADO': '🟠',
    'PELIGROSO': '🔴',
    'RIESGO EXTREMO': '⛔',
    'NO RECOMENDADO': '⛔'
};

export const ICONOS_DERIVA = {
    'BAJO': '🟢',
    'MODERADO': '🟡',
    'ALTO': '🟠',
    'MUY ALTO': '🔴',
    'EXTREMO': '⛔'
};

/**
 * Helper consolidado para actualizar el badge de seguridad del Coach en el DOM.
 * @param {HTMLElement|null} badgeEl Elemento DOM del badge de seguridad
 * @param {number} score Puntuación de seguridad de 0 a 100
 * @param {boolean} [isVeto=false] Si hay veto crítico activo
 * @param {string} [vetoIcon='🚨'] Icono para el veto
 */
export function actualizarBadgeSeguridadCoach(badgeEl, score, isVeto = false, vetoIcon = '🚨') {
    if (!badgeEl) return;
    if (isVeto) {
        badgeEl.className = 'text-xs font-black font-mono px-2.5 py-1 rounded-lg border flex items-center gap-1 bg-red-950/80 text-rose-300 border-red-500/40';
        badgeEl.innerHTML = `<span>${vetoIcon}</span> Seguridad: 0/100`;
        return;
    }

    let scoreBadgeCls = "bg-emerald-950/80 text-emerald-300 border-emerald-500/40";
    let scoreIcon = "🟢";

    if (score < 45) {
        scoreBadgeCls = "bg-rose-950/80 text-rose-300 border-rose-500/40";
        scoreIcon = "🔴";
    } else if (score < 75) {
        scoreBadgeCls = "bg-amber-950/80 text-amber-300 border-amber-500/40";
        scoreIcon = "🟡";
    }

    badgeEl.className = `text-xs font-black font-mono px-2.5 py-1 rounded-lg border flex items-center gap-1 ${scoreBadgeCls}`;
    badgeEl.innerHTML = `<span>${scoreIcon}</span> Seguridad: ${score}/100`;
}

/**
 * Helper consolidado para generar tarjetas de aviso/veto crítico en el Coach.
 * @param {Object} params
 * @param {string} params.icono Icono ilustrativo (ej: 🚨, ⛈️)
 * @param {string} params.titulo Título destacado del veto
 * @param {string} params.descripcion Explicación técnica del motivo
 * @param {string} params.tipoConsejo Etiqueta del consejo (ej: "Directiva del Instructor ISA")
 * @param {string} params.consejo Texto del consejo o directiva
 * @param {'critico'|'tormenta'} [params.nivelAlerta='critico']
 * @returns {string} Plantilla HTML
 */
export function generarTarjetaVetoCoach({ icono, titulo, descripcion, tipoConsejo, consejo, nivelAlerta = 'critico' }) {
    const bgCard = nivelAlerta === 'critico' ? 'bg-red-950/90 shadow-xl' : 'bg-red-950/70 shadow-lg';
    const bgBox = nivelAlerta === 'critico' ? 'bg-red-900/60 border-red-500/60 text-xs' : 'bg-red-900/40 border-red-500/40 text-[11px]';
    return `
        <div class="rounded-2xl border-2 border-red-600 ${bgCard} p-4 text-xs text-white">
            <p class="font-black text-sm flex items-center gap-2 text-rose-300">
                <span>${icono}</span> ${esc(titulo)}
            </p>
            <p class="mt-2 text-slate-100 leading-relaxed font-medium">
                ${esc(descripcion)}
            </p>
            <div class="mt-3 p-3 rounded-xl ${bgBox} text-amber-200">
                <strong>${esc(tipoConsejo)}:</strong> ${esc(consejo)}
            </div>
        </div>`;
}

/**
 * Muestra mensaje de fallback en el contenedor del Coach Básico si no hay conexión meteorológica.
 * @param {HTMLElement|null} container
 */
export function mostrarCoachPronosticoNoDisponible(container) {
    if (!container) return;
    container.classList.remove('hidden');
    container.innerHTML = `
        <div class="flex flex-col gap-2">
            <span class="font-black text-amber-300 text-xs uppercase tracking-wider">✨ Coach ISA</span>
            <p class="text-xs text-slate-200 leading-relaxed">Sin conexión con los servicios meteorológicos. Comprueba tu conexión a internet para cargar el análisis del spot.</p>
        </div>`;
}

/**
 * Valida si el análisis recibido por el Coach IA contradice el motor experto de seguridad.
 * @param {Object} coach
 * @param {Object} motor
 * @returns {boolean}
 */
export function coachContradiceMotor(coach, motor) {
    if (!motor) return false;
    const texto = JSON.stringify(coach).toLowerCase();
    const afirmaSeguro = /\b(seguro|seguros|navegable|navegables|condiciones ideales|puedes salir)\b/i.test(texto);
    const afirmaPeligro = /\b(riesgo extremo|peligroso|peligrosa|no salir|salida desaconsejada|no recomendable)\b/i.test(texto);
    return (motor.alertaEmergenciaActiva && afirmaSeguro)
        || (motor.recomendacion === 'NO RECOMENDADO' && afirmaSeguro)
        || (motor.seguridad?.nivel === 'SEGURO' && afirmaPeligro);
}

/**
 * Normaliza unidades de velocidad dentro de las cadenas generadas por el Coach a nudos (kt).
 * @param {*} valor
 * @returns {*}
 */
export function normalizarUnidadesCoach(valor) {
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

/**
 * Renderiza la tarjeta visual completa del Coach Pro en el DOM.
 * @param {Object} coach
 * @param {string} fuente
 * @param {string} userLvl
 * @param {Object|null} motor
 */
export function renderizarCoachProCard(coach, fuente, userLvl, motor = null) {
    const bodyCont = document.getElementById('proCoachBody');
    const badgeLvl = document.getElementById('proCoachLevelBadge');
    const badgeScore = document.getElementById('proCoachScoreBadge');
    if (!bodyCont || !coach) return;
    if (motor && (motor.alertaEmergenciaActiva || motor.recomendacion === 'NO RECOMENDADO' || motor.tormentaElectrica || motor.analysisConfidence < 40)) {
        renderizarCoachProFallbackLocal({ motorExperto: motor }, userLvl);
        return;
    }

    const score = motor?.seguridad?.score
        ?? Math.max(0, Math.min(100, Math.round(Number(coach.score) || 70)));
    if (motor) {
        coach = {
            ...coach,
            score,
            veredicto: `${ICONOS_SEGURIDAD[motor.seguridad?.nivel] || '🟢'} ${motor.seguridad?.nivel || 'SEGURO'}`,
            resumen: coach.resumen || motor.mensaje,
            seguridad_estrategia: [...(motor.factoresCriticos || []), `${ICONOS_DERIVA[motor.riesgoDeriva?.nivel] || '🟢'} Deriva ${motor.riesgoDeriva?.nivel || 'BAJO'} (${motor.riesgoDeriva?.score || 10}/100): ${motor.riesgoDeriva?.descripcion || ''}`]
        };
    }

    let scoreBarBg = "bg-emerald-500";
    if (score < 45) {
        scoreBarBg = "bg-rose-500";
    } else if (score < 75) {
        scoreBarBg = "bg-amber-500";
    }

    if (badgeLvl) badgeLvl.textContent = `Nivel: ${userLvl || 'Intermedio'}`;
    actualizarBadgeSeguridadCoach(badgeScore, score, false);

    // 1. RECOMENDACIÓN PRINCIPAL ÚNICA DEL INSTRUCTOR
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
        ? [motor.mensaje, ...(motor.factoresCriticos || []), motor.riesgoDeriva?.descripcion, consejoPrincipal].filter(Boolean)
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
            <p class="text-xs text-slate-200 leading-relaxed">${esc(zona.orografia || '')}</p>

            <!-- Peligros Locales Detectados -->
            <div class="bg-slate-800/70 rounded-xl p-3 border border-amber-500/20 flex flex-col gap-1.5 mt-1">
                <span class="text-[11px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1 border-b border-slate-700/50 pb-1">
                    <span>⚠️</span> Peligros y Precauciones Náuticas
                </span>
                <ul class="flex flex-col gap-1.5 mt-1">
                    ${peligrosHtml}
                </ul>
            </div>

            ${zona.recomendacion_seguridad ? `
            <div class="bg-slate-900/80 p-2.5 rounded-xl border border-slate-700/60 text-[11px] text-slate-300 flex items-start gap-2">
                <span class="text-sky-400 shrink-0 text-sm">🧭</span>
                <span class="leading-relaxed"><strong>Directiva Costera:</strong> ${esc(zona.recomendacion_seguridad)}</span>
            </div>` : ''}
        </div>

        <!-- Grid de Técnicas & Material -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <!-- Técnica & Postura -->
            <div class="bg-slate-800/70 rounded-2xl p-3.5 border border-teal-500/20 flex flex-col gap-2">
                <span class="text-[11px] font-black uppercase tracking-wider text-teal-400 flex items-center gap-1.5 border-b border-slate-700/50 pb-1.5">
                    <span>🏄</span> Técnica & Postura Adaptada
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

/**
 * Fallback local heurístico inmediato para el Coach Pro (0ms de latencia).
 * @param {Object} cond Condiciones meteorológicas o motor experto
 * @param {string} userLvl
 * @param {Array} [tramosData=[]]
 */
export function renderizarCoachProFallbackLocal(cond, userLvl, tramosData = []) {
    const motor = cond?.motorExperto || (typeof window.obtenerMotorExperto === 'function' ? window.obtenerMotorExperto(cond, userLvl) : null);

    // 0. PRIORIDAD ABSOLUTA: Veto por alerta oficial de emergencias (112 / Protección Civil / Aviso Especial)
    if (motor?.alertaEmergenciaActiva) {
        const body = document.getElementById('proCoachBody');
        const badgeScore = document.getElementById('proCoachScoreBadge');
        actualizarBadgeSeguridadCoach(badgeScore, 0, true, '🚨');
        if (body) {
            body.innerHTML = generarTarjetaVetoCoach({
                icono: '🚨',
                titulo: '⛔ PROHIBIDO SALIR A REMAR POR SITUACIÓN DE EMERGENCIA',
                descripcion: 'Existe una alerta oficial activa emitida por Protección Civil / 112. Las condiciones marítimas presentan un riesgo inaceptable para la vida humana (corrientes de arrastre, oleaje y dificultades extremas para rescates marítimos).',
                tipoConsejo: 'Directiva del Instructor ISA',
                consejo: 'Salida totalmente prohibida. Permanece en tierra firme bajo resguardo y atiende a las comunicaciones de las autoridades locales.',
                nivelAlerta: 'critico'
            });
        }
        return;
    }

    // 1. PRIORIDAD MÁXIMA: Veto por tormenta eléctrica
    if (motor?.tormentaElectrica) {
        const body = document.getElementById('proCoachBody');
        if (body) {
            body.innerHTML = generarTarjetaVetoCoach({
                icono: '⛈️',
                titulo: '⛔ NO RECOMENDADO SALIR A REMAR',
                descripcion: 'Existe riesgo confirmado de tormenta eléctrica en la zona. Aunque otros parámetros puedan parecer favorables, las descargas eléctricas y los cambios bruscos del viento convierten la actividad en una situación de riesgo vital inaceptable.',
                tipoConsejo: 'Consejo del Instructor',
                consejo: 'Cancela la salida de inmediato y permanece bajo techo en tierra firme.',
                nivelAlerta: 'tormenta'
            });
        }
        return;
    }

    // 2. GENERACIÓN DEL COACH INSTRUCTOR PROFESIONAL ISA (0ms)
    const coachLocal = generarConsejoCoach({
        condiciones: cond,
        userLevel: userLvl,
        motor,
        tramosData,
        ubicacion: cond?.ubicacion || 'Spot de Costa'
    });

    renderizarCoachProCard(coachLocal, "PaddleSafe Coach ISA", userLvl, motor);
}

/**
 * Solicita el análisis del Coach IA Pro para una ruta planificada o spot con tramos.
 */
export async function solicitarCoachIAPro(dx, userLvl, distMetros, tiempoMinutos, lat, lon, fechaD, horaSalida, tramosData = [], motor = null) {
    if (!motor && typeof window.obtenerMotorExperto === 'function') {
        motor = window.obtenerMotorExperto(dx, userLvl);
    }
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
            vientoNudos: motor?.vientoNudos ?? (windKmh ? kmhANudos(windKmh) : null),
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
        seguridad: motor?.seguridad,
        analysisConfidence: motor?.analysisConfidence,
        recomendacion: motor?.recomendacion,
        riesgoDeriva: motor?.riesgoDeriva,
        factoresCriticos: motor?.factoresCriticos
    };

    // 1. RENDERIZADO INMEDIATO (0ms): Sin tiempos de espera ni bloqueos ("pensando")
    renderizarCoachProFallbackLocal({ ...payload.condiciones, motorExperto: motor }, userLvl, tramosData);
    if (motor && (motor.alertaEmergenciaActiva || motor.recomendacion === 'NO RECOMENDADO' || motor.tormentaElectrica || (motor.analysisConfidence && motor.analysisConfidence < 40))) return;

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

/**
 * Solicita el análisis del Coach Básico para la vista inicial del spot.
 */
export async function solicitarCoachIABasico(dx, userLvl, loc, motor = null) {
    if (!motor && typeof window.obtenerMotorExperto === 'function') {
        motor = window.obtenerMotorExperto(dx, userLvl);
    }
    const cont = document.getElementById('basicCoachContainer');
    if (!cont) return;

    cont.classList.remove('hidden');

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
            vientoNudos: motor?.vientoNudos ?? (vientoKmh ? kmhANudos(vientoKmh) : null),
            rachasNudos: kmhANudos(rachasKmh),
            direccion: direccionViento,
            componenteViento: dx.componenteViento ?? dx.windComponent ?? motor?.derivaCostera?.componente ?? null,
            oleaje: wv === null ? null : Number(wv.toFixed(1)),
            periodo: Number(dx.wavePeriod || 0),
            tempAire: dx.tempAire || "N/D",
            tempAgua: dx.tempAgua || "N/D",
            lluvia: Number(dx.precipitation || 0),
            precipProb: Number(dx.precipProbability || 0),
            ubicacion: loc || "Spot de Costa"
        },
        userLevel: userLvl || "Intermedio",
        seguridad: motor?.seguridad,
        analysisConfidence: motor?.analysisConfidence,
        recomendacion: motor?.recomendacion,
        riesgoDeriva: motor?.riesgoDeriva,
        factoresCriticos: motor?.factoresCriticos
    };

    // 2. RENDERIZADO INMEDIATO DEL COACH PROFESIONAL ISA (0ms)
    const coachLocal = generarConsejoCoach({
        condiciones: payload.condiciones,
        userLevel: userLvl,
        motor,
        ubicacion: loc
    });

    const renderizarContenidoBasico = (coach, fuente = "PaddleSafe Coach ISA") => {
        const score = motor?.seguridad?.score ?? 85;
        let scoreCls = score >= 75 ? "text-emerald-400" : (score >= 45 ? "text-amber-400" : "text-rose-400");
        const nivelSeg = motor?.seguridad?.nivel || 'SEGURO';

        // 1. RECOMENDACIÓN PRINCIPAL ÚNICA DEL INSTRUCTOR
        const consejoPrincipal = coach.consejo_instructor || coach.regla_oro || null;

        cont.innerHTML = `
            <div class="flex flex-col gap-2.5">
                <div class="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div class="flex items-center gap-1.5">
                        <span class="text-base">🏄‍♂️</span>
                        <span class="font-black text-emerald-300 text-xs uppercase tracking-wider">Coach Instructor (${esc(userLvl || 'Intermedio')})</span>
                    </div>
                    <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 ${scoreCls} border border-slate-700 font-bold">${ICONOS_SEGURIDAD[nivelSeg] || '🟢'} ${esc(nivelSeg)} · ${score}/100</span>
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
    if (motor && (motor.alertaEmergenciaActiva || motor.recomendacion === 'NO RECOMENDADO' || motor.tormentaElectrica || (motor.analysisConfidence && motor.analysisConfidence < 40))) return;

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

/**
 * Solicita el análisis post-actividad del Coach Inteligente de Ruta Deportiva.
 * @param {string|number} rutaId
 */
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

    const distKm = Number(ruta?.distance_km || ruta?.distancia_km || mapRuntime.trackDistanceKm || window.trackDistanceKm || 0);
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

/**
 * Fallback heurístico local para el análisis post-actividad de ruta deportiva.
 * @param {Object} p Telemetría y parámetros de la ruta
 * @returns {Object} { bien, mejora, proxima_salida }
 */
export function generarAnalisisIARutaFallback(p) {
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

