# PaddleSafe Premium

El cobro es una suscripción de Google Play. No hay RevenueCat ni otro intermediario. El precio no está escrito en la app: sale de `ProductDetails` cuando Play responde.

## Qué es gratis y qué es Premium

Gratis, también sin cuenta:

- Mapa, búsqueda de spot y Mi GPS.
- Veredicto de seguridad del momento, con viento, rachas, oleaje y los factores de riesgo.
- El aviso de evolución peligrosa que ya viene en ese veredicto.
- Radar básico: flechas de viento, lluvia, oleaje y deriva.

Premium:

- Crear una cuenta nueva. Entrar y recuperar la contraseña siguen abiertos, para no dejar fuera a quien ya tiene usuario.
- Clubes, muro, ranking y amigos.
- Panel táctico, evolución hora a hora y coach.
- Planificador por tramos, GPX, repetición y seguimiento del recorrido.
- Partículas, favoritos, bitácora, neopreno, reporte en el agua, póster y avisos de la cuenta.

El teléfono de emergencia y el check-in de seguridad no se cobran: están en la ficha de sesión, fuera del registro del track.

La jornada por horas es Premium. El resumen de la mejor ventana y el aviso de peligro se quedan en el veredicto gratis, porque forman parte de «¿puedo salir ahora?».

## Orden de la compra

1. En Android, la persona paga con su cuenta de Google. Todavía no hace falta usuario de PaddleSafe. Play devuelve un `purchaseToken`.
2. La interfaz se abre en ese dispositivo porque Play dice que la suscripción está activa.
3. Si crea cuenta o entra, la app llama a `verificar-premium` con el token y la sesión.
4. La función lee el token en la API de Google (`purchases.subscriptionsv2`) y escribe `premium_derechos`.
5. A partir de ahí, el estado de la cuenta es el del servidor. Las políticas de fila no creen al cliente.

Un pago `PENDING` no abre Premium. Cancelar en Play deja el acceso hasta la fecha de expiración que devuelva la API; después el estado pasa a inactivo.

## Web y sitio antiguo

En el navegador no hay Play Billing. Si la cuenta tiene derecho verificado o `acceso_previo`, ve Premium. Si no, las pantallas avanzadas explican que la suscripción se contrata en la app Android. El mapa y el veredicto siguen.

`public_html` no lleva este candado. Sigue siendo el sitio de siempre. Meter el mismo cierre ahí dejaría fuera a quien entra por la web vieja; eso queda como decisión aparte.

Si la tabla `premium_derechos` o la columna `acceso_previo` aún no existen y hay sesión, la app trata a esa persona como acceso previo. Así no se cierra la cuenta de quien ya estaba antes de aplicar el SQL. Quien entra sin sesión no recibe ese hueco.

## Qué tiene que hacer Lumi en Play Console

1. Perfil de pagos activo en Google Play Console.
2. Suscripción con id de producto `premium` (o el valor de `VITE_PLAY_PRODUCT_ID` si se cambia).
3. Dos planes base, por ejemplo `mensual` (`P1M`) y `anual` (`P1Y`), con precio puesto en Play. La app muestra el texto que Play devuelve.
4. Licencias de prueba: cuentas de Gmail en Play Console → Configuración → Pruebas de licencias. Esas cuentas pueden comprar sin cargo real.
5. La app firmada de release tiene que estar en una pista (interna vale) para que Billing responda. Un APK debug no completa el flujo de compra.
6. API de Google Play Android Developer habilitada en Google Cloud, en el mismo proyecto que la cuenta de servicio.
7. En Play Console → Usuarios y permisos, invitar a esa cuenta de servicio con permiso para ver datos financieros de pedidos y suscripciones.

El botón «Gestionar o cancelar en Play» abre:

`https://play.google.com/store/account/subscriptions?package=es.evolucionesdigitales.paddlesafe&sku=premium`

## Qué tiene que hacer Lumi en Supabase (no está aplicado)

1. Revisar `sql/premium_derechos.sql`. El `update` marca `acceso_previo` solo en perfiles creados antes del 11 de noviembre de 2026. Hay que lanzarlo una vez. Una fecha distinta se cambia antes de ejecutarlo.
2. Crear el secreto `GOOGLE_PLAY_SERVICE_ACCOUNT` con el JSON de la cuenta de servicio. No va en el repositorio.
3. Desplegar `supabase/functions/verificar-premium`. Usa `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` y el secreto anterior.
4. Opcional: tema de Pub/Sub de notificaciones en tiempo real del desarrollador (RTDN) apuntando a `supabase/functions/rtdn-premium`. Esa función solo acusa recibo; el cambio de estado debe volver a leer el token.

Riesgo si se aplican políticas que exijan Premium en clubes o rutas sin el `update` de `acceso_previo`: los usuarios actuales de la web perderían esas funciones. Por eso el SQL marca a los perfiles anteriores y, mientras la tabla no exista, la app con sesión no les cierra la interfaz.

El candado de la interfaz se puede saltar modificando la app. Las escrituras de clubes y del muro solo quedan cerradas de verdad cuando una política de fila compruebe `premium_derechos.estado = 'activo'` o `perfiles.acceso_previo`. Esa política no está en este cambio: aplicarla sin el marcado previo dejaría fuera a la comunidad actual.

Biblioteca de cobro en Android: Play Billing 8.0.0, permiso `com.android.vending.BILLING`, plugin `PlayBilling` dentro de la app. Reconoce las compras en estado `PURCHASED` que aún no lo estaban.

## Cuenta y denuncias

Eliminar la cuenta está en Perfil, con dos confirmaciones, y en la página pública `eliminar-cuenta.html`. La función `eliminar-cuenta` está en el repositorio y no está desplegada. Borrar la cuenta no cancela Premium en Google Play.

Denunciar y bloquear escribe en `reports` y `user_blocks` (`sql/reports_y_bloqueos.sql`, sin aplicar). Las denuncias quedan en estado pendiente y las revisa el titular de PaddleSafe en Supabase. Bloquear solo oculta el contenido a quien bloquea.

