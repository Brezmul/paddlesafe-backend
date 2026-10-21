# PaddleSafe Backend

Backend serverless para análisis de seguridad, condiciones marinas, spots y rutas SUP.

## Arquitectura

- **Runtime:** Node.js con ES Modules, desplegado en Vercel.
- **Entrada:** `api/backend.js`, que despacha las acciones a sus handlers.
- **Proveedores externos:** OpenCage, StormGlass y Open-Meteo.
- **Variables de entorno:** `OPENCAGE_KEY` y `STORMGLASS_KEY` se configuran en Vercel.
- **Caché:** los handlers usan caché en memoria, que es local a cada instancia serverless y no persistente.

## API

La ruta canónica es `/api/backend?action=<acción>`. Los clientes antiguos que llamen `/api/<acción>` se mantienen compatibles mediante rewrites de Vercel. También se conserva el endpoint de función `/api/backend.js?action=<acción>`.

| Acción | Método |
|---|---|
| `ai` | POST |
| `alerts` | POST |
| `coach` | POST |
| `compare` | POST |
| `conditions` | POST |
| `dashboard` | POST |
| `forecast` | POST |
| `geoanalyze` | POST |
| `heatmap` | POST |
| `history` | POST |
| `levels` | GET |
| `map` | POST |
| `profile` | POST |
| `radar` | POST |
| `route` | POST |
| `safety` | POST |
| `spotinfo` | POST |
| `spotlist` | GET |
| `spotquality` | POST |
| `spotrating` | POST |
| `spotzones` | POST |
| `status` | GET |
| `summary` | POST |
| `terrain` | POST |
| `tides` | POST |
| `upload_route` | POST (Bearer token) |
| `warnings` | POST |

Las acciones POST reciben JSON. Los campos obligatorios y formatos son específicos de cada handler. Por ejemplo, `dashboard` y `forecast` usan `location`, `date`, `timeRange` y `userLevel`. `forecast` conserva compatibilidad con el contrato antiguo (`coordenadas`, `fecha`, `horaSalida`, `nivel` y `duracionRuta`) y normaliza esos campos en el servidor.

`route` calcula y analiza un recorrido entre origen y destino. No es el endpoint de persistencia de la grabación GPS: actualmente el frontend guarda esas rutas directamente en Supabase.

### `upload_route`

Guarda una ruta normalizada y autenticada en `rutas`, usando el usuario del token Supabase (se ignora cualquier `user_id` del cliente) y las políticas RLS existentes.

Configura en Vercel las variables `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`. La tabla `rutas` debe permitir `INSERT` a usuarios autenticados solo cuando `user_id = auth.uid()`.

En Vercel, añade ambas variables en **Project Settings → Environment Variables** para cada entorno de despliegue que vaya a usar la función (Production, Preview o Development). `SUPABASE_URL` debe ser la URL HTTPS del proyecto Supabase y `SUPABASE_PUBLISHABLE_KEY` una clave publishable del mismo proyecto; no configures una `service_role` key. Los valores deben estar disponibles en el runtime de la función.

La política RLS de `INSERT` debe limitar `user_id` a `auth.uid()`. Como la respuesta devuelve la fila insertada (`Prefer: return=representation`), la política de `SELECT` también debe permitir al usuario leer su propia fila. Verifica ambas políticas en el proyecto Supabase de producción antes de activar este endpoint.

Envía `POST /api/backend?action=upload_route` con `Authorization: Bearer <access_token>` y un JSON con:

```json
{
  "distancia_km": 4.2,
  "tiempo_minutos": 65,
  "ruta_json": [[38.8, 0.18], [38.81, 0.19]],
  "imagen_url": null,
  "ubicacion": "Travesía GPS"
}
```

Se aceptan entre 2 y 20 000 puntos `[latitud, longitud]`; el endpoint valida rangos, tamaño, duración, distancia e imágenes del bucket público `paddlesafe`. GPX, FIT y TCX aún requieren parsers que conviertan sus datos a este contrato antes de poder cargarlos.

## Límites y autenticación

Los endpoints de análisis no requieren autenticación propia; `upload_route` requiere un token de usuario Supabase. Las rutas offline pendientes creadas por versiones anteriores no contienen propietario verificable: al intentar sincronizarlas, se descartan localmente y no se asignan a la sesión activa. Las rutas nuevas sí guardan el ID del usuario y solo se sincronizan con esa misma cuenta.

Las cuotas de OpenCage y StormGlass dependen de sus planes y credenciales; usa el agregador `dashboard` cuando sea apropiado y evita solicitudes duplicadas.

La caché en memoria no es un limitador de peticiones ni un almacenamiento compartido entre instancias.
