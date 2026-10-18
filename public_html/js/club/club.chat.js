import { supabaseClient, appState } from '../config.js';
import { esc, safeUrl, IMG_FALLBACK } from '../utils.js';

let activeRealtimeChannel = null;
let currentChatClubId = null;

export const ClubChat = {
    async render(container, clubId, isMember = true) {
        if (!container) return;
        currentChatClubId = clubId;

        // Desuscribir canal previo si existía
        this.desuscribirRealtime();

        if (!isMember) {
            container.innerHTML = `
                <div class="text-center py-10 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700 p-6">
                    <span class="text-4xl block mb-2 opacity-50">🔒</span>
                    <h3 class="font-black text-marine dark:text-white mb-1 text-sm uppercase tracking-wider">Chat Exclusivo del Club</h3>
                    <p class="text-xs text-slate-400 mb-4">Solo los miembros confirmados del club pueden leer y escribir en esta frecuencia privada.</p>
                    <button type="button" onclick="window.Club.solicitarUnirseClub('${esc(clubId)}')" class="px-5 py-2.5 bg-water text-white font-bold text-xs rounded-xl shadow active:scale-95 transition-transform cursor-pointer">
                        🌊 Solicitar Ingreso al Club
                    </button>
                </div>`;
            return;
        }

        container.innerHTML = `
            <div class="flex flex-col h-[420px] bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden shadow-sm">
                <!-- Cabecera del Chat -->
                <div class="px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        <p class="text-xs font-black text-marine dark:text-white uppercase tracking-wider">Canal de Radio Privado</p>
                    </div>
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Solo Miembros</span>
                </div>

                <!-- Lista de Mensajes -->
                <div id="clubChatMessagesList" class="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-slate-50/50 dark:bg-slate-900/40">
                    <p class="text-center text-slate-400 py-10 text-xs font-bold animate-pulse">Sintonizando frecuencia del club...</p>
                </div>

                <!-- Barra de Entrada de Mensaje -->
                <div class="p-3 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700 flex items-center gap-2">
                    <input type="text" id="clubChatInput" placeholder="Escribe un mensaje al club..." maxlength="500" class="flex-1 h-11 px-4 bg-slate-50 dark:bg-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-water border border-slate-200 dark:border-slate-600 dark:text-white transition-all" onkeydown="if(event.key==='Enter') window.Club.enviarMensajeChat('${esc(clubId)}')">
                    <button type="button" id="btnSendClubChat" onclick="window.Club.enviarMensajeChat('${esc(clubId)}')" class="h-11 px-4 bg-marine dark:bg-water text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md active:scale-95 transition-transform flex items-center gap-1.5 cursor-pointer shrink-0">
                        <span>Enviar</span>
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                    </button>
                </div>
            </div>`;

        await this.cargarMensajes(clubId);
        this.suscribirRealtime(clubId);
    },

    async cargarMensajes(clubId) {
        const list = document.getElementById('clubChatMessagesList');
        if (!list) return;

        try {
            const { data: msgs, error } = await supabaseClient
                .from('club_chat')
                .select('id, user_id, mensaje, visibility, is_public, created_at, perfiles(nombre, avatar_url)')
                .eq('club_id', clubId)
                .order('created_at', { ascending: true })
                .limit(60);

            if (error) {
                console.error('[club.chat] error al cargar mensajes:', error);
                list.innerHTML = `<p class="text-center text-red-500 py-8 text-xs font-bold">Error al conectar con el chat: ${esc(error.message)}</p>`;
                return;
            }

            if (!msgs || msgs.length === 0) {
                list.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-12 text-center">
                        <span class="text-4xl mb-2 opacity-60">💬</span>
                        <p class="text-xs font-black text-marine dark:text-white uppercase tracking-wider">Sin mensajes todavía</p>
                        <p class="text-[11px] text-slate-400 mt-1 max-w-[240px]">¡Sé el primero en romper el hielo y saludar a los compañeros de ruta!</p>
                    </div>`;
                return;
            }

            const myId = appState.sesionActual?.user?.id;
            list.innerHTML = msgs.map(m => this.renderBurbujaMensaje(m, myId)).join('');
            this.scrollBottom();
        } catch (err) {
            console.error('[club.chat] error cargarMensajes:', err);
            list.innerHTML = `<p class="text-center text-red-500 py-8 text-xs font-bold">Error de conexión al cargar mensajes.</p>`;
        }
    },

    renderBurbujaMensaje(m, myId) {
        const esMio = m.user_id === myId;
        const nombre = m.perfiles?.nombre || 'Paddler';
        const avatar = safeUrl(m.perfiles?.avatar_url, IMG_FALLBACK);
        const fecha = m.created_at ? new Date(m.created_at) : new Date();
        const horaStr = fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

        if (esMio) {
            return `
                <div class="flex flex-col items-end">
                    <div class="max-w-[82%] bg-gradient-to-r from-marine to-sky-700 text-white rounded-2xl rounded-tr-xs p-3 shadow-sm text-xs leading-relaxed break-words">
                        <p>${esc(m.mensaje)}</p>
                    </div>
                    <span class="text-[9px] font-bold text-slate-400 mt-1 mr-1">${horaStr}</span>
                </div>`;
        } else {
            return `
                <div class="flex items-start gap-2.5 max-w-[85%]">
                    <img src="${esc(avatar)}" onerror="this.onerror=null; this.src='${IMG_FALLBACK}';" class="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5 border border-slate-200 dark:border-slate-700">
                    <div class="flex flex-col">
                        <span class="text-[10px] font-black text-water uppercase tracking-wider mb-0.5">${esc(nombre)}</span>
                        <div class="bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-2xl rounded-tl-xs p-3 shadow-xs border border-slate-100 dark:border-slate-600 text-xs leading-relaxed break-words">
                            <p>${esc(m.mensaje)}</p>
                        </div>
                        <span class="text-[9px] font-bold text-slate-400 mt-1 ml-1">${horaStr}</span>
                    </div>
                </div>`;
        }
    },

    async enviarMensaje(clubId) {
        const input = document.getElementById('clubChatInput');
        if (!input) return;
        const texto = input.value.trim();
        if (!texto) return;

        const myId = appState.sesionActual?.user?.id;
        if (!myId || appState.esInvitado) {
            alert("Debes iniciar sesión para escribir en el chat.");
            if (window.abrirModalAuth) window.abrirModalAuth();
            return;
        }

        const btn = document.getElementById('btnSendClubChat');
        if (btn) btn.disabled = true;

        try {
            const { error } = await supabaseClient.from('club_chat').insert([{
                club_id: clubId,
                user_id: myId,
                mensaje: texto,
                visibility: 'club_only',
                is_public: false
            }]);

            if (error) throw error;
            input.value = '';
            input.focus();

            // Si el realtime no está activo, refrescamos directamente
            if (!activeRealtimeChannel) {
                await this.cargarMensajes(clubId);
            }
        } catch (err) {
            console.error('[club.chat] error al enviar mensaje:', err);
            alert("Error al enviar mensaje: " + (err.message || err));
        } finally {
            if (btn) btn.disabled = false;
        }
    },

    suscribirRealtime(clubId) {
        if (!supabaseClient || !clubId) return;
        try {
            activeRealtimeChannel = supabaseClient
                .channel(`public:club_chat:${clubId}`)
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'club_chat',
                    filter: `club_id=eq.${clubId}`
                }, async (payload) => {
                    const list = document.getElementById('clubChatMessagesList');
                    if (!list) return;

                    // Consultar perfil del autor del nuevo mensaje
                    let perfilData = null;
                    if (payload.new && payload.new.user_id) {
                        try {
                            const { data: p } = await supabaseClient
                                .from('perfiles')
                                .select('nombre, avatar_url')
                                .eq('id', payload.new.user_id)
                                .maybeSingle();
                            perfilData = p;
                        } catch (_) {}
                    }

                    const msgCompleto = {
                        ...payload.new,
                        perfiles: perfilData
                    };

                    const myId = appState.sesionActual?.user?.id;
                    const dummyEmpty = list.querySelector('.opacity-60');
                    if (dummyEmpty) list.innerHTML = '';

                    const temp = document.createElement('div');
                    temp.innerHTML = this.renderBurbujaMensaje(msgCompleto, myId);
                    if (temp.firstElementChild) {
                        list.appendChild(temp.firstElementChild);
                    }
                    this.scrollBottom();
                })
                .subscribe();
        } catch (e) {
            console.warn('[club.chat] realtime no soportado o con aviso:', e);
        }
    },

    desuscribirRealtime() {
        if (activeRealtimeChannel && supabaseClient) {
            try {
                supabaseClient.removeChannel(activeRealtimeChannel);
            } catch (_) {}
            activeRealtimeChannel = null;
        }
        currentChatClubId = null;
    },

    scrollBottom() {
        const list = document.getElementById('clubChatMessagesList');
        if (list) {
            list.scrollTop = list.scrollHeight;
        }
    }
};

