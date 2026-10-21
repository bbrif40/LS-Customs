import { WebsiteTextProvider } from './components/common/WebsiteTextProvider'
import './website-text.css'
import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { IonApp } from '@ionic/react';
import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import './admin.css';
import './workspace-design.css';
import { App } from './App';
import { LoadingMessage } from './components/common/LoadingMessage';
import { ToastProvider } from './components/common/ToastProvider';
import { TransactionTermsProvider } from './components/common/TransactionTerms';
import './transactions.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <IonApp>
      <ToastProvider>
        <WebsiteTextProvider><TransactionTermsProvider><Suspense fallback={<LoadingMessage />}><App /></Suspense></TransactionTermsProvider></WebsiteTextProvider>
      </ToastProvider>
    </IonApp>
  </StrictMode>,
);
