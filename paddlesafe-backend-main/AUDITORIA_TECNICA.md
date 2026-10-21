# Auditoría técnica de PaddleSafe

**Fecha:** 12-10-2026  
**Alcance:** archivos presentes en `Paddlesafe_frontend/public_html` y `paddlesafe-backend-main`.  
**Tipo de auditoría:** estática; no se dispuso de conexión al proyecto Supabase/Vercel ni de credenciales de entorno.

## Conclusión ejecutiva

El frontend y el backend meteorológico están presentes, pero el código entregado **no contiene las definiciones de la base de datos**. No se puede confirmar si los RPC, las tablas, sus columnas, foreign keys, triggers, views, policies RLS o las reglas de Storage existen en producción ni si coinciden con los contratos consumidos por el frontend. No sería válido generar SQL o policies supuestamente corregidas sin esas fuentes.

Sí se encontraron defectos verificables en código:

1. Las vistas internas de clubes no están implementadas; tanto la selección de “Tripulación” como la de “Gestión” no ejecutan ninguna acción.
2. El auto-guardado de clubes compartía un único temporizador entre campos; modificar dos campos seguidos podía cancelar el guardado del primero. Corregido.
3. Las respuestas de error de PostgREST al editar un club se ignoraban y la interfaz confirmaba falsamente que se había guardado. Corregido.
4. El perfil de usuario podía sustituirse por un objeto local no persistido ante un error de creación o una carrera de upsert. Corregido: ahora se informa el error y se relee la fila si la inserción concurrente no devuelve representación.
5. El ranking ocultaba errores RPC como si no hubiera actividad. Corregido para ambos rankings.
6. El endpoint de estado convertía un `429` de StormGlass de “LIMITED” a “ERROR”. Corregido.
7. La grabación GPS inserta directamente en Supabase y no usa el límite de tamaño y puntos que valida el endpoint backend `upload_route`; las rutas largas pueden producir payloads excesivos o fallar al guardarse.
8. El límite configurado de 10 segundos en Vercel puede agotarse en el fallback meteorológico cuando se encadenan varios proveedores.

La revisión de seguridad delegada no confirmó vulnerabilidades explotables en el código local. Esto **no certifica** el despliegue Supabase: faltan precisamente las policies, grants y configuración de Auth/Storage necesarias para comprobarlo.

## 1. Mapa de dependencias

### Pronóstico y análisis

```text
Hostinger: index.html
  └─ carga js/main.js como módulo y Supabase JS desde CDN
      └─ js/config.js crea el cliente Supabase con URL + clave publishable
      └─ js/map.js
          └─ POST https://paddlesafe-backend.vercel.app/api/backend?action=forecast
              └─ api/backend.js despacha a forecast.js
                  ├─ coordenadas suministradas o geocodificación OpenCage
                  ├─ Open-Meteo para zona horaria y fallback
                  ├─ StormGlass para pronóstico principal
                  └─ respuesta { ok, received, datos }
                      └─ map.js presenta viento, oleaje, alertas y veredicto
```

`forecast` valida ubicación, fecha, franja y nivel, normaliza el contrato y mantiene una caché por instancia. Los nombres de entorno esperados son `OPENCAGE_KEY` y `STORMGLASS_KEY`; el fallback principal usa Open-Meteo. Los errores del backend retornan HTTP 500 con `details`.

El resto de acciones Vercel se enruta desde `api/backend.js`; `vercel.json` configura `/api/backend`, el rewrite de `/api/:action` y CORS. La tabla de acciones y métodos está en el README backend: `ai`, `alerts`, `coach`, `compare`, `conditions`, `dashboard`, `forecast`, `geoanalyze`, `heatmap`, `history`, `levels`, `map`, `profile`, `radar`, `route`, `safety`, `spotinfo`, `spotlist`, `spotquality`, `spotrating`, `spotzones`, `status`, `summary`, `terrain`, `tides`, `upload_route` y `warnings`. En el frontend actual solo se encontró consumo de `forecast`; las demás acciones no forman parte del flujo local encontrado.

### Auth, perfiles y social

```text
Supabase Auth (auth.users)
  └─ sesión obtenida con getSession / onAuthStateChange
      ├─ perfiles: SELECT por id; si falta fila, upsert con id/nombre
      ├─ perfiles: edición de nombre y privacidad
      ├─ perfiles: avatar_url apunta al bucket paddlesafe
      ├─ amistades: solicitudes, aceptación y lista
      └─ notificaciones: inserción, lectura y marcado como leída
```

No se encontró código local de trigger que cree el perfil al registrarse. El frontend intenta crearlo al cargar la sesión, por lo que necesita que la policy/grant correspondiente permita al usuario insertar su propia fila; esto no puede verificarse aquí.

### Clubes, ranking y rutas GPS

```text
UI de clubes
  ├─ RPC obtener_clubs_usuario(p_user_id)
  ├─ RPC crear_club_multiclub(p_nombre)
  ├─ tabla clubs: lectura, edición, eliminación
  ├─ Storage paddlesafe: clubs/logo-<id>.jpg y clubs/portada-<id>.jpg
  └─ vistas internas de club: actualmente no implementadas

UI de ranking
  ├─ RPC get_ranking_clubs_v2(periodo)
  └─ RPC get_ranking_riders(periodo)

GPS
  ├─ navigator.geolocation.watchPosition
  ├─ html2canvas → imagen en Storage paddlesafe/rutas/
  ├─ INSERT directo en rutas (user_id, distancia_km, tiempo_minutos,
  │  ruta_json, imagen_url, ubicacion)
  ├─ INSERT opcional en club_rutas
  └─ respaldo/sincronización offline en localStorage
```

También se encontraron accesos a `club_eventos`, `club_chat`, `catalog_insignias` y las relaciones `clubs_usuarios`. La persistencia GPS del frontend **no llama** a `upload_route`; usa el cliente Supabase directamente. Por tanto, las validaciones de ese handler no se aplican a la grabación GPS actual.

## 2. RPC y contratos observables

No hay definiciones SQL de estas funciones. Los siguientes son los contratos que **espera el cliente**, no una afirmación sobre el `RETURNS` real:

| RPC | Entrada observada | Tablas usadas / retorno |
|---|---|---|
| `obtener_clubs_usuario` | `{ p_user_id }` | Se consume como lista de relaciones con al menos `club_id`, `club_rol`, `nombre`, `ubicacion`, `descripcion`, `normas`, `nivel`, `puntos`, `logo_url` y `portada_url`. Tablas internas y tipos no verificables. |
| `crear_club_multiclub` | `{ p_nombre }` | El consumidor espera que `data` sea el identificador del nuevo club. Tablas, autorización y tipo SQL no verificables. |
| `get_ranking_clubs_v2` | `{ periodo }` | Se espera una lista con `nombre`, `logo_url`, `puntos_periodo`. Tablas, lógica temporal, índices y permisos no verificables. |
| `get_ranking_riders` | `{ periodo }` | Se espera una lista con `id`, `nombre`, `avatar_url`, `puntos_periodo`. Tablas, lógica temporal, índices y permisos no verificables. |

El frontend ahora diferencia el error RPC de una lista vacía en ambos rankings. No se puede afirmar que los cuatro RPC existan ni que sus nombres de parámetros coincidan con la base de datos desplegada.

## 3. Hallazgos

### Errores críticos

No se confirmó ningún error crítico en el código local.

### Errores importantes

**I-1 — Navegación de clubes sin implementación (confirmado).**  
Archivo: `Paddlesafe_frontend/public_html/js/club/index.js`, método `cambiarVistaInterna`, alrededor de línea 35.  
La función está vacía, aunque `club.render.js` la invoca al cargar un club y los botones “Tripulación”/“Gestión” también dependen de ella. Esas secciones no pueden funcionar. No se completó porque no se proporcionaron las vistas/consultas previas ni el SQL asociado; implementarlas inventando contratos violaría el alcance pedido.

**I-2 — Tamaño de rutas GPS sin límite en el camino activo (riesgo condicionado, impacto alto para travesías largas).**  
`Paddlesafe_frontend/public_html/js/map.js`, alrededor de las líneas 816–838, agrega cada posición válida de `watchPosition` a `trackCoords`. Después inserta el array directamente en `rutas`, alrededor de la línea 888. En cambio, `paddlesafe-backend-main/lib/handlers/upload_route.js` limita a 20 000 puntos y 1 MB, pero no lo invoca el flujo de la UI. Una grabación extensa puede producir una petición muy grande o un fallo del INSERT.  
Corrección pendiente: acordar la política funcional de muestreo/límite para GPS y aplicarla en la escritura real, manteniendo los puntos inicial y final; no se recortó silenciosamente una ruta del usuario.

**I-3 — Presupuesto de ejecución ajustado en fallback meteorológico (riesgo condicionado).**  
`paddlesafe-backend-main/vercel.json` fija `maxDuration: 10`; `forecast.js` permite 2.5 s por petición normal, solicita fallback de Open-Meteo y puede consultar StormGlass y datos marinos vecinos. La geocodificación OpenCage no tiene timeout propio. Una combinación de fallo/lentitud de proveedores puede exceder el máximo de la función antes de emitir su respuesta.  
Corrección: limitar el tiempo total del flujo y dar presupuesto explícito a geocodificación/fallback, o ajustar el límite de Vercel solo si el plan desplegado lo permite. No se cambió el límite porque la cuota del plan no está en el material.

**I-4 — Acciones meteorológicas heredadas no usan la fecha/franja recibidas (limitado a esos endpoints).**  
Handlers como `dashboard`, `conditions`, `summary`, `safety`, `radar`, `spotrating`, `spotzones` y `warnings` validan `date` y `timeRange`, pero sus solicitudes StormGlass no envían límites `start`/`end`; toman una hora central de `hours`. Por tanto, esos campos no seleccionan la ventana consultada. El frontend entregado usa `forecast`, que sí construye la ventana; el impacto está en consumidores externos de las otras acciones.

### Errores menores / errores corregidos

**M-1 — Un debounce global podía cancelar el guardado de otro campo (corregido).**  
`club.info.js`: un único temporizador compartido por todos los campos cancelaba el timer previo con cada edición. Se cambió por temporizadores independientes por club y columna.

**M-2 — Fallo de UPDATE de club presentado como éxito (corregido).**  
`club/api.js`, `updateField`: Supabase/PostgREST devuelve `{ error }` y no necesariamente lanza una excepción. El error se ignoraba; `ClubInfo` actualizaba `lastSaved` y presentaba “Guardado”, y `ClubPhotos` podía continuar como si persistiera la URL. Ahora `updateField` propaga el error para que los llamadores existentes ejecuten su manejo de fallo.

**M-3 — Perfil local falso tras error/carrera de creación (corregido).**  
`auth.js`, `cargarPerfilUsuarioActivo`: se asignaba `creado || nuevo`; `nuevo` nunca probaba que la fila existiera en Supabase. Ahora se registra el error de upsert y no se simula persistencia; si `ignoreDuplicates` no retorna fila, se relee para resolver la carrera concurrente.

**M-4 — Errores RPC presentados como rankings vacíos (corregido).**  
`main.js`, `cargarTopPaddlers`: `errorClubs`/`errorRiders` estaban disponibles, pero se ignoraban y se mostraba “Sin clubes/actividad”. Ahora se muestra un error explícito y se registra el detalle en consola.

**M-5 — `429` de StormGlass reportado como error genérico (corregido).**  
`lib/handlers/status.js`: el segundo `if (!storm.ok)` sobrescribía `LIMITED`. Cambiado a `else if`, conservando el estado de cuota limitada.

## 4. RLS, Auth, Storage e integridad: límites y requisitos de verificación

No se proporcionaron migraciones, snapshots de catálogo PostgreSQL, policies ni configuración del proyecto Supabase. Por ello, no se puede confirmar ni refutar:

- SQL inválido, funciones SQL ausentes, columnas/tablas inexistentes, FK rotas, triggers o views.
- Acceso cruzado entre usuarios, bypass RLS, policies duplicadas/contradictorias o privilegios excesivos.
- Trigger de `auth.users` para creación de perfiles y restricciones reales de email/confirmación.
- Existencia/visibilidad del bucket `paddlesafe`, políticas de `INSERT/UPDATE/SELECT`, MIME permitidos y URLs públicas.
- Huérfanos en tablas o Storage.
- Índices de filtros/join/ordenación ni planes de ejecución.

Los siguientes permisos son dependencias que el código requiere; no se presentan como policies actuales:

| Superficie | Operación requerida por el frontend/backend |
|---|---|
| `perfiles` | Usuario lee/crea/actualiza su propio perfil; lectura pública debe aplicar `is_private` a nivel de base de datos, no solo en UI. |
| `rutas` | Usuario crea/lee las suyas; la lectura pública debe respetar privacidad/visibilidad decidida por el producto. El endpoint `upload_route` requiere INSERT con `user_id = auth.uid()` y SELECT de la fila devuelta. |
| `clubs`, `clubs_usuarios` | Lectura según membresía; edición/borrado solo con rol autorizado; la creación RPC debe validar actor y membresía internamente. |
| `club_rutas`, `club_eventos`, `club_chat` | INSERT/lecturas deben comprobar pertenencia al club y rol donde corresponda. |
| `amistades`, `notificaciones` | INSERT/UPDATE/SELECT restringidos a participantes y propietario. |
| `paddlesafe` | Escritura autenticada en las rutas de avatar, ruta y club; lectura pública solo si el bucket está intencionalmente expuesto. |

La clave incluida en `config.js` tiene formato publishable y por sí sola no debe tratarse como secreto; la protección de datos depende de RLS. `upload_route` usa variables `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` y valida el usuario con Auth; no se observó una `service_role` key en los archivos locales.

## 5. Rendimiento y dependencias externas

- **Consultas frontend:** el historial de rutas restringe columnas y evita descargar `ruta_json`; es una medida adecuada. Las queries sociales cargan relaciones en consultas agrupadas y con límite de feed. Sin esquema/índices no se pueden probar scans completos.
- **GPS:** el array crece por posición aceptada y se inserta entero; ver I-2.
- **Pronóstico:** presupuesto Vercel y ausencia de timeout en geocodificación OpenCage; ver I-3.
- **Histórico:** `history.js` recorre fechas de forma secuencial y no limita localmente la amplitud del rango. Su tiempo/coste crece con cada día solicitado; limitar el rango debe formar parte del contrato si este endpoint se expone a usuarios.
- **Cachés:** son `Map` locales por instancia y no persistentes/compartidas; el README lo documenta. No son almacenamiento durable ni control global de cuota.
- **Dependencias:** el backend no declara paquetes externos; usa APIs nativas (`fetch`, `AbortSignal.timeout`, `TextEncoder`) y requiere un runtime Node compatible. No fija `"engines"` ni scripts de test/build. El frontend carga Supabase JS, Leaflet, Tailwind y html2canvas desde CDN.
- **Vistas SPA:** el cliente navega con `pushState` a `/user/<id>` y `/club/<id>`. No se entregó configuración Hostinger de rewrite/fallback; debe verificarse que una recarga directa de esas rutas sirva `index.html`.

## 6. Correcciones aplicadas

### Función corregida: carga/creación de perfil

```js
export async function cargarPerfilUsuarioActivo() {
    if (!appState.sesionActual?.user) return;
    const userId = appState.sesionActual.user.id;
    let { data, error } = await supabaseClient.from('perfiles').select('*').eq('id', userId).maybeSingle();
    if (error) console.warn('[perfil] lectura:', error.message);
    if (!data && !error) {
        const nuevo = { id: userId, nombre: (appState.sesionActual.user.email || 'Paddler').split('@')[0] };
        const { data: creado, error: errorCreacion } = await supabaseClient
            .from('perfiles')
            .upsert([nuevo], { onConflict: 'id', ignoreDuplicates: true })
            .select()
            .maybeSingle();
        if (errorCreacion) {
            console.warn('[perfil] creación:', errorCreacion.message);
            return;
        }
        data = creado;
        if (!data) {
            const { data: existente, error: errorLectura } = await supabaseClient
                .from('perfiles')
                .select('*')
                .eq('id', userId)
                .maybeSingle();
            if (errorLectura) {
                console.warn('[perfil] lectura tras creación concurrente:', errorLectura.message);
                return;
            }
            data = existente;
        }
    }
    if (data) { appState.perfilUsuario = data; actualizarBotonCabecera(); }
}
```

### Función corregida: persistencia de campos de club

```js
async updateField(clubId, payload) {
    const { error } = await supabaseClient.from('clubs').update(payload).eq('id', clubId);
    if (error) throw error;
}
```

El ranking ahora muestra un estado de error diferenciado cuando RPC devuelve `error`; el auto-guardado usa un temporizador por campo. El `429` de StormGlass se mantiene como `LIMITED`.

### SQL corregido

**Ninguno.** No se proporcionaron archivos SQL ni acceso al catálogo de producción; cualquier definición sería inventada. No ejecutar SQL de policies generado sin contrastarlo con el esquema real.

### Functions RPC corregidas

**Ninguna función SQL RPC puede corregirse ni entregarse completa** por falta de sus definiciones. Las correcciones aplicadas corresponden únicamente a funciones JavaScript, indicadas arriba.

### Policies corregidas

**Ninguna.** No se proporcionaron policies actuales. La tabla de dependencias RLS anterior es una lista de validaciones necesarias, no SQL listo para desplegar.

## 7. Validación realizada

- El diagnóstico del editor no reporta errores en `auth.js`, `main.js` ni `club/api.js`.
- `git diff --check` no encontró errores de whitespace en los cambios; Git sí muestra un aviso de conversión LF/CRLF en un `sw.js` previamente modificado.
- No se pudo ejecutar `node --check` ni tests: `node` no está instalado/disponible en el entorno; tampoco hay scripts de test/build en `package.json`.
- No se hicieron llamadas a producción ni se alteró el estado remoto de Supabase.

## 8. Riesgo

- **Riesgo técnico estimado del proyecto: 62/100.** Indicador cualitativo, no una métrica calculada de disponibilidad. Incluye la funcionalidad de clubes incompleta y la imposibilidad de verificar el contrato más importante (Supabase).
- **Probabilidad de algún fallo en producción: no calculable estadísticamente con estos archivos.** Si se requiere el valor numérico solicitado como indicador de incertidumbre, **55/100**, no equivalente a una tasa observada ni a una predicción de incidentes.

Para cerrar la auditoría de base de datos hacen falta, como mínimo, migraciones SQL o un dump sin datos personales, definiciones de policies/triggers/functions/views, configuración de buckets y grants; para confirmar el despliegue, también versiones de variables (nunca sus valores secretos), runtime Vercel y reglas Hostinger de SPA.
