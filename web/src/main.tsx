import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { applyTokens } from './styles/tokens';
import './styles/global.css';
import { Home } from './pages/Home';
import { HelpPage } from './pages/help/HelpPage';
import { PanelLayout } from './pages/panel/PanelLayout';
import { Overview } from './pages/panel/Overview';
import { History } from './pages/panel/History';
import { Staff } from './pages/panel/Staff';
import { Spots } from './pages/panel/Spots';
import { PrintSpots } from './pages/panel/PrintSpots';
import { Report } from './pages/panel/Report';
import { NotFound } from './pages/NotFound';
import { TryApp } from './pages/TryApp';

applyTokens();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        {/* QR público do Expo Go para testar o app da equipe. */}
        <Route path="/testar" element={<TryApp />} />
        {/* Página aberta pelo QR code: sem login. */}
        <Route path="/q/:code" element={<HelpPage />} />
        {/* Painel da gerência. */}
        <Route path="/painel" element={<PanelLayout />}>
          <Route index element={<Overview />} />
          <Route path="alertas" element={<History />} />
          {/* Endereço antigo, de antes de "pedido" virar "alerta" (16/11). */}
          <Route path="pedidos" element={<Navigate to="/painel/alertas" replace />} />
          <Route path="equipe" element={<Staff />} />
          <Route path="qr-codes" element={<Spots />} />
          <Route path="qr-codes/imprimir" element={<PrintSpots />} />
          <Route path="relatorio" element={<Report />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
