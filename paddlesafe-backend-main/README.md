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
| `warnings` | POST |

Las acciones POST reciben JSON. Los campos obligatorios y formatos son específicos de cada handler. Por ejemplo, `dashboard` espera `location`, `date`, `timeRange` y `userLevel`; `forecast` consume `fecha`, `horaSalida`, `nivel`, `coordenadas` y `duracionRuta`.

`route` calcula y analiza un recorrido entre origen y destino. No es el endpoint de persistencia de la grabación GPS: actualmente el frontend guarda esas rutas directamente en Supabase.

## Límites y autenticación

Los endpoints de análisis no requieren autenticación propia. Las cuotas de OpenCage y StormGlass dependen de sus planes y credenciales; usa el agregador `dashboard` cuando sea apropiado y evita solicitudes duplicadas.

La caché en memoria no es un limitador de peticiones ni un almacenamiento compartido entre instancias.
