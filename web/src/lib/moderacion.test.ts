import { describe, expect, it, vi } from 'vitest';
import { denunciaValida, filtrarBloqueados, guardarBloqueo, guardarDenuncia } from './moderacion';

const denuncia = {
  reporterId: 'a',
  reportedUserId: 'b',
  contexto: 'muro' as const,
  objetivoId: 'ruta-1',
  motivo: 'acoso' as const
};

describe('denunciar y bloquear', () => {
  it('rechaza una denuncia a uno mismo y oculta a quien está bloqueado', () => {
    expect(denunciaValida(denuncia)).toBe(true);
    expect(denunciaValida({ ...denuncia, reportedUserId: 'a' })).toBe(false);
    const visibles = filtrarBloqueados(
      [{ userId: 'b', texto: 'hola' }, { userId: 'c', texto: 'bien' }, { userId: null, texto: 'sistema' }],
      ['b']
    );
    expect(visibles.map((item) => item.texto)).toEqual(['bien', 'sistema']);
  });

  it('guarda la denuncia pendiente y el bloqueo en las tablas propuestas', async () => {
    const insert = vi.fn(async (_tabla: string, _fila: Record<string, unknown>) => ({ error: null }));
    const cliente = { from: (tabla: string) => ({ insert: (fila: Record<string, unknown>) => insert(tabla, fila) }) };
    const aviso = await guardarDenuncia(cliente, denuncia);
    expect(aviso.ok).toBe(true);
    expect(insert).toHaveBeenCalledWith('reports', expect.objectContaining({ estado: 'pendiente', motivo: 'acoso', contexto: 'muro' }));
    const bloqueo = await guardarBloqueo(cliente, 'a', 'b');
    expect(bloqueo.ok).toBe(true);
    expect(insert).toHaveBeenCalledWith('user_blocks', { blocker_id: 'a', blocked_id: 'b' });
    expect((await guardarBloqueo(cliente, 'a', 'a')).ok).toBe(false);
  });
});
