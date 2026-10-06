import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { IonApp } from '@ionic/react';
import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import './admin.css';
import { App } from './App';
import { ToastProvider } from './components/common/ToastProvider';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <IonApp>
      <ToastProvider>
        <Suspense fallback={<div role="status" style={{ padding: 24 }}>Loading LS Customs…</div>}><App /></Suspense>
      </ToastProvider>
    </IonApp>
  </StrictMode>,
);
