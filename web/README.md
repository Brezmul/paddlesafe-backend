# PaddleSafe — aplicación React

Aplicación de seguridad y comunidad para paddle surf. Sustituye el frontend de `public_html/` (HTML y JavaScript) por React, Vite y TypeScript, mantiene Supabase y la API que ya está en Vercel, y deja el proyecto Android listo para Google Play.

La web que hoy está en producción (`www.sup.evolucionesdigitales.es` y la función `https://paddlesafe-backend.vercel.app`) **no cambia** hasta que decidas desplegar esta carpeta. `public_html/` y `api/` siguen en el repositorio.

Todo el servicio nuevo cabe en los planes gratuitos que ya usas: Supabase (clave anónima / publishable), Vercel (la función de coach y el resto del backend) y Hostinger (sitio estático). No hace falta ninguna API de pago. Open-Meteo, RainViewer y las teselas de OpenStreetMap son públicas.

## Qué incluye

- Mapa, búsqueda de lugares, GPS y veredicto de seguridad (el mismo motor de `public_html/js/engine` y `map.weather.js`).
- Jornada horaria, ventanas de salida, calculadora de neopreno, coach del backend, comparación de spots y packs de calas.
- Spots favoritos, notas, reportes y bitácora (tablas `user_spots`, `spot_reports`, `spot_logbook`).
- Rutas A-B y multipunto, ida y vuelta, importación y exportación GPX, sesión GPS en vivo, póster, check-in (`safety_checkins`) y mapa descargado en la caché del navegador.
- Radar: viento (Open-Meteo), lluvia (RainViewer), oleaje y deriva estimada.
- Clubes, chat en tiempo real, quedadas, retos, logo, paddlers y amistades.
- Muro, me gusta, comentarios, ranking (RPC `get_ranking_riders` y `get_ranking_clubs_v2`) y avisos.
- Cuenta Supabase: alta, entrada, recuperación de contraseña, perfil, foto, tabla y ritmo. Modo invitado sin escribir en nombre de otra persona.
- PWA (manifiesto, service worker y caché de teselas y pronóstico).
- Proyecto Capacitor Android con id `es.evolucionesdigitales.paddlesafe`.

La interfaz está en español.

## 1. Ejecutar en local

Hace falta Node.js 20 o superior.

```bash
cd web
cp .env.example .env
npm install
npm run icons
npm run dev
```

Abre `http://127.0.0.1:5173`.

`.env` no se sube a git. Solo van la URL de Supabase y la clave **anon / publishable**. Nunca pongas la clave `service_role` en esta app ni en Vercel como variable `VITE_`.

Variables:

| Variable | Uso |
|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto, por ejemplo `https://amgmvnnwlraulbutgemx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Clave publishable o anon del mismo proyecto |
| `VITE_BACKEND_API_URL` | Por defecto `https://paddlesafe-backend.vercel.app/api/backend` |

Comprueba el tipo, las pruebas de la pantalla y el build:

```bash
npm test
npm run typecheck
npm run build
npm run preview
```

`npm test` usa Vitest y jsdom. Renderiza `MapaPage` con el motor real, sustituye el mapa de Leaflet y deja Supabase en nulo. La red meteorológica es un doble: no hace falta internet ni credenciales. Cubre un dato ausente frente a un cero medido, costa e interior, un viento peligroso y un aviso, el parte guardado (lugar, fecha y hora al cambiar de franja) y que un fallo o una respuesta tardía no dejen el veredicto del sitio anterior. No mide cobertura ni sustituye una prueba en el teléfono.

En Supabase → Authentication → URL configuration, añade como sitio y como redirect:

- `http://127.0.0.1:5173`
- la URL pública donde publiques la web
- `https://localhost` (la usa la app Android de Capacitor)

Sin esas URLs, el enlace de “olvidé la contraseña” no vuelve a la app.

## 2. Publicar la versión web

El build deja archivos estáticos en `web/dist/` (rutas con `./`, válidas en Hostinger y dentro de la app).

### Hostinger

1. Entra en hPanel del sitio `www.sup.evolucionesdigitales.es`.
2. Haz una copia de la carpeta actual (`public_html`) antes de sustituir nada.
3. Sube **el contenido** de `web/dist/` (no la carpeta `dist` en sí) al directorio público.
4. No subas `web/.env`: las variables ya van dentro del JavaScript del build. Por eso el build tiene que hacerse con el `.env` correcto.
5. La política de privacidad del sitio actual ya está en el repositorio como `public_html/privacidad.html`. Al subir esa carpeta (o solo ese archivo) queda en `https://www.sup.evolucionesdigitales.es/privacidad.html`. El mismo texto está en la raíz del repo para Vercel: `https://paddlesafe-backend.vercel.app/privacidad.html` cuando el merge a `main` se despliegue. En la app, la ruta es `/#/privacidad`. El contacto de la política es Brezmul@gmail.com.

La app usa rutas con almohadilla (`/#/clubes`), así que Hostinger no necesita reglas de reescritura. El sitio antiguo sigue funcionando hasta que hagas esta subida: este repositorio no la hace solo.

### Vercel

La API (`api/backend.js`) sigue siendo el despliegue actual del repositorio. Para servir también esta web sin romper la API:

1. Crea un **proyecto nuevo** de Vercel (el plan Hobby es gratuito) con la raíz en `web`, o
2. deja el proyecto actual solo como API y no cambies su “Root Directory”.

Comando de build del proyecto web: `npm run build`. Directorio de salida: `dist`. En Environment Variables del proyecto web pon las tres `VITE_*` de arriba (Production y Preview). No hace falta clave de OpenCage, StormGlass ni Gemini: el coach responde con el motor propio si no hay clave de pago.

La API sigue en `api/backend.js`. El archivo `privacidad.html` de la raíz del repositorio es estático: Vercel lo publica en `/privacidad.html` sin pasar por la función.

## 3. Google Play (pasos que tienes que hacer tú)

Google cobra **una cuota única de registro** de la cuenta de desarrollador (25 USD en el momento de escribir esto). No es una suscripción de PaddleSafe ni un servicio nuevo de mapas o base de datos. Sin esa cuenta no se puede publicar en Play.

Identificador de la app: `es.evolucionesdigitales.paddlesafe`.  
Nombre visible: PaddleSafe.  
Proyecto nativo: `web/android` (Capacitor 7).  
Icono y splash de origen: `web/resources/icon.png` (1024) y `web/resources/splash.png` (2732). Las densidades Android (icono adaptable y splash) las genera `@capacitor/assets` con `npm run assets:android`. Para la ficha: `web/store-assets/play-icon-512.png`, `web/store-assets/feature-graphic-1024x500.png`, las capturas en `web/store-assets/screenshots/` y los textos en `web/store-assets/listing.md`.

### 3.1. Cuenta de desarrollador

1. Entra en [Google Play Console](https://play.google.com/console) con una cuenta de Google.
2. Acepta el acuerdo y paga la cuota de registro.
3. Completa la identidad de la cuenta (persona física o empresa). La revisión de identidad puede pedir documentos; no se puede saltar desde el código.

### 3.2. Clave de firma (hazlo una sola vez y guárdala)

En tu ordenador, fuera del repositorio:

```bash
keytool -genkeypair -v \
  -keystore paddlesafe-upload.keystore \
  -alias paddlesafe \
  -keyalg RSA -keysize 2048 -validity 10000
```

- Guarda el archivo `.keystore` y las contraseñas en un sitio que no sea git (un USB o un gestor de contraseñas). Si se pierde, no podrás actualizar la misma ficha de Play.
- No lo subas al repositorio. `.gitignore` ya ignora `*.keystore`, `*.jks` y `keystore.properties`.

### 3.3. Compilar el AAB firmado

Requisitos en el ordenador donde compiles (esta máquina de desarrollo puede no tenerlos; ver más abajo):

- JDK 21 (Capacitor 8 y el plugin de Gradle 8.13 compilan con Java 21; Java 17 no basta para el código nativo de esta versión)
- Android SDK Platform 36 y Build-Tools 36.0.0
- Variable `ANDROID_HOME` apuntando al SDK
- El `targetSdk` es 36 (Android 16). Capacitor 7 solo admite el 35, así que el proyecto usa Capacitor 8.6.0, Gradle 8.14.3 y Android Gradle Plugin 8.13.0. El mínimo pasa a Android 7.0 (API 24).

```bash
cd web
npm install
npm run icons
npm run build
npx cap sync android
```

La primera vez, si no existe `web/android`:

```bash
npx cap add android
```

`android/app/build.gradle` lee `web/keystore.properties` solo si el archivo existe, y entonces firma `bundleRelease`. Un `storeFile` relativo (por ejemplo `paddlesafe-release.keystore`) se resuelve en `web/`, junto al properties, no dentro de `android/app`. Si el properties no existe, el AAB sale sin firmar y Play lo rechaza. El archivo y cualquier `.keystore` o `.jks` están en `.gitignore`. Este repositorio no crea ni guarda la clave.

```bash
cp keystore.properties.example keystore.properties
```

Contenido de `keystore.properties`:

```
storeFile=paddlesafe-release.keystore
storePassword=LA_CONTRASEÑA
keyAlias=paddlesafe
keyPassword=LA_CONTRASEÑA
```

Genera el Android App Bundle:

```bash
cd android
./gradlew bundleRelease
```

El archivo queda en:

`web/android/app/build/outputs/bundle/release/app-release.aab`

También puedes abrir `web/android` en Android Studio y usar **Build → Generate Signed App Bundle**, eligiendo el mismo keystore. Es el camino más claro si no quieres tocar Gradle.

`npm run android:debug` genera un APK de prueba (no sirve para la ficha de producción). `npm run android:bundle` hace el build de la web, sincroniza Capacitor y lanza `bundleRelease`. Sin `keystore.properties` el bundle de release no queda firmado y Play lo rechaza.

### 3.4. Ficha de Play Console

1. Play Console → Crear app. Idioma predeterminado: español (España). Tipo: aplicación. Gratuita.
2. Panel de la app → **Prueba interna** o **Producción** → Crear versión → sube el `.aab`.
3. Ficha de Play Store (idioma español):
   - Nombre: PaddleSafe
   - Descripción breve: Pronóstico, seguridad y clubes de paddle surf.
   - Descripción completa: explica el veredicto, el mapa, los clubes y que el parte es orientativo y no sustituye a AEMET ni al 112.
   - Icono 512×512, gráfico de función 1024×500 y capturas de teléfono (mínimo 2). Hazlas con el emulador o con un móvil; no se generan solas.
4. **Política de privacidad** (obligatoria): `https://www.sup.evolucionesdigitales.es/privacidad.html` o `https://paddlesafe-backend.vercel.app/privacidad.html`. Tiene que estar en línea antes de enviar la revisión. El texto también está en la app, en `/#/privacidad`. El contacto publicado es Brezmul@gmail.com.
5. **Seguridad de los datos**: declara correo de cuenta, nombre, fotos que sube el usuario, ubicación aproximada/precisa (solo con la app en uso) y contenido del usuario. Indica que Supabase es el encargado del tratamiento. No marques “ubicación en segundo plano”: esta versión no la usa.
6. Clasificación de contenido, público objetivo (no va dirigida a niños) y anuncio de anuncios: la app no lleva publicidad.
7. Permisos: `INTERNET` y `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION`. Si más adelante activas GPS con la pantalla apagada tendrás que declararlo aparte y justificarlo; ahora no está.
8. Países, categoría (Deportes) y envío a revisión.

Play puede tardar varios días y pedir cambios de textos o capturas. Eso no se resuelve en el repositorio.

### 3.5. Por qué el AAB puede no compilar en un servidor sin Android SDK

`npx cap add android` crea el proyecto Gradle sin necesidad del SDK. `./gradlew bundleRelease` sí necesita JDK y Android SDK (`compileSdk`, build-tools y las licencias aceptadas). Si el entorno no tiene `ANDROID_HOME` ni `android/sdk`, el fallo es exactamente ese: Gradle se detiene en “SDK location not found”. Instala [Android Studio](https://developer.android.com/studio) o los command-line tools, acepta las licencias (`sdkmanager --licenses`) y vuelve a lanzar el comando en tu ordenador. No hace falta una cuenta de pago de Google Cloud para compilar.

## 4. Lo que queda en tus manos

- Copiar `web/.env.example` a `web/.env` y, al publicar, repetir esas variables en el hosting del frontend.
- Añadir las URLs de redirect en Supabase Auth (local, dominio y `https://localhost`).
- Sustituir en Hostinger el sitio actual solo cuando hayas probado `npm run preview`. Conserva una copia de `public_html`.
- Confirmar el correo de la política de privacidad y publicarla en una URL https.
- Crear la cuenta de Play Console, el keystore y las capturas.
- Colocar `paddlesafe-release.keystore` en `web/`, al lado de `keystore.properties` (`storeFile=paddlesafe-release.keystore`). Los iconos de `web/resources` y `web/store-assets` ya son los de la ficha; cámbialos solo si quieres otro diseño.
- Los tres elementos abiertos en GitHub al preparar este cambio son PRs automáticos de Dependabot (`actions/checkout`, `actions/setup-node` y `actions/upload-artifact` de la versión 4 a la 7). No describen fallos de la app y no se han mezclado aquí para no tocar la integración continua de la API.

## 5. Límites honestos

- El veredicto es una ayuda. Con tormenta, aviso naranja/rojo o duda, no se entra al agua.
- El radar de partículas del frontend antiguo pasa a ser una rejilla de viento, la capa de RainViewer y el cálculo de deriva del mismo motor. El criterio de seguridad no se ha reescrito: se importa el código que ya estaba en producción.
- El seguimiento GPS con la pantalla apagada no forma parte de esta versión (en el plan gratuito y sin un servicio de ubicación de pago es poco fiable y Play lo revisa aparte).
- La caché de mapa guarda un puñado de teselas alrededor del punto, no la costa entera.
