import { describe, expect, it, vi } from 'vitest';
import { borradoConfirmado, solicitarBorradoCuenta } from './cuenta';

describe('eliminar cuenta', () => {
  it('exige el aviso y la palabra ELIMINAR', () => {
    expect(borradoConfirmado(false, 'ELIMINAR')).toBe(false);
    expect(borradoConfirmado(true, 'borrar')).toBe(false);
    expect(borradoConfirmado(true, ' eliminar ')).toBe(true);
  });

  it('pide a la función eliminar-cuenta y no inventa el éxito', async () => {
    const invoke = vi.fn(async () => ({ data: { ok: true }, error: null }));
    const bien = await solicitarBorradoCuenta({ invoke });
    expect(invoke).toHaveBeenCalledWith('eliminar-cuenta', { body: {} });
    expect(bien.ok).toBe(true);

    const mal = await solicitarBorradoCuenta({
      invoke: async () => ({ data: null, error: { message: 'sin sesión' } })
    });
    expect(mal).toEqual({ ok: false, mensaje: 'sin sesión' });
  });
});
