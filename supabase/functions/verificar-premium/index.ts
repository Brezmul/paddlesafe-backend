// Verifica un purchaseToken con la API de Google Play (subscriptionsv2).
// No está desplegada. El secreto GOOGLE_PLAY_SERVICE_ACCOUNT es el JSON de la cuenta de servicio
// y no se guarda en el repositorio.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PAQUETE = Deno.env.get('PLAY_PACKAGE_NAME') || 'es.evolucionesdigitales.paddlesafe';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  const clave = Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!clave || !supabaseUrl || !service) return json({ error: 'Falta la configuración del servidor' }, 500);

  const auth = req.headers.get('Authorization') || '';
  const usuario = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || '', {
    global: { headers: { Authorization: auth } }
  });
  const { data: sesion } = await usuario.auth.getUser();
  if (!sesion.user) return json({ error: 'Hace falta una sesión para vincular la compra' }, 401);

  const cuerpo = await req.json().catch(() => ({}));
  const token = String(cuerpo.purchaseToken || '');
  const producto = String(cuerpo.productId || 'premium');
  if (!token) return json({ error: 'Falta purchaseToken' }, 400);

  const access = await tokenDeCuenta(clave);
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PAQUETE}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`;
  const respuesta = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
  if (!respuesta.ok) return json({ error: 'Play no ha confirmado el token', estado: 'inactivo' }, 402);
  const compra = await respuesta.json();
  const estadoPlay = String(compra.subscriptionState || '');
  const linea = Array.isArray(compra.lineItems) ? compra.lineItems[0] : null;
  const expira = linea?.expiryTime ? String(linea.expiryTime) : null;
  const caduca = expira ? Date.parse(expira) : NaN;
  const sigue = !Number.isFinite(caduca) || caduca > Date.now();
  const activo = sigue && ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED'].includes(estadoPlay);
  const admin = createClient(supabaseUrl, service);
  await admin.from('premium_derechos').upsert({
    user_id: sesion.user.id,
    producto,
    estado: activo ? 'activo' : 'inactivo',
    expira_en: expira,
    token_compra: token,
    actualizado_en: new Date().toISOString()
  }, { onConflict: 'user_id' });
  return json({ estado: activo ? 'activo' : 'inactivo', expira_en: expira });
});

async function tokenDeCuenta(jsonCuenta: string): Promise<string> {
  const cuenta = JSON.parse(jsonCuenta);
  const ahora = Math.floor(Date.now() / 1000);
  const cabecera = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const cuerpo = b64(JSON.stringify({
    iss: cuenta.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: ahora,
    exp: ahora + 3600
  }));
  const firma = await firmar(`${cabecera}.${cuerpo}`, cuenta.private_key);
  const jwt = `${cabecera}.${cuerpo}.${firma}`;
  const cambio = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });
  const data = await cambio.json();
  if (!data.access_token) throw new Error('Google no ha dado un token de acceso');
  return data.access_token;
}

function b64(texto: string): string {
  return btoa(texto).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function firmar(contenido: string, pem: string): Promise<string> {
  const limpio = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const binario = Uint8Array.from(atob(limpio), (c) => c.charCodeAt(0));
  const clave = await crypto.subtle.importKey('pkcs8', binario, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const firma = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', clave, new TextEncoder().encode(contenido));
  return btoa(String.fromCharCode(...new Uint8Array(firma))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });
}
