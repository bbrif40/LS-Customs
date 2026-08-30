import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { IonApp } from '@ionic/react';
import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import './styles.css';
import './admin.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <IonApp>
      <App />
    </IonApp>
  </StrictMode>,
);
