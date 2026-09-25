# paddlesafe-backend
App para realizar deportes acuáticos de manera segura.
# PaddleSafe Backend – Documentación de la API

## 1. Introducción

PaddleSafe Backend proporciona endpoints para analizar seguridad, condiciones del mar, geografía del spot, calidad, rutas y recomendaciones tipo coach para paddle surf (SUP).

Todas las rutas siguen el patrón:
- Base: `/api/*`
- Formato: JSON
- Métodos: `GET` o `POST` según endpoint

---

## 2. Arquitectura general

- **Proveedor:** Vercel (serverless functions)
- **Lenguaje:** Node.js (ES Modules)
- **APIs externas:**
  - OpenCage (geocoding y datos geográficos)
  - StormGlass (condiciones del mar y viento)
- **Seguridad:**
  - Claves cifradas con AES-256-CBC
  - Sin claves en texto plano
- **Caché en memoria:** `Map()` por endpoint para reducir llamadas externas

---

## 3. Autenticación y límites

Actualmente:
- No hay autenticación por token (uso público controlado).
- Límites importantes:
  - StormGlass Free: ~10 requests/día.
  - OpenCage Free: límite diario según plan.

Recomendación:
- No disparar múltiples endpoints de condiciones en paralelo para el mismo usuario.
- Usar endpoints agregadores como `/api/dashboard` cuando sea posible.

---

## 4. Endpoints principales

### 4.1 `/api/dashboard` (POST)

**Descripción:**  
Panel maestro con resumen de seguridad, condiciones, mareas y recomendaciones.

**Body:**
```json
{
  "location": "Alicante, Spain",
  "date": "2026-09-26T10:00:00Z",
  "timeRange": "now",
  "userLevel": "Principiante"
}
