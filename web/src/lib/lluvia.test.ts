import { describe, expect, it } from 'vitest';
import { ZOOM_MAX_LLUVIA, ZOOM_NATIVO_LLUVIA } from './lluvia';

describe('teselas de lluvia', () => {
  it('no pide a RainViewer un zoom por encima del que sirve', () => {
    expect(ZOOM_NATIVO_LLUVIA).toBe(7);
    expect(ZOOM_MAX_LLUVIA).toBeGreaterThan(ZOOM_NATIVO_LLUVIA);
  });
});
