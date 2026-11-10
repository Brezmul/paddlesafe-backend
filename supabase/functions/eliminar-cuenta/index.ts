// Borra los datos del usuario autenticado y su cuenta de Auth.
// No está desplegada. Usa SUPABASE_SERVICE_ROLE_KEY, que no va en el repositorio.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TABLAS: Array<[string, string]> = [
  ['rutas_comentarios', 'user_id'],
  ['rutas_likes', 'user_id'],
  ['rutas', 'user_id'],
  ['spot_logbook', 'user_id'],
  ['spot_reports', 'user_id'],
  ['user_spots', 'user_id'],
  ['safety_checkins', 'user_id'],
  ['notificaciones', 'user_id'],
  ['club_chat', 'user_id'],
  ['clubs_usuarios', 'user_id'],
  ['clubs_solicitudes', 'user_id'],
  ['club_eventos_asistentes', 'user_id'],
  ['club_retos_participantes', 'user_id'],
  ['amistades', 'usuario_id'],
  ['amistades', 'amigo_id'],
  ['premium_derechos', 'user_id'],
  ['reports', 'reporter_id'],
  ['user_blocks', 'blocker_id'],
  ['user_blocks', 'blocked_id'],
  ['perfiles', 'id']
];

// club_showcase es la vitrina del club (club_id y contenido). No tiene columna
// de usuario: user_id no existe y borrarla por club vaciaría la vitrina ajena.

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Método no permitido' }, 405);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anon || !service) return json({ ok: false, error: 'Falta la configuración' }, 500);

  const auth = req.headers.get('Authorization') || '';
  const usuario = createClient(supabaseUrl, anon, { global: { headers: { Authorization: auth } } });
  const { data: sesion } = await usuario.auth.getUser();
  if (!sesion.user) return json({ ok: false, error: 'Hace falta iniciar sesión' }, 401);
  const id = sesion.user.id;
  const admin = createClient(supabaseUrl, service);

  const cubo = admin.storage.from('paddlesafe');
  const lista = await cubo.list('avatares');
  const fotos = (lista.data || []).filter((archivo) => archivo.name.startsWith(id)).map((archivo) => `avatares/${archivo.name}`);
  if (fotos.length) await cubo.remove(fotos);

  const rutas = await admin.from('rutas').select('id').eq('user_id', id);
  const ids = (rutas.data || []).map((fila: { id: string }) => fila.id);
  if (ids.length) await admin.from('club_rutas').delete().in('ruta_id', ids);

  for (const [tabla, columna] of TABLAS) {
    const { error } = await admin.from(tabla).delete().eq(columna, id);
    if (error && !/does not exist|schema cache/i.test(error.message)) {
      return json({ ok: false, error: `${tabla}: ${error.message}` }, 500);
    }
  }

  const borrado = await admin.auth.admin.deleteUser(id);
  if (borrado.error) return json({ ok: false, error: borrado.error.message }, 500);
  return json({
    ok: true,
    aviso: 'Si había una suscripción Premium, hay que cancelarla en Google Play. Esta función no la cancela.'
  });
});

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });
}
