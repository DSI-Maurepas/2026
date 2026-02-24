import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Import des outils Microsoft
import { PublicClientApplication } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import { msalConfig } from "./authConfig";

// On initialise le gardien
const msalInstance = new PublicClientApplication(msalConfig);

const root = ReactDOM.createRoot(document.getElementById('root'));

// On enroule l'application dans le MsalProvider
root.render(
  <React.StrictMode>
    <MsalProvider instance={msalInstance}>
      <App />
    </MsalProvider>
  </React.StrictMode>
);