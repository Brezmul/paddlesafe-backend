import type { Motor, Pronostico } from './legacy';

export type MarcaSnapshot = {
  _desdeSnapshot?: boolean;
  _snapshotTs?: number | null;
  _snapshotLocation?: string | null;
  _snapshotLat?: number | null;
  _snapshotLon?: number | null;
  _snapshotConsulta?: string | null;
  _snapshotObservado?: string | null;
};

export type ParteVisible = Pronostico & MarcaSnapshot;

export type EstadoConsulta = {
  generacion: number;
  pronostico: ParteVisible | null;
  motor: Motor | null;
  error: string | null;
  cargando: boolean;
  horaIdx: number;
};

const CLAVES_MARCA = [
  '_desdeSnapshot',
  '_snapshotTs',
  '_snapshotLocation',
  '_snapshotLat',
  '_snapshotLon',
  '_snapshotConsulta',
  '_snapshotObservado'
] as const;

export function crearEstadoConsulta(): EstadoConsulta {
  return { generacion: 0, pronostico: null, motor: null, error: null, cargando: false, horaIdx: 0 };
}

export function marcaSnapshotDe(fuente: unknown): MarcaSnapshot | null {
  if (!fuente || typeof fuente !== 'object') return null;
  const marca = fuente as MarcaSnapshot;
  if (marca._desdeSnapshot !== true) return null;
  const copia: MarcaSnapshot = { _desdeSnapshot: true };
  for (const clave of CLAVES_MARCA) {
    if (clave === '_desdeSnapshot') continue;
    const valor = marca[clave];
    if (valor !== undefined) (copia as Record<string, unknown>)[clave] = valor;
  }
  return copia;
}

export function iniciarEvaluacion(estado: EstadoConsulta): { estado: EstadoConsulta; id: number } {
  const id = estado.generacion + 1;
  return {
    id,
    estado: {
      ...estado,
      generacion: id,
      pronostico: null,
      motor: null,
      error: null,
      cargando: true,
      horaIdx: 0
    }
  };
}

export function aplicarExito(estado: EstadoConsulta, id: number, pronostico: ParteVisible, motor: Motor): EstadoConsulta {
  if (id !== estado.generacion) return estado;
  return { ...estado, pronostico, motor, error: null, cargando: false, horaIdx: 0 };
}

export function aplicarFallo(estado: EstadoConsulta, id: number, error: string): EstadoConsulta {
  if (id !== estado.generacion) return estado;
  return { ...estado, pronostico: null, motor: null, error, cargando: false };
}

export function aplicarHora(estado: EstadoConsulta, indice: number, motor: Motor): EstadoConsulta {
  if (!estado.pronostico) return estado;
  return { ...estado, horaIdx: indice, motor, pronostico: estado.pronostico };
}
