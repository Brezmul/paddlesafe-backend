import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReproductorRuta } from './ReproductorRuta';

describe('reproductor', () => {
  it('deja la barra y no arranca la animación si se pide menos movimiento', () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() { return false; },
      onchange: null,
      addListener() {},
      removeListener() {}
    })) as unknown as typeof window.matchMedia;
    render(<ReproductorRuta puntos={[[38.8, 0.18], [38.81, 0.19]]} onMarco={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Reproducir' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByLabelText('Posición del recorrido')).toBeTruthy();
    expect(screen.getByText(/menos movimiento/)).toBeTruthy();
  });
});
