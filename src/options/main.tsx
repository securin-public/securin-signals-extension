import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/tokens.css';
import './options.css';
import { loadSettings, saveSettings } from '../utils/settings';
import { OptionsApp } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OptionsApp services={{ loadSettings, saveSettings }} />
  </StrictMode>,
);
