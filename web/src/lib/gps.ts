import { Geolocation } from '@capacitor/geolocation';

export async function leerPosicion(): Promise<{ lat: number; lon: number }> {
  try {
    const permiso = await Geolocation.requestPermissions();
    if (permiso.location === 'denied') {
      throw new Error('El permiso de ubicación está denegado.');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('denegado')) throw error;
  }
  const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 12000 });
  return { lat: pos.coords.latitude, lon: pos.coords.longitude };
}

export async function seguirPosicion(
  onPosicion: (lat: number, lon: number) => void,
  onError: () => void
): Promise<string> {
  return Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 2000 }, (pos, err) => {
    if (err || !pos) onError();
    else onPosicion(pos.coords.latitude, pos.coords.longitude);
  });
}

export async function dejarDeSeguir(id: string) {
  await Geolocation.clearWatch({ id });
}
