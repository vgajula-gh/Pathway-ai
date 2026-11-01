import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';
import InstallPathway from './components/InstallPathway';
import App from './App';
createRoot(document.getElementById('root')!).render(<React.StrictMode><InstallPathway /><App /></React.StrictMode>);

if (import.meta.env.PROD && 'serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* App still works without installation/offline support. */ }); });
