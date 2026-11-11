/** Confirmación doble: primero el aviso, luego escribir ELIMINAR. */
export function borradoConfirmado(avisoAceptado: boolean, palabra: string): boolean {
  return avisoAceptado && palabra.trim().toUpperCase() === 'ELIMINAR';
}

export type ClienteBorrado = {
  invoke: (nombre: string, opciones: { body: Record<string, unknown> }) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export async function solicitarBorradoCuenta(cliente: ClienteBorrado): Promise<{ ok: boolean; mensaje: string }> {
  const { data, error } = await cliente.invoke('eliminar-cuenta', { body: {} });
  if (error) return { ok: false, mensaje: error.message };
  const estado = data && typeof data === 'object' && 'ok' in data ? Boolean((data as { ok?: boolean }).ok) : false;
  return estado
    ? { ok: true, mensaje: 'Cuenta eliminada.' }
    : { ok: false, mensaje: 'El servidor no ha confirmado el borrado.' };
}
