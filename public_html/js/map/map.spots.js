// ==============================================================================
// PADDLESAFE NEXT-GEN - MAP SPOTS, COMPARATOR & INTELLIGENCE MODULE (map.spots.js)
// Strangler Fig Pattern: Extracted from map.js to modularize spot management,
// live crowd reports (Waze for SUP), 24h daytime timeline scrubber,
// spot comparator, historical smart match, thermal bias, and conditions logbook.
// ==============================================================================

import { supabaseClient, appState, BACKEND_API_URL } from '../config.js';
import {
    fetchConTimeout,
    esc,
    kmhANudos,
    deduplicateInsights,
    calcularSolYCrepusculo,
    formatearTiempo,
    resolverOrientacionCostera,
    calcularComponenteVientoAuto,
    generarVeredictoNextGen,
    detectarVentanasOptimas
} from '../utils.js';
import { generarPerfilTacticoSpot } from '../engine/coastal.js';
import { mapRuntime } from './map.state.js';
import {
    valorNumericoMeteo,
    solicitarPronostico,
    solicitarPronosticoOpenMeteo,
    obtenerMotorExperto,
    renderizarAvisoSuperior,
    extraerDatosHoraPronostico,
    escanearMejoresVentanas72h
} from './map.weather.js';
import { solicitarCoachIABasico } from './map.coach.js';
import { recuperarEquipoUsuario, actualizarTipoTablaDesdeSelect } from './map.core.js';
import { renderizarMejoresVentanas72h } from './map.bento.js';

// ==============================================================================
// RUNTIME STATE & LIVE BINDING SYNCHRONIZATION
// ==============================================================================

export let spotsGuardadosMemoria = mapRuntime.spotsGuardadosMemoria || [];
export let spotActivoActual = mapRuntime.spotActivoActual || null;
export let pronosticoDiaCompletoActual = mapRuntime.pronosticoDiaCompletoActual || null;
export let horaSeleccionadaTimeline = mapRuntime.horaSeleccionadaTimeline || null;
export let reportesSpotActivo = mapRuntime.reportesSpotActivo || [];
export let biasSeleccionadoLogbook = mapRuntime.biasSeleccionadoLogbook || 'exacto';
export let ratingSeleccionadoLogbook = mapRuntime.ratingSeleccionadoLogbook || 5;
export let timelinePlaybackTimer = null;

function syncStateToRuntime() {
    mapRuntime.spotsGuardadosMemoria = spotsGuardadosMemoria;
    mapRuntime.spotActivoActual = spotActivoActual;
    mapRuntime.pronosticoDiaCompletoActual = pronosticoDiaCompletoActual;
    mapRuntime.horaSeleccionadaTimeline = horaSeleccionadaTimeline;
    mapRuntime.reportesSpotActivo = reportesSpotActivo;
    mapRuntime.biasSeleccionadoLogbook = biasSeleccionadoLogbook;
    mapRuntime.ratingSeleccionadoLogbook = ratingSeleccionadoLogbook;

    if (typeof window !== 'undefined') {
        window.spotsGuardadosMemoria = spotsGuardadosMemoria;
        window.spotActivoActual = spotActivoActual;
        window.pronosticoDiaCompletoActual = pronosticoDiaCompletoActual;
        window.horaSeleccionadaTimeline = horaSeleccionadaTimeline;
        window.reportesSpotActivo = reportesSpotActivo;
        window.biasSeleccionadoLogbook = biasSeleccionadoLogbook;
        window.ratingSeleccionadoLogbook = ratingSeleccionadoLogbook;
    }
}

export function setSpotActivoActual(val) {
    spotActivoActual = val;
    syncStateToRuntime();
    return val;
}

export function setPronosticoDiaCompletoActual(val) {
    pronosticoDiaCompletoActual = val;
    syncStateToRuntime();
    return val;
}

export function setSpotsGuardadosMemoria(val) {
    spotsGuardadosMemoria = val;
    syncStateToRuntime();
    return val;
}

export function setHoraSeleccionadaTimeline(val) {
    horaSeleccionadaTimeline = val;
    syncStateToRuntime();
    return val;
}

export function setReportesSpotActivo(val) {
    reportesSpotActivo = val;
    syncStateToRuntime();
    return val;
}


// ==============================================================================
// VISUAL DESIGN SYSTEM: BENTO GLOW & VERDICT UTILS
// ==============================================================================

function aplicarGlowVerdictBento(el, score) {
    if (!el) return;
    el.classList.remove('ps-glass-glow-emerald', 'ps-glass-glow-amber', 'ps-glass-glow-rose');
    if (score === null || score === undefined || isNaN(Number(score))) return;
    const num = Number(score);
    if (num >= 80) {
        el.classList.add('ps-glass-glow-emerald');
    } else if (num >= 50) {
        el.classList.add('ps-glass-glow-amber');
    } else {
        el.classList.add('ps-glass-glow-rose');
    }
}

// ==============================================================================
// 1. REPORTES EN VIVO DEL SPOT (WAZE FOR SUP)
// ==============================================================================

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
    const lat = Number(spotActivoActual?.lat || mapRuntime.latitudActual);
    const lon = Number(spotActivoActual?.lon || mapRuntime.longitudActual);

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
                <button type="button" onclick="window.cerrarModalReporteSpot()" class="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white font-bold cursor-pointer">&times;</button>
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
                <button type="button" onclick="window.cerrarModalReporteSpot()" class="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase rounded-xl transition-all cursor-pointer">
                    Cancelar
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    window._tagReporteSeleccionado = REPORT_TAGS_SPOT[0];
}

export function cerrarModalReporteSpot() {
    const modal = document.getElementById('modalReporteSpot');
    if (modal) modal.remove();
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
export const seleccionarTagReporteSpot = seleccionarTagReporte;

export async function confirmarEnvioReporteSpot(spotNombre, lat, lon) {
    const tag = window._tagReporteSeleccionado || REPORT_TAGS_SPOT[0];
    const comEl = document.getElementById('reportComment');
    const comentario = comEl ? comEl.value.trim() : '';

    await enviarReporteSpot(spotNombre, lat, lon, tag, comentario);
    cerrarModalReporteSpot();
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
    const currentMap = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);

    const reportesCercanos = todosReportes.filter(r => {
        const ts = new Date(r.created_at).getTime();
        if (ahora - ts > cuatroHorasMs) return false;
        if (!currentMap || typeof L === 'undefined') return false;
        const distM = L.latLng(latNum, lonNum).distanceTo(L.latLng(Number(r.lat), Number(r.lon)));
        return distM <= 5000;
    });

    reportesSpotActivo = reportesCercanos;
    syncStateToRuntime();

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

    if (mapRuntime.marcadorReporteSpot && currentMap) {
        currentMap.removeLayer(mapRuntime.marcadorReporteSpot);
        mapRuntime.marcadorReporteSpot = null;
    }

    if (reportesCercanos.length > 0 && currentMap && typeof L !== 'undefined') {
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

        const mk = L.marker([Number(rReciente.lat), Number(rReciente.lon)], {
            icon: iconCrowd,
            zIndexOffset: 350
        }).addTo(currentMap);

        mk.bindPopup(`
            <div class="text-xs font-sans">
                <b class="text-amber-600">${esc(rReciente.tag)}</b><br>
                ${rReciente.comentario ? `<span>"${esc(rReciente.comentario)}"</span><br>` : ''}
                <small class="text-slate-500">Por ${esc(rReciente.autor_nombre || 'Paddler')} · Coords: ${Number(rReciente.lat).toFixed(4)}, ${Number(rReciente.lon).toFixed(4)}</small>
            </div>
        `);
        mapRuntime.marcadorReporteSpot = mk;
    }
}

// ==============================================================================
// 2. GESTOR DE SPOTS FAVORITOS
// ==============================================================================

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
    syncStateToRuntime();
    renderizarBarraSpotsGuardados();
    actualizarEstadoBotonGuardarSpot();

    // Auto-apertura única del Asistente de Configuración si el usuario no tiene spots y no lo ha descartado
    if (spots.length === 0 && typeof window !== 'undefined' && !localStorage.getItem('ps_quick_setup_dismissed')) {
        setTimeout(() => {
            if (spotsGuardadosMemoria.length === 0 && !localStorage.getItem('ps_quick_setup_dismissed')) {
                abrirAsistenteConfiguracion();
            }
        }, 1200);
    }

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
    const currentLat = Number(mapRuntime.latitudActual);
    const currentLon = Number(mapRuntime.longitudActual);

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
export const renderizarListaSpotsGuardadosModal = renderizarBarraSpotsGuardados;

export function abrirModalSpotsGuardados() {
    const el = document.getElementById('savedSpotsBar');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
}

export function cerrarModalSpotsGuardados() {
    // No-op or collapse panel if bar is open
}

export function actualizarEstadoBotonGuardarSpot() {
    const btn = document.getElementById('btnToggleSaveSpot');
    const icon = document.getElementById('btnToggleSaveSpotIcon');
    const text = document.getElementById('btnToggleSaveSpotText');
    if (!btn || !icon || !text) return;

    const locVal = document.getElementById('location')?.value?.trim().toLowerCase();
    const lat = Number(mapRuntime.latitudActual);
    const lon = Number(mapRuntime.longitudActual);

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
    const lat = Number(mapRuntime.latitudActual);
    const lon = Number(mapRuntime.longitudActual);

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
    syncStateToRuntime();

    const storageKey = userId ? `ps_spots_${userId}` : 'ps_guest_spots';
    try {
        localStorage.setItem(storageKey, JSON.stringify(spotsGuardadosMemoria));
    } catch (e) {
        console.warn('No se pudo guardar spots en localStorage:', e);
    }

    renderizarBarraSpotsGuardados();
    actualizarEstadoBotonGuardarSpot();
}
export const guardarSpotActualEnBBDD = guardarSpotActual;

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

    syncStateToRuntime();
    renderizarBarraSpotsGuardados();
    actualizarEstadoBotonGuardarSpot();
}

// ==============================================================================
// 2.1 PRESETS COSTEROS Y ASISTENTE DE CONFIGURACIÓN RÁPIDA (BATCH #19)
// ==============================================================================

export const PACKS_SPOTS_COSTEROS = {
    costa_blanca_norte: {
        id: 'costa_blanca_norte',
        nombre: '🌊 Marina Alta (Dénia · Jávea · Moraira)',
        descripcion: 'Calas protegidas, aguas cristalinas y acantilados de la Costa Blanca Norte.',
        spots: [
            { nombre: 'Cala Blanca (Jávea)', lat: 38.7681, lon: 0.2078, seaward_deg: 85 },
            { nombre: 'Cala Granadella (Jávea)', lat: 38.7294, lon: 0.1983, seaward_deg: 125 },
            { nombre: 'Cala del Portitxol (Jávea)', lat: 38.7562, lon: 0.2289, seaward_deg: 90 },
            { nombre: 'Les Rotes (Dénia)', lat: 38.8242, lon: 0.1472, seaward_deg: 60 },
            { nombre: 'El Portet (Moraira)', lat: 38.6881, lon: 0.1389, seaward_deg: 160 }
        ]
    },
    alicante_campello: {
        id: 'alicante_campello',
        nombre: '☀️ Alicante · Campello · Tabarca',
        descripcion: 'Playas abiertas, fondos rocosos y travesía insular de referencia.',
        spots: [
            { nombre: 'Coveta Fumà (El Campello)', lat: 38.4411, lon: -0.3603, seaward_deg: 110 },
            { nombre: 'Baños de la Reina (El Campello)', lat: 38.4286, lon: -0.3831, seaward_deg: 120 },
            { nombre: 'Cabo de las Huertas (Alicante)', lat: 38.3569, lon: -0.2167, seaward_deg: 105 },
            { nombre: 'Isla de Tabarca', lat: 38.1656, lon: -0.4736, seaward_deg: 180 }
        ]
    },
    valencia_gandia: {
        id: 'valencia_gandia',
        nombre: '🏖️ Valencia · Cullera · Gandía',
        descripcion: 'Arenales dorados, brisas térmicas y abrigo del cabo de Cullera.',
        spots: [
            { nombre: 'Les Deveses (Oliva/Dénia)', lat: 38.8872, lon: 0.0167, seaward_deg: 65 },
            { nombre: 'Puerto de Gandía', lat: 38.9972, lon: -0.1556, seaward_deg: 90 },
            { nombre: 'Faro de Cullera', lat: 39.1867, lon: -0.2189, seaward_deg: 80 },
            { nombre: 'Malvarrosa (Valencia)', lat: 39.4792, lon: -0.3242, seaward_deg: 85 }
        ]
    },
    baleares_brava: {
        id: 'baleares_brava',
        nombre: '🏝️ Baleares & Costa Brava',
        descripcion: 'Aguas turquesas y calas espectaculares del Mediterráneo.',
        spots: [
            { nombre: 'Cap de Formentor (Mallorca)', lat: 39.9272, lon: 3.1367, seaward_deg: 350 },
            { nombre: 'Cala Galdana (Menorca)', lat: 39.9378, lon: 3.9611, seaward_deg: 200 },
            { nombre: 'Aiguablava (Begur, Costa Brava)', lat: 41.9356, lon: 3.2189, seaward_deg: 100 }
        ]
    }
};

/**
 * Carga un pack costero preconfigurado en los spots favoritos del usuario en 1 tap.
 * @param {string} packId Identificador del pack en PACKS_SPOTS_COSTEROS
 * @returns {Promise<Array>} Lista actualizada de spots guardados
 */
export async function cargarPackSpotsCostero(packId) {
    const pack = PACKS_SPOTS_COSTEROS[packId];
    if (!pack || !Array.isArray(pack.spots)) return spotsGuardadosMemoria;

    const user = appState?.sesionActual?.user;
    const userId = user?.id || null;
    const storageKey = userId ? `ps_spots_${userId}` : 'ps_guest_spots';

    for (const spotInfo of pack.spots) {
        const yaExiste = spotsGuardadosMemoria.some(s =>
            (s.nombre && s.nombre.toLowerCase() === spotInfo.nombre.toLowerCase()) ||
            (Math.abs(s.lat - spotInfo.lat) < 0.003 && Math.abs(s.lon - spotInfo.lon) < 0.003)
        );
        if (!yaExiste) {
            const nuevoSpot = {
                id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('spot_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
                user_id: userId,
                nombre: spotInfo.nombre,
                lat: Number(spotInfo.lat.toFixed(6)),
                lon: Number(spotInfo.lon.toFixed(6)),
                seaward_deg: spotInfo.seaward_deg ?? null,
                orden: spotsGuardadosMemoria.length,
                created_at: new Date().toISOString()
            };
            spotsGuardadosMemoria.push(nuevoSpot);

            if (userId && supabaseClient) {
                try {
                    await supabaseClient.from('user_spots').insert([{
                        user_id: userId,
                        nombre: nuevoSpot.nombre,
                        lat: nuevoSpot.lat,
                        lon: nuevoSpot.lon,
                        seaward_deg: nuevoSpot.seaward_deg,
                        orden: nuevoSpot.orden
                    }]);
                } catch (e) {
                    console.warn('Aviso guardando spot del pack en Supabase:', e);
                }
            }
        }
    }

    syncStateToRuntime();
    try {
        localStorage.setItem(storageKey, JSON.stringify(spotsGuardadosMemoria));
    } catch (e) {
        console.warn('No se pudo guardar spots en localStorage:', e);
    }

    renderizarBarraSpotsGuardados();
    actualizarEstadoBotonGuardarSpot();

    // Si no había spot activo y estamos en navegador con DOM activo, activamos el primer spot
    if (!spotActivoActual && pack.spots.length > 0 && typeof document !== 'undefined' && document.getElementById('location')) {
        const primerSpot = spotsGuardadosMemoria.find(s => s.nombre === pack.spots[0].nombre) || spotsGuardadosMemoria[0];
        if (primerSpot) {
            void seleccionarSpotGuardadoPorId(primerSpot.id || primerSpot.nombre);
        }
    }

    return spotsGuardadosMemoria;
}

export function abrirAsistenteConfiguracion() {
    const modal = document.getElementById('quickSetupModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    const eq = (typeof recuperarEquipoUsuario === 'function') ? recuperarEquipoUsuario() : null;
    const tipo = eq?.tipoTabla || 'rigid_touring';
    seleccionarTablaAsistente(tipo);
}

export function cerrarAsistenteConfiguracion(dismissForever = false) {
    const modal = document.getElementById('quickSetupModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    if (dismissForever) {
        try { localStorage.setItem('ps_quick_setup_dismissed', '1'); } catch (_) {}
    }
}

export function seleccionarTablaAsistente(tipo) {
    if (typeof actualizarTipoTablaDesdeSelect === 'function') {
        actualizarTipoTablaDesdeSelect(tipo);
    }
    const btns = document.querySelectorAll('.quick-board-btn');
    btns.forEach(b => {
        const board = b.getAttribute('data-board');
        if (board === tipo || (tipo === 'inflat_touring' && board === 'rigid_touring')) {
            b.classList.add('border-emerald-500', 'ring-2', 'ring-emerald-400', 'bg-emerald-950/60');
            b.classList.remove('border-slate-700', 'bg-slate-800/80');
        } else {
            b.classList.remove('border-emerald-500', 'ring-2', 'ring-emerald-400', 'bg-emerald-950/60');
            b.classList.add('border-slate-700', 'bg-slate-800/80');
        }
    });
}

export async function cargarPackYFinalizarAsistente(packId) {
    await cargarPackSpotsCostero(packId);
    cerrarAsistenteConfiguracion(true);
}

export async function seleccionarSpotGuardado(spot) {
    if (!spot) return;
    spotActivoActual = spot;
    mapRuntime.latitudActual = Number(spot.lat);
    mapRuntime.longitudActual = Number(spot.lon);
    syncStateToRuntime();

    const locInput = document.getElementById('location');
    if (locInput) locInput.value = spot.nombre;

    const currentMap = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
    if (currentMap && typeof L !== 'undefined') {
        const ll = new L.LatLng(mapRuntime.latitudActual, mapRuntime.longitudActual);
        if (mapRuntime.marcador) mapRuntime.marcador.setLatLng(ll);
        else {
            mapRuntime.marcador = L.marker(ll).addTo(currentMap);
            if (typeof window !== 'undefined') window.marcador = mapRuntime.marcador;
        }
        currentMap.setView(ll, 13);
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

    if (typeof window !== 'undefined' && typeof window.consultarBasico === 'function') {
        await window.consultarBasico();
    }
}

export function seleccionarSpotGuardadoPorId(idOrName) {
    const spot = spotsGuardadosMemoria.find(s => (s.id && s.id === idOrName) || s.nombre === idOrName);
    if (spot) {
        seleccionarSpotGuardado(spot);
    }
}

export function abrirSpotActualEnPlanificadorPro() {
    const ploc = document.getElementById('proLocation');
    const pdate = document.getElementById('proDate');
    const ptime = document.getElementById('proTime');
    const plevel = document.getElementById('proLevelOption');

    const basicDate = document.getElementById('date')?.value;
    const basicLevel = document.getElementById('userLevel')?.value;

    const lat = Number(mapRuntime.latitudActual);
    const lon = Number(mapRuntime.longitudActual);

    if (ploc) ploc.value = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    if (pdate && basicDate) pdate.value = basicDate;
    if (ptime) ptime.value = horaSeleccionadaTimeline || '10:00';
    if (plevel && basicLevel) plevel.value = basicLevel;

    if (typeof window !== 'undefined' && typeof window.togglePanelPro === 'function') {
        window.togglePanelPro(true);
    }

    const panelPro = document.getElementById('panelPro');
    if (panelPro) {
        panelPro.scrollIntoView({ behavior: 'smooth' });
    }

    const currentMap = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
    if (currentMap && typeof L !== 'undefined') {
        const ll = new L.LatLng(lat, lon);
        currentMap.setView(ll, 13);
        if (mapRuntime.marcador) mapRuntime.marcador.setLatLng(ll);
    }
}

// ==============================================================================
// 3. COMPARADOR MULTI-SPOT
// ==============================================================================

export function abrirModalComparadorSpots() {
    const panel = document.getElementById('spotsComparisonPanel');
    if (panel) {
        panel.classList.remove('hidden');
        compararSpotsGuardados();
    }
}

export function cerrarModalComparadorSpots() {
    const panel = document.getElementById('spotsComparisonPanel');
    if (panel) panel.classList.add('hidden');
}

export function seleccionarSpotParaComparar(spotId) {
    seleccionarSpotGuardadoPorId(spotId);
}

export function quitarSpotDeComparacion(spotId) {
    eliminarSpotGuardado(spotId);
    compararSpotsGuardados();
}

export function renderizarTablaComparativaSpots(validos = []) {
    const list = document.getElementById('spotsComparisonList');
    if (!list) return;

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
    const eq = appState?.equipoUsuario || (typeof window !== 'undefined' && typeof window.recuperarEquipoUsuario === 'function' ? window.recuperarEquipoUsuario() : { driftMod: 1.0, tipoTabla: 'All-Round' });

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

    renderizarTablaComparativaSpots(validos);
}

// ==============================================================================
// 4. TIMELINE DIURNO COMPLETO & SCRUBBER 24H INTERACTIVO
// ==============================================================================

export async function cargarJornadaCompletaSpot(spot, fecha, userLevel) {
    if (!spot || !Number.isFinite(Number(spot.lat)) || !Number.isFinite(Number(spot.lon))) return;
    const f = fecha || document.getElementById('date')?.value || new Date().toISOString().split('T')[0];
    const u = userLevel || document.getElementById('userLevel')?.value || 'Intermedio';

    spotActivoActual = spot;
    mapRuntime.latitudActual = Number(spot.lat);
    mapRuntime.longitudActual = Number(spot.lon);
    syncStateToRuntime();

    const currentMap = mapRuntime.map || (typeof window !== 'undefined' ? window.map : null);
    if (currentMap && typeof L !== 'undefined') {
        const ll = new L.LatLng(mapRuntime.latitudActual, mapRuntime.longitudActual);
        if (mapRuntime.marcador) mapRuntime.marcador.setLatLng(ll);
        else {
            mapRuntime.marcador = L.marker(ll).addTo(currentMap);
            if (typeof window !== 'undefined') window.marcador = mapRuntime.marcador;
        }
        currentMap.setView(ll, 13);
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
            syncStateToRuntime();
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
    syncStateToRuntime();
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

    if (typeof renderizarMejoresVentanas72h === 'function') {
        renderizarMejoresVentanas72h(spot, pronostico);
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
            const wDir = Number(h.waveDirDeg ?? dir ?? 0);
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

            const sparkBarColor = score >= 80 ? 'bg-emerald-400' : (score >= 60 ? 'bg-amber-400' : (score >= 40 ? 'bg-orange-500' : 'bg-rose-500'));
            const sparkPct = Math.min(100, Math.max(12, Math.round((r / 25) * 100)));

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
                        <div class="wind-arrow text-emerald-400 w-3.5 h-3.5 shrink-0" style="transform: rotate(${dir}deg);" title="Viento: ${Math.round(dir)}°">
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.25a.75.75 0 0 1 .75.75v16.19l4.72-4.72a.75.75 0 1 1 1.06 1.06l-6 6a.75.75 0 0 1-1.06 0l-6-6a.75.75 0 1 1 1.06-1.06l4.72 4.72V3a.75.75 0 0 1 .75-.75Z" /></svg>
                        </div>
                        <span class="ps-tabular font-mono">${v.toFixed(1)} kt</span>
                        ${hayRacha ? `<span class="text-[10px] text-amber-400 font-mono ps-tabular">(${r.toFixed(1)})</span>` : ''}
                    </div>
                    <div class="flex items-center justify-between text-[11px] text-slate-300 gap-1">
                        <div class="flex items-center gap-1">
                            <div class="swell-arrow text-sky-400 w-3 h-3 shrink-0" style="transform: rotate(${wDir}deg);" title="Oleaje: ${Math.round(wDir)}°">
                                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.25a.75.75 0 0 1 .75.75v16.19l4.72-4.72a.75.75 0 1 1 1.06 1.06l-6 6a.75.75 0 0 1-1.06 0l-6-6a.75.75 0 1 1 1.06-1.06l4.72 4.72V3a.75.75 0 0 1 .75-.75Z" /></svg>
                            </div>
                            <span class="ps-tabular">🌊 ${o.toFixed(1)}m${h.periodoOlaS ? ` · ${Math.round(h.periodoOlaS)}s` : ''}</span>
                        </div>
                        ${h.tempC !== null && h.tempC !== undefined ? `<span class="text-slate-400 font-mono text-[10px] ps-tabular">${Math.round(h.tempC)}°</span>` : ''}
                    </div>
                    ${tagCosta ? `<div class="mt-0.5 flex items-center">${tagCosta}</div>` : ''}
                    <!-- Spark bar de intensidad de rachas / score -->
                    <div class="w-full bg-slate-950/70 rounded-full h-1 mt-1 overflow-hidden" title="Rachas: ${r.toFixed(1)} kt · Score: ${score}/100">
                        <div class="${sparkBarColor} h-full rounded-full transition-all duration-300" style="width: ${sparkPct}%;"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    timelineEl.dataset.haSidoCargado = 'true';
    timelineEl.classList.remove('hidden');
    const ventanasCalc = pronostico.ventanasOptimas || detectarVentanasOptimas(pronostico.horasDiurnas, userLevel);
    const scoreTimeline = ventanasCalc?.mejorVentana?.score ?? pronostico?.score ?? 80;
    aplicarGlowVerdictBento(timelineEl, scoreTimeline);
    renderizarInteligenciaYDiarioSpot(spot, pronostico);
    if (typeof window.cambiarSubVistaSpot === 'function' && window.subVistaSpotActual) {
        window.cambiarSubVistaSpot(window.subVistaSpotActual);
    }
}
export const renderizarScrubber24hSpot = renderizarTimelineJornadaCompleta;

export function seleccionarHoraTimeline(horaStr, doScroll = false) {
    if (!pronosticoDiaCompletoActual || !Array.isArray(pronosticoDiaCompletoActual.horasDiurnas)) return;
    const h = pronosticoDiaCompletoActual.horasDiurnas.find(item => item.hora === horaStr);
    if (!h) return;

    horaSeleccionadaTimeline = horaStr;
    syncStateToRuntime();

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

    actualizarRelojTimelineUI(horaStr);

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
    if (typeof window !== 'undefined' && typeof window.renderizarResumenExperto === 'function') {
        window.renderizarResumenExperto(motor);
    }
    solicitarCoachIABasico(dxHora, u, loc, motor);
    if (typeof window !== 'undefined' && typeof window.renderizarRosaVectoresMapa === 'function') {
        window.renderizarRosaVectoresMapa(Number(mapRuntime.latitudActual), Number(mapRuntime.longitudActual), dxHora);
    }

    if (doScroll) {
        document.getElementById('basicCards')?.scrollIntoView({ behavior: 'smooth' });
    }
}
export const seleccionarHoraScrubber24h = seleccionarHoraTimeline;

export function actualizarRelojTimelineUI(horaStr) {
    const relojEl = document.getElementById('timelineScrubberClock');
    if (relojEl) {
        relojEl.textContent = horaStr || '--:--';
    }
}

export function reproducirTimeline24hSpot() {
    if (timelinePlaybackTimer) {
        pausarTimeline24hSpot();
        return;
    }
    if (!pronosticoDiaCompletoActual || !Array.isArray(pronosticoDiaCompletoActual.horasDiurnas) || pronosticoDiaCompletoActual.horasDiurnas.length === 0) {
        return;
    }

    const horas = pronosticoDiaCompletoActual.horasDiurnas.map(h => h.hora);
    let currentIdx = horas.indexOf(horaSeleccionadaTimeline);
    if (currentIdx === -1 || currentIdx >= horas.length - 1) currentIdx = 0;
    else currentIdx++;

    seleccionarHoraTimeline(horas[currentIdx], false);

    const btnPlay = document.getElementById('btnPlayTimeline24h');
    if (btnPlay) {
        btnPlay.innerHTML = '⏸️ Pausar';
        btnPlay.classList.add('bg-amber-600', 'text-white');
    }

    timelinePlaybackTimer = setInterval(() => {
        currentIdx = (currentIdx + 1) % horas.length;
        seleccionarHoraTimeline(horas[currentIdx], false);
    }, 1500);
}

export function pausarTimeline24hSpot() {
    if (timelinePlaybackTimer) {
        clearInterval(timelinePlaybackTimer);
        timelinePlaybackTimer = null;
    }
    const btnPlay = document.getElementById('btnPlayTimeline24h');
    if (btnPlay) {
        btnPlay.innerHTML = '▶️ Reproducir';
        btnPlay.classList.remove('bg-amber-600');
    }
}

export function alternarPlayTimeline24hSpot() {
    if (timelinePlaybackTimer) {
        pausarTimeline24hSpot();
    } else {
        reproducirTimeline24hSpot();
    }
}

// ==============================================================================
// 5. SPOT INTELLIGENCE, SMART MATCH & CONDITIONS LOGBOOK (BATCH #17)
// ==============================================================================

export function calcularDistanciaGeodesicaKm(lat1, lon1, lat2, lon2) {
    if (!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) return Infinity;
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export function analizarHistorialYSmartMatchSpot(lat, lon, spotNombre = '', meteoHoy = {}, rutasExternas = null) {
    const latNum = Number(lat);
    const lonNum = Number(lon);
    const nombreNorm = String(spotNombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    const routesMap = new Map();
    if (Array.isArray(rutasExternas)) {
        rutasExternas.forEach(r => { if (r && (r.id || r.ruta_id)) routesMap.set(String(r.id || r.ruta_id), r); });
    }
    if (typeof window !== 'undefined' && window.__rutasUsuarioCache instanceof Map) {
        window.__rutasUsuarioCache.forEach((r, k) => { if (r && (r.id || k)) routesMap.set(String(r.id || k), r); });
    }
    if (typeof window !== 'undefined' && window.socialRoutesCache && typeof window.socialRoutesCache === 'object') {
        Object.values(window.socialRoutesCache).forEach(r => { if (r && (r.id || r.ruta_id)) routesMap.set(String(r.id || r.ruta_id), r); });
    }
    try {
        if (typeof localStorage !== 'undefined') {
            const stored = JSON.parse(localStorage.getItem('ps_user_routes_cache') || '[]');
            if (Array.isArray(stored)) {
                stored.forEach(r => { if (r && (r.id || r.ruta_id)) routesMap.set(String(r.id || r.ruta_id), r); });
            }
        }
    } catch (_) {}

    const todasLasRutas = Array.from(routesMap.values());
    const matchedRoutes = [];

    for (const r of todasLasRutas) {
        let coincide = false;
        const rNom = String(r.nombre || r.titulo || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const rUbic = String(r.ubicacion || r.spot_nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (nombreNorm.length >= 3 && (rNom.includes(nombreNorm) || rUbic.includes(nombreNorm) || (nombreNorm.includes(rNom) && rNom.length >= 4))) {
            coincide = true;
        }

        if (!coincide && Number.isFinite(latNum) && Number.isFinite(lonNum)) {
            let rLat = Number(r.lat ?? r.latitude ?? r.inicio_lat);
            let rLon = Number(r.lon ?? r.longitude ?? r.inicio_lon);

            if (!Number.isFinite(rLat) && Array.isArray(r.puntos) && r.puntos.length > 0) {
                const pt = r.puntos[0];
                rLat = Number(Array.isArray(pt) ? pt[0] : (pt.lat || pt.latitude));
                rLon = Number(Array.isArray(pt) ? pt[1] : (pt.lng || pt.lon || pt.longitude));
            } else if (!Number.isFinite(rLat) && Array.isArray(r.coordenadas) && r.coordenadas.length > 0) {
                const pt = r.coordenadas[0];
                rLat = Number(Array.isArray(pt) ? pt[0] : (pt.lat || pt.latitude));
                rLon = Number(Array.isArray(pt) ? pt[1] : (pt.lng || pt.lon || pt.longitude));
            }

            if (Number.isFinite(rLat) && Number.isFinite(rLon)) {
                const dKm = calcularDistanciaGeodesicaKm(latNum, lonNum, rLat, rLon);
                if (dKm <= 4.5) {
                    coincide = true;
                }
            }
        }

        if (coincide) {
            matchedRoutes.push(r);
        }
    }

    if (matchedRoutes.length === 0) {
        return {
            totalSesionesSpot: 0,
            totalKmSpot: 0,
            mejorRitmoKmh: 0,
            mejorRutaId: null,
            smartMatch: null
        };
    }

    let totalKm = 0;
    let maxVel = 0;
    let mejorRutaId = null;

    matchedRoutes.forEach(r => {
        const d = Number(r.distancia_km || r.distanciaKm || (r.distancia_m ? r.distancia_m / 1000 : 0)) || 0;
        totalKm += d;
        const vel = Number(r.velocidad_media_kmh || r.velocidad_media || r.ritmo_kmh || (r.duracion_seg && d > 0 ? (d / (r.duracion_seg / 3600)) : 0)) || 0;
        if (vel > maxVel) {
            maxVel = vel;
            mejorRutaId = r.id || r.ruta_id;
        }
    });

    const hoyViento = Number(meteoHoy.vientoKt || meteoHoy.windKnots || 8);
    const hoyOlas = Number(meteoHoy.olasM || meteoHoy.waveHeight || 0.4);

    let bestDelta = Infinity;
    let smartMatch = null;

    matchedRoutes.forEach(r => {
        const rViento = Number(r.meteo_viento_kt ?? r.viento_kt ?? (r.meteo?.windKnots) ?? 8);
        const rOlas = Number(r.meteo_olas_m ?? r.olas_m ?? (r.meteo?.waveHeight) ?? 0.4);
        const delta = Math.abs(rViento - hoyViento) + Math.abs(rOlas - hoyOlas) * 10;
        if (delta < bestDelta) {
            bestDelta = delta;
            smartMatch = {
                rutaId: r.id || r.ruta_id,
                fecha: r.fecha || (r.created_at ? r.created_at.slice(0, 10) : 'Sesión pasada'),
                distKm: Number((r.distancia_km || (r.distancia_m ? r.distancia_m / 1000 : 0) || 0).toFixed(1)),
                velMedia: Number((r.velocidad_media_kmh || (r.duracion_seg && r.distancia_km ? (r.distancia_km / (r.duracion_seg / 3600)) : 0) || 4.5).toFixed(1)),
                vientoKt: rViento,
                olasM: rOlas,
                nombre: r.nombre || 'Sesión en este spot',
                delta: Math.round(delta * 10) / 10
            };
        }
    });

    return {
        totalSesionesSpot: matchedRoutes.length,
        totalKmSpot: Number(totalKm.toFixed(1)),
        mejorRitmoKmh: Number(maxVel.toFixed(1)),
        mejorRutaId,
        smartMatch
    };
}

export function calcularSesgoTermicoSpot(spotNombre = '', lat = null, lon = null, entries = []) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return { hasThermalBias: false, masVientoCount: 0, totalEntries: 0, msg: null };
    }
    const nombreNorm = String(spotNombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const spotEntries = entries.filter(e => {
        if (!e) return false;
        const eNom = String(e.spot_nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
        if (nombreNorm.length >= 3 && eNom.includes(nombreNorm)) return true;
        if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lon)) && Number.isFinite(Number(e.lat)) && Number.isFinite(Number(e.lon))) {
            return calcularDistanciaGeodesicaKm(Number(lat), Number(lon), Number(e.lat), Number(e.lon)) <= 4.5;
        }
        return false;
    });

    if (spotEntries.length === 0) {
        return { hasThermalBias: false, masVientoCount: 0, totalEntries: 0, msg: null };
    }

    const masVientoCount = spotEntries.filter(e => e.viento_real_bias === 'mas_viento').length;
    const ratio = masVientoCount / spotEntries.length;

    if (masVientoCount >= 2 || (spotEntries.length >= 2 && ratio >= 0.5)) {
        return {
            hasThermalBias: true,
            masVientoCount,
            totalEntries: spotEntries.length,
            msg: `🧠 Inteligencia Local: En este spot sueles registrar +3 a +5 kt más de viento térmico que el modelo oficial (${masVientoCount} de ${spotEntries.length} entradas en bitácora).`
        };
    }

    return {
        hasThermalBias: false,
        masVientoCount,
        totalEntries: spotEntries.length,
        msg: null
    };
}

export function toggleFormBitacoraSpot(forceOpen) {
    const panel = document.getElementById('spotLogbookFormPanel');
    if (!panel) return;
    const shouldOpen = forceOpen !== undefined ? forceOpen : panel.classList.contains('hidden');
    if (shouldOpen) {
        panel.classList.remove('hidden');
        panel.classList.add('flex');
    } else {
        panel.classList.add('hidden');
        panel.classList.remove('flex');
    }
}
export const abrirModalLogbookCondicion = () => toggleFormBitacoraSpot(true);
export const cerrarModalLogbookCondicion = () => toggleFormBitacoraSpot(false);

export function seleccionarBiasLogbook(bias) {
    biasSeleccionadoLogbook = bias;
    syncStateToRuntime();
    const group = document.getElementById('spotBiasSelectorGroup');
    if (group) {
        const btns = group.querySelectorAll('button[data-bias]');
        btns.forEach(btn => {
            if (btn.getAttribute('data-bias') === bias) {
                btn.classList.add('ps-chip-active');
            } else {
                btn.classList.remove('ps-chip-active');
            }
        });
    }
}
export const seleccionarBiasSpot = seleccionarBiasLogbook;

export function setLogbookRating(rating) {
    ratingSeleccionadoLogbook = Math.max(1, Math.min(5, Number(rating) || 5));
    syncStateToRuntime();
    const group = document.getElementById('spotRatingStarsGroup');
    if (group) {
        const stars = group.querySelectorAll('button');
        stars.forEach((star, i) => {
            const active = (i < ratingSeleccionadoLogbook);
            star.textContent = active ? '⭐' : '☆';
            star.style.opacity = active ? '1' : '0.35';
            if (active) {
                star.classList.add('scale-110');
            } else {
                star.classList.remove('scale-110');
            }
        });
        const label = document.getElementById('spotLogbookRatingLabel');
        if (label) label.textContent = `${ratingSeleccionadoLogbook}/5`;
    }
}
export const seleccionarRatingLogbook = setLogbookRating;

export async function guardarEntradaBitacoraSpot(datosEntrada) {
    const spot = spotActivoActual || {};
    const userId = appState?.sesionActual?.user?.id || null;
    const lat = Number(datosEntrada?.lat ?? spot.lat ?? mapRuntime.latitudActual);
    const lon = Number(datosEntrada?.lon ?? spot.lon ?? mapRuntime.longitudActual);
    const spotNombre = datosEntrada?.spot_nombre || spot.nombre || document.getElementById('location')?.value?.split(',')[0]?.trim() || 'Spot';

    const nuevaEntrada = {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `log_${Date.now()}`,
        user_id: userId,
        spot_nombre: spotNombre,
        lat,
        lon,
        fecha: datosEntrada?.fecha || new Date().toISOString().slice(0, 10),
        viento_previsto_kt: datosEntrada?.viento_previsto_kt ?? (mapRuntime.datosMeteoActuales?.windSpeed ? kmhANudos(mapRuntime.datosMeteoActuales.windSpeed * 3.6) : null),
        viento_real_bias: datosEntrada?.viento_real_bias || biasSeleccionadoLogbook || 'exacto',
        olas_m: datosEntrada?.olas_m ?? (mapRuntime.datosMeteoActuales?.waveHeight ?? null),
        rating: Math.max(1, Math.min(5, Number(datosEntrada?.rating ?? ratingSeleccionadoLogbook ?? 5))),
        notas: (datosEntrada?.notas ?? document.getElementById('inputNotaBitacoraSpot')?.value ?? '').trim(),
        ruta_id: datosEntrada?.ruta_id || null,
        created_at: new Date().toISOString()
    };

    try {
        const localLogs = JSON.parse(localStorage.getItem('ps_spot_logbook') || '[]');
        localLogs.unshift(nuevaEntrada);
        localStorage.setItem('ps_spot_logbook', JSON.stringify(localLogs.slice(0, 100)));
    } catch (_) {}

    if (userId && supabaseClient) {
        try {
            const { error } = await supabaseClient
                .from('spot_logbook')
                .insert([{
                    user_id: userId,
                    spot_nombre: nuevaEntrada.spot_nombre,
                    lat: nuevaEntrada.lat,
                    lon: nuevaEntrada.lon,
                    fecha: nuevaEntrada.fecha,
                    viento_previsto_kt: nuevaEntrada.viento_previsto_kt,
                    viento_real_bias: nuevaEntrada.viento_real_bias,
                    olas_m: nuevaEntrada.olas_m,
                    rating: nuevaEntrada.rating,
                    notas: nuevaEntrada.notas,
                    ruta_id: nuevaEntrada.ruta_id
                }]);
            if (error) {
                console.warn('Aviso no crítico al guardar en spot_logbook:', error.message);
            }
        } catch (err) {
            console.warn('Aviso al conectar con Supabase para spot_logbook:', err);
        }
    }

    const inputEl = document.getElementById('inputNotaBitacoraSpot');
    if (inputEl) inputEl.value = '';
    toggleFormBitacoraSpot(false);

    renderizarInteligenciaYDiarioSpot(spot, pronosticoDiaCompletoActual || mapRuntime.datosMeteoActuales);
    return nuevaEntrada;
}
export const guardarEntradaLogbookCondicion = guardarEntradaBitacoraSpot;

export async function cargarBitacoraSpot(spotId, lat, lon) {
    let logs = [];
    const userId = appState?.sesionActual?.user?.id;
    if (userId && supabaseClient) {
        try {
            let q = supabaseClient.from('spot_logbook').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
            if (spotId) q = q.eq('spot_id', spotId);
            const { data, error } = await q;
            if (!error && Array.isArray(data)) {
                logs = data;
            }
        } catch (e) {
            console.warn('Aviso leyendo spot_logbook de Supabase:', e);
        }
    }
    if (logs.length === 0) {
        try {
            logs = JSON.parse(localStorage.getItem('ps_spot_logbook') || '[]');
        } catch (_) {}
    }
    return logs;
}

export function abrirModalNotasTacticasSpot() {
    const modal = document.getElementById('modalNotasTacticasSpot');
    if (!modal) return;
    const spot = spotActivoActual || {};
    const inputNotas = document.getElementById('inputSpotNotasTacticas');
    const inputAcceso = document.getElementById('inputSpotAccesoParking');
    const inputPeligros = document.getElementById('inputSpotPeligrosLocales');

    if (inputNotas) inputNotas.value = spot.notas_tacticas || '';
    if (inputAcceso) inputAcceso.value = spot.acceso_parking || '';
    if (inputPeligros) inputPeligros.value = spot.peligros_locales || '';

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

export function cerrarModalNotasTacticasSpot() {
    const modal = document.getElementById('modalNotasTacticasSpot');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

export async function confirmarGuardarNotasTacticas() {
    const inputNotas = document.getElementById('inputSpotNotasTacticas');
    const inputAcceso = document.getElementById('inputSpotAccesoParking');
    const inputPeligros = document.getElementById('inputSpotPeligrosLocales');

    const notas = {
        notas_tacticas: inputNotas?.value?.trim() || '',
        acceso_parking: inputAcceso?.value?.trim() || '',
        peligros_locales: inputPeligros?.value?.trim() || ''
    };

    await guardarNotasTacticasSpot(spotActivoActual?.id, notas);
    cerrarModalNotasTacticasSpot();
}

export async function guardarNotasTacticasSpot(spotId, notas = {}) {
    const userId = appState?.sesionActual?.user?.id || null;
    const spot = spotActivoActual || {};
    const sid = spotId || spot.id;

    if (spot) {
        if (notas.notas_tacticas !== undefined) spot.notas_tacticas = notas.notas_tacticas;
        if (notas.acceso_parking !== undefined) spot.acceso_parking = notas.acceso_parking;
        if (notas.peligros_locales !== undefined) spot.peligros_locales = notas.peligros_locales;
    }
    const idx = spotsGuardadosMemoria.findIndex(s => (sid && s.id === sid) || s.nombre === spot.nombre);
    if (idx >= 0) {
        Object.assign(spotsGuardadosMemoria[idx], notas);
        try {
            localStorage.setItem('ps_spots_guardados', JSON.stringify(spotsGuardadosMemoria));
        } catch (_) {}
    }

    if (userId && supabaseClient && sid && !String(sid).startsWith('spot_')) {
        try {
            await supabaseClient
                .from('user_spots')
                .update({
                    notas_tacticas: notas.notas_tacticas ?? '',
                    acceso_parking: notas.acceso_parking ?? '',
                    peligros_locales: notas.peligros_locales ?? ''
                })
                .eq('id', sid)
                .eq('user_id', userId);
        } catch (err) {
            console.warn('Aviso al actualizar notas en user_spots:', err);
        }
    }

    renderizarInteligenciaYDiarioSpot(spot, pronosticoDiaCompletoActual || mapRuntime.datosMeteoActuales);
    return { ok: true, spot };
}

export function renderizarInteligenciaYDiarioSpot(spot, pronosticoActual) {
    const bento = document.getElementById('spotIntelligenceBento');
    if (!bento) return;

    const sNom = spot?.nombre || document.getElementById('location')?.value?.split(',')[0]?.trim() || 'Spot';
    const lat = Number(spot?.lat ?? mapRuntime.latitudActual);
    const lon = Number(spot?.lon ?? mapRuntime.longitudActual);

    // 1. Header Bar
    const titleEl = document.getElementById('spotIntelTitle');
    if (titleEl) titleEl.textContent = `Spot Intelligence: ${esc(sNom)}`;

    const perfil = generarPerfilTacticoSpot(sNom, lat, lon);
    const orientEl = document.getElementById('spotIntelOrientation');
    if (orientEl) {
        orientEl.textContent = perfil.seawardDeg !== null 
            ? `🌊 Mar hacia ${perfil.seawardDeg}° (${perfil.cardinalMar})` 
            : `🏞️ ${perfil.cardinalMar}`;
    }

    // Viento & Olas actuales
    const wKt = pronosticoActual?.windSpeed ? kmhANudos(pronosticoActual.windSpeed * 3.6) : null;
    const wvM = pronosticoActual?.waveHeight ?? null;

    // 2. Tactical Rose Cards
    const abrigoCard = document.getElementById('spotRumboAbrigoCardinal');
    const abrigoDesc = document.getElementById('spotRumboAbrigoDesc');
    if (abrigoCard) abrigoCard.textContent = perfil.rumboAbrigo.cardinal;
    if (abrigoDesc) abrigoDesc.textContent = perfil.rumboAbrigo.descripcion;

    const crossCard = document.getElementById('spotRumboCrossCardinal');
    const crossDesc = document.getElementById('spotRumboCrossDesc');
    if (crossCard) crossCard.textContent = perfil.rumboCross.cardinales.join(' / ');
    if (crossDesc) crossDesc.textContent = perfil.rumboCross.descripcion;

    const criticoCard = document.getElementById('spotRumboCriticoCardinal');
    const criticoDesc = document.getElementById('spotRumboCriticoDesc');
    if (criticoCard) criticoCard.textContent = perfil.rumboCritico.onshore.cardinal;
    if (criticoDesc) criticoDesc.textContent = perfil.rumboCritico.offshoreDrift.descripcion;

    // 3. User History & Smart Match
    const hist = analizarHistorialYSmartMatchSpot(lat, lon, sNom, { vientoKt: wKt, olasM: wvM });
    const statsContainer = document.getElementById('spotIntelStatsPills');
    if (statsContainer) {
        statsContainer.innerHTML = `
            <span class="ps-chip text-slate-300">🏄 ${hist.totalSesionesSpot} sesiones tuyas aquí</span>
            <span class="ps-chip text-slate-300 ps-tabular">📏 ${hist.totalKmSpot} km</span>
            <span class="ps-chip text-emerald-300 ps-tabular">⚡ PR: ${hist.mejorRitmoKmh > 0 ? `${hist.mejorRitmoKmh} km/h` : '--'}</span>
        `;
    }

    // 4. Logbook entries & Thermal Bias
    let localLogs = [];
    try {
        localLogs = JSON.parse(localStorage.getItem('ps_spot_logbook') || '[]');
    } catch (_) { localLogs = []; }

    const bias = calcularSesgoTermicoSpot(sNom, lat, lon, localLogs);

    // Smart Match Banner
    const bannerEl = document.getElementById('spotSmartMatchBanner');
    if (bannerEl) {
        let bannerHtml = '';
        if (hist.smartMatch) {
            bannerHtml += `
                <div class="flex items-center gap-2.5">
                    <span class="text-2xl shrink-0">🎯</span>
                    <div>
                        <div class="font-black text-teal-300 text-xs sm:text-sm">SMART MATCH CONDICIONES SIMILARES: ${esc(hist.smartMatch.fecha)}</div>
                        <p class="text-[11px] text-slate-200 mt-0.5 leading-snug">
                            Remaste en condiciones casi idénticas (${hist.smartMatch.vientoKt} kt · ${hist.smartMatch.olasM}m) completando <b>${hist.smartMatch.distKm} km</b> a una media de <b>${hist.smartMatch.velMedia} km/h</b>.
                        </p>
                    </div>
                </div>
                <button type="button" onclick="if(window.abrirRutaSocialEnMapa) window.abrirRutaSocialEnMapa('${esc(hist.smartMatch.rutaId)}');" class="ps-chip text-teal-300 border-teal-500/50 bg-teal-500/20 hover:bg-teal-500/30 active:scale-95 shrink-0 cursor-pointer">
                    <span>🗺️</span> <span>Ver aquella ruta</span>
                </button>
            `;
        }
        if (bias.hasThermalBias) {
            bannerHtml += `
                <div class="w-full mt-1.5 p-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs flex items-center gap-2">
                    <span class="text-base">⚠️</span>
                    <span>${esc(bias.msg)}</span>
                </div>
            `;
        }

        if (bannerHtml) {
            bannerEl.innerHTML = bannerHtml;
            bannerEl.classList.remove('hidden');
            bannerEl.classList.add('flex');
        } else {
            bannerEl.classList.add('hidden');
            bannerEl.classList.remove('flex');
            bannerEl.innerHTML = '';
        }
    }

    // 5. Tactical Notes container
    const notasCont = document.getElementById('spotNotasTacticasContainer');
    if (notasCont) {
        const hasNotes = spot?.notas_tacticas || spot?.acceso_parking || spot?.peligros_locales;
        if (hasNotes) {
            let nHtml = '<div class="font-black text-amber-400 uppercase text-[10px] tracking-wider mb-0.5">Notas Tácticas del Spot</div>';
            if (spot.notas_tacticas) nHtml += `<p class="leading-relaxed"><b class="text-slate-300">Táctica:</b> ${esc(spot.notas_tacticas)}</p>`;
            if (spot.acceso_parking) nHtml += `<p class="leading-relaxed"><b class="text-sky-300">Acceso / Parking:</b> ${esc(spot.acceso_parking)}</p>`;
            if (spot.peligros_locales) nHtml += `<p class="leading-relaxed text-rose-300 font-semibold"><b class="text-rose-400">Peligros Locales:</b> ⚠️ ${esc(spot.peligros_locales)}</p>`;
            notasCont.innerHTML = nHtml;
            notasCont.classList.remove('hidden');
            notasCont.classList.add('flex');
        } else {
            notasCont.classList.add('hidden');
            notasCont.classList.remove('flex');
            notasCont.innerHTML = '';
        }
    }

    // 6. Logbook Feed List
    const logList = document.getElementById('spotLogbookList');
    const logBadge = document.getElementById('spotLogbookCountBadge');
    const spotEntries = localLogs.filter(e => {
        if (!e) return false;
        const eNom = String(e.spot_nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
        const sNomNorm = sNom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
        return sNomNorm.length >= 3 && (eNom.includes(sNomNorm) || sNomNorm.includes(eNom));
    });

    if (logBadge) logBadge.textContent = `${spotEntries.length} entradas`;
    if (logList) {
        if (spotEntries.length === 0) {
            logList.innerHTML = `
                <div class="text-center py-3 text-slate-500 text-xs">
                    Sin reportes aún en la bitácora de este spot. ¡Añade tu primera sensación arriba!
                </div>
            `;
        } else {
            const biasLabels = {
                'exacto': '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm flex items-center gap-1">🎯 Exacto</span>',
                'mas_viento': '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm flex items-center gap-1">💨 +Térmico</span>',
                'menos_viento': '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm flex items-center gap-1">🌊 +Calmado</span>'
            };
            logList.innerHTML = spotEntries.slice(0, 10).map(e => `
                <div class="ps-bento-card p-3 flex flex-col gap-1.5 text-xs hover:border-slate-600/60 transition-all">
                    <div class="flex items-center justify-between text-slate-400 text-[10px] border-b border-slate-800/60 pb-1.5">
                        <div class="flex items-center gap-2 font-bold">
                            <span class="text-slate-300">📅 ${esc(e.fecha || 'Reciente')}</span>
                            <span class="text-amber-400 tracking-wider">${'⭐'.repeat(e.rating || 5)}</span>
                        </div>
                        ${biasLabels[e.viento_real_bias] || ''}
                    </div>
                    ${e.notas ? `<p class="text-slate-200 mt-0.5 leading-snug italic font-medium">"${esc(e.notas)}"</p>` : ''}
                </div>
            `).join('');
        }
    }

    const scoreSpot = pronosticoActual?.score ?? Number(document.getElementById('basicScoreNumber')?.textContent) ?? 80;
    aplicarGlowVerdictBento(bento, scoreSpot);

    bento.dataset.haSidoCargado = 'true';
    bento.classList.remove('hidden');
    bento.classList.add('flex');
    if (typeof window.cambiarSubVistaSpot === 'function' && window.subVistaSpotActual) {
        window.cambiarSubVistaSpot(window.subVistaSpotActual);
    }
}

if (typeof window !== 'undefined') {
    window.guardarSpotActual = guardarSpotActual;
    window.guardarSpotActualEnBBDD = guardarSpotActualEnBBDD;
    window.eliminarSpotGuardado = eliminarSpotGuardado;
    window.seleccionarSpotGuardado = seleccionarSpotGuardado;
    window.seleccionarSpotGuardadoPorId = seleccionarSpotGuardadoPorId;
    window.abrirSpotActualEnPlanificadorPro = abrirSpotActualEnPlanificadorPro;
    window.abrirModalComparadorSpots = abrirModalComparadorSpots;
    window.cerrarModalComparadorSpots = cerrarModalComparadorSpots;
    window.seleccionarSpotParaComparar = seleccionarSpotParaComparar;
    window.quitarSpotDeComparacion = quitarSpotDeComparacion;
    window.renderizarTablaComparativaSpots = renderizarTablaComparativaSpots;
    window.compararSpotsGuardados = compararSpotsGuardados;
    window.cargarJornadaCompletaSpot = cargarJornadaCompletaSpot;
    window.renderizarTimelineJornadaCompleta = renderizarTimelineJornadaCompleta;
    window.renderizarScrubber24hSpot = renderizarScrubber24hSpot;
    window.seleccionarHoraTimeline = seleccionarHoraTimeline;
    window.seleccionarHoraScrubber24h = seleccionarHoraScrubber24h;
    window.actualizarRelojTimelineUI = actualizarRelojTimelineUI;
    window.reproducirTimeline24hSpot = reproducirTimeline24hSpot;
    window.pausarTimeline24hSpot = pausarTimeline24hSpot;
    window.alternarPlayTimeline24hSpot = alternarPlayTimeline24hSpot;
    window.calcularDistanciaGeodesicaKm = calcularDistanciaGeodesicaKm;
    window.analizarHistorialYSmartMatchSpot = analizarHistorialYSmartMatchSpot;
    window.calcularSesgoTermicoSpot = calcularSesgoTermicoSpot;
    window.toggleFormBitacoraSpot = toggleFormBitacoraSpot;
    window.abrirModalLogbookCondicion = abrirModalLogbookCondicion;
    window.cerrarModalLogbookCondicion = cerrarModalLogbookCondicion;
    window.seleccionarBiasLogbook = seleccionarBiasLogbook;
    window.seleccionarBiasSpot = seleccionarBiasSpot;
    window.setLogbookRating = setLogbookRating;
    window.seleccionarRatingLogbook = seleccionarRatingLogbook;
    window.guardarEntradaBitacoraSpot = guardarEntradaBitacoraSpot;
    window.guardarEntradaLogbookCondicion = guardarEntradaLogbookCondicion;
    window.cargarBitacoraSpot = cargarBitacoraSpot;
    window.abrirModalNotasTacticasSpot = abrirModalNotasTacticasSpot;
    window.cerrarModalNotasTacticasSpot = cerrarModalNotasTacticasSpot;
    window.confirmarGuardarNotasTacticas = confirmarGuardarNotasTacticas;
    window.guardarNotasTacticasSpot = guardarNotasTacticasSpot;
    window.renderizarInteligenciaYDiarioSpot = renderizarInteligenciaYDiarioSpot;
    window.abrirModalReporteSpot = abrirModalReporteSpot;
    window.cerrarModalReporteSpot = cerrarModalReporteSpot;
    window.seleccionarTagReporte = seleccionarTagReporte;
    window.seleccionarTagReporteSpot = seleccionarTagReporteSpot;
    window.confirmarEnvioReporteSpot = confirmarEnvioReporteSpot;
    window.enviarReporteSpot = enviarReporteSpot;
    window.cargarReportesSpot = cargarReportesSpot;
    window.cargarSpotsGuardadosUsuario = cargarSpotsGuardadosUsuario;
    window.renderizarBarraSpotsGuardados = renderizarBarraSpotsGuardados;
    window.renderizarListaSpotsGuardadosModal = renderizarListaSpotsGuardadosModal;
    window.abrirModalSpotsGuardados = abrirModalSpotsGuardados;
    window.cerrarModalSpotsGuardados = cerrarModalSpotsGuardados;
    window.actualizarEstadoBotonGuardarSpot = actualizarEstadoBotonGuardarSpot;
    window.PACKS_SPOTS_COSTEROS = PACKS_SPOTS_COSTEROS;
    window.cargarPackSpotsCostero = cargarPackSpotsCostero;
    window.abrirAsistenteConfiguracion = abrirAsistenteConfiguracion;
    window.cerrarAsistenteConfiguracion = cerrarAsistenteConfiguracion;
    window.seleccionarTablaAsistente = seleccionarTablaAsistente;
    window.cargarPackYFinalizarAsistente = cargarPackYFinalizarAsistente;
}
