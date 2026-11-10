// Aviso opcional de Google Play (RTDN) vía Pub/Sub push. No está desplegado.
// Play publica en un tema; una suscripción push llama a esta URL.
// El cuerpo es un mensaje de Pub/Sub. No verifica el token de compra por sí solo:
// extrae el purchaseToken y vuelve a consultar la API, igual que verificar-premium.
Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('método', { status: 405 });
  const secreto = Deno.env.get('RTDN_PUSH_AUDIENCE');
  if (secreto && req.headers.get('Authorization') !== `Bearer ${secreto}`) {
    return new Response('no autorizado', { status: 401 });
  }
  const cuerpo = await req.json().catch(() => ({}));
  const datos = cuerpo?.message?.data ? JSON.parse(atob(cuerpo.message.data)) : null;
  const nota = datos?.subscriptionNotification;
  return new Response(JSON.stringify({
    recibido: Boolean(nota),
    producto: nota?.subscriptionId || null,
    aviso: 'Hay que volver a leer el token con subscriptionsv2 antes de cambiar premium_derechos. Esta función solo acusa recibo.'
  }), { headers: { 'Content-Type': 'application/json' } });
});
