// src/services/authService.js
// Service d'authentification OAuth 2.0 pour Google Sheets API
// + Gestion d'accès applicatif (BV / Global / Admin) via code
// + SÉCURITÉ : Protection CSRF via paramètre 'state'

import { GOOGLE_SHEETS, LOCAL_STORAGE_KEYS } from '../utils/constants';
import { ACCESS_CONFIG, parseAccessCode } from '../config/authConfig.js';

// --- Accès applicatif (BV / Global / Admin) ---
const ACCESS_STORAGE_KEY = 'elections_access_v1';
// --- Auth Admin (mot de passe local) ---
const ADMIN_STORAGE_KEY = 'elections_admin_auth_v1';
// --- Sécurité OAuth ---
const OAUTH_STATE_KEY = 'oauth_state_pending';

class AuthService {
  constructor() {
    this.clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    this.scopes = GOOGLE_SHEETS.SCOPES.join(' ');
    this.tokenClient = null;
    this.accessToken = null;
  }

  /**
   * Initialise le client OAuth 2.0
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      // Évite de recharger le script si déjà présent
      if (window.google?.accounts?.oauth2) {
        this._initClient(resolve, reject);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => this._initClient(resolve, reject);
      script.onerror = (e) => reject(new Error("Erreur de chargement du script Google GSI"));
      document.head.appendChild(script);
    });
  }

  /**
   * Configuration interne du client une fois le script chargé
   */
  _initClient(resolve, reject) {
    try {
      this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: this.scopes,
        // Callback par défaut (sera surchargé dans signIn pour capturer le state)
        callback: (response) => {
          if (response.error) {
            reject(response);
            return;
          }
          // Note: Ici on ne peut pas valider le state facilement car il est lié
          // à l'appel requestAccessToken. La validation se fait dans signIn().
          this.handleAuthResponse(response);
          resolve(response);
        },
      });
      resolve();
    } catch (err) {
      reject(err);
    }
  }

  /**
   * Génère un état aléatoire unique pour la sécurité CSRF
   */
  _generateState() {
    const array = new Uint32Array(4);
    window.crypto.getRandomValues(array);
    const state = Array.from(array, dec => dec.toString(16).padStart(8, '0')).join('');
    // Stockage en session (expire à la fermeture de l'onglet)
    sessionStorage.setItem(OAUTH_STATE_KEY, state);
    return state;
  }

  /**
   * Valide que l'état reçu correspond à l'état envoyé
   */
  _validateState(receivedState) {
    const storedState = sessionStorage.getItem(OAUTH_STATE_KEY);
    // Nettoyage immédiat pour éviter la réutilisation (Replay Attack)
    sessionStorage.removeItem(OAUTH_STATE_KEY); 
    
    if (!storedState || !receivedState) return false;
    return storedState === receivedState;
  }

  /**
   * Déclenche le flux d'authentification avec protection CSRF
   */
  async signIn() {
    if (!this.tokenClient) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      try {
        // 1. Génération du challenge de sécurité
        const stateToken = this._generateState();

        // 2. Surcharge du callback pour inclure la validation
        this.tokenClient.callback = (response) => {
          if (response.error) {
            reject(response);
            return;
          }

          // 3. VÉRIFICATION DE SÉCURITÉ CRITIQUE
          if (!this._validateState(response.state)) {
            console.error("⛔ ALERTE SÉCURITÉ : Tentative de CSRF détectée ou état invalide.");
            reject(new Error("Échec de l'authentification : Validation de sécurité (state) incorrecte."));
            return;
          }

          this.handleAuthResponse(response);
          resolve(response);
        };

        // 4. Envoi de la requête avec le paramètre state
        // prompt: '' force la connexion silencieuse si possible, 
        // ou 'select_account' pour forcer le choix
        this.tokenClient.requestAccessToken({ 
          prompt: '',
          state: stateToken // <--- Ajout du paramètre d'état
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Gère la réponse d'authentification (Succès)
   */
  handleAuthResponse(response) {
    this.accessToken = response.access_token;

    // Stocker le token
    localStorage.setItem(LOCAL_STORAGE_KEYS.AUTH_TOKEN, response.access_token);

    // Stocker l'expiration
    const expiresIn = response.expires_in || 3600;
    const expiresAt = Date.now() + (expiresIn * 1000);
    localStorage.setItem('auth_token_expires_at', expiresAt.toString());
  }

  /**
   * Déconnexion OAuth
   */
  signOut() {
    const token = this.accessToken || localStorage.getItem(LOCAL_STORAGE_KEYS.AUTH_TOKEN);

    if (token && window.google?.accounts?.oauth2) {
      try {
        google.accounts.oauth2.revoke(token, () => {
          console.log('Token révoqué');
        });
      } catch (e) {
        console.warn('Erreur révocation', e);
      }
    }

    this.accessToken = null;
    localStorage.removeItem(LOCAL_STORAGE_KEYS.AUTH_TOKEN);
    localStorage.removeItem('auth_token_expires_at');
    localStorage.removeItem(LOCAL_STORAGE_KEYS.USER_EMAIL);
    sessionStorage.removeItem(OAUTH_STATE_KEY);
  }

  /**
   * Vérifie si l'utilisateur est authentifié OAuth
   */
  isAuthenticated() {
    const token = localStorage.getItem(LOCAL_STORAGE_KEYS.AUTH_TOKEN);
    const expiresAt = localStorage.getItem('auth_token_expires_at');

    if (!token || !expiresAt) return false;

    // Vérifier l'expiration
    if (Date.now() > parseInt(expiresAt, 10)) {
      this.signOut();
      return false;
    }

    this.accessToken = token;
    return true;
  }

  /**
   * Récupère le token d'accès actuel
   */
  getAccessToken() {
    if (!this.isAuthenticated()) {
      return null;
    }
    return this.accessToken || localStorage.getItem(LOCAL_STORAGE_KEYS.AUTH_TOKEN);
  }

  /**
   * Rafraîchit le token si nécessaire
   */
  async refreshTokenIfNeeded() {
    const expiresAt = localStorage.getItem('auth_token_expires_at');
    if (!expiresAt) return;

    const now = Date.now();
    const timeUntilExpiry = parseInt(expiresAt, 10) - now;

    // Rafraîchir si expire dans moins de 5 minutes
    if (timeUntilExpiry < 5 * 60 * 1000) {
      console.log("Token proche expiration, rafraîchissement...");
      await this.signIn();
    }
  }

  /**
   * Récupère les informations de l'utilisateur connecté
   */
  async getUserInfo() {
    const token = this.getAccessToken();
    if (!token) {
      throw new Error('Non authentifié');
    }

    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error("Erreur lors de la récupération des informations utilisateur");
    }

    const userInfo = await response.json();
    localStorage.setItem(LOCAL_STORAGE_KEYS.USER_EMAIL, userInfo.email);
    return userInfo;
  }

  getUserEmail() {
    return localStorage.getItem(LOCAL_STORAGE_KEYS.USER_EMAIL) || 'utilisateur@inconnu.com';
  }

  // =========================
  // Auth Administration (mot de passe local)
  // =========================

  adminSignIn(password) {
    const ok = typeof password === 'string' && password === ACCESS_CONFIG.ADMIN_PASSWORD;
    if (ok) {
      localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify({ ok: true, ts: Date.now() }));
    }
    return ok;
  }

  adminSignOut() {
    localStorage.removeItem(ADMIN_STORAGE_KEY);
  }

  isAdminSignedIn() {
    try {
      const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return !!parsed?.ok;
    } catch {
      return false;
    }
  }
}

// =========================
// Accès applicatif (BV / GLOBAL / ADMIN)
// =========================

export function loginWithCode(code) {
  const auth = parseAccessCode(code);
  if (!auth) return null;
  localStorage.setItem(ACCESS_STORAGE_KEY, JSON.stringify({ ...auth, ts: Date.now() }));
  return auth;
}

export function getAuthState() {
  try {
    const raw = localStorage.getItem(ACCESS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.role) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function logoutAccess() {
  localStorage.removeItem(ACCESS_STORAGE_KEY);
}

export function clearAllSessions() {
  logoutAccess();
  localStorage.removeItem(ADMIN_STORAGE_KEY);
  try {
    authService.signOut();
  } catch {
    // noop
  }
}

// Helpers
export function isBV(auth) { return auth?.role === 'BV'; }
export function isGlobal(auth) { return auth?.role === 'GLOBAL'; }
export function isAdmin(auth) { return auth?.role === 'ADMIN'; }

// Singleton
const authService = new AuthService();
export default authService;