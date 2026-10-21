// ====================================================
// js/club/club.retos.js - RETOS MENSUALES Y EVENTOS COMPETITIVOS
// ====================================================

import { supabaseClient, appState } from '../config.js';
import { esc, safeUrl, IMG_FALLBACK } from '../utils.js';
import { ClubState } from './state.js';
import { PLANTILLAS_RETOS_CLUB, calcularProgresoRetoClub } from '../gamification.js';

export async function obtenerRetosClub(clubId) {
    if (!clubId) return [];
    let retos = [];

    // 1. Intentar consultar Supabase
    if (supabaseClient && typeof supabaseClient.from === 'function') {
        try {
            const { data, error } = await supabaseClient
                .from('club_retos')
                .select('*')
                .eq('club_id', clubId)
                .order('created_at', { ascending: false });

            if (!error && Array.isArray(data)) {
                retos = data;
            }
        } catch (e) {
            console.warn('[ClubRetos] Aviso leyendo club_retos desde Supabase:', e);
        }
    }

    // 2. Fallback / Sincronización con localStorage
    try {
        const localKey = 'ps_club_challenges_' + clubId;
        const localRaw = localStorage.getItem(localKey);
        if (localRaw) {
            const localList = JSON.parse(localRaw);
            if (Array.isArray(localList)) {
                localList.forEach(lr => {
                    if (!retos.some(r => String(r.id) === String(lr.id))) {
                        retos.push(lr);
                    }
                });
            }
        }
    } catch (_) {}

    // 3. Si no hay retos activos, inyectar la primera plantilla por defecto
    if (retos.length === 0) {
        const now = new Date();
        const defaultReto = {
            id: 'reto_default_' + clubId,
            club_id: clubId,
            titulo: '🌊 Reto Colectivo 300K',
            descripcion: 'Objetivo de club: sumar entre todos los miembros 300 km en el agua este mes.',
            tipo: 'colectivo_km',
            meta_valor: 300,
            xp_recompensa: 250,
            fecha_inicio: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
            fecha_fin: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString(),
            created_at: new Date().toISOString()
        };
        retos.push(defaultReto);
        try {
            localStorage.setItem('ps_club_challenges_' + clubId, JSON.stringify(retos));
        } catch (_) {}
    }

    return retos;
}

export async function obtenerParticipantesReto(retoId) {
    if (!retoId) return [];
    const participantesIds = new Set();

    // 1. Supabase
    if (supabaseClient && typeof supabaseClient.from === 'function') {
        try {
            const { data, error } = await supabaseClient
                .from('club_retos_participantes')
                .select('user_id, completado')
                .eq('reto_id', retoId);
            if (!error && Array.isArray(data)) {
                data.forEach(p => participantesIds.add(String(p.user_id)));
            }
        } catch (_) {}
    }

    // 2. localStorage
    try {
        const partKey = 'ps_club_participants_' + retoId;
        const raw = localStorage.getItem(partKey);
        if (raw) {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) list.forEach(id => participantesIds.add(String(id)));
        }
    } catch (_) {}

    return Array.from(participantesIds);
}

export function abrirCreadorRetoClub() {
    const panel = document.getElementById('clubChallengeFormPanel');
    if (!panel) return;
    panel.classList.remove('hidden');

    const tInput = document.getElementById('inputRetoTitulo');
    if (tInput && !tInput.value) {
        aplicarPlantillaRetoClub('colectivo_300k');
    }
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function cerrarCreadorRetoClub() {
    const panel = document.getElementById('clubChallengeFormPanel');
    if (panel) panel.classList.add('hidden');
}

export function aplicarPlantillaRetoClub(presetId) {
    const preset = PLANTILLAS_RETOS_CLUB.find(p => p.id === presetId);
    if (!preset) return;

    const tInput = document.getElementById('inputRetoTitulo');
    const descInput = document.getElementById('inputRetoDesc');
    const tipoSelect = document.getElementById('selectRetoTipo');
    const metaInput = document.getElementById('inputRetoMeta');
    const xpInput = document.getElementById('inputRetoXP');

    if (tInput) tInput.value = preset.titulo;
    if (descInput) descInput.value = preset.descripcion;
    if (tipoSelect) tipoSelect.value = preset.tipo;
    if (metaInput) metaInput.value = preset.meta_valor;
    if (xpInput) xpInput.value = preset.xp_recompensa;
}

export async function crearRetoMensualClub() {
    const activeClubId = ClubState.activeId || ClubState.publicId;
    if (!activeClubId) {
        return alert("No hay ningún club activo seleccionado.");
    }

    const myId = appState.sesionActual?.user?.id;
    if (!myId || appState.esInvitado) {
        alert("Debes iniciar sesión para crear retos en el club.");
        if (window.abrirModalAuth) window.abrirModalAuth();
        return;
    }

    const tInput = document.getElementById('inputRetoTitulo');
    const descInput = document.getElementById('inputRetoDesc');
    const tipoSelect = document.getElementById('selectRetoTipo');
    const metaInput = document.getElementById('inputRetoMeta');
    const xpInput = document.getElementById('inputRetoXP');
    const iniInput = document.getElementById('inputRetoInicio');
    const finInput = document.getElementById('inputRetoFin');

    const titulo = tInput?.value?.trim();
    if (!titulo) {
        return alert("Introduce un título para el reto.");
    }

    const metaValor = Number(metaInput?.value || 100);
    if (metaValor <= 0) {
        return alert("Introduce un valor objetivo superior a 0.");
    }

    const tipo = tipoSelect?.value || 'colectivo_km';
    const xpRecompensa = Number(xpInput?.value || 250);
    const descripcion = descInput?.value?.trim() || '';

    const now = new Date();
    const fechaInicio = iniInput?.value ? new Date(iniInput.value + 'T00:00:00Z').toISOString() : new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const fechaFin = finInput?.value ? new Date(finInput.value + 'T23:59:59Z').toISOString() : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    const nuevoReto = {
        id: 'reto_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        club_id: activeClubId,
        creador_id: myId,
        titulo,
        descripcion,
        tipo,
        meta_valor: metaValor,
        xp_recompensa: xpRecompensa,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        created_at: new Date().toISOString()
    };

    // 1. Guardar en localStorage
    try {
        const localKey = 'ps_club_challenges_' + activeClubId;
        const current = JSON.parse(localStorage.getItem(localKey) || '[]');
        current.unshift(nuevoReto);
        localStorage.setItem(localKey, JSON.stringify(current));

        // Auto-unir al creador
        const partKey = 'ps_club_participants_' + nuevoReto.id;
        localStorage.setItem(partKey, JSON.stringify([myId]));
    } catch (_) {}

    // 2. Guardar en Supabase
    if (supabaseClient && typeof supabaseClient.from === 'function') {
        try {
            const { data, error } = await supabaseClient.from('club_retos').insert([{
                club_id: activeClubId,
                creador_id: myId,
                titulo: nuevoReto.titulo,
                descripcion: nuevoReto.descripcion,
                tipo: nuevoReto.tipo,
                meta_valor: nuevoReto.meta_valor,
                xp_recompensa: nuevoReto.xp_recompensa,
                fecha_inicio: nuevoReto.fecha_inicio,
                fecha_fin: nuevoReto.fecha_fin
            }]).select().maybeSingle();

            if (!error && data && data.id) {
                nuevoReto.id = data.id;
                supabaseClient.from('club_retos_participantes')
                    .insert([{ reto_id: data.id, user_id: myId }])
                    .then(() => {})
                    .catch(() => {});
            }
        } catch (e) {
            console.warn('[ClubRetos] Aviso al insertar en Supabase:', e);
        }

        // 3. Anuncio automático en el chat del club
        const announcementText = `🏆 ¡Nuevo Reto Mensual activado en el club!: ${nuevoReto.titulo} (Meta: ${nuevoReto.meta_valor} | +${nuevoReto.xp_recompensa} XP). ¡Únete en la pestaña Retos!`;
        try {
            await supabaseClient.from('club_chat').insert([{
                club_id: activeClubId,
                user_id: myId,
                mensaje: announcementText,
                visibility: 'club_only',
                is_public: false
            }]);
        } catch (_) {}
    }

    cerrarCreadorRetoClub();
    const contenedor = document.getElementById('vistaClubContent') || document.getElementById('clubChallengesContainer');
    if (contenedor) {
        ClubRetos.render(contenedor, activeClubId, true);
    }
}

export async function toggleParticipacionRetoClub(retoId) {
    const myId = appState.sesionActual?.user?.id;
    if (!myId || appState.esInvitado) {
        alert("Debes iniciar sesión para unirte al reto.");
        if (window.abrirModalAuth) window.abrirModalAuth();
        return;
    }

    const partKey = 'ps_club_participants_' + retoId;
    let list = [];
    try {
        const raw = localStorage.getItem(partKey);
        if (raw) list = JSON.parse(raw) || [];
    } catch (_) {}

    const isJoined = list.includes(myId);

    if (isJoined) {
        list = list.filter(id => id !== myId);
        try {
            localStorage.setItem(partKey, JSON.stringify(list));
        } catch (_) {}

        if (supabaseClient && typeof supabaseClient.from === 'function') {
            supabaseClient.from('club_retos_participantes')
                .delete()
                .eq('reto_id', retoId)
                .eq('user_id', myId)
                .then(() => {})
                .catch(() => {});
        }
    } else {
        list.push(myId);
        try {
            localStorage.setItem(partKey, JSON.stringify(list));
        } catch (_) {}

        if (supabaseClient && typeof supabaseClient.from === 'function') {
            supabaseClient.from('club_retos_participantes')
                .insert([{ reto_id: retoId, user_id: myId }])
                .then(() => {})
                .catch(() => {});
        }
    }

    const activeClubId = ClubState.activeId || ClubState.publicId;
    const contenedor = document.getElementById('vistaClubContent') || document.getElementById('clubChallengesContainer');
    if (contenedor && activeClubId) {
        ClubRetos.render(contenedor, activeClubId, true);
    }
}

export function toggleDesplegarParticipantesReto(retoId) {
    const list = document.getElementById(`participantesReto-${retoId}`);
    const arrow = document.getElementById(`arrowReto-${retoId}`);
    if (!list) return;
    const isHidden = list.classList.contains('hidden');
    list.classList.toggle('hidden', !isHidden);
    if (arrow) arrow.textContent = isHidden ? '▲' : '▼';
}

export function mostrarToastCelebracionReto(reto, xp) {
    const toast = document.createElement('div');
    toast.className = "fixed bottom-5 right-5 z-[200] max-w-sm bg-gradient-to-r from-amber-500 to-orange-500 text-white p-4 rounded-2xl shadow-2xl border border-amber-300 animate-bounce flex items-center gap-3";
    toast.innerHTML = `
        <span class="text-3xl">🎉</span>
        <div class="min-w-0">
            <p class="text-xs font-black uppercase tracking-wider">¡Reto de Club Superado!</p>
            <p class="text-[11px] font-bold mt-0.5">Has ganado <strong>+${xp} XP</strong> por completar <em>${esc(reto.titulo)}</em></p>
        </div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('opacity-0', 'transition-opacity', 'duration-500');
        setTimeout(() => toast.remove(), 500);
    }, 6000);
}

export async function premiarFinisherReto(reto, userId) {
    if (!reto || !userId) return;
    const rewardKey = `ps_reto_rewarded_${reto.id}_${userId}`;
    if (localStorage.getItem(rewardKey)) return;

    localStorage.setItem(rewardKey, new Date().toISOString());

    if (supabaseClient && typeof supabaseClient.from === 'function') {
        supabaseClient.from('club_retos_participantes')
            .update({ completado: true })
            .eq('reto_id', reto.id)
            .eq('user_id', userId)
            .then(() => {})
            .catch(() => {});
    }

    const xp = Number(reto.xp_recompensa || 250);

    if (typeof window.sincronizarProgresion === 'function') {
        window.sincronizarProgresion(xp, 0);
    } else if (appState.perfilUsuario) {
        appState.perfilUsuario.puntos = (appState.perfilUsuario.puntos || 0) + xp;
        if (supabaseClient && typeof supabaseClient.from === 'function') {
            supabaseClient.from('perfiles')
                .update({ puntos: appState.perfilUsuario.puntos })
                .eq('id', userId)
                .then(() => {})
                .catch(() => {});
        }
    }

    mostrarToastCelebracionReto(reto, xp);
}

export const ClubRetos = {
    async render(container, clubId, isAdmin = false) {
        if (!container) return;

        const myId = appState.sesionActual?.user?.id;
        const now = new Date();
        const startOfMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const endOfMonthStr = `${endOfMonth.getFullYear()}-${String(endOfMonth.getMonth() + 1).padStart(2, '0')}-${String(endOfMonth.getDate()).padStart(2, '0')}`;

        container.innerHTML = `
            <div class="space-y-4">
                <!-- Header Banner -->
                <div class="bg-gradient-to-r from-marine to-slate-900 text-white p-4 rounded-2xl shadow-md border border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div class="text-center sm:text-left">
                        <h4 class="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5 justify-center sm:justify-start">
                            <span>🏆</span> Retos del Mes del Club
                        </h4>
                        <p class="text-[11px] text-slate-300 mt-0.5">Compite y colabora con tu club para conquistar retos en el agua y sumar XP.</p>
                    </div>
                    <button type="button" onclick="abrirCreadorRetoClub()" class="w-full sm:w-auto px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0">
                        <span>➕</span><span>Nuevo Reto Mensual</span>
                    </button>
                </div>

                <!-- Inline Creator Panel (#clubChallengeFormPanel) -->
                <div id="clubChallengeFormPanel" class="hidden bg-slate-50 dark:bg-slate-800/90 rounded-2xl p-4 sm:p-5 border border-amber-300 dark:border-amber-600/40 shadow-lg space-y-4">
                    <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2.5">
                        <h5 class="text-xs font-black uppercase tracking-wider text-marine dark:text-white flex items-center gap-1.5">
                            <span>🎯</span> Configurar Reto de Club
                        </h5>
                        <button type="button" onclick="cerrarCreadorRetoClub()" class="text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs font-bold">✕ Cancelar</button>
                    </div>

                    <!-- Preset Chips -->
                    <div>
                        <p class="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Plantillas Rápidas (1 Tap):</p>
                        <div class="flex items-center gap-1.5 flex-wrap">
                            ${PLANTILLAS_RETOS_CLUB.map(p => `
                                <button type="button" onclick="aplicarPlantillaRetoClub('${p.id}')" class="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-amber-400 text-[10px] font-bold shadow-xs active:scale-95 transition-all cursor-pointer">
                                    ${p.icono} ${p.titulo}
                                </button>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Fields -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div class="sm:col-span-2">
                            <label class="block text-[10px] font-bold uppercase text-slate-400 mb-1">Título del Reto</label>
                            <input type="text" id="inputRetoTitulo" placeholder="Ej: Reto Colectivo 300K" class="w-full h-10 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-amber-400">
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold uppercase text-slate-400 mb-1">Tipo de Desafío</label>
                            <select id="selectRetoTipo" class="w-full h-10 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-amber-400">
                                <option value="colectivo_km">🌊 Colectivo (km de club)</option>
                                <option value="individual_km">🔥 Individual (km personales)</option>
                                <option value="individual_salidas">🧭 Individual (número de salidas)</option>
                                <option value="mejor_ritmo">⚡ Sprint (mejor velocidad media)</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold uppercase text-slate-400 mb-1">Meta / Valor Objetivo</label>
                            <input type="number" id="inputRetoMeta" value="300" step="0.5" class="w-full h-10 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-black text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-amber-400">
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold uppercase text-slate-400 mb-1">Recompensa (XP)</label>
                            <input type="number" id="inputRetoXP" value="250" step="25" class="w-full h-10 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-black text-amber-600 dark:text-amber-400 outline-none focus:ring-2 focus:ring-amber-400">
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold uppercase text-slate-400 mb-1">Fecha Inicio</label>
                            <input type="date" id="inputRetoInicio" value="${startOfMonthStr}" class="w-full h-10 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-amber-400">
                        </div>
                        <div class="sm:col-span-2">
                            <label class="block text-[10px] font-bold uppercase text-slate-400 mb-1">Fecha Fin</label>
                            <input type="date" id="inputRetoFin" value="${endOfMonthStr}" class="w-full h-10 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-amber-400">
                        </div>
                        <div class="sm:col-span-2">
                            <label class="block text-[10px] font-bold uppercase text-slate-400 mb-1">Descripción / Reglas</label>
                            <input type="text" id="inputRetoDesc" placeholder="Objetivo de club..." class="w-full h-10 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-amber-400">
                        </div>
                    </div>

                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                        <button type="button" onclick="cerrarCreadorRetoClub()" class="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer">Cancelar</button>
                        <button type="button" onclick="crearRetoMensualClub()" class="px-5 py-2 bg-marine dark:bg-water hover:opacity-90 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md active:scale-95 transition-all cursor-pointer">🚀 Publicar Reto</button>
                    </div>
                </div>

                <!-- Challenges Container -->
                <div id="clubChallengesContainer" class="space-y-3">
                    <p class="text-center text-slate-400 py-6 text-xs font-bold animate-pulse">Cargando retos mensuales...</p>
                </div>
            </div>
        `;

        // Cargar datos asíncronos y poblar #clubChallengesContainer
        const challengesListEl = document.getElementById('clubChallengesContainer');
        if (!challengesListEl) return;

        try {
            // 1. Retos del club
            const retos = await obtenerRetosClub(clubId);

            // 2. Miembros del club
            let memberIds = [];
            let profilesMap = new Map();
            if (supabaseClient && typeof supabaseClient.from === 'function') {
                const { data: mData } = await supabaseClient.from('clubs_usuarios').select('user_id').eq('club_id', clubId);
                if (Array.isArray(mData)) memberIds = mData.map(m => String(m.user_id));

                const { data: pData } = await supabaseClient.from('perfiles').select('id, nombre, avatar_url, nivel');
                if (Array.isArray(pData)) pData.forEach(p => profilesMap.set(String(p.id), p));
            }

            // 3. Rutas de los miembros
            let memberRoutes = [];
            if (supabaseClient && typeof supabaseClient.from === 'function') {
                const [urRes, legRes] = await Promise.all([
                    supabaseClient.from('user_routes').select('id, user_id, title, distance_km, duration_seconds, avg_speed, created_at'),
                    supabaseClient.from('rutas').select('id, user_id, distancia_km, tiempo_minutos, avg_speed_kmh, fecha')
                ]);

                if (Array.isArray(urRes.data)) {
                    urRes.data.forEach(r => {
                        memberRoutes.push({
                            id: r.id,
                            user_id: r.user_id,
                            distance_km: Number(r.distance_km || 0),
                            duration_seconds: Number(r.duration_seconds || 0),
                            avg_speed: Number(r.avg_speed || 0),
                            created_at: r.created_at
                        });
                    });
                }
                if (Array.isArray(legRes.data)) {
                    legRes.data.forEach(r => {
                        const dist = Number(r.distancia_km || 0);
                        const durSec = Number(r.tiempo_minutos || 0) * 60;
                        const avg = Number(r.avg_speed_kmh || (durSec > 0 ? (dist / (durSec / 3600)) : 0));
                        memberRoutes.push({
                            id: r.id,
                            user_id: r.user_id,
                            distance_km: dist,
                            duration_seconds: durSec,
                            avg_speed: avg,
                            created_at: r.fecha
                        });
                    });
                }
            }

            if (retos.length === 0) {
                challengesListEl.innerHTML = `
                    <div class="text-center py-8 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                        <span class="text-3xl block mb-2 opacity-50">🏆</span>
                        <p class="text-slate-400 text-xs font-bold uppercase tracking-wider">Sin retos activos en este club</p>
                    </div>
                `;
                return;
            }

            // Renderizar cada reto
            const cardsHtml = await Promise.all(retos.map(async (reto) => {
                const participantesIds = await obtenerParticipantesReto(reto.id);
                const isJoined = myId ? participantesIds.includes(String(myId)) : false;

                const calc = calcularProgresoRetoClub(reto, memberRoutes, participantesIds);
                if (!calc) return '';

                // Enriquecer participantes con datos de perfil
                calc.rankingParticipantes.forEach(p => {
                    const prof = profilesMap.get(String(p.userId));
                    if (prof) {
                        p.nombre = prof.nombre || p.nombre;
                        p.avatarUrl = prof.avatar_url || '';
                    }
                });

                // Auto-premiar al usuario actual si completó el reto y aún no fue premiado
                if (myId && isJoined) {
                    const myStat = calc.rankingParticipantes.find(p => String(p.userId) === String(myId));
                    if (myStat && myStat.isFinisher) {
                        premiarFinisherReto(reto, myId);
                    }
                }

                let badgeTipo = '🌊 Club Colectivo';
                if (reto.tipo === 'individual_km') badgeTipo = '🔥 Reto Individual';
                else if (reto.tipo === 'individual_salidas') badgeTipo = '🧭 Constancia';
                else if (reto.tipo === 'mejor_ritmo') badgeTipo = '⚡ Sprint Ritmo';

                const targetLabel = reto.tipo === 'mejor_ritmo' ? `${reto.meta_valor} km/h` : (reto.tipo === 'individual_salidas' ? `${reto.meta_valor} salidas` : `${reto.meta_valor} km`);
                const currentLabel = reto.tipo === 'mejor_ritmo' ? `${calc.totalProgreso} km/h` : (reto.tipo === 'individual_salidas' ? `${calc.totalProgreso} salidas` : `${calc.totalProgreso} km`);

                return `
                    <div class="ps-bento-card bg-slate-900/90 rounded-2xl p-4 sm:p-5 border border-slate-700/80 shadow-md space-y-3.5 transition-all">
                        <div class="flex items-start justify-between gap-2 flex-wrap">
                            <div>
                                <div class="flex items-center gap-1.5 flex-wrap">
                                    <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-800">${badgeTipo}</span>
                                    <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">⏳ ${calc.diasRestantes} días</span>
                                    <span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700">⚡ +${reto.xp_recompensa || 250} XP</span>
                                </div>
                                <h4 class="text-sm sm:text-base font-black text-marine dark:text-white mt-1.5 leading-snug">${esc(reto.titulo)}</h4>
                                ${reto.descripcion ? `<p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">${esc(reto.descripcion)}</p>` : ''}
                            </div>
                            <div class="shrink-0">
                                ${isJoined ? `
                                    <button type="button" onclick="toggleParticipacionRetoClub('${esc(reto.id)}')" class="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer" title="Pulsa para cancelar participación">
                                        <span>✅</span><span>Participando</span>
                                    </button>
                                ` : `
                                    <button type="button" onclick="toggleParticipacionRetoClub('${esc(reto.id)}')" class="px-3.5 py-1.5 bg-marine dark:bg-water hover:opacity-90 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer">
                                        <span>✋</span><span>Unirme al Reto</span>
                                    </button>
                                `}
                            </div>
                        </div>

                        <!-- Progress Bar -->
                        <div class="space-y-1">
                            <div class="flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
                                <span class="flex items-center gap-1">
                                    <span>Progreso:</span>
                                    <strong class="text-white ps-tabular">${currentLabel}</strong>
                                    <span class="text-slate-400 font-normal ps-tabular">/ ${targetLabel}</span>
                                </span>
                                <span class="font-black text-white ps-tabular">${calc.progressPct}%</span>
                            </div>
                            <div class="w-full h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden p-0.5 border border-slate-200 dark:border-slate-600">
                                <div class="h-full rounded-full transition-all duration-500 ${calc.completadoGlobal ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : 'bg-gradient-to-r from-amber-500 via-orange-500 to-water'}" style="width: ${calc.progressPct}%"></div>
                            </div>
                            ${calc.completadoGlobal ? `
                                <p class="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest text-right mt-0.5">🎉 ¡Objetivo de club superado!</p>
                            ` : ''}
                        </div>

                        <!-- Collapsible Leaderboard -->
                        <div class="pt-2 border-t border-slate-100 dark:border-slate-700/60">
                            <button type="button" onclick="toggleDesplegarParticipantesReto('${esc(reto.id)}')" class="text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-water flex items-center justify-between w-full cursor-pointer py-0.5">
                                <span class="flex items-center gap-1">
                                    <span>👥 Remadores participantes (${calc.rankingParticipantes.length})</span>
                                </span>
                                <span id="arrowReto-${esc(reto.id)}" class="text-xs">▼</span>
                            </button>

                            <div id="participantesReto-${esc(reto.id)}" class="mt-2 space-y-1.5 hidden pt-1">
                                ${calc.rankingParticipantes.length === 0 ? `
                                    <p class="text-[10px] text-slate-400 py-1 text-center font-medium">Aún no hay participantes inscritos. ¡Sé el primero!</p>
                                ` : calc.rankingParticipantes.map(p => {
                                    const avatar = safeUrl(p.avatarUrl, IMG_FALLBACK);
                                    const medal = p.rank === 1 ? '🥇' : (p.rank === 2 ? '🥈' : (p.rank === 3 ? '🥉' : `#${p.rank}`));
                                    const aporteText = reto.tipo === 'colectivo_km' && p.aportePct > 0 ? `· ${p.aportePct}% aporte` : '';
                                    return `
                                        <div class="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/50 text-xs">
                                            <div class="flex items-center gap-2 min-w-0">
                                                <span class="w-5 text-[10px] font-black text-slate-400 text-center shrink-0">${medal}</span>
                                                <img src="${esc(avatar)}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-6 h-6 rounded-full object-cover shrink-0">
                                                <span class="font-bold text-slate-800 dark:text-slate-200 truncate">${esc(p.nombre)}</span>
                                            </div>
                                            <div class="flex items-center gap-2 shrink-0">
                                                <span class="font-bold text-slate-600 dark:text-slate-300 text-[11px]">${p.valorLabel} <span class="text-[9px] text-slate-400 font-normal">${aporteText}</span></span>
                                                ${p.isFinisher ? `<span class="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-800 text-[8px] font-black rounded-md">FINISHER</span>` : ''}
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    </div>
                `;
            }));

            challengesListEl.innerHTML = cardsHtml.filter(Boolean).join('');

        } catch (e) {
            console.error('[ClubRetos] error al renderizar retos:', e);
            challengesListEl.innerHTML = `<p class="text-center text-red-500 py-6 text-xs font-bold">Error al cargar los retos del club.</p>`;
        }
    }
};

// Exponer en window para acceso global y desde HTML inline handlers
if (typeof window !== 'undefined') {
    window.ClubRetos = ClubRetos;
    window.obtenerRetosClub = obtenerRetosClub;
    window.obtenerParticipantesReto = obtenerParticipantesReto;
    window.abrirCreadorRetoClub = abrirCreadorRetoClub;
    window.cerrarCreadorRetoClub = cerrarCreadorRetoClub;
    window.aplicarPlantillaRetoClub = aplicarPlantillaRetoClub;
    window.crearRetoMensualClub = crearRetoMensualClub;
    window.toggleParticipacionRetoClub = toggleParticipacionRetoClub;
    window.toggleDesplegarParticipantesReto = toggleDesplegarParticipantesReto;
    window.mostrarToastCelebracionReto = mostrarToastCelebracionReto;
    window.premiarFinisherReto = premiarFinisherReto;
}

