import { useState } from 'react';
import { Boton } from '@/components/ui';
import { MOTIVOS_DENUNCIA, type ContextoModeracion, type MotivoDenuncia } from '@/lib/moderacion';

export function MenuModeracion({
  autorId,
  yo,
  contexto,
  objetivoId,
  onDenunciar,
  onBloquear
}: {
  autorId: string;
  yo: string | null;
  contexto: ContextoModeracion;
  objetivoId: string;
  onDenunciar: (motivo: MotivoDenuncia) => Promise<string>;
  onBloquear: () => Promise<string>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nota, setNota] = useState<string | null>(null);
  if (!yo || yo === autorId) return null;
  return (
    <div className="mt-1">
      <button type="button" className="min-h-11 text-xs font-bold text-slate-300" onClick={() => setAbierto((v) => !v)}>
        {abierto ? 'Cerrar' : 'Moderar'}
      </button>
      {abierto && (
        <div className="mt-1 flex flex-wrap gap-2">
          {MOTIVOS_DENUNCIA.map((motivo) => (
            <Boton key={motivo} variante="suave" onClick={async () => setNota(await onDenunciar(motivo))}>Denunciar: {motivo}</Boton>
          ))}
          <Boton variante="peligro" onClick={async () => setNota(await onBloquear())}>Bloquear usuario</Boton>
        </div>
      )}
      {nota && <p className="mt-1 text-xs text-slate-300">{nota}</p>}
      <span className="sr-only">{contexto} {objetivoId}</span>
    </div>
  );
}
