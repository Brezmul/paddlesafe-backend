// ====================================================
// PADDLESAFE: MÓDULO ÚNICO DEFINITIVO (V56)
// ====================================================

// --- VARIABLES GLOBALES DEL MAPA ---
let map;
let marcador; 
let datosMeteoActuales = null; 
let latitudActual = 38.80; 
let longitudActual = 0.18;
let modoTravesiaActivo = false;
let modoRutaLibreActivo = false;
let marcadoresRuta = [];
let lineaRuta = null;
let lineasMultiPunto = []; 

// --- VARIABLES GLOBALES DE GPS Y TRACKING ---
let isTracking = false;
let trackDistanceKm = 0;
let trackCoords = [];
let lastPositionGPS = null;
let trackStartTime = null;
let cronometroInterval = null;
let watchId = null;
let wakeLock = null;
let livePolyline = null;

// --- VARIABLES GLOBALES DE AUTENTICACIÓN ---
let isLoginMode = true;
let sesionActual = null;
let perfilUsuario = null;
let esInvitado = false;
let invitadoId = 'guest_' + Math.floor(Math.random() * 10000);
let tempRecoveryTokens = null;

// Inicialización de Supabase
const supabaseUrl = 'https://amgmvnnwlraulbutgemx.supabase.co';
const supabaseKey = 'sb_publishable_bMJMhbAMO932NzZR8QyxAw_T6JF76Kq';
const supabaseClient = window.supabase ? window.supabase.createClient(supabaseUrl, supabaseKey) : null;

// ====================================================
// 1. INICIALIZACIÓN PRINCIPAL Y EVENTOS DOM
// ====================================================
document.addEventListener('DOMContentLoaded', () => {
    if (!supabaseClient) {
        console.error("❌ Error Crítico: Supabase no se cargó correctamente desde CDN.");
    }
    
    const btnPro = document.getElementById("btnPro");
    const panelPro = document.getElementById("panelPro");
    const btnProIcon = document.getElementById("btnProIcon");
    let proPanelOpen = false;

    if (btnPro && panelPro && btnProIcon) {
        btnPro.addEventListener("click", () => {
            proPanelOpen = !proPanelOpen;
            panelPro.style.gridTemplateRows = proPanelOpen ? "1fr" : "0fr";
            
            if (proPanelOpen) {
                btnProIcon.classList.add("rotate-180");
                inicializarMapa();
                setTimeout(() => { 
                    if (map) {
                        map.invalidateSize(); 
                    }
                }, 350);
            } else {
                btnProIcon.classList.remove("rotate-180");
            }
        });
    }

    // Interceptar el Fragmento de la URL si el usuario viene de un enlace de recuperación
    verificarModoRecuperacion();
});

// ====================================================
// 2. SEGURIDAD Y AUTENTICACIÓN (SUPABASE + VERCEL)
// ====================================================
if (supabaseClient) {
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        console.log("🔐 [AUTH LOG] Evento Supabase detectado:", event);
        sesionActual = session;
        esInvitado = false; 
        
        if (event === 'PASSWORD_RECOVERY') {
            setTimeout(() => { 
                abrirModalRecuperacionFinal(); 
            }, 500);
            return; 
        }
        
        if (session) {
            const { data } = await supabaseClient.from('perfiles')
                .select('*')
                .eq('id', session.user.id)
                .single();
            if (data) {
                perfilUsuario = data;
            }
        } else {
            perfilUsuario = null;
        }
        
        actualizarBotonCabecera();

        const modal = document.getElementById('authModal');
        if (modal && !modal.classList.contains('hidden') && sesionActual) {
            if (!document.getElementById('nuevaPassword')) {
                abrirModalAuth();
            }
        }
    });
}

function verificarModoRecuperacion() {
    const hash = window.location.hash.substring(1); 
    const params = new URLSearchParams(hash);

    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');

    if (type === 'recovery') {
        if (!accessToken || !refreshToken) {
            alert("⚠️ Enlace de recuperación inválido o incompleto. Solicita uno nuevo.");
            history.replaceState(null, null, window.location.pathname);
            return;
        }
        
        history.replaceState(null, null, window.location.pathname);
        tempRecoveryTokens = { accessToken, refreshToken, type };
        
        setTimeout(() => { 
            abrirModalRecuperacionFinal(); 
        }, 500);
    }
}

function mostrarFormularioOlvidastePassword() {
    const content = document.getElementById('authModalContent');
    content.innerHTML = `
        <div class="text-center">
            <h2 class="text-2xl sm:text-3xl font-bold text-marine mb-2">Recuperar Contraseña</h2>
            <p class="text-slate-500 text-sm mb-6">Introduce tu correo y te enviaremos un enlace seguro para restablecerla.</p>
        </div>
        <div class="space-y-4 w-full">
            <div class="flex flex-col gap-2 text-left">
                <label class="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Email</label>
                <input type="email" id="recuperarEmail" class="block w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-water transition-all shadow-inner text-base" placeholder="tu@email.com">
            </div>
            
            <button onclick="enviarEmailRecuperacion()" id="btnRecuperar" class="w-full h-12 mt-4 bg-water hover:bg-sky-600 text-white font-bold rounded-xl shadow-lg shadow-sky-200 transition-all active:scale-95 flex justify-center items-center text-lg">
                Enviar Enlace Mágico
            </button>
        </div>
        <div class="mt-6 text-center text-sm text-slate-500 border-t border-slate-100 pt-4">
            <button onclick="restaurarFormularioAuth()" class="text-water font-bold hover:underline">Volver a Iniciar Sesión</button>
        </div>
    `;
}

async function enviarEmailRecuperacion() {
    const email = document.getElementById('recuperarEmail').value;
    
    if (!email) {
        return alert("Por favor, introduce tu email.");
    }
    
    const btn = document.getElementById('btnRecuperar');
    btn.disabled = true; 
    btn.textContent = "Enviando...";

    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://sup.evolucionesdigitales.es/' 
    });

    if (error) {
        alert("Error: " + error.message);
        btn.disabled = false; 
        btn.textContent = "Enviar Enlace Mágico";
    } else {
        alert("✅ Te hemos enviado un enlace. Revisa tu bandeja de entrada o la carpeta de SPAM.");
        restaurarFormularioAuth(); 
        cerrarModalAuth();
    }
}

function abrirModalRecuperacionFinal() {
    const modal = document.getElementById('authModal');
    const content = document.getElementById('authModalContent');
    
    content.innerHTML = `
        <div class="text-center pt-4">
            <span class="text-5xl drop-shadow-md mb-3 block">🔐</span>
            <h2 class="text-2xl sm:text-3xl font-bold text-marine mb-2">Nueva Contraseña</h2>
            <p class="text-slate-500 text-sm mb-6">Elige una clave fuerte de al menos 8 caracteres.</p>
        </div>
        <div class="space-y-4 w-full">
            <div class="flex flex-col gap-2 text-left">
                <label class="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Tu nueva clave</label>
                <input type="password" id="nuevaPassword" class="block w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all shadow-inner text-base" placeholder="Mínimo 8 caracteres">
            </div>
            
            <button onclick="guardarNuevaPassword()" id="btnGuardarNuevaPass" class="w-full h-12 mt-4 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl shadow-lg transition-all active:scale-95 flex justify-center items-center text-lg">
                Cambiar contraseña
            </button>
        </div>
    `;
    
    modal.classList.remove('hidden');
    setTimeout(() => { 
        modal.classList.remove('opacity-0'); 
        content.classList.remove('scale-95'); 
    }, 10);
}

async function guardarNuevaPassword() {
    const pass = document.getElementById('nuevaPassword').value;
    const tokens = tempRecoveryTokens;

    if (!tokens) {
        return alert("❌ Sesión de recuperación inválida o expirada. Vuelve a solicitar el enlace.");
    }
    
    if (pass.length < 8) {
        return alert("⚠️ La contraseña debe tener al menos 8 caracteres.");
    }
    
    const btn = document.getElementById('btnGuardarNuevaPass');
    btn.disabled = true; 
    btn.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-5 w-5 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Guardando...`;

    try {
        const response = await fetch('https://paddlesafe-backend.vercel.app/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                access_token: tokens.accessToken,
                refresh_token: tokens.refreshToken,
                type: tokens.type,
                new_password: pass
            })
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok && data.ok) {
            alert("✅ " + (data.message || "Contraseña actualizada con éxito."));
            tempRecoveryTokens = null; 
            
            cerrarModalAuth();
            setTimeout(() => { 
                restaurarFormularioAuth(); 
                abrirModalAuth(); 
            }, 400);

        } else {
            let msgError = data.error || "Ocurrió un error desconocido";
            
            if (response.status === 400) {
                if (data.code === 'invalid_request') msgError = "Datos incorrectos: " + data.error;
                else if (data.code === 'password_rejected') msgError = "Contraseña rechazada: " + data.error;
            } else if (response.status === 401) {
                if (data.code === 'recovery_token_used') msgError = "Este enlace ya ha sido utilizado. Solicita uno nuevo.";
                else if (data.code === 'recovery_token_processing') msgError = "El enlace ya está siendo procesado.";
                else if (data.code === 'token_expired' || data.code === 'invalid_recovery_token') msgError = "El enlace ha expirado o no es válido. Solicita uno nuevo.";
            } else if (response.status === 503) {
                msgError = "Servicio temporalmente no disponible. Inténtalo en unos minutos.";
            } else if (response.status === 405) {
                msgError = "Error de servidor: Método no permitido (405).";
            }
            
            alert("❌ " + msgError);
        }
    } catch (err) {
        alert("❌ Error de red o conexión con el servidor Vercel.");
    } finally {
        btn.disabled = false; 
        btn.textContent = "Cambiar contraseña";
    }
}

function entrarComoInvitado() {
    esInvitado = true;
    perfilUsuario = {
        id: invitadoId,
        nombre: 'Invitado',
        nivel: 1,
        puntos: 0,
        km_totales: 0,
        tiempo_total: 0,
        is_private: true,
        insignias: [],
        avatar_url: `https://api.dicebear.com/9.x/adventurer/svg?seed=${invitadoId}&backgroundColor=e0f2fe`
    };
    actualizarBotonCabecera();
    abrirModalAuth(); 
}

function restaurarFormularioAuth() {
    const content = document.getElementById('authModalContent');
    isLoginMode = true;
    
    content.innerHTML = `
        <div class="text-center">
            <h2 id="authTitle" class="text-3xl font-bold text-marine mb-2">Iniciar Sesión</h2>
            <p id="authDesc" class="text-slate-500 text-sm mb-6">Accede a tu diario de rutas y niveles.</p>
        </div>
        <div class="space-y-4 w-full">
            <div class="flex flex-col gap-2 text-left">
                <label class="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Email</label>
                <input type="email" id="authEmail" class="block w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-water transition-all shadow-inner text-base" placeholder="tu@email.com">
            </div>
            <div class="flex flex-col gap-2 text-left">
                <label class="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Contraseña</label>
                <input type="password" id="authPassword" class="block w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-water transition-all shadow-inner text-base" placeholder="••••••••">
                <button onclick="mostrarFormularioOlvidastePassword()" class="text-[11px] text-slate-400 hover:text-water transition-colors mt-1 text-left w-fit underline decoration-dotted">¿Olvidaste tu contraseña?</button>
            </div>
            
            <div id="authPrivateContainer" class="hidden flex-col gap-2 mt-3 bg-slate-50 border border-slate-200 p-4 rounded-xl transition-all shadow-sm text-left">
                <label class="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" id="authIsPrivate" class="w-5 h-5 text-water bg-white border-slate-300 rounded focus:ring-water focus:ring-2">
                    <span class="text-sm font-bold text-slate-700">Perfil Privado</span>
                </label>
                <p class="text-xs text-slate-500 leading-relaxed">Tus rutas y estadísticas no serán visibles en los rankings públicos del grupo.</p>
            </div>

            <button id="authSubmitBtn" onclick="procesarAuth()" class="w-full h-12 mt-4 bg-water hover:bg-sky-600 text-white font-bold rounded-xl shadow-lg shadow-sky-200 transition-all active:scale-95 flex justify-center items-center text-lg">
                Entrar
            </button>
            
            <div class="mt-6 flex items-center justify-center">
                <div class="h-px bg-slate-200 flex-1"></div>
                <span class="px-4 text-xs text-slate-400 font-bold uppercase tracking-widest">O</span>
                <div class="h-px bg-slate-200 flex-1"></div>
            </div>
            
            <button onclick="entrarComoInvitado()" class="w-full h-12 mt-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl border border-slate-300 transition-all active:scale-95 flex justify-center items-center gap-2 text-sm sm:text-base">
                🕵️‍♂️ Acceder como Invitado
            </button>
        </div>
        <div class="mt-8 text-center text-sm text-slate-500 border-t border-slate-100 pt-4">
            <span id="authToggleText">¿No tienes cuenta?</span> 
            <button onclick="toggleAuthMode()" class="text-water font-bold hover:underline ml-1" id="authToggleBtn">Regístrate</button>
        </div>
    `;
}

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('authTitle').textContent = isLoginMode ? "Iniciar Sesión" : "Crear Cuenta";
    document.getElementById('authDesc').textContent = isLoginMode ? "Accede a tu diario de rutas y niveles." : "Únete a la tripulación de PaddleSafe.";
    document.getElementById('authSubmitBtn').textContent = isLoginMode ? "Entrar" : "Registrarme";
    document.getElementById('authToggleText').textContent = isLoginMode ? "¿No tienes cuenta?" : "¿Ya tienes cuenta?";
    document.getElementById('authToggleBtn').textContent = isLoginMode ? "Regístrate" : "Inicia Sesión";

    const privateContainer = document.getElementById('authPrivateContainer');
    if (isLoginMode) { 
        privateContainer.classList.add('hidden'); 
        privateContainer.classList.remove('flex'); 
    } else { 
        privateContainer.classList.remove('hidden'); 
        privateContainer.classList.add('flex'); 
    }
}

async function procesarAuth() {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    const isPrivate = document.getElementById('authIsPrivate') ? document.getElementById('authIsPrivate').checked : false;
    const btn = document.getElementById('authSubmitBtn');
    
    if (!email || !password) {
        return alert("Por favor, rellena tu email y contraseña.");
    }
    
    btn.disabled = true; 
    btn.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-5 w-5 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Procesando...`;

    if (isLoginMode) {
        const { error } = await supabaseClient.auth.signInWithPassword({ 
            email: email, 
            password: password 
        });
        if (error) { 
            alert("⚠️ Error: " + error.message); 
            btn.disabled = false; 
            btn.textContent = "Entrar"; 
        }
    } else {
        const { error } = await supabaseClient.auth.signUp({
            email: email, 
            password: password,
            options: { data: { is_vip: false, is_private: isPrivate } }
        });
        
        if (error) { 
            alert("⚠ Error al registrar: " + error.message); 
            btn.disabled = false; 
            btn.textContent = "Registrarme"; 
        } else { 
            alert("✅ ¡Registro completado! 🎉"); 
        }
    }
}

async function cerrarSesion() {
    if (esInvitado) {
        esInvitado = false; 
        perfilUsuario = null; 
        actualizarBotonCabecera(); 
        cerrarModalAuth(); 
        return;
    }
    
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
        alert("⚠️ Error al cerrar sesión: " + error.message);
    } else {
        cerrarModalAuth();
    }
}

function actualizarBotonCabecera() {
    const btnPerfil = document.getElementById('btnCabeceraPerfil');
    const btnSalir = document.getElementById('btnCerrarSesionCabecera');
    
    if (!btnPerfil) return;

    if ((sesionActual || esInvitado) && perfilUsuario) {
        const avatarSrc = perfilUsuario.avatar_url || `https://api.dicebear.com/9.x/adventurer/svg?seed=${perfilUsuario.id}&backgroundColor=e0f2fe`;
        
        btnPerfil.innerHTML = `
            <img src="${avatarSrc}" alt="Avatar" class="w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-water shadow-md bg-white object-cover flex-shrink-0">
            <span class="text-[11px] sm:text-xs font-black mt-1 tracking-wider uppercase text-water truncate w-16 text-center">${perfilUsuario.nombre || 'Perfil'}</span>
        `;
        if(btnSalir) {
            btnSalir.classList.remove('hidden');
        }
    } else {
        btnPerfil.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7 sm:h-8 sm:w-8 text-white/80 drop-shadow-md" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span class="text-[11px] sm:text-xs font-black mt-1 tracking-wider uppercase text-white/80">Perfil</span>
        `;
        if(btnSalir) {
            btnSalir.classList.add('hidden');
        }
    }
}

function calcularRangoMaritimo(puntos) {
    let nivel = Math.min(99, 1 + Math.floor(puntos / 500));
    let titulo = "";
    
    if (nivel < 10) titulo = "Grumete de Agua Dulce 🪵";
    else if (nivel < 20) titulo = "Marinero de Cala ⛵";
    else if (nivel < 30) titulo = "Navegante Costero 🧭";
    else if (nivel < 40) titulo = "Timonel de Travesía 🛟";
    else if (nivel < 50) titulo = "Contramaestre de Oleaje ⚓";
    else if (nivel < 60) titulo = "Patrón de Bajura 🗺️";
    else if (nivel < 70) titulo = "Capitán de Altura ⛴";
    else if (nivel < 80) titulo = "Comodoro del Viento 🦅";
    else if (nivel < 90) titulo = "Almirante del Océano 🔱";
    else if (nivel < 99) titulo = "Poseidón de la Costa 👑";
    else titulo = "Leyenda del Mar 🌊";

    let puntosNivelActual = (nivel - 1) * 500;
    let progresoPorcentaje = nivel === 99 ? 100 : (((puntos - puntosNivelActual) / 500) * 100);
    let puntosParaSubir = nivel === 99 ? 0 : (nivel * 500) - puntos;

    return { 
        nivel, 
        titulo, 
        progresoPorcentaje, 
        puntosParaSubir 
    };
}

function abrirModalAuth() {
    const modal = document.getElementById('authModal');
    const content = document.getElementById('authModalContent');
    
    if (document.getElementById('nuevaPassword')) {
        return;
    }
    
    if ((sesionActual || esInvitado) && perfilUsuario) {
        const avatarSrc = perfilUsuario.avatar_url || `https://api.dicebear.com/9.x/adventurer/svg?seed=${perfilUsuario.id}&backgroundColor=e0f2fe`;
        const horasNav = Math.floor((perfilUsuario.tiempo_total || 0) / 60);
        const minNav = (perfilUsuario.tiempo_total || 0) % 60;
        const pts = perfilUsuario.puntos || 0;
        const rango = calcularRangoMaritimo(pts);
        
        let insigniasHTML = `<p class="text-[10px] text-slate-400 font-medium my-2">Aún no has ganado insignias en quedadas.</p>`;
        
        if (perfilUsuario.insignias && perfilUsuario.insignias.length > 0) {
            insigniasHTML = `<div class="flex flex-wrap gap-3 justify-start mt-2">`;
            perfilUsuario.insignias.forEach(ins => {
                insigniasHTML += `
                    <div class="flex flex-col items-center bg-slate-50 p-3 rounded-xl border border-slate-200 shadow-sm text-center min-w-[70px]" title="${ins.nombre} (${ins.fecha}) - Club: ${ins.club_nombre || 'N/A'}">
                        <span class="text-3xl drop-shadow-sm mb-2">${ins.icono}</span>
                        <span class="text-[11px] font-bold text-marine truncate w-16 leading-tight">${ins.nombre}</span>
                    </div>
                `;
            });
            insigniasHTML += `</div>`;
        }

        const disableInput = esInvitado ? 'disabled' : '';
        const cursorInput = esInvitado ? 'cursor-not-allowed' : 'cursor-pointer';
        const colorInput = esInvitado ? 'bg-slate-400' : 'bg-water hover:bg-sky-600';
        
        const bannerInvitado = esInvitado ? `<div class="bg-blue-50 text-blue-600 text-[11px] font-bold py-2 px-3 rounded-lg mb-3 shadow-inner">Modo Invitado: Tus rutas no se guardan permanentemente.</div>` : '';

        const esTesterReal = sesionActual && sesionActual.user.email === 'tester@paddlesafe.com';
        if (esTesterReal && perfilUsuario.puntos < 49000) {
            perfilUsuario.puntos = 50000; 
            perfilUsuario.is_vip = true;
            supabaseClient.from('perfiles').update({ puntos: 50000, is_vip: true, nombre: 'Poseidón Tester' }).eq('id', sesionActual.user.id);
        }

        content.innerHTML = `
            <div class="text-center pt-2 relative">
                ${bannerInvitado}
                ${perfilUsuario.is_vip ? `<div class="absolute top-0 left-0 bg-gradient-to-r from-amber-400 to-yellow-500 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-md">👑 VIP</div>` : ''}

                <div class="relative inline-block mb-1 mt-2">
                    <img id="avatarPreview" src="${avatarSrc}" class="w-24 h-24 sm:w-28 sm:h-28 mx-auto rounded-full border-4 border-water shadow-lg bg-slate-50 object-cover transition-opacity">
                    <label for="avatarUpload" class="absolute bottom-1 right-1 ${colorInput} text-white rounded-full p-2.5 ${cursorInput} shadow-md transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                    </label>
                    <input type="file" id="avatarUpload" accept="image/*" class="hidden" onchange="subirAvatar(event)" ${disableInput}>
                </div>

                <div class="mb-4 mt-3">
                    <h2 class="text-2xl sm:text-3xl font-black text-marine leading-tight truncate px-4">
                        <input type="text" id="perfilNombre" value="${perfilUsuario.nombre || ''}" class="text-center bg-transparent border-b border-transparent hover:border-slate-300 focus:border-water focus:outline-none transition-colors w-full" placeholder="Tu Nombre">
                    </h2>
                    <p class="text-xs sm:text-sm font-bold text-water uppercase tracking-widest mt-1">${rango.titulo}</p>
                    ${perfilUsuario.club_id ? `<p class="text-[11px] font-bold text-emerald-600 mt-1.5 uppercase">🛡️ Miembro de Club (${perfilUsuario.club_rol})</p>` : ''}
                </div>

                <div class="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5 shadow-inner text-left">
                    <div class="flex justify-between items-end mb-2">
                        <span class="text-[11px] font-black text-slate-500 uppercase tracking-widest">Nivel ${rango.nivel}</span>
                        <span class="text-[11px] font-bold text-slate-400">${rango.nivel === 99 ? 'MAX' : rango.puntosParaSubir + ' pts para Nivel ' + (rango.nivel + 1)}</span>
                    </div>
                    <div class="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                        <div class="bg-gradient-to-r from-water to-emerald-400 h-3 rounded-full shadow-inner transition-all duration-1000" style="width: ${rango.progresoPorcentaje}%"></div>
                    </div>
                </div>

                <div class="mb-5">
                    <h3 class="text-[11px] sm:text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-2 text-left">🎖️ Vitrina de Insignias</h3>
                    ${insigniasHTML}
                </div>

                <div class="space-y-3 text-left w-full mb-5">
                    <div class="flex items-center justify-between bg-slate-50 border border-slate-200 p-3 rounded-xl min-w-0">
                        <div class="flex items-center gap-2">
                            <input type="checkbox" id="perfilPrivado" ${perfilUsuario.is_private ? 'checked' : ''} class="w-5 h-5 text-water bg-white border-slate-300 rounded focus:ring-water" ${disableInput}>
                            <label for="perfilPrivado" class="text-xs sm:text-sm font-semibold text-slate-700 ${cursorInput}">Mantener perfil privado</label>
                        </div>
                        <button onclick="guardarPerfil()" id="btnGuardarPerfil" class="h-10 px-4 ml-2 ${esInvitado ? 'bg-slate-400 cursor-not-allowed' : 'bg-marine hover:bg-slate-800'} text-white font-bold rounded-lg shadow text-xs uppercase tracking-wider flex-shrink-0 transition-colors">Guardar</button>
                    </div>
                </div>

                <div class="bg-slate-100 rounded-xl p-4 mb-5 grid grid-cols-3 gap-3 shadow-inner w-full text-center divide-x divide-slate-200 border border-slate-200">
                    <div class="flex flex-col items-center justify-center min-w-0">
                        <p class="text-slate-500 font-bold text-[10px] uppercase tracking-wider">Puntos</p>
                        <p class="text-amber-500 text-xl font-black truncate w-full">${pts}</p>
                    </div>
                    <div class="flex flex-col items-center justify-center min-w-0">
                        <p class="text-slate-500 font-bold text-[10px] uppercase tracking-wider">Distancia</p>
                        <p class="text-slate-800 text-xl font-black truncate w-full">${Number(perfilUsuario.km_totales || 0).toFixed(1)}<span class="text-[10px] ml-0.5">km</span></p>
                    </div>
                    <div class="flex flex-col items-center justify-center min-w-0">
                        <p class="text-slate-500 font-bold text-[10px] uppercase tracking-wider">Tiempo</p>
                        <p class="text-slate-800 text-xl font-black truncate w-full">${horasNav}h <span class="text-sm font-bold text-slate-600">${minNav}m</span></p>
                    </div>
                </div>
                
                <div class="text-left mb-5">
                    <h3 class="text-[11px] sm:text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1 border-b border-slate-100 pb-2">📖 Mi Diario de Rutas</h3>
                    <div id="contenedorHistorial" class="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar"></div>
                </div>

                <button onclick="cerrarSesion()" class="w-full h-12 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-xl border border-red-200 transition-all text-sm">
                    ${esInvitado ? 'Salir del Modo Invitado' : 'Cerrar Sesión'}
                </button>
            </div>
        `;
        cargarHistorialRutas();
    } else {
        restaurarFormularioAuth();
    }
    
    modal.classList.remove('hidden');
    setTimeout(() => { 
        modal.classList.remove('opacity-0'); 
        content.classList.remove('scale-95'); 
    }, 10);
}

function cerrarModalAuth() {
    const modal = document.getElementById('authModal');
    const content = document.getElementById('authModalContent');
    modal.classList.add('opacity-0');
    content.classList.add('scale-95');
    setTimeout(() => { 
        modal.classList.add('hidden'); 
    }, 300);
}

// ====================================================
// 3. DIARIO DE RUTAS (FOTOS DE MAPA Y TARJETAS VISUALES)
// ====================================================
async function cargarHistorialRutas() {
    const contenedor = document.getElementById('contenedorHistorial');
    
    if (esInvitado) {
        return contenedor.innerHTML = `<p class="text-xs text-slate-400 font-bold text-center py-4">Los invitados no guardan historial de rutas.</p>`;
    }
    
    if (!contenedor || !sesionActual) return;

    const { data, error } = await supabaseClient.from('rutas')
        .select('*')
        .eq('user_id', sesionActual.user.id)
        .order('fecha', { ascending: false });
        
    if (error) {
        return contenedor.innerHTML = `<p class="text-xs text-red-500 font-bold text-center py-2">Error al cargar historial.</p>`;
    }
    if (!data || data.length === 0) {
        return contenedor.innerHTML = `<p class="text-xs text-slate-400 font-bold text-center py-4">Aún no has registrado ninguna ruta.</p>`;
    }

    let html = '';
    data.forEach(ruta => {
        const fechaStr = new Date(ruta.fecha).toLocaleDateString('es-ES', { 
            weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' 
        });
        const pts = Math.round(ruta.distancia_km * 10) + ruta.tiempo_minutos;
        const kmStr = Number(ruta.distancia_km).toFixed(1);
        
        let tiempoStr = '';
        if (ruta.tiempo_minutos < 60) {
            tiempoStr = `${ruta.tiempo_minutos} min`;
        } else {
            const h = Math.floor(ruta.tiempo_minutos / 60);
            const m = ruta.tiempo_minutos % 60;
            tiempoStr = `${h}h ${m}m`;
        }

        const imagenHTML = ruta.imagen_url 
            ? `<img src="${ruta.imagen_url}" alt="Mapa" class="w-full h-32 object-cover border-b border-slate-200">` 
            : `<div class="w-full h-24 bg-marine flex items-center justify-center border-b border-slate-200"><span class="text-white/50 font-bold text-xs uppercase tracking-widest">Ruta sin captura</span></div>`;

        html += `
            <div class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm mb-4 transition-transform hover:-translate-y-1">
                ${imagenHTML}
                <div class="p-4">
                    <div class="flex justify-between items-center mb-3">
                        <span class="text-xs font-bold text-slate-500 capitalize">${fechaStr}</span>
                        <span class="text-xs font-black text-amber-500 bg-amber-50 px-2 py-1 rounded-md">+${pts} pts</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2 mb-4">
                        <div class="bg-slate-50 p-2 rounded-lg border border-slate-100 text-center">
                            <p class="text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-0.5">Distancia</p>
                            <p class="font-black text-slate-800 text-sm">${kmStr} km</p>
                        </div>
                        <div class="bg-slate-50 p-2 rounded-lg border border-slate-100 text-center">
                            <p class="text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-0.5">Tiempo</p>
                            <p class="font-black text-slate-800 text-sm">${tiempoStr}</p>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="verRutaEnMapa('${ruta.id}')" class="flex-1 bg-sky-50 text-water font-bold text-xs py-2.5 rounded-lg border border-sky-100 transition-colors hover:bg-sky-100 shadow-sm active:scale-95">
                            🗺️ Ver Mapa Interactivo
                        </button>
                        <button onclick="compartirRuta('${kmStr}', '${ruta.tiempo_minutos}', '${ruta.imagen_url || ''}')" class="bg-emerald-50 text-emerald-600 px-4 py-2.5 rounded-lg border border-emerald-100 transition-colors hover:bg-emerald-100 shadow-sm active:scale-95" title="Compartir">
                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    
    contenedor.innerHTML = html;
}

async function guardarPerfil() {
    if (esInvitado) {
        return alert("Los invitados no pueden modificar su perfil. ¡Regístrate!");
    }
    
    const nuevoNombre = document.getElementById('perfilNombre').value;
    const esPrivado = document.getElementById('perfilPrivado').checked;
    const btn = document.getElementById('btnGuardarPerfil');
    
    btn.disabled = true; 
    btn.textContent = "Guardando...";

    const { error } = await supabaseClient.from('perfiles').update({ 
        nombre: nuevoNombre, 
        is_private: esPrivado 
    }).eq('id', sesionActual.user.id);
    
    if (error) { 
        alert("❌ Error al guardar: " + error.message); 
        btn.textContent = "Guardar"; 
    } else {
        perfilUsuario.nombre = nuevoNombre; 
        perfilUsuario.is_private = esPrivado;
        actualizarBotonCabecera();
        btn.textContent = "¡Guardado! ✅";
        setTimeout(() => { 
            btn.textContent = "Guardar"; 
        }, 2000);
    }
    
    btn.disabled = false;
}

async function subirAvatar(event) {
    if (esInvitado) {
        return alert("Los invitados no pueden subir foto.");
    }
    
    const file = event.target.files[0];
    if (!file) {
        return;
    }

    const preview = document.getElementById('avatarPreview');
    preview.style.opacity = '0.5';
    
    const fileExt = file.name.split('.').pop();
    const fileName = `${sesionActual.user.id}-${Date.now()}.${fileExt}`;

    try {
        const { error: uploadError } = await supabaseClient.storage.from('avatars').upload(fileName, file);
        if (uploadError) throw uploadError;
        
        const { data } = supabaseClient.storage.from('avatars').getPublicUrl(fileName);
        
        await supabaseClient.from('perfiles').update({ avatar_url: data.publicUrl }).eq('id', sesionActual.user.id);
        
        perfilUsuario.avatar_url = data.publicUrl; 
        preview.src = data.publicUrl; 
        actualizarBotonCabecera();
    } catch (error) { 
        alert("❌ Error al subir la imagen. Comprueba la configuración de Storage."); 
    } finally { 
        preview.style.opacity = '1'; 
    }
}

function compartirRuta(km, min, imgUrl) {
    const vel = min > 0 ? (parseFloat(km) / (parseInt(min) / 60)).toFixed(1) : 0;
    
    let textoMensaje = `🏄‍♂️ ¡Acabo de remar ${km} km en ${min} min con PaddleSafe!\n🌊 Velocidad media: ${vel} km/h.\n🤙 ¿Te animas a la próxima?`;
    
    // Si la ruta tiene imagen, le añadimos el enlace para que puedan ver la captura
    if (imgUrl && imgUrl !== 'undefined' && imgUrl !== 'null') {
        textoMensaje += `\n\n🗺️ Mira mi recorrido en el mapa: ${imgUrl}`;
    }
    
    if (navigator.share) {
        navigator.share({ 
            title: 'Mi ruta en PaddleSafe', 
            text: textoMensaje 
        }).catch((err) => {
            console.log('Cancelado por el usuario o no soportado.', err);
        });
    } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(textoMensaje)}`, '_blank');
    }
}

// ====================================================
// 4. MAPA: LÓGICA DE RUTA Y TRAVESÍA
// ====================================================
function buscarYCentrarMapa(texto) {
    if (!texto) {
        return;
    }
    
    if (texto.includes(',')) {
        const partes = texto.split(',');
        const lat = parseFloat(partes[0]);
        const lon = parseFloat(partes[1]);
        if (!isNaN(lat) && !isNaN(lon)) { 
            actualizarMapa(lat, lon); 
            return; 
        }
    }
    
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(texto)}`)
        .then(res => res.json())
        .then(data => {
            if (data && data.length > 0) {
                actualizarMapa(parseFloat(data[0].lat), parseFloat(data[0].lon));
            }
        })
        .catch(e => console.log("No se pudo centrar el mapa automáticamente", e));
}

function actualizarMapa(lat, lon) {
    latitudActual = lat;
    longitudActual = lon;
    
    if (map && !modoTravesiaActivo && !modoRutaLibreActivo) {
        const newLatLng = new L.LatLng(lat, lon);
        if (marcador) {
            marcador.setLatLng(newLatLng);
        } else {
            marcador = L.marker(newLatLng).addTo(map);
        }
        map.setView(newLatLng, 12); 
    }
}

function inicializarMapa() {
    if (map) return; 

    map = L.map('mapaInteractivo').setView([latitudActual, longitudActual], 11);

    // Añadimos crossOrigin: true vital para poder hacer capturas de pantalla de los Tiles en canvas
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap', 
        maxZoom: 18,
        crossOrigin: true
    }).addTo(map);

    L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
        attribution: '© OpenSeaMap',
        crossOrigin: true
    }).addTo(map);

    if (!modoTravesiaActivo && !modoRutaLibreActivo) {
        marcador = L.marker([latitudActual, longitudActual]).addTo(map);
    }

    map.on('click', async function(e) {
        const lat = e.latlng.lat;
        const lon = e.latlng.lng;

        // Verificación Topográfica (Anti-Tierra Firme > 8m)
        try {
            const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`);
            const data = await res.json();
            if (data.elevation && data.elevation[0] > 8) {
                alert(`🚫 Punto no válido. Has seleccionado tierra firme (${data.elevation[0]}m de altitud).\n\nPara practicar Paddle Surf y obtener datos precisos, selecciona un punto en el mar.`);
                return; 
            }
        } catch (err) {
            console.warn("No se pudo verificar la elevación, permitiendo clic por defecto.", err);
        }

        if (modoTravesiaActivo) {
            gestionarClicRuta(e.latlng);
        } else if (modoRutaLibreActivo) {
            gestionarClicRutaLibre(e.latlng);
        } else {
            actualizarMapa(lat.toFixed(5), lon.toFixed(5));
            document.getElementById('location').value = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
            consultar();
        }
    });
}

function toggleModoTravesia() {
    if (modoRutaLibreActivo) {
        toggleRutaLibre(); 
    }
    
    modoTravesiaActivo = !modoTravesiaActivo;
    const btn = document.getElementById('btnTravesia');
    const msg = document.getElementById('mapMsg');
    
    if (modoTravesiaActivo) {
        btn.classList.replace('bg-marine', 'bg-red-500');
        btn.innerHTML = "❌ Cancelar (A ➔ B)";
        msg.textContent = "📍 Toca el PUNTO A (Salida)";
        
        if (marcador) map.removeLayer(marcador);
        limpiarRuta();
        
        document.getElementById('contenedorIdaVuelta').classList.remove('hidden');
        document.getElementById('contenedorIdaVuelta').classList.add('flex');
        document.getElementById('contenedorMultipunto').classList.add('hidden');
        document.getElementById('contenedorMultipunto').classList.remove('flex');
        document.getElementById('panelRuta').classList.remove('hidden');
        document.getElementById('panelRuta').classList.add('flex');
    } else {
        btn.classList.replace('bg-red-500', 'bg-marine');
        btn.innerHTML = "📍 Ruta (A ➔ B)";
        msg.textContent = "👆 Toca el mar para ver el clima";
        
        limpiarRuta();
        if (map) marcador = L.marker([latitudActual, longitudActual]).addTo(map);
        document.getElementById('panelRuta').classList.add('hidden');
        document.getElementById('panelRuta').classList.remove('flex');
    }
}

function toggleRutaLibre() {
    if (modoTravesiaActivo) {
        toggleModoTravesia(); 
    }
    
    modoRutaLibreActivo = !modoRutaLibreActivo;
    const btnLibre = document.getElementById('btnRutaLibre');
    const msg = document.getElementById('mapMsg');
    
    if (modoRutaLibreActivo) {
        btnLibre.classList.replace('bg-sky-400', 'bg-sky-500');
        btnLibre.classList.replace('hover:bg-sky-500', 'hover:bg-sky-600');
        btnLibre.innerHTML = "📍 Modo Multipunto";
        msg.textContent = "📍 Toca el mapa para añadir paradas";
        
        document.getElementById('leyendaMapa').classList.remove('hidden');
        document.getElementById('leyendaMapa').classList.add('flex');
        
        if (marcador) map.removeLayer(marcador);
        limpiarRuta();
        
        document.getElementById('contenedorIdaVuelta').classList.add('hidden');
        document.getElementById('contenedorIdaVuelta').classList.remove('flex');
        document.getElementById('contenedorMultipunto').classList.remove('hidden');
        document.getElementById('contenedorMultipunto').classList.add('flex');
        document.getElementById('contenedorMultipunto').innerHTML = ""; 
        document.getElementById('panelRuta').classList.remove('hidden');
        document.getElementById('panelRuta').classList.add('flex');
    } else {
        btnLibre.classList.remove('bg-red-500', 'hover:bg-red-600', 'bg-sky-500', 'hover:bg-sky-600');
        btnLibre.classList.add('bg-sky-400', 'hover:bg-sky-500');
        btnLibre.innerHTML = "🗺️ Travesía Multipunto";
        
        document.getElementById('leyendaMapa').classList.add('hidden');
        document.getElementById('leyendaMapa').classList.remove('flex');
        document.getElementById('multipuntoToolbar').classList.add('hidden');
        document.getElementById('multipuntoToolbar').classList.remove('flex');
        
        if (marcadoresRuta.length > 1) {
            calcularGeometriaRuta(marcadoresRuta.map(m => m.getLatLng()));
            msg.textContent = "✅ Travesía Multipunto Calculada";
            msg.className = "text-xs sm:text-sm font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 min-h-[44px] px-4 rounded-xl shadow-sm w-full text-center flex items-center justify-center gap-1.5 transition-colors";
        } else {
            msg.textContent = "👆 Toca el mar para ver el clima";
            msg.className = "text-xs sm:text-sm font-bold text-slate-500 bg-white min-h-[44px] px-4 rounded-xl shadow-sm border border-slate-100 w-full text-center flex items-center justify-center gap-1.5 transition-colors";
            limpiarRuta();
            if (map) marcador = L.marker([latitudActual, longitudActual]).addTo(map);
            document.getElementById('panelRuta').classList.add('hidden');
            document.getElementById('panelRuta').classList.remove('flex');
        }
    }
}

function limpiarRuta() {
    marcadoresRuta.forEach(m => map.removeLayer(m));
    marcadoresRuta = [];
    if (lineaRuta) map.removeLayer(lineaRuta);
    
    if (lineasMultiPunto) {
        lineasMultiPunto.forEach(layer => map.removeLayer(layer));
        lineasMultiPunto = [];
    }
    
    const btnLibre = document.getElementById('btnRutaLibre');
    if (modoRutaLibreActivo) {
        btnLibre.classList.remove('bg-red-500', 'hover:bg-red-600');
        btnLibre.classList.add('bg-sky-500', 'hover:bg-sky-600');
        btnLibre.innerHTML = "📍 Modo Multipunto";
    }
    
    const mapMsg = document.getElementById('mapMsg');
    if (mapMsg) {
        mapMsg.className = "text-xs sm:text-sm font-bold text-slate-500 bg-white min-h-[44px] px-4 rounded-xl shadow-sm border border-slate-100 w-full text-center flex items-center justify-center gap-1.5 transition-colors";
    }
}

function crearMarcadorLetra(latlng, index) {
    const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const letra = letras[index] || index;
    return L.marker(latlng, {
        icon: L.divIcon({
            className: '',
            html: `<div class="bg-marine text-white font-black w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center shadow-lg border-2 border-white text-[10px] sm:text-xs transform transition-transform hover:scale-110">${letra}</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        })
    });
}

function gestionarClicRuta(latlng) {
    const msg = document.getElementById('mapMsg');
    
    if (marcadoresRuta.length === 0) {
        let m = L.marker(latlng, {
            icon: L.icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png', iconSize: [25, 41], iconAnchor: [12, 41] })
        }).addTo(map);
        marcadoresRuta.push(m);
        msg.textContent = "🏁 Toca el PUNTO B (Llegada)";
    } 
    else if (marcadoresRuta.length === 1) {
        let m = L.marker(latlng, {
            icon: L.icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png', iconSize: [25, 41], iconAnchor: [12, 41] })
        }).addTo(map);
        marcadoresRuta.push(m);
        msg.textContent = "✅ Ruta calculada";
        
        const coords = marcadoresRuta.map(marker => marker.getLatLng());
        lineaRuta = L.polyline(coords, {color: '#0ea5e9', weight: 4, dashArray: '5, 10'}).addTo(map);
        map.fitBounds(lineaRuta.getBounds(), {padding: [50, 50]});

        analizarRutaGeometria(coords[0], coords[1]);
    }
}

function gestionarClicRutaLibre(latlng) {
    const index = marcadoresRuta.length;
    let m = crearMarcadorLetra(latlng, index).addTo(map);
    marcadoresRuta.push(m);

    const btnLibre = document.getElementById('btnRutaLibre');
    if (marcadoresRuta.length >= 1) {
        btnLibre.classList.remove('bg-sky-500', 'hover:bg-sky-600', 'bg-sky-400', 'hover:bg-sky-500');
        btnLibre.classList.add('bg-red-500', 'hover:bg-red-600');
        btnLibre.innerHTML = "✅ Terminar Trazado";
        
        document.getElementById('multipuntoToolbar').classList.remove('hidden');
        document.getElementById('multipuntoToolbar').classList.add('flex');
    }

    if (marcadoresRuta.length > 1) {
        calcularGeometriaRuta(marcadoresRuta.map(marker => marker.getLatLng()));
    }
}

function deshacerUltimoPunto() {
    if (marcadoresRuta.length === 0) return;
    
    const removed = marcadoresRuta.pop();
    map.removeLayer(removed);
    
    calcularGeometriaRuta(marcadoresRuta.map(m => m.getLatLng()));
    
    if (marcadoresRuta.length === 0) {
        document.getElementById('multipuntoToolbar').classList.add('hidden');
        document.getElementById('multipuntoToolbar').classList.remove('flex');
        document.getElementById('mapMsg').textContent = "📍 Toca el mapa para añadir paradas";
        document.getElementById('contenedorMultipunto').innerHTML = "";
        document.getElementById('rutaTotalDist').textContent = "-- km";
        document.getElementById('rutaTotalTiempo').textContent = "--h --m";
        
        const btnLibre = document.getElementById('btnRutaLibre');
        btnLibre.classList.remove('bg-red-500', 'hover:bg-red-600');
        btnLibre.classList.add('bg-sky-500', 'hover:bg-sky-600');
        btnLibre.innerHTML = "📍 Modo Multipunto";
    }
}

function reiniciarRutaMultipunto() {
    limpiarRuta();
    document.getElementById('multipuntoToolbar').classList.add('hidden');
    document.getElementById('multipuntoToolbar').classList.remove('flex');
    document.getElementById('mapMsg').textContent = "📍 Toca el mapa para añadir paradas";
    document.getElementById('contenedorMultipunto').innerHTML = "";
    document.getElementById('rutaTotalDist').textContent = "-- km";
    document.getElementById('rutaTotalTiempo').textContent = "--h --m";
}

function analizarRutaGeometria(p1, p2) {
    document.getElementById('contenedorIdaVuelta').classList.remove('hidden');
    document.getElementById('contenedorIdaVuelta').classList.add('flex');
    document.getElementById('contenedorMultipunto').classList.add('hidden');
    document.getElementById('contenedorMultipunto').classList.remove('flex');

    const distanciaMetros = p1.distanceTo(p2);
    const distanciaKm = parseFloat((distanciaMetros / 1000).toFixed(2));
    
    const lat1 = p1.lat * Math.PI / 180;
    const lon1 = p1.lng * Math.PI / 180;
    const lat2 = p2.lat * Math.PI / 180;
    const lon2 = p2.lng * Math.PI / 180;
    
    const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
    
    let rumboIda = Math.atan2(y, x) * 180 / Math.PI;
    rumboIda = Math.round((rumboIda + 360) % 360);
    
    const rumboVuelta = (rumboIda + 180) % 360;

    document.getElementById('idaRumbo').textContent = `Rumbo: ${rumboIda}°`;
    document.getElementById('vueltaRumbo').textContent = `Rumbo: ${rumboVuelta}°`;

    if (datosMeteoActuales) {
        const modVientoIda = evaluarVientoRelativo(rumboIda, datosMeteoActuales.windDirection, 'idaVientoEfecto', 'idaVientoCard', 'idaViento');
        const modVientoVuelta = evaluarVientoRelativo(rumboVuelta, datosMeteoActuales.windDirection, 'vueltaVientoEfecto', 'vueltaVientoCard', 'vueltaViento');

        const velIda = Math.max(2.0, 4.5 + modVientoIda);
        const velVuelta = Math.max(2.0, 4.5 + modVientoVuelta);

        const minIda = Math.round((distanciaKm / velIda) * 60);
        const minVuelta = Math.round((distanciaKm / velVuelta) * 60);
        const totalMin = minIda + minVuelta;

        document.getElementById('idaDist').textContent = `${distanciaKm} km`;
        document.getElementById('vueltaDist').textContent = `${distanciaKm} km`;
        document.getElementById('rutaTotalDist').textContent = `${(distanciaKm * 2).toFixed(2)} km`;

        document.getElementById('idaTiempo').textContent = formatearTiempo(minIda);
        document.getElementById('vueltaTiempo').textContent = formatearTiempo(minVuelta);
        document.getElementById('rutaTotalTiempo').textContent = formatearTiempo(totalMin);
    }
}

function calcularGeometriaRuta(coords) {
    lineasMultiPunto.forEach(layer => map.removeLayer(layer));
    lineasMultiPunto = [];
    
    if (coords.length < 2) return;
    
    const contIdaVuelta = document.getElementById('contenedorIdaVuelta');
    const contMulti = document.getElementById('contenedorMultipunto');
    
    if (contIdaVuelta) {
        contIdaVuelta.classList.add('hidden');
        contIdaVuelta.classList.remove('flex');
    }
    if (contMulti) {
        contMulti.classList.remove('hidden');
        contMulti.classList.add('flex');
    }
    
    let distTotalMetros = 0;
    let tiempoTotalMin = 0;
    let htmlTramos = "";
    const dirViento = datosMeteoActuales ? Number(datosMeteoActuales.windDirection) : 0;
    const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    for(let i = 0; i < coords.length - 1; i++) {
        const p1 = coords[i];
        const p2 = coords[i+1];
        const distSeg = p1.distanceTo(p2);
        distTotalMetros += distSeg;
        
        const letra1 = letras[i] || i;
        const letra2 = letras[i+1] || (i+1);
        const nombreTramo = `${letra1} ➔ ${letra2}`;

        const lat1 = p1.lat * Math.PI / 180;
        const lon1 = p1.lng * Math.PI / 180;
        const lat2 = p2.lat * Math.PI / 180;
        const lon2 = p2.lng * Math.PI / 180;
        const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
        let rumbo = Math.atan2(y, x) * 180 / Math.PI;
        rumbo = Math.round((rumbo + 360) % 360);

        let infoViento = { texto: "--", claseColor: "bg-slate-800/80 border-slate-700", modVelocidad: 0, colorRumbo: "text-white", hexLineColor: "#0ea5e9" };
        if (datosMeteoActuales) {
            infoViento = evaluarVientoRelativoInfo(rumbo, dirViento);
        }

        const polyline = L.polyline([p1, p2], {
            color: infoViento.hexLineColor,
            weight: 5,
            className: 'ruta-animada'
        }).addTo(map);

        const kmSegmento = (distSeg / 1000).toFixed(2);
        polyline.bindTooltip(`${kmSegmento} km`, {
            permanent: true, direction: 'center', className: 'distancia-tooltip'
        }).openTooltip();

        lineasMultiPunto.push(polyline);

        const velBase = Math.max(2.0, 4.5 + infoViento.modVelocidad);
        const tiempoSeg = ((distSeg / 1000) / velBase) * 60;
        tiempoTotalMin += tiempoSeg;
        const minStr = Math.round(tiempoSeg);

        htmlTramos += `
            <div class="bg-slate-900 rounded-xl p-4 border-l-4 ${infoViento.borderPanel || 'border-slate-600'} shadow-sm relative overflow-hidden mt-1 transition-all">
                <div class="flex justify-between items-center mb-4 border-b border-slate-700/50 pb-2">
                    <h4 class="${infoViento.colorRumbo || 'text-white'} font-bold text-xs sm:text-sm tracking-wider uppercase flex items-center gap-2">
                        TRAMO ${nombreTramo}
                    </h4>
                    <span class="text-[11px] bg-slate-800 px-2 py-1 rounded text-slate-300 font-mono truncate max-w-[120px]">Rumbo: ${rumbo}°</span>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-white">
                    <div class="bg-slate-800/80 rounded-xl py-3 px-2 min-w-0 flex flex-col justify-center border border-slate-700/30">
                        <p class="text-[11px] text-slate-400 font-bold tracking-wider mb-1 truncate">DIST</p>
                        <p class="font-bold text-sm sm:text-base truncate">${kmSegmento} km</p>
                    </div>
                    <div class="bg-slate-800/80 rounded-xl py-3 px-2 min-w-0 flex flex-col justify-center border border-slate-700/30">
                        <p class="text-[11px] text-slate-400 font-bold tracking-wider mb-1 truncate">TIEMPO</p>
                        <p class="font-bold text-sm sm:text-base truncate">${minStr} min</p>
                    </div>
                    <div class="col-span-2 sm:col-span-2 border rounded-xl py-3 px-2 min-w-0 flex flex-col justify-center transition-colors ${infoViento.claseColor}">
                        <p class="text-[11px] text-slate-400 font-bold tracking-wider mb-1 truncate">EFECTO DEL VIENTO</p>
                        <p class="font-bold text-sm sm:text-base truncate">${infoViento.texto}</p>
                    </div>
                </div>
            </div>
        `;
    }

    if (contMulti) {
        contMulti.innerHTML = htmlTramos;
    }

    const distTotalKm = parseFloat((distTotalMetros / 1000).toFixed(2));
    document.getElementById('rutaTotalDist').textContent = `${distTotalKm} km`;
    document.getElementById('rutaTotalTiempo').textContent = formatearTiempo(Math.round(tiempoTotalMin));

    if (datosMeteoActuales) {
        let tempAireValue = datosMeteoActuales.tempAire ?? datosMeteoActuales.temperature ?? datosMeteoActuales.temp ?? "N/D";
        let tempAguaValue = datosMeteoActuales.tempAgua ?? datosMeteoActuales.waterTemperature ?? datosMeteoActuales.water_temp ?? "N/D";
        document.getElementById('tempAmbiente').textContent = tempAireValue !== "N/D" ? `${tempAireValue}°` : "--°";
        document.getElementById('tempAgua').textContent = tempAguaValue !== "N/D" ? `${tempAguaValue}°` : "--°";
    }
}

function evaluarVientoRelativoInfo(rumboNavegacion, direccionVientoOrigen) {
    let diff = Math.abs(direccionVientoOrigen - rumboNavegacion);
    if (diff > 180) diff = 360 - diff; 
    
    if (diff <= 45) {
        return { texto: "🛑 EN CONTRA", claseColor: "bg-red-900/40 border-red-500 text-red-100", modVelocidad: -1.5, colorRumbo: "text-red-400", borderPanel: "border-red-500", hexLineColor: "#ef4444" };
    } else if (diff >= 135) {
        return { texto: "🚀 A FAVOR", claseColor: "bg-emerald-900/40 border-emerald-500 text-emerald-100", modVelocidad: 1.0, colorRumbo: "text-emerald-400", borderPanel: "border-emerald-500", hexLineColor: "#10b981" };
    } else {
        return { texto: "💨 LATERAL / MIXTO", claseColor: "bg-yellow-900/40 border-yellow-500 text-yellow-100", modVelocidad: -0.5, colorRumbo: "text-yellow-400", borderPanel: "border-yellow-500", hexLineColor: "#eab308" };
    }
}

function calcularModificadorViento(rumboNavegacion, direccionVientoOrigen) {
    let diff = Math.abs(direccionVientoOrigen - rumboNavegacion);
    if (diff > 180) diff = 360 - diff; 
    
    if (diff <= 45) return -1.5; 
    else if (diff >= 135) return 1.0; 
    else return -0.5; 
}

function evaluarVientoRelativo(rumboNavegacion, direccionVientoOrigen, idTextoAntiguo, idCard, idTexto) {
    const info = evaluarVientoRelativoInfo(rumboNavegacion, direccionVientoOrigen);
    const card = document.getElementById(idCard);
    const textElement = document.getElementById(idTexto);
    
    if (textElement && card) {
        textElement.textContent = info.texto;
        card.className = `col-span-2 sm:col-span-2 border rounded-xl py-3 px-2 min-w-0 flex flex-col justify-center transition-colors ${info.claseColor}`;
    }
    
    return info.modVelocidad;
}

function formatearTiempo(minutosTotales) {
    if (minutosTotales < 60) return `${minutosTotales} min`;
    const h = Math.floor(minutosTotales / 60);
    const m = minutosTotales % 60;
    return `${h}h ${m}m`;
}

// ====================================================
// 5. ALERTAS Y RENDERIZADO DEL CLIMA GLOBALES
// ====================================================
function generarTimelineSimulado(datosBase) {
    const timeline = document.getElementById('timelineHorario');
    timeline.innerHTML = ""; 
    
    let horaInicial = 9; 
    const velocidadMediaKmh = datosBase.windSpeed * 3.6;
    const direccionBase = Number(datosBase.windDirection) || 0;

    for (let i = 0; i < 4; i++) {
        let vientoSim = (velocidadMediaKmh + (i * 1.5)).toFixed(1);
        let dirSim = (direccionBase + (i * 5)) % 360;
        
        timeline.innerHTML += `
            <div class="flex flex-col items-center min-w-[70px] bg-slate-800 rounded-lg p-2 flex-shrink-0 border border-slate-700">
                <span class="font-bold text-water text-xs">${horaInicial + i}:00</span>
                <svg class="h-6 w-6 my-2 text-water drop-shadow-sm transition-transform duration-500" style="transform: rotate(${dirSim}deg);" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m0 0l-4-4m4 4l4-4" />
                </svg>
                <span class="font-semibold text-sm">${vientoSim}</span>
                <span class="text-[11px] text-slate-400">km/h</span>
            </div>
        `;
    }
}

function evaluarAlertasGlobales(windKmh, waveHeight, precipitacionMM, probLluvia, clima) {
    const viento = parseFloat(windKmh);
    const olas = waveHeight !== null ? parseFloat(waveHeight) : 0;
    
    if (viento >= 62 || olas >= 4.0) {
        return { activa: true, origen: 'AEMET', nivel: "NARANJA", tipo: "Riesgo Importante por Fenómenos Costeros", colorClasses: "from-orange-600 to-red-600 text-orange-400 border-orange-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]", icono: "⚠️" };
    } else if (viento >= 50 || olas >= 3.0) {
        return { activa: true, origen: 'AEMET', nivel: "AMARILLA", tipo: "Riesgo por Fenómenos Costeros", colorClasses: "from-yellow-500 to-amber-600 text-yellow-400 border-yellow-400 shadow-[0_0_20px_rgba(245,158,11,0.4)]", icono: "⚠️" };
    }
    
    if (precipitacionMM > 0 || probLluvia > 60 || (clima && clima.toLowerCase() === "lluvia")) {
        return { activa: true, origen: 'LLUVIA', nivel: "PELIGROSO", tipo: "Tormenta o Lluvia Activa", colorClasses: "from-blue-600 to-indigo-800 text-blue-300 border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.4)]", icono: "⛈️" };
    } else if (probLluvia > 40) {
        return { activa: true, origen: 'LLUVIA', nivel: "PRECAUCIÓN", tipo: "Alta Probabilidad de Lluvia", colorClasses: "from-sky-500 to-blue-600 text-sky-200 border-sky-400 shadow-[0_0_20px_rgba(14,165,233,0.4)]", icono: "🌦️" };
    }

    return { activa: false };
}

function renderizarAlertaGlobal(alerta) {
    let container = document.getElementById('global-alert-container');
    const resultadoDiv = document.getElementById('resultado');
    
    if (!container) {
        container = document.createElement('div');
        container.id = 'global-alert-container';
        resultadoDiv.parentNode.insertBefore(container, resultadoDiv);
    }
    
    if (!alerta.activa) {
        container.innerHTML = "";
        return;
    }
    
    let tituloHTML = alerta.origen === 'AEMET' 
        ? `AVISO AEMET <span class="bg-red-600 text-white text-[11px] px-2 py-0.5 rounded-sm animate-bounce ml-2">ACTIVO</span>` 
        : `ALERTA CLIMA <span class="bg-blue-500 text-white text-[11px] px-2 py-0.5 rounded-sm animate-bounce ml-2">LLUVIA</span>`;
    
    let msgHTML = alerta.origen === 'AEMET' 
        ? `Peligro extremo para la práctica de Paddle Surf. <strong>Las autoridades recomiendan no salir al mar bajo ninguna circunstancia.</strong>`
        : `Condiciones inseguras por lluvia. <strong>Prohibido salir a remar. El riesgo de rayos y ráfagas súbitas es alto.</strong>`;

    if (alerta.nivel === "PRECAUCIÓN") {
        msgHTML = `Probabilidad de lluvia moderada-alta (>40%). Evalúa constantemente el cielo y ten un plan de escape rápido.`;
    }
    
    container.innerHTML = `
        <div class="mb-6 bg-gradient-to-r ${alerta.colorClasses} p-1 rounded-3xl animate-pulse shadow-lg">
            <div class="bg-slate-900 rounded-[1.3rem] p-5 sm:p-6 flex items-start gap-4 h-full relative overflow-hidden">
                <div class="bg-slate-800 p-3 rounded-full border border-slate-700 shadow-inner z-10 flex-shrink-0 mt-1">
                    <span class="text-3xl leading-none block drop-shadow-md">${alerta.icono}</span>
                </div>
                <div class="flex-1 text-left z-10 min-w-0">
                    <h4 class="font-black text-xs sm:text-sm uppercase tracking-widest mb-1.5 flex items-center" style="color: inherit;">
                        ${tituloHTML}
                    </h4>
                    <p class="text-white font-bold text-sm sm:text-base mb-2 leading-tight truncate">${alerta.tipo} (Nivel ${alerta.nivel})</p>
                    <p class="text-slate-300 text-xs sm:text-sm leading-relaxed border-t border-slate-700/50 pt-3">
                        ${msgHTML}
                    </p>
                </div>
            </div>
        </div>
    `;
}

function consultar() {
    const locationInput = document.getElementById('location').value;
    const dateInput = document.getElementById('date').value;
    const timeRangeInput = document.getElementById('timeRange').value;
    const userLevelInput = document.getElementById('userLevel').value;

    const btn = document.getElementById('btn-consultar');
    const spinner = document.getElementById('spinner');
    const btnText = document.getElementById('btn-text');
    const resultado = document.getElementById('resultado');

    if (!locationInput || !dateInput || !timeRangeInput || !userLevelInput) {
        alert("Por favor, rellena todos los campos.");
        return;
    }

    buscarYCentrarMapa(locationInput);

    btn.disabled = true; 
    spinner.classList.remove('hidden'); 
    btnText.textContent = 'Analizando zona...';
    resultado.textContent = 'Contactando con servidores marítimos...';

    const alertaPrevia = document.getElementById('global-alert-container');
    if (alertaPrevia) {
        alertaPrevia.innerHTML = "";
    }

    const payload = { 
        location: locationInput, 
        date: dateInput, 
        timeRange: timeRangeInput, 
        userLevel: userLevelInput 
    };

    fetch("https://paddlesafe-backend.vercel.app/api/backend.js?action=forecast", {
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify(payload)
    })
    .then(async response => {
        const text = await response.text();
        return { ok: response.ok, status: response.status, text };
    })
    .then(({ ok, status, text }) => {
        let textoFinal = text;
        
        try {
            const parsed = JSON.parse(text);
            
            if (ok && parsed.datos) {
                const d = parsed.datos; 
                const r = parsed.received;
                
                datosMeteoActuales = d; 

                const windKmh = (d.windSpeed * 3.6).toFixed(1);
                const cardinalPoints = ["Norte", "Noreste", "Este", "Sureste", "Sur", "Suroeste", "Oeste", "Noroeste"];
                const cardinalIndex = Math.round(d.windDirection / 45) % 8;

                document.getElementById("proWindSpeed").textContent = `${windKmh} km/h`;
                
                const windDegrees = Math.round(d.windDirection);
                document.getElementById("proWindDir").innerHTML = `
                    <span class="inline-flex items-center gap-1">
                        <svg class="h-4 w-4 sm:h-5 sm:w-5 text-water drop-shadow-sm transition-transform duration-500" style="transform: rotate(${windDegrees}deg);" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m0 0l-4-4m4 4l4-4" />
                        </svg>
                        <span>${cardinalPoints[cardinalIndex]} (${windDegrees}°)</span>
                    </span>
                `;

                let waveValue = null;
                if (d.waveHeight !== null && d.waveHeight !== undefined && String(d.waveHeight).trim().toLowerCase() !== "null" && !isNaN(d.waveHeight)) {
                    waveValue = parseFloat(d.waveHeight);
                }

                document.getElementById("proWave").textContent = waveValue !== null ? `${waveValue} m` : 'N/D*';

                const precipitacionMM = d.precipitation !== undefined ? parseFloat(d.precipitation) : 0;
                const probLluvia = parseFloat(d.precipitation_probability ?? d.precipProbability ?? 0);
                
                document.getElementById("proPrecipitation").textContent = `${precipitacionMM} mm`;
                document.getElementById("proPrecipProb").textContent = `${probLluvia}%`;

                const alertaGlobal = evaluarAlertasGlobales(windKmh, waveValue, precipitacionMM, probLluvia, d.clima);
                renderizarAlertaGlobal(alertaGlobal);

                let safetyMsg = "";
                const wave = waveValue !== null ? waveValue : 0; 
                const wind = parseFloat(windKmh);
                const levelEl = document.getElementById("proLevel");
                let estado = "";

                if (alertaGlobal.activa && alertaGlobal.origen === 'AEMET') {
                    estado = "PROHIBIDO"; 
                    safetyMsg = `🚨 ALERTA ACTIVA AEMET. Condición extrema detectada (${alertaGlobal.tipo}).`; 
                    levelEl.className = "min-h-[48px] flex items-center justify-center px-6 py-3 rounded-full text-base sm:text-lg font-black w-full text-center bg-red-600 text-white shadow-lg shadow-red-500/50 animate-pulse";
                } else if (precipitacionMM > 0 || probLluvia > 60) {
                    estado = "Peligroso"; 
                    safetyMsg = "🔴 Peligroso. Riesgo de lluvia o tormenta inminente. Prohibido salir al mar.";
                    levelEl.className = "min-h-[48px] flex items-center justify-center px-6 py-3 rounded-full text-base sm:text-lg font-bold w-full text-center bg-red-100 text-red-700";
                } else if (probLluvia > 40) {
                    estado = "Precaución"; 
                    safetyMsg = "🟡 Precaución. Alta probabilidad de lluvia. Evalúa el cielo y no te alejes de la costa.";
                    levelEl.className = "min-h-[48px] flex items-center justify-center px-6 py-3 rounded-full text-base sm:text-lg font-bold w-full text-center bg-yellow-100 text-yellow-700";
                } else {
                    if (userLevelInput === "Principiante") {
                        if (wind <= 11 && wave <= 0.4) { 
                            estado = "Seguro"; 
                            safetyMsg = "🟢 Seguro. Condiciones perfectas para tu nivel."; 
                            levelEl.className = "min-h-[48px] flex items-center justify-center bg-emerald-100 text-emerald-700 rounded-full font-bold w-full"; 
                        } else { 
                            estado = "Peligroso"; 
                            safetyMsg = "🔴 Peligroso por viento/oleaje. No recomendado para principiantes."; 
                            levelEl.className = "min-h-[48px] flex items-center justify-center bg-red-100 text-red-700 rounded-full font-bold w-full"; 
                        }
                    } else if (userLevelInput === "Intermedio") {
                        if (wind <= 13 && wave <= 0.7) { 
                            estado = "Seguro"; 
                            safetyMsg = "🟢 Seguro. Buenas condiciones para navegar."; 
                            levelEl.className = "min-h-[48px] flex items-center justify-center bg-emerald-100 text-emerald-700 rounded-full font-bold w-full"; 
                        } else { 
                            estado = "Peligroso"; 
                            safetyMsg = "🔴 Peligroso por viento/oleaje. Riesgo alto, mejor no salir."; 
                            levelEl.className = "min-h-[48px] flex items-center justify-center bg-red-100 text-red-700 rounded-full font-bold w-full"; 
                        }
                    } else { 
                        if (wind <= 14 && wave <= 1.5) { 
                            estado = "Seguro"; 
                            safetyMsg = "🟢 Seguro. Condiciones manejables para travesía."; 
                            levelEl.className = "min-h-[48px] flex items-center justify-center bg-emerald-100 text-emerald-700 rounded-full font-bold w-full"; 
                        } else { 
                            estado = "Peligroso"; 
                            safetyMsg = "🔴 Peligroso. Condiciones extremas de viento y mar."; 
                            levelEl.className = "min-h-[48px] flex items-center justify-center bg-red-100 text-red-700 rounded-full font-bold w-full"; 
                        }
                    }
                }
                
                levelEl.textContent = estado;

                const locationName = r.location.includes(',') ? "Coordenadas seleccionadas" : r.location;
                const alertaOleaje = waveValue === null ? "\n\n⚠️ *Oleaje N/D: Tu coordenada parece estar en tierra firme. Para ver el oleaje real, abre el 'Modo Pro' y haz clic sobre el agua." : "";
                
                textoFinal = `📍 Zona: ${locationName}\n📅 Fecha: ${r.date} | ${r.timeRange}\n\n🌊 Oleaje: ${waveValue !== null ? waveValue + ' m' : 'N/D'}\n💨 Viento: ${windKmh} km/h\n🌧️ Lluvia: ${precipitacionMM} mm (Probabilidad: ${probLluvia}%)\n\n💡 Veredicto:\n${safetyMsg}${alertaOleaje}`;
                
                let tempAireValue = d.tempAire ?? d.temperature ?? d.temp ?? "N/D";
                let tempAguaValue = d.tempAgua ?? d.waterTemperature ?? d.water_temp ?? "N/D";
                
                document.getElementById('tempAmbiente').textContent = tempAireValue !== "N/D" ? `${tempAireValue}°` : "--°";
                document.getElementById('tempAgua').textContent = tempAguaValue !== "N/D" ? `${tempAguaValue}°` : "--°";
                
                let icono = "☀️", textoClima = "SOL";
                if (d.clima && d.clima.toLowerCase().includes("nublado")) { 
                    icono = "⛅"; 
                    textoClima = "NUBES"; 
                }
                if ((d.clima && d.clima.toLowerCase().includes("lluvia")) || probLluvia > 0) { 
                    icono = "🌧️"; 
                    textoClima = "LLUVIA"; 
                }
                
                document.getElementById('iconoClima').textContent = icono;
                document.getElementById('textoClima').textContent = textoClima;

                generarTimelineSimulado(datosMeteoActuales);

                if (modoRutaLibreActivo && marcadoresRuta.length > 1) {
                    calcularGeometriaRuta(marcadoresRuta.map(m => m.getLatLng()));
                } else if (modoTravesiaActivo && marcadoresRuta.length === 2) {
                    analizarRutaGeometria(marcadoresRuta[0].getLatLng(), marcadoresRuta[1].getLatLng());
                }
            } 
        } catch (e) {
            if (!ok) {
                textoFinal = `⚠️ Error ${status}: Fallo interno en el servidor Vercel.`;
            }
        }
        
        resultado.textContent = textoFinal;
    })
    .catch(error => { 
        resultado.textContent = "❌ Error de red."; 
    })
    .finally(() => { 
        btn.disabled = false; 
        spinner.classList.add('hidden'); 
        btnText.textContent = 'Analizar Condiciones'; 
    });
}

function obtenerUbicacion() {
    const btnGps = document.getElementById('btn-gps');
    const inputLocation = document.getElementById('location');
    
    // VERIFICACIÓN HTTPS (Hostinger/Seguridad del navegador)
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        return alert("⚠️ El GPS requiere una conexión segura. Asegúrate de acceder a la web usando 'https://' en lugar de 'http://'.");
    }

    if (!navigator.geolocation) { 
        alert("Tu navegador no soporta la geolocalización."); 
        return; 
    }

    btnGps.classList.add('animate-pulse');
    inputLocation.value = "Calculando coordenadas...";

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude.toFixed(5);
            const lon = position.coords.longitude.toFixed(5);
            inputLocation.value = `${lat}, ${lon}`;
            btnGps.classList.remove('animate-pulse');
            actualizarMapa(lat, lon);
        },
        (error) => {
            inputLocation.value = "";
            btnGps.classList.remove('animate-pulse');
            
            // Avisos específicos para orientar al usuario
            if (error.code === error.PERMISSION_DENIED) {
                alert("❌ Permiso denegado. Activa la Ubicación y dale permisos a tu navegador web.");
            } else if (error.code === error.POSITION_UNAVAILABLE) {
                alert("❌ Señal de ubicación no disponible en este momento.");
            } else {
                alert("❌ Error al obtener ubicación: " + error.message);
            }
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}

// ====================================================
// 6. NAVEGACIÓN GPS EN VIVO Y CAPTURA DE PANTALLA
// ====================================================
async function solicitarWakeLock() {
    try { 
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen'); 
        }
    } catch (err) {
        console.warn("WakeLock falló", err);
    }
}

function iniciarTravesia() {
    if (!sesionActual && !esInvitado) {
        return alert("Inicia sesión para usar el GPS.");
    }
    
    if (!navigator.geolocation) {
        return alert("Tu navegador no soporta seguimiento GPS.");
    }

    isTracking = true; 
    trackDistanceKm = 0; 
    trackCoords = []; 
    lastPositionGPS = null; 
    trackStartTime = new Date();

    const panel = document.getElementById('liveTrackingPanel');
    panel.innerHTML = `
        <div class="flex justify-between items-center mb-4 px-1">
            <div class="flex flex-col">
                <span class="text-xs font-bold text-red-400 uppercase animate-pulse flex items-center gap-2">
                    <span class="w-2.5 h-2.5 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span> Grabando Ruta
                </span>
                <span id="gpsStatusText" class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Buscando satélites...</span>
            </div>
            <span id="liveTime" class="font-mono text-3xl font-black text-emerald-400">00:00</span>
        </div>
        <div class="grid grid-cols-2 gap-3 text-center mb-4">
            <div class="bg-slate-800 rounded-2xl py-3 border border-slate-700 shadow-inner">
                <p class="text-[10px] text-slate-400 font-bold uppercase">Distancia</p>
                <p id="liveDist" class="font-black text-xl text-white">0.00 <span class="text-xs text-slate-400">km</span></p>
            </div>
            <div class="bg-slate-800 rounded-2xl py-3 border border-slate-700 shadow-inner">
                <p class="text-[10px] text-slate-400 font-bold uppercase">Velocidad</p>
                <p id="liveSpeed" class="font-black text-xl text-white">0.0 <span class="text-xs text-slate-400">km/h</span></p>
            </div>
        </div>
        <button id="btnFinalizarTravesia" onclick="finalizarTravesia()" class="w-full h-12 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl active:scale-95">
            ⏹ Finalizar
        </button>
    `;

    panel.classList.remove('hidden');
    document.getElementById('btnIniciarLive').classList.add('hidden');
    document.getElementById('btnTravesia').classList.add('hidden');
    document.getElementById('btnRutaLibre').classList.add('hidden');
    
    solicitarWakeLock();

    if (lineaRuta) {
        map.removeLayer(lineaRuta);
    }
    
    livePolyline = L.polyline([], {color: '#ef4444', weight: 5}).addTo(map);
    cronometroInterval = setInterval(actualizarCronometro, 1000);

    watchId = navigator.geolocation.watchPosition(
        posicionActualizadaGPS,
        (error) => console.warn("Error GPS:", error.message),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );
}

function posicionActualizadaGPS(pos) {
    if (!isTracking) return;
    
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const accuracy = pos.coords.accuracy;
    
    const gpsStatus = document.getElementById('gpsStatusText');
    if (gpsStatus) {
        if (accuracy > 100) {
            gpsStatus.innerHTML = `⚠️ Señal débil (${Math.round(accuracy)}m)`;
            gpsStatus.className = "text-[10px] font-bold text-yellow-400 uppercase tracking-widest mt-1";
        } else {
            gpsStatus.innerHTML = `✅ Señal óptima (${Math.round(accuracy)}m)`;
            gpsStatus.className = "text-[10px] font-bold text-emerald-400 uppercase tracking-widest mt-1";
        }
    }

    // Si la precisión es malísima, no la guardamos en el track para no falsear los kilómetros ni ensuciar el mapa
    if (accuracy > 100) return;

    const currentPoint = L.latLng(lat, lng);
    trackCoords.push([lat, lng]);
    livePolyline.addLatLng(currentPoint);

    if (lastPositionGPS) {
        const distMeters = lastPositionGPS.distanceTo(currentPoint);
        trackDistanceKm += (distMeters / 1000);
        let speedKmh = pos.coords.speed !== null ? (pos.coords.speed * 3.6).toFixed(1) : ((distMeters / 1000) / (1 / 3600)).toFixed(1);
        if (isNaN(speedKmh) || speedKmh < 0 || speedKmh > 50) speedKmh = 0.0; 
        
        document.getElementById('liveDist').textContent = trackDistanceKm.toFixed(2) + ' km';
        document.getElementById('liveSpeed').textContent = speedKmh + ' km/h';
    } else {
        map.setView(currentPoint, 16);
    }
    lastPositionGPS = currentPoint;
}

function actualizarCronometro() {
    const diffSecs = Math.floor((new Date() - trackStartTime) / 1000);
    const h = Math.floor(diffSecs / 3600);
    const m = Math.floor((diffSecs % 3600) / 60);
    const s = diffSecs % 60;
    
    let timeString = '';
    if (h > 0) {
        timeString += h + ':';
    }
    timeString += m.toString().padStart(2, '0') + ':' + s.toString().padStart(2, '0');
    
    document.getElementById('liveTime').textContent = timeString;
}

async function finalizarTravesia() {
    isTracking = false;
    clearInterval(cronometroInterval);
    
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
    }
    if (wakeLock !== null) {
        wakeLock.release();
    }

    const btnFinalizar = document.getElementById('btnFinalizarTravesia');
    if (btnFinalizar) { 
        btnFinalizar.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Procesando Mapa...`; 
        btnFinalizar.disabled = true; 
    }

    const minutosTotales = Math.floor((new Date() - trackStartTime) / 60000);
    
    if (trackDistanceKm < 0.05 && minutosTotales < 1) {
        alert("Ruta demasiado corta para registrarse.");
        restaurarTracker(); 
        return;
    }

    if (esInvitado) {
        alert(`✅ ¡Travesía finalizada!\nHas recorrido ${trackDistanceKm.toFixed(2)} km en ${minutosTotales} min.\n\n⚠️ Nota: Al ser invitado, esta ruta no se guardará en el historial. ¡Regístrate para guardar tu progreso y ganar puntos!`);
        restaurarTracker(); 
        return;
    }

    // Proceso de Captura de Pantalla del Mapa
    let imagenUrl = null;
    try {
        if (typeof html2canvas !== 'undefined') {
            // Ajustamos el mapa para asegurar que la ruta se ve completa antes de capturar
            if (livePolyline && trackCoords.length > 0) {
                map.fitBounds(livePolyline.getBounds(), { padding: [20, 20] });
            }
            
            // Esperamos un segundo a que las "tiles" terminen de renderizar
            await new Promise(r => setTimeout(r, 1000));

            const mapElement = document.getElementById('mapContainer');
            const canvas = await html2canvas(mapElement, { 
                useCORS: true, 
                allowTaint: false,
                backgroundColor: '#e2e8f0'
            });

            // Convertir a blob JPEG
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
            const fileName = `rutas/${sesionActual.user.id}-${Date.now()}.jpg`;

            // Subimos al bucket (asumiendo que avatars está configurado, guardamos en la carpeta rutas)
            const { error: uploadError } = await supabaseClient.storage.from('avatars').upload(fileName, blob);
            if (!uploadError) {
                const { data } = supabaseClient.storage.from('avatars').getPublicUrl(fileName);
                imagenUrl = data.publicUrl;
            }
        }
    } catch (e) {
        console.warn("No se pudo generar la captura del mapa. Se guardará sin imagen.", e);
    }

    const { error } = await supabaseClient.from('rutas').insert([{
        user_id: sesionActual.user.id, 
        distancia_km: trackDistanceKm.toFixed(2),
        tiempo_minutos: minutosTotales, 
        ruta_json: trackCoords,
        imagen_url: imagenUrl
    }]);

    if (error) {
        alert("❌ Error al guardar la ruta en base de datos. " + error.message);
        restaurarTracker();
    } else {
        const puntosGanados = Math.round(trackDistanceKm * 10) + minutosTotales;
        perfilUsuario.km_totales = Number(perfilUsuario.km_totales) + trackDistanceKm;
        perfilUsuario.tiempo_total = Number(perfilUsuario.tiempo_total || 0) + minutosTotales;
        perfilUsuario.puntos = Number(perfilUsuario.puntos || 0) + puntosGanados;
        perfilUsuario.nivel = 1 + Math.floor(perfilUsuario.puntos / 500);

        if (perfilUsuario.club_id) {
            const { data: clubData } = await supabaseClient.from('clubs').select('puntos').eq('id', perfilUsuario.club_id).single();
            if (clubData) {
                const nuevosPuntosClub = Number(clubData.puntos) + puntosGanados;
                const nuevoNivelClub = 1 + Math.floor(nuevosPuntosClub / 1000);
                await supabaseClient.from('clubs').update({ 
                    puntos: nuevosPuntosClub, 
                    nivel: nuevoNivelClub 
                }).eq('id', perfilUsuario.club_id);
            }
        }

        const panel = document.getElementById('liveTrackingPanel');
        panel.innerHTML = `
            <div class="text-center py-4">
                <span class="text-5xl block mb-3 drop-shadow-md">🏆</span>
                <h3 class="font-black text-2xl text-white mb-2">¡Ruta Guardada!</h3>
                <p class="text-slate-300 text-sm mb-5">Has sumado <span class="text-amber-400 font-bold">+${puntosGanados} pts</span> a tu perfil.</p>
                <button onclick="compartirRuta('${trackDistanceKm.toFixed(2)}', '${minutosTotales}', '${imagenUrl || ''}')" class="w-full h-12 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-base transition-all shadow-lg active:scale-95 mb-3 flex justify-center items-center gap-2">Compartir en WhatsApp</button>
                <button onclick="restaurarTracker()" class="w-full h-12 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl text-sm transition-all active:scale-95">Cerrar panel</button>
            </div>
        `;
    }
}

function restaurarTracker() {
    document.getElementById('liveTrackingPanel').classList.add('hidden');
    document.getElementById('btnIniciarLive').classList.remove('hidden');
    document.getElementById('btnTravesia').classList.remove('hidden');
    document.getElementById('btnRutaLibre').classList.remove('hidden');
}

// ====================================================
// 7. RANKING PADDLERS Y CLUBS
// ====================================================

function abrirModalRanking() {
    const modal = document.getElementById('rankingModal');
    const content = document.getElementById('rankingModalContent');
    modal.classList.remove('hidden');
    
    setTimeout(() => { 
        modal.classList.remove('opacity-0'); 
        if(content) content.classList.remove('scale-95'); 
    }, 10);
    
    cargarTopPaddlers('historico'); 
}

function cerrarModalRanking() {
    const modal = document.getElementById('rankingModal');
    const content = document.getElementById('rankingModalContent');
    modal.classList.add('opacity-0');
    
    if(content) {
        content.classList.add('scale-95');
    }
    
    setTimeout(() => { 
        modal.classList.add('hidden'); 
    }, 300);
}

async function cargarTopPaddlers(periodo) {
    const tabs = ['Diario', 'Semanal', 'Mensual', 'Anual', 'Historico'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tabRank${t}`);
        if(btn) {
            btn.className = "h-8 px-3 bg-slate-100 text-slate-600 text-[10px] sm:text-xs font-bold rounded-lg hover:bg-slate-200 whitespace-nowrap";
        }
    });
    
    const btnActivo = document.getElementById(`tabRank${periodo.charAt(0).toUpperCase() + periodo.slice(1)}`);
    if(btnActivo) {
        btnActivo.className = "h-8 px-3 bg-marine text-white text-[10px] sm:text-xs font-bold rounded-lg shadow whitespace-nowrap";
    }

    const lista = document.getElementById('rankingLista');
    lista.innerHTML = `<div class="text-center py-10"><p class="text-xs font-bold text-slate-400 uppercase tracking-widest animate-pulse">Calculando...</p></div>`;

    const { data, error } = await supabaseClient.rpc('get_ranking_riders', { periodo: periodo });
    
    if (error) {
        return lista.innerHTML = `<p class="text-red-500 font-bold text-sm text-center py-4">❌ Error al cargar rankings.</p>`;
    }
    if (!data || data.length === 0) {
        return lista.innerHTML = `<p class="text-slate-500 font-bold text-sm text-center py-4">Aún no hay rutas en este periodo.</p>`;
    }

    let html = '';
    data.forEach((paddler, index) => {
        let medalla = `<span class="w-6 text-center font-black text-slate-400 text-sm sm:text-base">${index + 1}º</span>`;
        if (index === 0) {
            medalla = `<span class="w-6 text-center text-3xl drop-shadow-sm">🥇</span>`;
        } else if (index === 1) {
            medalla = `<span class="w-6 text-center text-2xl drop-shadow-sm">🥈</span>`;
        } else if (index === 2) {
            medalla = `<span class="w-6 text-center text-xl drop-shadow-sm">🥉</span>`;
        }

        const avatarSrc = paddler.avatar_url || `https://api.dicebear.com/9.x/adventurer/svg?seed=${paddler.id}&backgroundColor=e0f2fe`;
        const vipTag = paddler.is_vip ? `<span class="bg-gradient-to-r from-amber-400 to-yellow-500 text-white text-[9px] px-1.5 py-0.5 rounded shadow-sm uppercase font-black ml-1">VIP</span>` : '';
        const esPrimero = index === 0 ? 'bg-amber-50/50 border border-amber-200/50 rounded-2xl shadow-sm' : 'border-b border-slate-100 rounded-xl hover:bg-slate-50';

        html += `
            <div onclick="abrirPerfilPublico('${paddler.id}')" class="flex items-center justify-between p-3 sm:p-4 transition-colors cursor-pointer active:scale-95 ${esPrimero}">
                <div class="flex items-center gap-3 min-w-0">
                    ${medalla}
                    <img src="${avatarSrc}" class="w-12 h-12 rounded-full border-2 flex-shrink-0 ${index === 0 ? 'border-amber-400 shadow-md' : 'border-slate-200'} object-cover">
                    <div class="flex flex-col text-left min-w-0">
                        <span class="font-bold text-slate-800 text-sm flex items-center truncate w-full">${paddler.nombre || 'Paddler Anónimo'} ${vipTag}</span>
                    </div>
                </div>
                <div class="text-right flex flex-col items-end flex-shrink-0 pl-2">
                    <span class="font-black text-water text-xl">${paddler.puntos_periodo || 0}</span>
                    <span class="text-[9px] text-slate-400 block font-bold uppercase tracking-widest">PTS</span>
                </div>
            </div>
        `;
    });
    lista.innerHTML = html;
}

function abrirModalClubs() {
    const modal = document.getElementById('clubsModal');
    modal.classList.remove('hidden');
    setTimeout(() => { 
        modal.classList.remove('opacity-0'); 
        modal.querySelector('div').classList.remove('scale-95'); 
    }, 10);
    cambiarTabClubs('miclub');
}

function cerrarModalClubs() {
    const modal = document.getElementById('clubsModal');
    modal.classList.add('opacity-0');
    modal.querySelector('div').classList.add('scale-95');
    setTimeout(() => { 
        modal.classList.add('hidden'); 
    }, 300);
}

function cambiarTabClubs(tab) {
    const tabs = ['MiClub', 'BuscarClub', 'Paddlers'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab${t}`);
        if(btn) {
            btn.className = "h-9 sm:h-10 px-3 sm:px-4 bg-slate-100 text-slate-600 text-[11px] sm:text-sm font-bold rounded-lg hover:bg-slate-200 transition-all";
        }
    });
    
    if (tab === 'miclub') {
        document.getElementById('tabMiClub').className = "h-9 sm:h-10 px-3 sm:px-4 bg-marine text-white text-[11px] sm:text-sm font-bold rounded-lg shadow transition-all";
        renderTabMiClub();
    } else if (tab === 'buscar_club') {
        document.getElementById('tabBuscarClub').className = "h-9 sm:h-10 px-3 sm:px-4 bg-marine text-white text-[11px] sm:text-sm font-bold rounded-lg shadow transition-all";
        renderTabBuscarClubs();
    } else if (tab === 'paddlers') {
        document.getElementById('tabPaddlers').className = "h-9 sm:h-10 px-3 sm:px-4 bg-marine text-white text-[11px] sm:text-sm font-bold rounded-lg shadow transition-all";
        renderTabBuscarPaddlers();
    }
}

async function renderTabBuscarPaddlers() {
    const content = document.getElementById('clubsContent');
    content.innerHTML = `
        <div class="mb-5 mt-2">
            <div class="relative">
                <span class="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">🔍</span>
                <input type="text" id="buscadorPaddlers" onkeyup="ejecutarBusquedaPaddlers(event)" placeholder="Buscar por nombre..." class="block w-full h-12 pl-11 pr-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-water text-sm shadow-inner">
            </div>
        </div>
        <div id="listaBusquedaPaddlers" class="space-y-3">
            <div class="text-center py-10 opacity-70">
                <span class="text-4xl drop-shadow-sm mb-3 block">🏄‍♂️</span>
                <p class="text-xs font-bold text-slate-400 uppercase tracking-widest">Encuentra a otros Paddlers</p>
            </div>
        </div>
    `;
}

async function ejecutarBusquedaPaddlers(e) {
    if (e.key !== 'Enter') return;
    const query = document.getElementById('buscadorPaddlers').value;
    const lista = document.getElementById('listaBusquedaPaddlers');
    
    if (!query) return;

    lista.innerHTML = `<p class="text-xs text-center text-water font-bold animate-pulse py-6 uppercase tracking-widest">Buscando...</p>`;
    
    const { data, error } = await supabaseClient.from('perfiles')
        .select('*')
        .ilike('nombre', `%${query}%`)
        .eq('is_private', false)
        .limit(15);
    
    if (error || !data || data.length === 0) {
        lista.innerHTML = `<p class="text-xs text-center text-slate-500 py-6 uppercase tracking-widest">No se encontraron Paddlers públicos.</p>`;
        return;
    }

    let html = '';
    data.forEach(paddler => {
        const avatar = paddler.avatar_url || `https://api.dicebear.com/9.x/adventurer/svg?seed=${paddler.id}&backgroundColor=e0f2fe`;
        html += `
            <div class="flex items-center justify-between bg-white border border-slate-200 p-3 sm:p-4 rounded-2xl shadow-sm hover:shadow transition-shadow">
                <div class="flex items-center gap-3 min-w-0">
                    <img src="${avatar}" class="w-12 h-12 rounded-full border border-slate-100 object-cover shadow-sm">
                    <div class="flex flex-col min-w-0">
                        <span class="text-sm font-bold text-marine truncate">${paddler.nombre}</span>
                        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">${paddler.puntos} pts</span>
                    </div>
                </div>
                <button onclick="abrirPerfilPublico('${paddler.id}')" class="h-10 px-4 bg-water text-white text-xs font-bold rounded-lg shadow-md active:scale-95">Ver Perfil</button>
            </div>
        `;
    });
    lista.innerHTML = html;
}

async function abrirPerfilPublico(userId) {
    cerrarModalRanking(); 
    cerrarModalClubs();
    
    const modal = document.getElementById('authModal');
    const content = document.getElementById('authModalContent');
    content.innerHTML = `<div class="text-center py-10"><p class="text-xs font-bold text-slate-400 uppercase tracking-widest animate-pulse">Cargando perfil...</p></div>`;
    modal.classList.remove('hidden');
    
    setTimeout(() => { 
        modal.classList.remove('opacity-0'); 
        content.classList.remove('scale-95'); 
    }, 10);

    const { data: paddler } = await supabaseClient.from('perfiles')
        .select('*, clubs(nombre)')
        .eq('id', userId)
        .single();
        
    if (!paddler || paddler.is_private) {
        content.innerHTML = `
            <div class="flex justify-end mb-2">
                <button onclick="cerrarModalAuth()" class="text-slate-400 hover:bg-slate-100 rounded-full w-11 h-11 flex justify-center items-center">❌</button>
            </div>
            <div class="text-center py-10"><p class="text-sm font-bold text-slate-500">Este perfil es privado o no existe.</p></div>
        `;
        return;
    }

    const avatarSrc = paddler.avatar_url || `https://api.dicebear.com/9.x/adventurer/svg?seed=${paddler.id}&backgroundColor=e0f2fe`;
    const rango = calcularRangoMaritimo(paddler.puntos || 0);

    let botonAmigoHTML = '';
    if (sesionActual && sesionActual.user.id !== userId) {
        const { data: amistad } = await supabaseClient.from('amistades')
            .select('estado')
            .or(`and(usuario_id.eq.${sesionActual.user.id},amigo_id.eq.${userId}),and(usuario_id.eq.${userId},amigo_id.eq.${sesionActual.user.id})`)
            .single();
            
        if (amistad) {
            if (amistad.estado === 'pendiente') {
                botonAmigoHTML = `<button disabled class="mt-2 bg-slate-200 text-slate-500 text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-widest">Solicitud Enviada</button>`;
            } else {
                botonAmigoHTML = `<button disabled class="mt-2 bg-emerald-100 text-emerald-600 text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-widest border border-emerald-200">✅ Amigos</button>`;
            }
        } else {
            botonAmigoHTML = `<button onclick="enviarSolicitudAmistad('${userId}')" id="btnAmigo" class="mt-2 bg-water hover:bg-sky-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-widest transition-colors shadow">Añadir Amigo</button>`;
        }
    }

    content.innerHTML = `
        <button onclick="cerrarModalAuth()" class="absolute top-4 right-4 text-slate-400 hover:text-slate-700 bg-slate-100 rounded-full w-11 h-11 flex justify-center items-center z-10"><svg class="h-6 w-6" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg></button>
        <div class="text-center pt-2 relative">
            <img src="${avatarSrc}" class="w-24 h-24 sm:w-28 sm:h-28 mx-auto rounded-full border-4 border-water shadow-lg bg-slate-50 object-cover mt-4 mb-3">
            <h2 class="text-2xl font-black text-marine truncate px-4">${paddler.nombre}</h2>
            <p class="text-xs font-bold text-water uppercase tracking-widest">${rango.titulo}</p>
            ${paddler.clubs?.nombre ? `<p class="text-[11px] font-bold text-emerald-600 mt-1 uppercase">🛡️ ${paddler.clubs.nombre}</p>` : ''}
            ${botonAmigoHTML}
            
            <div class="bg-slate-100 rounded-xl p-4 mt-5 grid grid-cols-2 gap-3 w-full text-center divide-x divide-slate-200">
                <div><p class="text-slate-500 font-bold text-[10px] uppercase">Puntos</p><p class="text-amber-500 text-xl font-black">${paddler.puntos || 0}</p></div>
                <div><p class="text-slate-500 font-bold text-[10px] uppercase">Distancia</p><p class="text-slate-800 text-xl font-black">${Number(paddler.km_totales || 0).toFixed(1)}<span class="text-[10px] ml-0.5">km</span></p></div>
            </div>
        </div>
    `;
}

async function enviarSolicitudAmistad(amigoId) {
    if (!sesionActual) return alert("Inicia sesión para añadir amigos.");
    
    const btn = document.getElementById('btnAmigo');
    btn.disabled = true; 
    btn.textContent = "Enviando...";
    
    const { error } = await supabaseClient.from('amistades').insert([{ 
        usuario_id: sesionActual.user.id, 
        amigo_id: amigoId 
    }]);
    
    if (error) { 
        alert("Error al enviar solicitud."); 
        btn.disabled = false; 
        btn.textContent = "Añadir Amigo"; 
    } else {
        btn.className = "mt-2 bg-slate-200 text-slate-500 text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-widest";
        btn.textContent = "Solicitud Enviada";
    }
}

async function renderTabMiClub() {
    const content = document.getElementById('clubsContent');
    if (!sesionActual || esInvitado) { 
        content.innerHTML = `<div class="text-center py-10"><p class="text-sm font-bold text-slate-500">Inicia sesión para interactuar.</p></div>`; 
        return; 
    }
    
    const { data: usuario } = await supabaseClient.from('perfiles').select('club_id, club_rol').eq('id', sesionActual.user.id).single();
    
    if (!usuario.club_id) {
        content.innerHTML = `
            <div class="text-center py-6 px-2">
                <h3 class="text-xl font-black text-marine mb-2">Sin afiliación</h3>
                <p class="text-sm text-slate-500 mb-6">Busca un club en la pestaña superior.</p>
                <div class="bg-slate-50 p-5 rounded-2xl shadow-inner">
                    <h4 class="text-xs font-bold text-marine mb-3">Fundar Club</h4>
                    <input type="text" id="nuevoClubNombre" placeholder="Nombre del Club" class="w-full h-12 px-4 border rounded-xl focus:ring-2 focus:ring-water mb-4">
                    <button onclick="crearClub()" class="w-full h-12 bg-water text-white font-bold rounded-xl shadow-md active:scale-95">⚓ Crear Club</button>
                </div>
            </div>
        `;
        return;
    }

    const { data: club } = await supabaseClient.from('clubs').select('*').eq('id', usuario.club_id).single();
    const { data: miembros } = await supabaseClient.from('perfiles').select('id, nombre, puntos, avatar_url, club_rol').eq('club_id', club.id).order('puntos', { ascending: false });
    const { data: trofeos } = await supabaseClient.from('trofeos_club').select('*').eq('club_id', club.id);

    const logoClub = club.logo_url || `https://api.dicebear.com/9.x/initials/svg?seed=${club.nombre}&backgroundColor=0ea5e9`;
    
    let htmlTrofeos = '';
    if(trofeos && trofeos.length > 0) {
        htmlTrofeos = `
            <h4 class="text-[10px] font-black text-amber-500 uppercase tracking-widest mt-6 mb-2 text-left">🏆 Vitrina de Trofeos</h4>
            <div class="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
        `;
        trofeos.forEach(t => { 
            htmlTrofeos += `
                <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col items-center min-w-[80px] shadow-sm">
                    <span class="text-3xl mb-1">${t.icono}</span>
                    <span class="text-[9px] font-bold text-marine text-center leading-tight">${t.nombre}</span>
                </div>
            `; 
        });
        htmlTrofeos += `</div>`;
    }

    let htmlMiembros = `
        <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1 mt-4 mb-2 text-left">Tripulación (${miembros.length})</h4>
        <div class="space-y-2">
    `;
    
    miembros.forEach(m => {
        let tagRol = m.club_rol === 'creador' ? '👑' : (m.club_rol === 'admin' ? '🛡' : '');
        htmlMiembros += `
            <div class="flex items-center justify-between bg-slate-50 border border-slate-200 p-2 rounded-xl">
                <div class="flex items-center gap-3">
                    <img src="${m.avatar_url}" class="w-8 h-8 rounded-full border border-slate-200 object-cover">
                    <div class="flex flex-col">
                        <span class="text-xs font-bold text-marine">${m.nombre} ${tagRol}</span>
                    </div>
                </div>
                <span class="text-xs font-black text-water">${m.puntos} pts</span>
            </div>
        `;
    });
    htmlMiembros += `</div>`;

    let panelAdminHTML = '';
    const esAdmin = (usuario.club_rol === 'creador' || usuario.club_rol === 'admin');
    const esCreador = usuario.club_rol === 'creador';

    if (esAdmin) {
        let optionsMiembros = '<option value="">Selecciona un paddler...</option>';
        miembros.forEach(m => { 
            optionsMiembros += `<option value="${m.id}">${m.nombre}</option>`; 
        });

        panelAdminHTML = `
            <div class="mt-6 border-t border-slate-200 pt-5">
                <h3 class="text-[10px] sm:text-xs font-black text-purple-600 uppercase tracking-widest mb-3 flex items-center gap-1">🛡 Zona Administrador</h3>
                <div class="bg-purple-50/50 p-4 rounded-2xl border border-purple-100 shadow-inner space-y-3">
                    <select id="insigniaUser" class="w-full h-12 text-sm px-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-purple-400 bg-white">${optionsMiembros}</select>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input type="text" id="insigniaNombre" placeholder="Ruta/Quedada" class="w-full h-12 text-sm px-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-purple-400">
                        <input type="text" id="insigniaLugar" placeholder="Lugar (Cala Blanca)" class="w-full h-12 text-sm px-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-purple-400">
                    </div>
                    <div class="grid grid-cols-3 gap-3 items-center">
                        <input type="text" id="insigniaIcono" placeholder="Icono (ej. 🏅)" class="w-full h-12 text-center text-lg rounded-xl border border-slate-300 focus:ring-2 focus:ring-purple-400 col-span-1">
                        <button onclick="otorgarInsigniaClub()" class="w-full h-12 bg-purple-600 text-white text-xs sm:text-sm font-bold rounded-xl hover:bg-purple-700 shadow active:scale-95 col-span-2 transition-all">Otorgar Insignia</button>
                    </div>
                </div>
            </div>
        `;
    }

    let btnSubirLogo = esCreador ? `
        <label for="logoClubUpload" class="absolute bottom-0 right-0 bg-water text-white rounded-full p-2 cursor-pointer shadow-lg hover:bg-sky-600 transition-colors transform translate-x-2 translate-y-2">
            <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
        </label>
        <input type="file" id="logoClubUpload" accept="image/*" class="hidden" onchange="subirLogoClub(event, '${club.id}')">
    ` : '';

    let botonPeligro = esCreador ? 
        `<button onclick="eliminarClub('${club.id}')" class="w-full h-12 mt-4 bg-red-50 text-red-500 text-xs sm:text-sm font-bold uppercase tracking-widest rounded-xl hover:bg-red-100 transition-colors border border-red-200">Eliminar Club</button>` :
        `<button onclick="abandonarClub()" class="w-full h-12 mt-4 bg-red-50 text-red-500 text-xs sm:text-sm font-bold uppercase tracking-widest rounded-xl hover:bg-red-100 transition-colors border border-red-200">Abandonar Club</button>`;

    content.innerHTML = `
        <div class="text-center mb-4">
            <div class="relative inline-block mb-3">
                <img id="logoClubPreview" src="${logoClub}" class="w-20 h-20 mx-auto rounded-3xl border-4 border-water shadow-lg object-cover transition-opacity">
                ${btnSubirLogo}
            </div>
            <h3 class="text-2xl font-black text-marine mt-3">${club.nombre}</h3>
            <p class="text-[11px] font-bold text-slate-500 uppercase mt-1">Nvl ${club.nivel} • ${club.puntos} Puntos Globales</p>
        </div>
        ${htmlTrofeos}
        ${htmlMiembros}
        ${panelAdminHTML}
        ${botonPeligro}
    `;
}

async function renderTabBuscarClubs() {
    const content = document.getElementById('clubsContent');
    content.innerHTML = `
        <div class="mb-5 mt-2">
            <div class="relative">
                <span class="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">🔍</span>
                <input type="text" id="buscadorClubs" onkeyup="ejecutarBusquedaClubs(event)" placeholder="Buscar por nombre..." class="block w-full h-12 pl-11 pr-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-water text-sm shadow-inner">
            </div>
        </div>
        <div id="listaBusquedaClubs" class="space-y-3">
            <div class="text-center py-10 opacity-70">
                <span class="text-4xl drop-shadow-sm mb-3 block">⛵</span>
                <p class="text-xs font-bold text-slate-400 uppercase tracking-widest">Busca un club para unirte</p>
            </div>
        </div>
    `;
}

async function ejecutarBusquedaClubs(e) {
    if (e.key !== 'Enter') return;
    
    const query = document.getElementById('buscadorClubs').value;
    const lista = document.getElementById('listaBusquedaClubs');
    
    if (!query) return;

    lista.innerHTML = `<p class="text-xs text-center text-water font-bold animate-pulse py-6 uppercase tracking-widest">Buscando flota...</p>`;
    
    const { data, error } = await supabaseClient.from('clubs')
        .select('*')
        .ilike('nombre', `%${query}%`)
        .limit(10);
        
    if (error || !data || data.length === 0) {
        lista.innerHTML = `<p class="text-xs text-center text-slate-500 py-6 uppercase tracking-widest">No se encontraron clubes.</p>`;
        return;
    }

    let html = '';
    data.forEach(c => {
        const logo = c.logo_url || `https://api.dicebear.com/9.x/initials/svg?seed=${c.nombre}&backgroundColor=0ea5e9`;
        html += `
            <div class="flex items-center justify-between bg-white border border-slate-200 p-3 sm:p-4 rounded-2xl shadow-sm hover:shadow transition-shadow">
                <div class="flex items-center gap-3 sm:gap-4 min-w-0">
                    <img src="${logo}" class="w-12 h-12 sm:w-14 sm:h-14 rounded-xl border border-slate-100 object-cover flex-shrink-0 shadow-sm">
                    <div class="flex flex-col min-w-0">
                        <span class="text-sm sm:text-base font-bold text-marine truncate">${c.nombre}</span>
                        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">Nivel ${c.nivel} • ${c.puntos} pts</span>
                    </div>
                </div>
                <button onclick="unirseClub('${c.id}')" class="h-10 px-4 bg-water text-white text-xs font-bold rounded-lg shadow-md active:scale-95 flex-shrink-0 transition-transform">Unirme</button>
            </div>
        `;
    });
    lista.innerHTML = html;
}

async function crearClub() {
    const nombre = document.getElementById('nuevoClubNombre').value;
    
    if (!nombre) {
        return alert("Ponle un nombre a tu Club.");
    }
    if (!sesionActual) {
        return;
    }

    const { data: club, error: errClub } = await supabaseClient.from('clubs')
        .insert([{ nombre: nombre, creador_id: sesionActual.user.id }])
        .select()
        .single();
        
    if (errClub) {
        return alert("Error al crear el club. Puede que el nombre ya exista.");
    }

    const { error: errUser } = await supabaseClient.from('perfiles')
        .update({ club_id: club.id, club_rol: 'creador' })
        .eq('id', sesionActual.user.id);
        
    if (!errUser) {
        alert(`¡Club ${nombre} fundado con éxito! ⚓`);
        renderTabMiClub();
    }
}

async function unirseClub(clubId) {
    if (!sesionActual || esInvitado) {
        return alert("Regístrate en una cuenta real para unirte a un club.");
    }
    
    const { error } = await supabaseClient.from('perfiles')
        .update({ club_id: clubId, club_rol: 'miembro' })
        .eq('id', sesionActual.user.id);
        
    if (error) {
        alert("Error al unirse.");
    } else { 
        alert("¡Bienvenido a bordo! ⛵"); 
        cambiarTabClubs('miclub'); 
    }
}

async function abandonarClub() {
    if(!confirm("¿Seguro que quieres abandonar el club? Perderás tu rango.")) {
        return;
    }
    await supabaseClient.from('perfiles').update({ club_id: null, club_rol: 'ninguno' }).eq('id', sesionActual.user.id);
    renderTabMiClub();
}

async function eliminarClub(clubId) {
    if(!confirm("⚠️ ADVERTENCIA: ¿Estás seguro de que quieres disolver y ELIMINAR tu club por completo? Todos los miembros serán expulsados.")) {
        return;
    }
    
    await supabaseClient.from('perfiles').update({ club_id: null, club_rol: 'ninguno' }).eq('club_id', clubId);
    const { error } = await supabaseClient.from('clubs').delete().eq('id', clubId);
    
    if (error) {
        alert("Error al eliminar el club.");
    } else { 
        alert("El club ha sido disuelto."); 
        renderTabMiClub(); 
    }
}

async function expulsarMiembro(userId) {
    if(!confirm("¿Seguro que quieres expulsar a este usuario del club?")) {
        return;
    }
    
    const { error } = await supabaseClient.from('perfiles').update({ club_id: null, club_rol: 'ninguno' }).eq('id', userId);
    
    if (error) {
        alert("Error al expulsar al miembro."); 
    } else { 
        alert("Usuario expulsado."); 
        renderTabMiClub(); 
    }
}

async function hacerAdmin(userId) {
    const { data: usuarioActual } = await supabaseClient.from('perfiles').select('club_id').eq('id', sesionActual.user.id).single();
    const { data: admins } = await supabaseClient.from('perfiles').select('id').eq('club_id', usuarioActual.club_id).eq('club_rol', 'admin');
    
    if (admins && admins.length >= 5) {
        return alert("Ya hay 5 administradores en este club.");
    }
    
    await supabaseClient.from('perfiles').update({ club_rol: 'admin' }).eq('id', userId);
    alert("Usuario ascendido a Administrador."); 
    renderTabMiClub();
}

async function quitarAdmin(userId) {
    if(!confirm("¿Quitar permisos de administrador a este usuario?")) {
        return;
    }
    
    await supabaseClient.from('perfiles').update({ club_rol: 'miembro' }).eq('id', userId);
    renderTabMiClub();
}

async function otorgarInsigniaClub() {
    const userIdDestino = document.getElementById('insigniaUser').value;
    const nombre = document.getElementById('insigniaNombre').value;
    const lugar = document.getElementById('insigniaLugar').value;
    const icono = document.getElementById('insigniaIcono').value || '🏅';
    
    if(!userIdDestino || !nombre || !lugar) {
        return alert("Rellena todos los campos.");
    }

    const { data: clubUsuario } = await supabaseClient.from('perfiles').select('club_id').eq('id', sesionActual.user.id).single();
    const { data: clubData } = await supabaseClient.from('clubs').select('nombre, logo_url').eq('id', clubUsuario.club_id).single();
    const { data: userDestino } = await supabaseClient.from('perfiles').select('insignias').eq('id', userIdDestino).single();

    let arrInsignias = userDestino.insignias || [];
    arrInsignias.push({ 
        icono: icono, 
        nombre: nombre, 
        lugar: lugar, 
        fecha: new Date().toLocaleDateString('es-ES'), 
        club_nombre: clubData.nombre, 
        club_logo: clubData.logo_url 
    });

    const { error } = await supabaseClient.from('perfiles').update({ insignias: arrInsignias }).eq('id', userIdDestino);
    
    if(error) {
        alert("Error al otorgar insignia.");
    } else {
        alert("¡Insignia otorgada con éxito! 🏆");
        document.getElementById('insigniaNombre').value = ""; 
        document.getElementById('insigniaLugar').value = ""; 
        document.getElementById('insigniaIcono').value = "";
    }
}

async function subirLogoClub(event, clubId) {
    const file = event.target.files[0];
    
    if (!file) {
        return;
    }
    
    const preview = document.getElementById('logoClubPreview');
    if (preview) {
        preview.style.opacity = '0.5';
    }
    
    const fileName = `club-${clubId}-${Date.now()}.${file.name.split('.').pop()}`;

    try {
        const { error: uploadError } = await supabaseClient.storage.from('avatars').upload(fileName, file);
        if (uploadError) throw uploadError;
        
        const { data } = supabaseClient.storage.from('avatars').getPublicUrl(fileName);
        
        const { error: updateError } = await supabaseClient.from('clubs').update({ logo_url: data.publicUrl }).eq('id', clubId);
        if (updateError) throw updateError;
        
        if (preview) {
            preview.src = data.publicUrl; 
        }
        alert("Logo del club actualizado.");
    } catch (error) { 
        alert("❌ Error al subir el logo."); 
    } finally { 
        if (preview) {
            preview.style.opacity = '1'; 
        }
    }
}