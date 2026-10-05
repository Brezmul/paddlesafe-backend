/**
 * PADDLESAFE - MÓDULO DE AUTENTICACIÓN (auth.js)
 * Versión optimizada, modular y segura para producción.
 * Compatible con Supabase + Backend Vercel.
 */

/* ---------------------------------------------------------
   1. Inicialización de Supabase (solo ANON KEY)
--------------------------------------------------------- */

const supabaseUrl = 'https://amgmvnnwlraulbutgemx.supabase.co';
const supabaseKey = 'sb_publishable_bMJMhbAMO932NzZR8QyxAw_T6JF76Kq';

window.supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
});

/* ---------------------------------------------------------
   Variables Globales
--------------------------------------------------------- */

window.isLoginMode = true;
window.sesionActual = null;
window.perfilUsuario = null;
window.esInvitado = false;
window.esTester = false;
window.invitadoId = 'guest_' + Math.floor(Math.random() * 10000);
window.tempRecoveryTokens = null;

/* ---------------------------------------------------------
   2. Manejador de eventos de autenticación
--------------------------------------------------------- */

window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
    console.log("[AUTH LOG] Evento Supabase:", event);

    window.sesionActual = session;
    window.esInvitado = false;

    // Evitar interferencias durante recuperación
    if (event === 'PASSWORD_RECOVERY') {
        setTimeout(() => abrirModalRecuperacionFinal?.(), 500);
        return;
    }

    await actualizarPerfil(session);
    actualizarUIAuth();
});

/* ---------------------------------------------------------
   3. Cargar perfil del usuario desde la tabla "perfiles"
--------------------------------------------------------- */

async function actualizarPerfil(session) {
    if (!session) {
        window.perfilUsuario = null;
        return;
    }

    const { data, error } = await window.supabaseClient
        .from('perfiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

    if (error) {
        console.warn("[AUTH LOG] No se pudo cargar perfil:", error.message);
    }

    window.perfilUsuario = data || null;
}

/* ---------------------------------------------------------
   4. Actualizar UI según estado de sesión
--------------------------------------------------------- */

function actualizarUIAuth() {
    actualizarBotonCabecera?.();

    const modal = document.getElementById('authModal');
    if (modal && !modal.classList.contains('hidden') && window.sesionActual) {
        if (!document.getElementById('nuevaPassword')) abrirModalAuth?.();
    }
}

/* ---------------------------------------------------------
   5. Interceptor del fragmento de recuperación
--------------------------------------------------------- */

window.verificarModoRecuperacion = function() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);

    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');

    if (type === 'recovery') {
        if (!accessToken || !refreshToken) {
            alert("⚠️ Enlace de recuperación inválido o incompleto.");
            history.replaceState(null, null, window.location.pathname);
            return;
        }

        console.log("[AUTH LOG] Fragmento de recuperación detectado.");

        history.replaceState(null, null, window.location.pathname);

        window.tempRecoveryTokens = { accessToken, refreshToken, type };

        setTimeout(() => abrirModalRecuperacionFinal?.(), 500);
    }
};

/* ---------------------------------------------------------
   6. UI Login / Registro
--------------------------------------------------------- */

window.toggleAuthMode = function() {
    window.isLoginMode = !window.isLoginMode;

    document.getElementById('authTitle').textContent =
        window.isLoginMode ? "Iniciar Sesión" : "Crear Cuenta";

    document.getElementById('authDesc').textContent =
        window.isLoginMode ? "Accede a tu diario de rutas y niveles."
                           : "Únete a la tripulación de PaddleSafe.";

    document.getElementById('authSubmitBtn').textContent =
        window.isLoginMode ? "Entrar" : "Registrarme";

    document.getElementById('authToggleText').textContent =
        window.isLoginMode ? "¿No tienes cuenta?" : "¿Ya tienes cuenta?";

    document.getElementById('authToggleBtn').textContent =
        window.isLoginMode ? "Regístrate" : "Inicia Sesión";

    const privateContainer = document.getElementById('authPrivateContainer');
    if (window.isLoginMode) {
        privateContainer.classList.add('hidden');
        privateContainer.classList.remove('flex');
    } else {
        privateContainer.classList.remove('hidden');
        privateContainer.classList.add('flex');
    }
};

/* ---------------------------------------------------------
   7. Procesar Login / Registro
--------------------------------------------------------- */

window.procesarAuth = async function() {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    const isPrivate = document.getElementById('authIsPrivate')?.checked || false;
    const btn = document.getElementById('authSubmitBtn');

    const urlParams = new URLSearchParams(window.location.search);
    const esVIP = urlParams.get('ref') === 'vip';

    if (!email || !password) return alert("Por favor, rellena tu email y contraseña.");

    btn.disabled = true;
    btn.innerHTML = `Procesando...`;

    if (window.isLoginMode) {
        const { error } = await window.supabaseClient.auth.signInWithPassword({ email, password });

        if (error) {
            alert("⚠️ Error: " + error.message);
            btn.disabled = false;
            btn.textContent = "Entrar";
        }
    } else {
        const { error } = await window.supabaseClient.auth.signUp({
            email,
            password,
            options: { data: { is_vip: esVIP, is_private: isPrivate } }
        });

        if (error) {
            alert("⚠️ Error al registrar: " + error.message);
            btn.disabled = false;
            btn.textContent = "Registrarme";
        } else {
            alert("✅ ¡Registro completado!");
        }
    }
};

/* ---------------------------------------------------------
   8. Cerrar sesión
--------------------------------------------------------- */

window.cerrarSesion = async function() {
    if (window.esInvitado) {
        window.esInvitado = false;
        window.perfilUsuario = null;
        actualizarBotonCabecera?.();
        cerrarModalAuth?.();
        return;
    }

    const { error } = await window.supabaseClient.auth.signOut();

    if (error) alert("⚠️ Error al cerrar sesión: " + error.message);
    else cerrarModalAuth?.();
};

/* ---------------------------------------------------------
   9. Enviar email de recuperación
--------------------------------------------------------- */

window.enviarEmailRecuperacion = async function() {
    const email = document.getElementById('recuperarEmail').value;
    if (!email) return alert("Por favor, introduce tu email.");

    const btn = document.getElementById('btnRecuperar');
    btn.disabled = true;
    btn.textContent = "Enviando...";

    const { error } = await window.supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://sup.evolucionesdigitales.es/'
    });

    if (error) {
        alert("Error: " + error.message);
        btn.disabled = false;
        btn.textContent = "Enviar Enlace Mágico";
    } else {
        alert("✅ Enlace enviado. Revisa tu bandeja de entrada.");
        restaurarFormularioAuth?.();
        cerrarModalAuth?.();
    }
};

/* ---------------------------------------------------------
   10. Guardar nueva contraseña (Backend Vercel)
--------------------------------------------------------- */

window.guardarNuevaPassword = async function() {
    const pass = document.getElementById('nuevaPassword').value;
    const tokens = window.tempRecoveryTokens;

    if (!tokens) return alert("❌ Enlace inválido o ya usado.");
    if (pass.length < 8) return alert("⚠️ La contraseña debe tener al menos 8 caracteres.");

    const btn = document.getElementById('btnGuardarNuevaPass');
    btn.disabled = true;
    btn.innerHTML = `Guardando...`;

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

        if (response.status === 200) {
            alert("✔ Contraseña actualizada.");
            window.tempRecoveryTokens = null;
            cerrarModalAuth?.();
            window.location.href = '/panel.html';
            return;
        }

        if (response.status === 401) {
            alert("❌ Enlace expirado o ya usado.");
            window.tempRecoveryTokens = null;
            cerrarModalAuth?.();
            return;
        }

        alert("⚠️ Error: " + (data.error || "Error desconocido."));
    } catch (err) {
        alert("❌ Error de red.");
    } finally {
        btn.disabled = false;
        btn.textContent = "Cambiar contraseña";
    }
};

/* ---------------------------------------------------------
   11. Activar interceptor al cargar
--------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', window.verificarModoRecuperacion);
