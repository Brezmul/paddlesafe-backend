import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { MapaPage } from './pages/MapaPage';
import { RadarPage } from './pages/RadarPage';
import { ClubesPage } from './pages/ClubesPage';
import { SocialPage } from './pages/SocialPage';
import { PerfilPage } from './pages/PerfilPage';
import { PremiumPage } from './pages/PremiumPage';
import { PrivacidadPage } from './pages/PrivacidadPage';
import { AccesoProvider } from './context/AccesoContext';

export default function App() {
  return (
    <AccesoProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<MapaPage />} />
          <Route path="/radar" element={<RadarPage />} />
          <Route path="/clubes" element={<ClubesPage />} />
          <Route path="/social" element={<SocialPage />} />
          <Route path="/perfil" element={<PerfilPage />} />
          <Route path="/premium" element={<PremiumPage />} />
          <Route path="/privacidad" element={<PrivacidadPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AccesoProvider>
  );
}
