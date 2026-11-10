export const MOTIVOS_DENUNCIA = ['spam', 'acoso', 'contenido ilegal', 'otro'] as const;
export type MotivoDenuncia = (typeof MOTIVOS_DENUNCIA)[number];
export type ContextoModeracion = 'club_chat' | 'comentario' | 'muro';

export type Denuncia = {
  reporterId: string;
  reportedUserId: string;
  contexto: ContextoModeracion;
  objetivoId: string;
  motivo: MotivoDenuncia;
};

export function denunciaValida(denuncia: Denuncia): boolean {
  return Boolean(
    denuncia.reporterId
    && denuncia.reportedUserId
    && denuncia.reporterId !== denuncia.reportedUserId
    && denuncia.objetivoId
    && (MOTIVOS_DENUNCIA as readonly string[]).includes(denuncia.motivo)
  );
}

export function filtrarBloqueados<T extends { userId?: string | null }>(items: T[], bloqueados: string[]): T[] {
  const ids = new Set(bloqueados);
  return items.filter((item) => !item.userId || !ids.has(item.userId));
}

export function desdeSupabase(origen: {
  from: (tabla: string) => { insert: (fila: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }> };
}): Insertable {
  return {
    from(tabla) {
      return {
        async insert(fila) {
          const { error } = await origen.from(tabla).insert(fila);
          return { error: error ? { message: error.message } : null };
        }
      };
    }
  };
}

type Insertable = {
  from: (tabla: string) => {
    insert: (fila: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  };
};

export async function guardarDenuncia(cliente: Insertable, denuncia: Denuncia): Promise<{ ok: boolean; mensaje: string }> {
  if (!denunciaValida(denuncia)) return { ok: false, mensaje: 'La denuncia no está completa.' };
  const { error } = await cliente.from('reports').insert({
    reporter_id: denuncia.reporterId,
    reported_user_id: denuncia.reportedUserId,
    contexto: denuncia.contexto,
    objetivo_id: denuncia.objetivoId,
    motivo: denuncia.motivo,
    estado: 'pendiente'
  });
  return error ? { ok: false, mensaje: error.message } : { ok: true, mensaje: 'Denuncia enviada. La revisa el equipo de PaddleSafe.' };
}

export async function guardarBloqueo(cliente: Insertable, blockerId: string, blockedId: string): Promise<{ ok: boolean; mensaje: string }> {
  if (!blockerId || !blockedId || blockerId === blockedId) return { ok: false, mensaje: 'No puedes bloquearte a ti mismo.' };
  const { error } = await cliente.from('user_blocks').insert({ blocker_id: blockerId, blocked_id: blockedId });
  return error ? { ok: false, mensaje: error.message } : { ok: true, mensaje: 'Usuario bloqueado. Dejas de ver su contenido.' };
}
