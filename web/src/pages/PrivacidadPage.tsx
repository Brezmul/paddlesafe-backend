import { Link } from 'react-router-dom';

const documento = `${import.meta.env.BASE_URL}privacidad.html`;

export function PrivacidadPage() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-300">
        El mismo texto está publicado para la ficha de Play en{' '}
        <a className="font-bold text-sky-300" href="https://www.sup.evolucionesdigitales.es/privacidad.html">www.sup.evolucionesdigitales.es/privacidad.html</a>
        {' '}y en{' '}
        <a className="font-bold text-sky-300" href="https://paddlesafe-backend.vercel.app/privacidad.html">paddlesafe-backend.vercel.app/privacidad.html</a>.
      </p>
      <iframe
        title="Política de privacidad de PaddleSafe"
        src={documento}
        className="h-[75dvh] w-full rounded-3xl border border-white/10 bg-white"
      />
      <p className="text-center text-sm">
        <a className="font-bold text-sky-300" href={documento}>Abrir la política en una página propia</a>
        {' · '}
        <Link className="font-bold text-sky-300" to="/">Volver al mapa</Link>
      </p>
    </div>
  );
}
