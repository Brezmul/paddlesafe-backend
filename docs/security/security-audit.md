# INFORME DE AUDITORÍA DE SEGURIDAD Y PROTECCIÓN DE DATOS — PADDLESAFE

**Fecha de Ejecución:** 21 de Octubre de 2026  
**Alcance:** Dependencias NPM, Arquitectura de Frontend, Reglas `.htaccess`, Supabase RLS y Detección de Secretos  
**Estado General:** 🟢 **APROBADO — 0 VULNERABILIDADES CONOCIDAS**

---

## 1. Auditoría de Dependencias NPM (`npm audit`)

Se ejecutó un análisis estricto sobre el árbol de dependencias instalado:

```bash
npm audit --audit-level=high
```

**Resultado:**
- **Vulnerabilidades Críticas:** 0
- **Vulnerabilidades Altas:** 0
- **Vulnerabilidades Moderadas:** 0
- **Vulnerabilidades Bajas:** 0
- **Total de vulnerabilidades encontradas:** **0** (Clean tree)

---

## 2. Análisis de Secretos y Claves Expuestas

Se realizó un escaneo automatizado en todo el código fuente de `public_html/` y scripts del repositorio:

| Tipo de Secreto / Token | Estado en Frontend | Verificación |
| :--- | :---: | :--- |
| **Supabase `service_role` (Master Key)** | 🟢 **NO EXPUESTO** | 0 coincidencias en frontend. Las operaciones privilegiadas se limitan a funciones de backend aisladas. |
| **Supabase `anon_key` (Public Key)** | 🟢 **CONFORME** | Clave pública autorizada para peticiones cliente, protegida en base de datos mediante **RLS (Row Level Security)**. |
| **Credenciales FTP de Hostinger** | 🟢 **PROTEGIDO** | Los scripts de despliegue (`deploy_hostinger.ps1`) reciben las credenciales por parámetro o variables de entorno, no en texto plano. |
| **Archivos de entorno (`.env*`)** | 🟢 **IGNORADOS** | Filtrados estrictamente en `.gitignore` y bloqueados por regla Apache en `.htaccess`. |
| **Archivos de log y volcados (`.sql`, `.log`)** | 🟢 **BLOQUEADOS** | Prohibida su subida a producción en Hostinger y bloqueados por servidor web. |

---

## 3. Auditoría de Configuración del Servidor Web (`.htaccess`)

El archivo [`.htaccess`](../../public_html/.htaccess) implementa políticas de defensa en profundidad:

1. **Bloqueo contra exploración de directorios:**
   - `Options -Indexes` activo para prevenir indexación de ficheros.
2. **Filtrado de peticiones a rutas y extensiones sensibles:**
   - Bloqueo 403 Forbidden a directorios: `/api`, `/lib`, `/sql`, `/.git`.
   - Bloqueo 403 Forbidden a extensiones: `.sql`, `.env`, `.log`, `.md`, `.sh`, `.bash`, `.jsonl`.
   - Bloqueo 403 Forbidden a ficheros ocultos que comiencen por punto (`.`*).
3. **Control de Caché Anti-Stale:**
   - `index.html`, `version.json` y `sw.js` están configurados con `no-cache, no-store, must-revalidate` para garantizar propagación instantánea de parches de seguridad y versiones críticas.

---

## 4. Auditoría de Protección Contra Inyecciones y XSS

1. **Sanitización de Inputs:**
   - La búsqueda de spots en el Omnibar (`#location`) y los mensajes de feedback utilizan codificación de entidades HTML (`escapeHtml` / `encodeURIComponent`) antes de pintar contenido en el DOM.
2. **Leaflet Popups:**
   - Los títulos y descripciones de las balizas cartográficas no interpretan HTML arbitrario introducido por usuarios no autenticados.
3. **Mitigación de Cross-Site Scripting (XSS):**
   - El motor de renderizado de tarjetas sociales previene la inyección de etiquetas `<script>` o manipulaciones de atributos `javascript:`.

---

## 5. Recomendaciones de Hardening para Producción

1. **Content Security Policy (CSP):**
   - Incorporar en el servidor Apache cabecera HTTP CSP restringiendo orígenes de script a dominios explícitos:
     ```apache
     Header set Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://unpkg.com https://fonts.googleapis.com; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co https://api.open-meteo.com https://*.cartocdn.com;"
     ```
2. **Cabeceras de Seguridad Adicionales:**
   - `X-Frame-Options: SAMEORIGIN` (previene clickjacking contra los modales de autenticación).
   - `X-Content-Type-Options: nosniff` (previene ataques de confusión de tipos MIME).
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains` (fuerza HTTPS en todo momento).
   - `Referrer-Policy: strict-origin-when-cross-origin`.
   - `Permissions-Policy: geolocation=(self)` (limita el acceso al GPS exclusivamente al origen de PaddleSafe).

