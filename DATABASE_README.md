# PaddleSafe - Database & Supabase Migrations Repository (Branch: `database`)

Esta rama está destinada **exclusiva y aisladamente** a la capa de persistencia, esquemas, funciones PL/pgSQL, triggers y políticas RLS de Supabase PostgreSQL para PaddleSafe.

---

## 🔒 Aislamiento de Seguridad Frente a Hostinger

- **Cero exposición en Hostinger**: La rama de despliegue a producción en Hostinger es `frontend-deploy` (que únicamente alberga `public_html/` y recursos PWA estáticos).
- **Archivos SQL protegidos**: Ningún archivo `.sql` se encuentra en la rama de Hostinger ni se sube al servidor web.
- **Reglas `.htaccess`**: Tanto la raíz como `public_html/` tienen configurado el bloqueo estricto con `403 Forbidden` (`RewriteRule \.(sql|env|log)$ - [F,L]`) como doble capa de defensa.

---

## 🚀 Archivo Maestro de Base de Datos

El script consolidado e idempotente listo para ejecutar en Supabase es:

👉 **[`PADDLESAFE_MASTER_DATABASE_V3.sql`](PADDLESAFE_MASTER_DATABASE_V3.sql)** (y en [`sql/PADDLESAFE_MASTER_DATABASE_V3.sql`](sql/PADDLESAFE_MASTER_DATABASE_V3.sql))

### Cobertura de Parches Incluida:
1. **PATCH #01**: Seguridad RLS y aislamiento de datos por usuario.
2. **PATCH #02**: Sincronización atómica de Gamificación (`rutas` / `user_routes` <-> `perfiles`).
3. **PATCH #03**: Privacidad estricta de Clubes (`club_chat`) y permisos multi-club.
4. **PATCH #04**: Spots Favoritos (`public.user_spots`) para Comparador y Home Spots.
5. **PATCH #05**: Rankings unificados multi-periodo y filtro anti-trampas de velocidad (>45 km/h).
6. **PATCH #06**: Reportes colaborativos en tiempo real (`public.spot_reports` / Waze SUP).
7. **PATCH #07**: Perfil y calibración de material hidrodinámico SUP en `public.perfiles`.
8. **PATCH #08**: Telemetría y snapshot meteorológico en `public.rutas` y `public.user_routes`.
9. **PATCH #09**: Guardacostas Virtual y ETA Check-in en `public.safety_checkins`.
10. **EXTRA**: Quedadas multipunto (`club_eventos`, `club_eventos_asistentes`), Storage público `paddlesafe` y alta de perfiles en `auth.users`.

---

## 🛠️ Instrucciones de Ejecución

1. Accede al panel de control de tu proyecto en **Supabase** (`https://supabase.com/dashboard/project/<tu-proyecto>/sql`).
2. Abre una nueva pestaña en el **SQL Editor**.
3. Pega el contenido completo de `PADDLESAFE_MASTER_DATABASE_V3.sql`.
4. Haz clic en **Run** (Ejecutar).
5. Todo el proceso se ejecuta dentro de una transacción segura (`BEGIN; ... COMMIT;`), garantizando que no se dejen tablas en estados parciales ni se pierda ningún dato existente.
