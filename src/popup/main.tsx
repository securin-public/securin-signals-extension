import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/tokens.css';
import './popup.css';
import { App } from './App';
import { chromeServices } from './services';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App services={chromeServices} />
  </StrictMode>,
);
