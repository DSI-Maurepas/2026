// src/services/googleSheetsService.js
import { GOOGLE_CONFIG, APP_CONFIG } from '../config/googleSheets';

class GoogleSheetsService {
  constructor() {
    this.gapiLoaded = false;
    this.gisLoaded = false;
    this.tokenClient = null;
    this.accessToken = null;
    
    // Système de cache simple
    this.reservationsCache = null;
    this.reservationsIACache = null; // Cache pour les IA
    this.lastFetchTime = 0;
    this.lastFetchTimeIA = 0;
  }

  async initialize() {
    if (this.gapiLoaded && this.gisLoaded) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const initGapiClient = async () => {
        try {
          await window.gapi.client.init({
            apiKey: GOOGLE_CONFIG.API_KEY,
            discoveryDocs: GOOGLE_CONFIG.DISCOVERY_DOCS,
          });
          this.gapiLoaded = true;
          if (this.gisLoaded) resolve();
        } catch (err) { reject(err); }
      };

      const initGisClient = () => {
        try {
          this.tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CONFIG.CLIENT_ID,
            scope: GOOGLE_CONFIG.SCOPES,
            callback: '',
          });
          this.gisLoaded = true;
          if (this.gapiLoaded) resolve();
        } catch (err) { reject(err); }
      };

      if (window.gapi && window.gapi.client) initGapiClient();
      else {
        const script1 = document.createElement('script');
        script1.src = 'https://apis.google.com/js/api.js';
        script1.onload = () => window.gapi.load('client', initGapiClient);
        script1.onerror = (e) => reject(new Error("Erreur chargement GAPI"));
        document.body.appendChild(script1);
      }

      if (window.google && window.google.accounts) initGisClient();
      else {
        const script2 = document.createElement('script');
        script2.src = 'https://accounts.google.com/gsi/client';
        script2.onload = initGisClient;
        script2.onerror = (e) => reject(new Error("Erreur chargement GIS"));
        document.body.appendChild(script2);
      }
    });
  }

  async requestAccessToken() {
    return new Promise((resolve, reject) => {
      try {
        if (!this.tokenClient) {
          if (window.google && window.google.accounts) {
             this.tokenClient = window.google.accounts.oauth2.initTokenClient({
              client_id: GOOGLE_CONFIG.CLIENT_ID,
              scope: GOOGLE_CONFIG.SCOPES,
              callback: '',
            });
          } else {
            reject(new Error('Erreur init TokenClient. Rafraîchir la page.'));
            return;
          }
        }

        this.tokenClient.callback = async (response) => {
          if (response.error !== undefined) { reject(response); return; }
          this.accessToken = response.access_token;
          resolve(response);
        };

        if (this.accessToken && window.gapi.client.getToken()) {
          resolve({ access_token: this.accessToken });
        } else {
          this.tokenClient.requestAccessToken({ prompt: 'consent' });
        }
      } catch (error) { reject(error); }
    });
  }

  isAuthenticated() {
    return this.accessToken !== null;
  }

  // --- GESTION SALLES CLASSIQUES ---
  async getAllReservations(forceRefresh = false) {
    try {
      const now = Date.now();
      if (!forceRefresh && this.reservationsCache && (now - this.lastFetchTime < APP_CONFIG.CACHE_DURATION)) {
        return this.reservationsCache;
      }

      if (!window.gapi || !window.gapi.client || !window.gapi.client.sheets) {
        await this.initialize();
      }

      const response = await window.gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: GOOGLE_CONFIG.SPREADSHEET_ID,
        range: `${GOOGLE_CONFIG.SHEETS.RESERVATIONS}!A2:S`,
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING'
      });

      const rows = response.result.values || [];
      const formatted = rows
        .filter(row => row && row[0] && row[1])
        .map((row, index) => ({
          id: row[0] || `res_${index}`,
          salle: row[1] || '',
          dateDebut: row[2] || '',
          heureDebut: row[3] || '',
          dateFin: row[4] || '',
          heureFin: row[5] || '',
          nom: row[6] || '',
          prenom: row[7] || '',
          email: row[8] || '',
          telephone: row[9] || '',
          service: row[10] || '',
          objet: row[11] || '',
          recurrence: (row[12] || '').toUpperCase() === 'OUI',
          recurrenceJusquau: row[13] || null,
          description: row[14] || '',
          statut: row[15] || 'active',
          agencement: row[16] || '',
          nbPersonnes: row[17] || '',
          dateCreation: row[18] || ''
        }));

      this.reservationsCache = formatted;
      this.lastFetchTime = now;
      return formatted;
    } catch (error) {
      console.error('Erreur getAllReservations:', error);
      throw error;
    }
  }

  async addReservation(reservation) {
    try {
      if (!this.isAuthenticated()) await this.requestAccessToken();

      const id = `RES_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const dateFin = reservation.dateFin || reservation.dateDebut;

      const values = [[
        id, reservation.salle, reservation.dateDebut, reservation.heureDebut,
        dateFin, reservation.heureFin, reservation.nom, reservation.prenom,
        reservation.email || '', reservation.telephone || '', reservation.service,
        reservation.objet, reservation.recurrence ? 'OUI' : 'NON',
        reservation.recurrenceJusquau || '', reservation.description || '',
        'active', reservation.agencement || '', reservation.nbPersonnes || '',
        new Date().toISOString()
      ]];

      await window.gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: GOOGLE_CONFIG.SPREADSHEET_ID,
        range: `${GOOGLE_CONFIG.SHEETS.RESERVATIONS}!A:S`,
        valueInputOption: 'USER_ENTERED',
        resource: { values }
      });
      
      this.reservationsCache = null;
      return { success: true, id };
    } catch (error) {
      console.error('Erreur addReservation:', error);
      throw error;
    }
  }

  async deleteReservation(reservationId) {
    try {
      if (!this.isAuthenticated()) await this.requestAccessToken();
      const response = await window.gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: GOOGLE_CONFIG.SPREADSHEET_ID,
        range: `${GOOGLE_CONFIG.SHEETS.RESERVATIONS}!A:A`,
      });
      const rows = response.result.values || [];
      const rowIndex = rows.findIndex(row => row[0] === reservationId);
      if (rowIndex === -1) throw new Error("Réservation introuvable");

      await window.gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: GOOGLE_CONFIG.SPREADSHEET_ID,
        resource: {
          requests: [{ deleteDimension: { range: { sheetId: 0, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 } } }]
        }
      });
      this.reservationsCache = null;
      return { success: true };
    } catch (error) {
      console.error('Erreur deleteReservation:', error);
      throw error;
    }
  }

  // --- GESTION IA ---

  async getAllIAReservations(forceRefresh = false) {
    try {
      const now = Date.now();
      if (!forceRefresh && this.reservationsIACache && (now - this.lastFetchTimeIA < APP_CONFIG.CACHE_DURATION)) {
        return this.reservationsIACache;
      }

      if (!window.gapi || !window.gapi.client || !window.gapi.client.sheets) {
        await this.initialize();
      }

      const response = await window.gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: GOOGLE_CONFIG.SPREADSHEET_ID,
        range: `${GOOGLE_CONFIG.SHEETS.RESERVATIONS_IA}!A2:S`,
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING'
      });

      const rows = response.result.values || [];
      const formatted = rows
        .filter(row => row && row[0] && row[1])
        .map((row, index) => ({
          id: row[0] || `ia_${index}`,
          toolId: row[1] || '',
          dateDebut: row[2] || '',
          heureDebut: row[3] || '',
          dateFin: row[4] || '',
          heureFin: row[5] || '',
          nom: row[6] || '',
          prenom: row[7] || '',
          email: row[8] || '',
          telephone: row[9] || '',
          service: row[10] || '',
          objet: row[11] || '',
          recurrence: (row[12] || '').toUpperCase() === 'OUI',
          recurrenceJusquau: row[13] || null,
          description: row[14] || '',
          statut: row[15] || 'active',
          dateCreation: row[18] || ''
        }));

      this.reservationsIACache = formatted;
      this.lastFetchTimeIA = now;
      return formatted;
    } catch (error) {
      console.error('Erreur getAllIAReservations:', error);
      return [];
    }
  }

  async addIAReservation(reservation) {
    try {
      if (!this.isAuthenticated()) await this.requestAccessToken();

      const id = `IA_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const dateFin = reservation.dateFin || reservation.dateDebut;

      const values = [[
        id, reservation.toolId, reservation.dateDebut, reservation.heureDebut,
        dateFin, reservation.heureFin, reservation.nom, reservation.prenom,
        reservation.email || '', reservation.telephone || '', reservation.service,
        reservation.objet, reservation.recurrence ? 'OUI' : 'NON',
        reservation.recurrenceJusquau || '', reservation.description || '',
        'active', '', '', // Champs vides pour s'aligner
        new Date().toISOString()
      ]];

      await window.gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: GOOGLE_CONFIG.SPREADSHEET_ID,
        // ✅ CORRECTION : Forcer l'ancrage sur la colonne A pour éviter le décalage vers S
        range: `${GOOGLE_CONFIG.SHEETS.RESERVATIONS_IA}!A:A`,
        valueInputOption: 'USER_ENTERED',
        resource: { values }
      });
      
      this.reservationsIACache = null;
      return { success: true, id };
    } catch (error) {
      console.error('Erreur addIAReservation:', error);
      throw error;
    }
  }

  // Utilitaires
  formatTime(timeValue) {
    const hours = Math.floor(timeValue);
    const minutes = Math.round((timeValue - hours) * 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  timeToFloat(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h + (m / 60);
  }

  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

export default new GoogleSheetsService();