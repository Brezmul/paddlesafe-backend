import { Link } from 'react-router-dom';

export function PrivacidadPage() {
  return (
    <article className="space-y-4 rounded-3xl border border-white/10 bg-slate-900/70 p-4 text-sm leading-relaxed text-slate-200">
      <h1 className="text-2xl font-black text-white">Política de privacidad</h1>
      <p>Última actualización: 5 de noviembre de 2026. Responsable: el titular de evolucionesdigitales.es (PaddleSafe). Contacto que debes publicar en Google Play: privacidad@evolucionesdigitales.es. Cámbialo si usas otro buzón.</p>
      <h2 className="text-lg font-black text-white">Qué datos trata la app</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Cuenta: correo, contraseña (gestionada por Supabase Auth; la app no la almacena) y perfil (nombre, foto, tabla, ritmo, privacidad, XP y kilómetros).</li>
        <li>Ubicación: solo cuando pulsas GPS, evalúas un punto del mapa o inicias una sesión en vivo. Sirve para el pronóstico, el mapa y, si lo guardas, la ruta.</li>
        <li>Contenido que publicas: spots, notas, bitácora, reportes, rutas, mensajes de club, quedadas, retos, comentarios y me gusta.</li>
        <li>Teléfono de emergencia: se queda en el dispositivo (almacenamiento local) y no se envía al servidor.</li>
      </ul>
      <h2 className="text-lg font-black text-white">Para qué y con quién</h2>
      <p>La cuenta y los datos de comunidad se guardan en Supabase (PostgreSQL y Storage del proyecto ya existente). El pronóstico se consulta en Open-Meteo. El radar de lluvia usa RainViewer. El mapa usa teselas de OpenStreetMap. El consejo del coach llama a la función ya desplegada en Vercel (`paddlesafe-backend`), que puede usar solo su motor propio. No vendemos datos ni añadimos publicidad de terceros.</p>
      <h2 className="text-lg font-black text-white">Base y conservación</h2>
      <p>La cuenta y el contenido existen mientras no los borres o cierres la cuenta. Los reportes de spot están pensados para verse solo durante unas horas. Puedes marcar el perfil como privado para salir de los rankings públicos. Las rutas antiguas sin propietario no se asignan a otra cuenta.</p>
      <h2 className="text-lg font-black text-white">Permisos de Android</h2>
      <p>La app pide ubicación precisa para el GPS y la sesión en vivo. No pedimos ubicación en segundo plano en esta versión. La cámara o la galería solo se usan si eliges una foto de perfil o un logo de club.</p>
      <h2 className="text-lg font-black text-white">Tus derechos</h2>
      <p>Puedes acceder, rectificar y suprimir tus datos desde el perfil (nombre, foto, rutas) o escribiendo al contacto de privacidad. Si borras la cuenta en Supabase Auth, los datos ligados a tu usuario deben eliminarse según las políticas de la base. También puedes reclamar ante la Agencia Española de Protección de Datos.</p>
      <h2 className="text-lg font-black text-white">Menores</h2>
      <p>PaddleSafe no está dirigida a menores de 16 años.</p>
      <p><Link className="font-bold text-sky-300" to="/">Volver al mapa</Link></p>
    </article>
  );
}
