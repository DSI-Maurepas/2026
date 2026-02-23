// src/services/googleSheetsService.js
// Service Google Sheets API v4 - Backend unique de l'application
//
// Correctifs (2026-01-27):
// - Utilise values:batchGet (query param) au lieu de /values/{range} (path) pour éviter les erreurs 400
//   "Unable to parse range" liées à l'encodage (accents, quotes, caractères spéciaux).
// - Encodage A1 robuste: 'NomOnglet'!A:Z
// - Retry/backoff sur 429 + déduplication des requêtes en vol + cache TTL court.
// - Méthodes génériques attendues par useGoogleSheets(): getData/appendRow/updateRow/deleteRow.
//
// NB: OAuth Bearer token requis. Pas de clé API nécessaire.

import authService, { getAuthState } from './authService';
import { SHEET_NAMES } from '../utils/constants';

class GoogleSheetsService {
  constructor() {
    this.spreadsheetId = import.meta.env.VITE_SPREADSHEET_ID;
    this.apiUrl = 'https://sheets.googleapis.com/v4/spreadsheets';

    this._inflight = new Map(); // key -> Promise
    this._cache = new Map();    // key -> { at, data }
    this._cacheTtlMs = 800;     // cache court (ms)
  }


  // ==================== ACCÈS (BV / GLOBAL / ADMIN) ====================

  _getAccessContext() {
    const auth = getAuthState?.() || null;
    const role = auth?.role || null;
    const bureauId = auth?.bureauId ?? null;
    return { auth, role, bureauId };
  }

  _normalizeBureauId(value) {
    if (value === null || value === undefined) return '';
    const s = String(value).trim().toUpperCase();
    const m = s.match(/(\d+)/);
    return m ? m[1] : s;
  }

  _assertBureauAllowed(targetBureauId) {
    const { role, bureauId } = this._getAccessContext();
    if (role === 'BV') {
      const t = this._normalizeBureauId(targetBureauId);
      const b = this._normalizeBureauId(bureauId);
      if (!t || !b || t !== b) {
        throw new Error('Accès refusé : bureau non autorisé');
      }
    }
  }

  _filterRowsByAccess(sheetName, rows) {
    const { role, bureauId } = this._getAccessContext();
    if (role !== 'BV') return rows;

    const norm = String(sheetName || '').trim();

    // BV : ne voit que SON bureau dans les feuilles bureautées
    const keepOnlyBureau = (r) => this._normalizeBureauId(r?.bureauId) === this._normalizeBureauId(bureauId);

    // ⚠️ CORRECTION (2026-02-09) : BV doit voir les données de référence pour l'affichage des résultats
    
    // Candidats : LECTURE SEULE, tous les candidats (nécessaire pour afficher les noms dans ResultatsConsolidation)
    if (norm === 'Candidats') return rows;
    
    // Bureaux : TOUS les bureaux (nécessaire pour calculer les inscrits communaux et statistiques)
    // Note : la saisie reste limitée au bureau du BV via _assertBureauAllowed dans updateRow/appendRow
    if (norm === 'Bureaux') return rows;
    
    // Participation et Résultats : FILTRAGE strict sur le bureau du BV
    if (norm === 'Participation_T1' || norm === 'Participation_T2') return rows.filter(keepOnlyBureau);
    if (norm === 'Resultats_T1' || norm === 'Resultats_T2') return rows.filter(keepOnlyBureau);

    // Par défaut, BV n'a pas accès au reste via l'UI (routes protégées),
    // mais on filtre à vide ici par prudence si un composant appelait quand même le service.
    return [];
  }


  // ==================== HELPERS ====================

  colIndexToA1(colIndex) {
    let n = colIndex + 1;
    let s = '';
    while (n > 0) {
      const r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  parseSheetValue(value) {
    if (value === undefined || value === null) return value;
    if (typeof value !== 'string') return value;

    const v = value.trim();
    if (v === 'TRUE') return true;
    if (v === 'FALSE') return false;

    if (v !== '' && !Number.isNaN(Number(v))) return Number(v);

    if ((v.startsWith('[') && v.endsWith(']')) || (v.startsWith('{') && v.endsWith('}'))) {
      try { return JSON.parse(v); } catch (_) { return value; }
    }
    return value;
  }

    /**
   * Construit une notation A1 robuste:
   * - entoure toujours le nom d'onglet de quotes simples (support espaces/accents)
   * - échappe les quotes simples selon la règle Google Sheets ('' )
   * - accepte aussi une entrée déjà au format "Feuille!A1:B2" (évite double !A:Z)
   */
  a1(sheetOrA1, range = 'A:Z') {
    const input = String(sheetOrA1 || '').trim();

    // Si on nous passe déjà une A1 (ex: "Candidats!A2:B"), on découpe proprement.
    let sheetName = input;
    let localRange = range;

    if (input.includes('!')) {
      const idx = input.indexOf('!');
      sheetName = input.slice(0, idx);
      localRange = input.slice(idx + 1) || range;

      // Enlève des quotes éventuelles autour du nom d'onglet
      // (on re-quotera systématiquement ensuite)
      if (sheetName.startsWith("'") && sheetName.endsWith("'")) {
        sheetName = sheetName.slice(1, -1).replace(/''/g, "'");
      }
    }

    // Normalisation des ranges "ouverts" de type A2:B (Google API refuse)
    // => A2:B9999 (suffisant pour couvrir toutes les lignes)
    const openEndedColRange = /^([A-Z]+)(\d+):([A-Z]+)$/i;
    const m = String(localRange || '').trim().match(openEndedColRange);
    if (m) {
      const startCol = m[1].toUpperCase();
      const startRow = m[2];
      const endCol = m[3].toUpperCase();
      localRange = `${startCol}${startRow}:${endCol}9999`;
    }

    const safe = String(this.normalizeSheetName(sheetName) || '').replace(/'/g, "''");
    return `'${safe}'!${localRange}`;
  }


  /**
   * Variante A1 pour les endpoints qui exigent la range dans l'URL path (ex: values/{range}:append|clear).
   * Objectif: éviter les erreurs "Unable to parse range" observées avec des noms d'onglets quotés
   * lorsqu'ils passent dans le path encodé. 
   *
   * Règle:
   * - Si le nom d'onglet est "safe" (A-Z a-z 0-9 underscore) ET qu'on nous passe un nom d'onglet simple,
   *   on génère sans quotes: SheetName!A:Z
   * - Sinon, on retombe sur a1() (quotée, robuste espaces/accents).
   *
   * NB: Ne modifie pas la logique de normalizeSheetName.
   */
  a1Path(sheetOrA1, range = 'A:Z') {
    const input = String(sheetOrA1 || '').trim();

    // Si l'appelant fournit déjà une A1 complète, on ne tente pas de "dé-quotage" agressif:
    // on ne retire les quotes que si le nom d'onglet est "safe".
    if (input.includes('!')) {
      const idx = input.indexOf('!');
      let sheetName = input.slice(0, idx);
      const localRange = input.slice(idx + 1) || range;

      if (sheetName.startsWith("'") && sheetName.endsWith("'")) {
        sheetName = sheetName.slice(1, -1).replace(/''/g, "'");
      }
      const safeName = String(this.normalizeSheetName(sheetName) || '');
      if (/^[A-Za-z0-9_]+$/.test(safeName)) {
        return `${safeName}!${localRange}`;
      }
      return this.a1(sheetName, localRange);
    }

    const safeName = String(this.normalizeSheetName(input) || '');
    if (/^[A-Za-z0-9_]+$/.test(safeName)) {
      return `${safeName}!${range}`;
    }
    return this.a1(input, range);
  }

  
  /**
   * Normalise les noms d'onglets pour éviter les régressions (accents/variantes).
   * Ex: "Résultats_T1" -> "Resultats_T1"
   */
  normalizeSheetName(sheetName) {
    const raw = String(sheetName || '').trim();
    if (!raw) return raw;

    // 1) Normalisation unicode (suppression des accents)
    const noAccents = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // 2) Corrections ciblées (au cas où)
    const mapped = noAccents
      .replace(/^Resultats_/i, 'Resultats_')
      .replace(/^Participation_/i, 'Participation_');

    return mapped;
  }

async sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ==================== CORE ====================

  async makeRequest(endpoint, options = {}, retry = 0) {
    if (!this.spreadsheetId) {
      throw new Error('Configuration manquante: VITE_SPREADSHEET_ID non défini');
    }

    try {
      await authService.refreshTokenIfNeeded?.();
    } catch (e) {
      console.warn('Avertissement: refreshTokenIfNeeded a échoué:', e);
    }

    const token = authService.getAccessToken?.();
    if (!token) {
      throw new Error('Non authentifié - Token manquant');
    }

    const url = `${this.apiUrl}/${this.spreadsheetId}${endpoint}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    let response;
    try {
      response = await fetch(url, { ...options, headers });
    } catch (fetchErr) {
      // Retry erreurs réseau transitoires
      if (retry < 3) {
        const base = 400 * (2 ** retry);
        const jitter = Math.floor(Math.random() * 200);
        await this.sleep(base + jitter);
        return this.makeRequest(endpoint, options, retry + 1);
      }
      throw fetchErr;
    }

    // Retry quota 429
    if (response.status === 429 && retry < 3) {
      const retryAfter = response.headers.get('retry-after');
      const waitMs = retryAfter ? (parseInt(retryAfter, 10) * 1000) : (300 * (2 ** retry));
      await this.sleep(waitMs);
      return this.makeRequest(endpoint, options, retry + 1);
    }

    // Retry erreurs transitoires Google (5xx)
    // Objectif: réduire l'impact des indisponibilités temporaires (HTTP 500/502/503/504)
    // Sans créer de rafale : backoff exponentiel + jitter léger, max 3 retries.
    if ([500, 502, 503, 504].includes(response.status) && retry < 3) {
      const base = 400 * (2 ** retry);
      const jitter = Math.floor(Math.random() * 200);
      await this.sleep(base + jitter);
      return this.makeRequest(endpoint, options, retry + 1);
    }

    if (!response.ok) {
      let message = 'Erreur API Google Sheets';
      try {
        const errJson = await response.json();
        message = errJson?.error?.message || message;
      } catch (_) {
        try {
          const text = await response.text();
          if (text) message = text;
        } catch (_) {}
      }
      const error = new Error(`${message} (HTTP ${response.status})`);
      error.status = response.status;
      throw error;
    }

    if (response.status === 204) return null;
    return await response.json();
  }

  // ==================== DÉDUP & CACHE ====================

  _getCached(key) {
    const hit = this._cache.get(key);
    if (!hit) return null;
    if ((Date.now() - hit.at) > this._cacheTtlMs) {
      this._cache.delete(key);
      return null;
    }
    return hit.data;
  }

  _setCached(key, data) {
    this._cache.set(key, { at: Date.now(), data });
  }

  async _dedup(key, fn) {
    const inflight = this._inflight.get(key);
    if (inflight) return inflight;

    const p = (async () => {
      try {
        return await fn();
      } finally {
        this._inflight.delete(key);
      }
    })();

    this._inflight.set(key, p);
    return p;
  }

  // ==================== VALUES HELPERS ====================
  // Utilise batchGet pour éviter les soucis d'encodage du paramètre {range} dans l'URL path.
  async getValues(a1Range) {
    const endpoint = `/values:batchGet?ranges=${encodeURIComponent(a1Range)}`;
    const res = await this.makeRequest(endpoint);
    const vr = res?.valueRanges?.[0];
    return vr?.values || [];
  }

  // ==================== API GÉNÉRIQUE (attendue par useGoogleSheets) ====================

  /**
   * Transforme les lignes brutes en objets selon la structure de la feuille
   */
  _transformRows(sheetName, rows, header = []) {
    if (!rows || rows.length === 0) return [];

    // Header-driven mapping (robuste aux décalages de colonnes)
    const _norm = (s) => String(s ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9_]/g, '');

    const _h = Array.isArray(header) ? header : [];
    const _hmap = {};
    _h.forEach((h, i) => {
      const k = _norm(h);
      if (k) _hmap[k] = i;
    });

    const _idx = (key, fallback) => {
      const k = _norm(key);
      return (k && _hmap[k] !== undefined) ? _hmap[k] : fallback;
    };

    const _str = (row, key, fallback, def = '') => {
      const i = _idx(key, fallback);
      const v = (i !== undefined && i !== null) ? row[i] : undefined;
      return (v === undefined || v === null) ? def : String(v);
    };

    const _int = (row, key, fallback, def = 0) => {
      const i = _idx(key, fallback);
      const v = (i !== undefined && i !== null) ? row[i] : undefined;
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? n : def;
    };

    switch (sheetName) {
      case 'Bureaux':
        return rows.map(row => ({
          id: row[0] || '',
          nom: row[1] || '',
          adresse: row[2] || '',
          president: row[3] || '',
          secretaire: row[4] || '',
          secretaireSuppleant: row[5] || '',
          inscrits: parseInt(row[6]) || 0,
          actif: row[7] === 'TRUE' || row[7] === true
        }));

      case 'Candidats':
        return rows.map(row => ({
          listeId: row[0] || '',
          nomListe: row[1] || '',
          teteListeNom: row[2] || '',
          teteListePrenom: row[3] || '',
          couleur: row[4] || '#0055A4',
          ordre: parseInt(row[5]) || 0,
          actifT1: String(row[6] ?? '').trim().toUpperCase() === 'TRUE',
          actifT2: String(row[7] ?? '').trim().toUpperCase() === 'TRUE'
        }));

      case 'Participation_T1':
      case 'Participation_T2':
        // Mapping par en-têtes (évite les décalages quand une colonne est ajoutée/supprimée)
        // Colonnes attendues (Google Sheets) :
        // A BureauID | B Tour | C Inscrits | D Votants09h | ... | O Votants20h | P Timestamp (optionnel)
        return rows.map(row => ({
          bureauId: _str(row, 'BureauID', 0, ''),
          tour: _int(row, 'Tour', 1, 1) || 1,
          inscrits: _int(row, 'Inscrits', 2, 0),

          // ⚠️ 08h supprimé : la première heure officielle est 09h
          votants09h: _int(row, 'Votants09h', 3, 0),
          votants10h: _int(row, 'Votants10h', 4, 0),
          votants11h: _int(row, 'Votants11h', 5, 0),
          votants12h: _int(row, 'Votants12h', 6, 0),
          votants13h: _int(row, 'Votants13h', 7, 0),
          votants14h: _int(row, 'Votants14h', 8, 0),
          votants15h: _int(row, 'Votants15h', 9, 0),
          votants16h: _int(row, 'Votants16h', 10, 0),
          votants17h: _int(row, 'Votants17h', 11, 0),
          votants18h: _int(row, 'Votants18h', 12, 0),
          votants19h: _int(row, 'Votants19h', 13, 0),
          votants20h: _int(row, 'Votants20h', 14, 0),

          // Timestamp éventuel (si présent)
          timestamp: _str(row, 'Timestamp', 15, '')
        }));

      case 'Resultats_T1':
      case 'Resultats_T2': {
        // Colonnes attendues (Google Sheets):
        // A BureauID | B Inscrits | C Votants | D Blancs | E Nuls | F Exprimes | G..L L1_Voix..L6_Voix | M SaisiPar | N ValidePar | O Timestamp
        const mapped = rows.map(row => {
          const voix = {
            L1: parseInt(row[6]) || 0,
            L2: parseInt(row[7]) || 0,
            L3: parseInt(row[8]) || 0,
            L4: parseInt(row[9]) || 0,
            L5: parseInt(row[10]) || 0,
            L6: parseInt(row[11]) || 0,
          };

          return {
            bureauId: row[0] || '',
            inscrits: parseInt(row[1]) || 0,
            votants: parseInt(row[2]) || 0,
            blancs: parseInt(row[3]) || 0,
            nuls: parseInt(row[4]) || 0,
            exprimes: parseInt(row[5]) || 0,
            voix,
            saisiPar: row[12] || '',
            validePar: row[13] || '',
            timestamp: row[14] || ''
          };
        });

        // ── Déduplication par bureauId ────────────────────────────────────────
        // En cas de double saisie (appendRow déclenché deux fois), on garde
        // uniquement la ligne avec le plus grand nombre de suffrages exprimés.
        // Si deux lignes ont le même exprimes, on prend la dernière (rowIndex max).
        const byBureau = new Map();
        mapped.forEach(r => {
          const key = String(r.bureauId || '').trim().toUpperCase();
          if (!key) return; // ignorer les lignes sans bureauId
          const existing = byBureau.get(key);
          if (!existing) {
            byBureau.set(key, r);
          } else {
            const newExprimes = Number(r.exprimes) || 0;
            const curExprimes = Number(existing.exprimes) || 0;
            // Priorité : exprimes le plus grand ; à égalité, rowIndex le plus récent
            if (newExprimes > curExprimes ||
               (newExprimes === curExprimes && (r.rowIndex ?? 0) > (existing.rowIndex ?? 0))) {
              byBureau.set(key, r);
            }
          }
        });

        const deduped = Array.from(byBureau.values());

        return deduped;
      }

      case 'Seats_Municipal':
        // Colonnes attendues :
        // Tour | ListeID | NomListe | Voix | PctVoix | SiegesMajorite | SiegesProportionnels | SiegesTotal | Eligible
        return rows.map(row => ({
          tour: _int(row, 'Tour', 0, 1) || 1,
          listeId: _str(row, 'ListeID', 1, ''),
          nomListe: _str(row, 'NomListe', 2, ''),
          voix: _int(row, 'Voix', 3, 0),
          pctVoix: (() => {
            const i = _idx('PctVoix', 4);
            const v = (i !== undefined && i !== null) ? row[i] : undefined;
            const n = parseFloat(String(v ?? '').replace(',', '.'));
            return Number.isFinite(n) ? n : 0;
          })(),
          siegesMajorite: _int(row, 'SiegesMajorite', 5, 0),
          siegesProportionnels: _int(row, 'SiegesProportionnels', 6, 0),
          siegesTotal: _int(row, 'SiegesTotal', 7, 0),
          eligible: String(_str(row, 'Eligible', 8, 'FALSE')).trim().toUpperCase() === 'TRUE'
        }));

      case 'Seats_Community':
        // Colonnes attendues :
        // ListeID | NomListe | VoixMunicipal | PctMunicipal | SiegesCommunautaires | Eligible
        return rows.map(row => ({
          listeId: _str(row, 'ListeID', 0, ''),
          nomListe: _str(row, 'NomListe', 1, ''),
          voixMunicipal: _int(row, 'VoixMunicipal', 2, 0),
          pctMunicipal: (() => {
            const i = _idx('PctMunicipal', 3);
            const v = (i !== undefined && i !== null) ? row[i] : undefined;
            const n = parseFloat(String(v ?? '').replace(',', '.'));
            return Number.isFinite(n) ? n : 0;
          })(),
          siegesCommunautaires: _int(row, 'SiegesCommunautaires', 4, 0),
          eligible: String(_str(row, 'Eligible', 5, 'FALSE')).trim().toUpperCase() === 'TRUE'
        }));
default:
        // AuditLog : colonnes A timestamp | B user | C action | D details
        if (sheetName === 'AuditLog') {
          return rows.map(row => ({
            timestamp: row[0] || '',
            user: row[1] || '',
            action: row[2] || '',
            details: row[3] || ''
          }));
        }
        // Par défaut, retourner les lignes brutes
        return rows;
    }
  }

  async getData(sheetName, filters = {}) {
    const normalizedSheet = this.normalizeSheetName(sheetName);
    const range = filters?.range || 'A:Z';
    const a1 = this.a1(normalizedSheet, range);
    const { role, bureauId } = this._getAccessContext();
    const accessKey = role === 'BV' ? `BV:${bureauId}` : (role || 'NONE');
    const key = `getData:${normalizedSheet}:${a1}:${accessKey}`;
    const cached = this._getCached(key);
    if (cached) return cached;

    return await this._dedup(key, async () => {
      const values = await this.getValues(a1);
      const rows = values.slice();
      const header = rows.length > 0 ? rows[0] : [];
      if (rows.length > 0) rows.shift(); // remove header
      
      // Transformer les lignes en objets selon le sheetName
      const transformed = this._transformRows(normalizedSheet, rows, header);
      
      // IMPORTANT : Ajouter rowIndex à chaque objet pour permettre update/delete
      const withRowIndex = transformed.map((obj, index) => ({
        ...obj,
        rowIndex: index
      }));
      
            const filtered = this._filterRowsByAccess(normalizedSheet, withRowIndex);
      
this._setCached(key, filtered);
      return filtered;
    });
  }

  /**
   * Identique à getData, mais vide le cache et les requêtes inflight
   * AVANT de lire, garantissant des données fraîches depuis Google Sheets.
   *
   * À utiliser UNIQUEMENT avant une écriture critique (ex: handleBlur dans ParticipationSaisie)
   * pour éviter de réécrire des données périmées (stale) depuis le state React.
   *
   * ⚠️ Ne pas utiliser en boucle / en auto-refresh (performance / quotas).
   */
  async getDataFresh(sheetName, filters = {}) {
    // Vider tout le cache + inflight pour cette sheet
    const normalizedSheet = this.normalizeSheetName(sheetName);
    for (const k of Array.from(this._cache.keys())) {
      if (String(k).includes(normalizedSheet)) this._cache.delete(k);
    }
    for (const k of Array.from(this._inflight.keys())) {
      if (String(k).includes(normalizedSheet)) this._inflight.delete(k);
    }
    // Lecture fraîche
    return await this.getData(sheetName, filters);
  }


  /**
   * Convertit un objet métier en ligne (Array) dans l'ordre exact des colonnes Google Sheets.
   * IMPORTANT : évite les régressions liées à Object.values() (ordre non garanti / champs manquants).
   */
  _toRow(sheetName, rowData) {
    if (Array.isArray(rowData)) return rowData;
    const obj = rowData || {};

    switch (sheetName) {
      case 'Resultats_T1':
      case 'Resultats_T2': {
        const voix = obj.voix || {};
        // Supporte soit des clés "L1..L6", soit des ids candidats (ex: 'L1') identiques
        const l1 = parseInt(voix.L1 ?? voix['L1'] ?? obj.L1_Voix ?? obj.L1 ?? 0) || 0;
        const l2 = parseInt(voix.L2 ?? voix['L2'] ?? obj.L2_Voix ?? obj.L2 ?? 0) || 0;
        const l3 = parseInt(voix.L3 ?? voix['L3'] ?? obj.L3_Voix ?? obj.L3 ?? 0) || 0;
        const l4 = parseInt(voix.L4 ?? voix['L4'] ?? obj.L4_Voix ?? obj.L4 ?? 0) || 0;
        const l5 = parseInt(voix.L5 ?? voix['L5'] ?? obj.L5_Voix ?? obj.L5 ?? 0) || 0;
        const l6 = parseInt(voix.L6 ?? voix['L6'] ?? obj.L6_Voix ?? obj.L6 ?? 0) || 0;

        return [
          obj.bureauId ?? '',                 // A BureauID
          parseInt(obj.inscrits) || 0,         // B Inscrits
          parseInt(obj.votants) || 0,          // C Votants
          parseInt(obj.blancs) || 0,           // D Blancs
          parseInt(obj.nuls) || 0,             // E Nuls
          parseInt(obj.exprimes) || 0,          // F Exprimes
          l1,                                  // G L1_Voix
          l2,                                  // H L2_Voix
          l3,                                  // I L3_Voix
          l4,                                  // J L4_Voix
          l5,                                  // K L5_Voix
          l6,                                  // L L6_Voix
          obj.saisiPar ?? '',                  // M SaisiPar
          obj.validePar ?? '',                 // N ValidePar
          obj.timestamp ?? ''                  // O Timestamp
        ];
      }
      case 'Participation_T1':
      case 'Participation_T2':
        // Ordre exact des colonnes Google Sheets (08h supprimé)
        // A BureauID | B Tour | C Inscrits | D Votants09h ... | O Votants20h | P Timestamp (optionnel)
        return [
          obj.bureauId ?? '',                 // A BureauID
          parseInt(obj.tour) || 1,            // B Tour
          parseInt(obj.inscrits) || 0,        // C Inscrits
          parseInt(obj.votants09h) || 0,      // D
          parseInt(obj.votants10h) || 0,      // E
          parseInt(obj.votants11h) || 0,      // F
          parseInt(obj.votants12h) || 0,      // G
          parseInt(obj.votants13h) || 0,      // H
          parseInt(obj.votants14h) || 0,      // I
          parseInt(obj.votants15h) || 0,      // J
          parseInt(obj.votants16h) || 0,      // K
          parseInt(obj.votants17h) || 0,      // L
          parseInt(obj.votants18h) || 0,      // M
          parseInt(obj.votants19h) || 0,      // N
          parseInt(obj.votants20h) || 0,      // O
          obj.timestamp ?? ''                 // P Timestamp (optionnel)
        ];

      default:
        return Object.values(obj);
    }
  }

  async appendRow(sheetName, rowData) {
    const normalizedSheet = this.normalizeSheetName(sheetName);

    // Restriction BV : ne peut écrire que sur son bureau (Participation / Résultats)
    if (normalizedSheet === 'Participation_T1' || normalizedSheet === 'Participation_T2' || normalizedSheet === 'Resultats_T1' || normalizedSheet === 'Resultats_T2') {
      this._assertBureauAllowed(rowData?.bureauId);
    }
    const row = this._toRow(sheetName, rowData);
    return await this.appendRows(normalizedSheet, [row]);
  }

  async updateRow(sheetName, rowIndex, rowData) {
    const normalizedSheet = this.normalizeSheetName(sheetName);

    // Restriction BV : ne peut mettre à jour que son bureau (Participation / Résultats)
    if (normalizedSheet === 'Participation_T1' || normalizedSheet === 'Participation_T2' || normalizedSheet === 'Resultats_T1' || normalizedSheet === 'Resultats_T2') {
      this._assertBureauAllowed(rowData?.bureauId);
    }
    const row = this._toRow(sheetName, rowData);
    const sheetRow = Number(rowIndex) + 2;
    const lastCol = this.colIndexToA1(Math.max(0, row.length - 1));
    const a1 = this.a1(normalizedSheet, `A${sheetRow}:${lastCol}${sheetRow}`);

    // cache invalidation simple
    this._cache.clear();

    return await this.makeRequest(`/values:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [{ range: a1, values: [row] }],
      }),
    });
  }

  async deleteRow(sheetName, rowIndex) {
    const normalizedSheet = this.normalizeSheetName(sheetName);

    // Restriction BV : suppression interdite sur Participation / Résultats
    const { role } = this._getAccessContext();
    if (role === 'BV' && (normalizedSheet === 'Participation_T1' || normalizedSheet === 'Participation_T2' || normalizedSheet === 'Resultats_T1' || normalizedSheet === 'Resultats_T2')) {
      throw new Error('Accès refusé : suppression interdite pour un bureau de vote');
    }
    const sheetRow = Number(rowIndex) + 2;
    const a1 = this.a1Path(normalizedSheet, `A${sheetRow}:Z${sheetRow}`);

    this._cache.clear();

    return await this.makeRequest(`/values/${encodeURIComponent(a1)}:clear`, { method: 'POST' });
  }

  async batchUpdate(arg1, arg2) {
    if (Array.isArray(arg1) && arg2 === undefined) {
      const updates = arg1;
      const data = updates.map((u) => ({ range: u.range, values: u.values }));
      this._cache.clear();
      return await this.makeRequest('/values:batchUpdate', {
        method: 'POST',
        body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
      });
    }

    const sheetName = this.normalizeSheetName(arg1);

    // Restriction BV : batch update uniquement sur son bureau (Participation / Résultats)
    const { role: _roleBV, bureauId: _bvId } = this._getAccessContext();
    if (_roleBV === 'BV' && (sheetName === 'Participation_T1' || sheetName === 'Participation_T2' || sheetName === 'Resultats_T1' || sheetName === 'Resultats_T2')) {
      for (const r of (Array.isArray(arg2) ? arg2 : [])) {
        const dataObj = r?.rowData ?? r?.data ?? {};
        const target = dataObj?.bureauId;
        this._assertBureauAllowed(target);
      }
    }

    const rows = Array.isArray(arg2) ? arg2 : [];
    const updates = rows.map((r) => {
      const rowIndex = r.rowIndex ?? r.index ?? 0;
      const rowData = r.rowData ?? r.data ?? [];
      const row = this._toRow(sheetName, rowData);
      const sheetRow = Number(rowIndex) + 2;
      const lastCol = this.colIndexToA1(Math.max(0, row.length - 1));
      const rangeA1 = this.a1(sheetName, `A${sheetRow}:${lastCol}${sheetRow}`);
      return { range: rangeA1, values: [row] };
    });

    return await this.batchUpdate(updates);
  }

  // ==================== CONFIG ====================

  async getConfig() {
    const a1 = this.a1(SHEET_NAMES.CONFIG, 'A:B');
    const key = `getConfig:${a1}`;
    const cached = this._getCached(key);
    if (cached) return cached;

    return await this._dedup(key, async () => {
      const values = await this.getValues(a1);
      const config = {};
      values.forEach(([k, v]) => { if (k) config[k] = this.parseSheetValue(v); });
      this._setCached(key, config);
      return config;
    });
  }

  async setConfig(keyOrObject, value) {
    // Support:
    // - setConfig('VALIDATION_ADMIN_T1', 'TRUE')
    // - setConfig({ VALIDATION_ADMIN_T1: 'TRUE', VALIDATION_ADMIN_T2: 'FALSE' })
    const isObj =
      keyOrObject && typeof keyOrObject === 'object' && !Array.isArray(keyOrObject);

    const patch = isObj ? keyOrObject : { [keyOrObject]: value };

    const normKey = (k) => String(k ?? '').trim();
    const a1 = this.a1(SHEET_NAMES.CONFIG, 'A:B');

    // Lire l'onglet Config pour localiser les lignes existantes
    const values = await this.getValues(a1);
    const startIndex =
      values.length > 0 && String(values[0][0]).toLowerCase().includes('key') ? 1 : 0;

    // Map: key -> absoluteRowNumber (1-based in sheet)
    const keyToAbsRow = new Map();
    for (let i = startIndex; i < values.length; i++) {
      const k = normKey(values[i]?.[0]);
      if (k) keyToAbsRow.set(k, i + 1); // +1 because values[] is 0-based but sheet rows are 1-based
    }

    const batchData = [];
    const toAppend = [];

    for (const [k0, v] of Object.entries(patch)) {
      const k = normKey(k0);
      if (!k) continue;

      const absRow = keyToAbsRow.get(k);

      if (!absRow) {
        // Ajout d'une nouvelle clé
        toAppend.push([k, v]);
      } else {
        // Mise à jour de la valeur existante
        const updateA1 = this.a1(SHEET_NAMES.CONFIG, `B${absRow}`);
        batchData.push({ range: updateA1, values: [[v]] });
      }
    }

    // Invalidation caches AVANT les appels réseau
    try {
      for (const k of Array.from(this._cache.keys())) {
        if (String(k).startsWith('getConfig:')) this._cache.delete(k);
      }
      for (const k of Array.from(this._inflight.keys())) {
        if (String(k).startsWith('getConfig:')) this._inflight.delete(k);
      }
    } catch (e) {
      console.warn('Cache invalidation failed (getConfig):', e);
    }
    // Invalidation globale (best effort)
    this._cache.clear();

    // Exécuter les mises à jour
    if (batchData.length > 0) {
      await this.batchUpdate(batchData);
    }

    // Ajouter les nouvelles lignes
    if (toAppend.length > 0) {
      await this.appendRows(SHEET_NAMES.CONFIG, toAppend);
    }

    return true;
  }

  // ==================== STATE ====================

  async getElectionState() {
    const a1 = this.a1(SHEET_NAMES.ELECTIONS_STATE, 'A:C');
    const key = `getElectionState:${a1}`;
    const cached = this._getCached(key);
    if (cached) return cached;

    return await this._dedup(key, async () => {
      const values = await this.getValues(a1);
      const rows = values.slice();
      if (rows.length > 0 && String(rows[0][0]).toLowerCase().includes('key')) rows.shift();

      const state = {};
      rows.forEach(([k, v]) => { if (k) state[k] = this.parseSheetValue(v); });

      
// Compat: certaines versions historiques stockent le tour sous CURRENT_TOUR
if (state.tourActuel === undefined && state.CURRENT_TOUR !== undefined) {
  state.tourActuel = state.CURRENT_TOUR;
}
this._setCached(key, state);
      return state;
    });
  }

  
async updateElectionState(keyOrObject, value) {
  // Support:
  // - updateElectionState('tourActuel', 1)
  // - updateElectionState({ tourActuel: 1, secondTourEnabled: false })
  const isObj =
    keyOrObject && typeof keyOrObject === 'object' && !Array.isArray(keyOrObject);

  const patch = isObj ? keyOrObject : { [keyOrObject]: value };

  const normKey = (k) => String(k ?? '').trim();
  const a1 = this.a1(SHEET_NAMES.ELECTIONS_STATE, 'A:C');

  // Lire une fois pour localiser les lignes existantes
  const values = await this.getValues(a1);
  const startIndex =
    values.length > 0 && String(values[0][0]).toLowerCase().includes('key') ? 1 : 0;

  // Map: key -> absoluteRowNumber (1-based in sheet)
  const keyToAbsRow = new Map();
  for (let i = startIndex; i < values.length; i++) {
    const k = normKey(values[i]?.[0]);
    if (k) keyToAbsRow.set(k, i + 1); // +1 because values[] is 0-based but sheet rows are 1-based
  }

  // Compat: si on met à jour tourActuel, et que CURRENT_TOUR existe, on le met à jour aussi
  if (Object.prototype.hasOwnProperty.call(patch, 'tourActuel')) {
    const hasCurrentTour = keyToAbsRow.has('CURRENT_TOUR');
    const hasInPatch = Object.prototype.hasOwnProperty.call(patch, 'CURRENT_TOUR');
    if (hasCurrentTour && !hasInPatch) {
      patch.CURRENT_TOUR = patch.tourActuel;
    }
  }

  const timestamp = new Date().toISOString();
  const batchData = [];
  const toAppend = [];

  for (const [k0, v] of Object.entries(patch)) {
    const k = normKey(k0);
    if (!k) continue;

    const absRow = keyToAbsRow.get(k);

    if (!absRow) {
      // Ajout d'une nouvelle clé
      toAppend.push([k, v, timestamp]);
    } else {
      const updateA1 = this.a1(SHEET_NAMES.ELECTIONS_STATE, `B${absRow}:C${absRow}`);
      batchData.push({ range: updateA1, values: [[v, timestamp]] });
    }
  }

  // Invalidation caches AVANT les appels réseau suivants (pour éviter relire une valeur obsolète)
  try {
    for (const k of Array.from(this._cache.keys())) {
      if (String(k).startsWith('getElectionState:')) this._cache.delete(k);
    }
    for (const k of Array.from(this._inflight.keys())) {
      if (String(k).startsWith('getElectionState:')) this._inflight.delete(k);
    }
  } catch (e) {
    console.warn('Cache invalidation failed (getElectionState):', e);
  }
  // Invalidation globale (best effort)
  this._cache.clear();

  // 1) Updates existants via batchUpdate
  if (batchData.length > 0) {
    await this.makeRequest('/values:batchUpdate', {
      method: 'POST',
      body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: batchData }),
    });
  }

  // 2) Append des nouvelles lignes en une fois
  if (toAppend.length > 0) {
    await this.appendRows(SHEET_NAMES.ELECTIONS_STATE, toAppend);
  }

  // Broadcast UI (best effort)
  try {
    window.dispatchEvent(new CustomEvent('sheets:changed', { detail: { sheetName: SHEET_NAMES.ELECTIONS_STATE } }));
  } catch (_) {}

  return { updated: batchData.length, appended: toAppend.length };
}

// ==================== AUDIT / ERREURS ====================

  /**
   * Journalise une action métier dans la feuille AUDIT_LOG.
   * Colonnes attendues (ordre):
   * timestamp | action | entity | entityId | beforeJson | afterJson | userEmail (optionnel)
   */
  async logAudit(action, entity, entityId, before = {}, after = {}) {
    const ts = new Date().toISOString();

    const normalizeCell = (v) => {
      if (v === null || v === undefined) return "";
      if (typeof v === "object") {
        try { return JSON.stringify(v); } catch { return String(v); }
      }
      return v;
    };
    const beforeJson = JSON.stringify(before ?? {});
    const afterJson = JSON.stringify(after ?? {});
    const userEmail = (authService.getUserEmail?.() || authService.getUser?.()?.email || '') || '';

    return await this.appendRows(SHEET_NAMES.AUDIT_LOG, [[
      ts,
      action || '',
      entity || '',
      entityId || '',
      beforeJson,
      afterJson,
      userEmail
    ]]);
  }

  /**
   * Journalise une erreur technique/fonctionnelle dans la feuille ERROR_LOG.
   * Colonnes attendues (ordre):
   * timestamp | severity | source | message | stack | contextJson | userEmail (optionnel)
   */
  async logError(severity, source, message, stack = '', context = {}) {
    const ts = new Date().toISOString();
    const contextJson = JSON.stringify(context ?? {});
    const userEmail = (authService.getUserEmail?.() || authService.getUser?.()?.email || '') || '';

    return await this.appendRows(SHEET_NAMES.ERROR_LOG, [[
      ts,
      severity || 'ERROR',
      source || '',
      message || '',
      stack || '',
      contextJson,
      userEmail
    ]]);
  }


  /**
   * Purge partielle du journal d'audit (feuille AUDIT_LOG) par tour.
   * - Conserve la ligne d'en-tête si détectée
   * - Supprime les lignes identifiées comme liées au tour demandé (T1/T2)
   *
   * Heuristique (robuste aux formats historiques) :
   * - Format "logAudit" : [ts, action, entity, entityId, ...]
   * - Format "AuditService.log" : [ts, user, action, detailsJson] avec detailsJson contenant {entity, entityId, ...}
   */
  async purgeAuditLogByTour(tour = 1) {
    const sheetName = (SHEET_NAMES && SHEET_NAMES.AUDIT_LOG) ? SHEET_NAMES.AUDIT_LOG : 'AuditLog';
    const a1 = this.a1(sheetName, 'A:Z');

    const values = await this.getValues(a1);
    if (!Array.isArray(values) || values.length === 0) {
      return { removed: 0, kept: 0 };
    }

    const norm = (v) => String(v ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();

    const safeStringify = (v) => {
      try {
        if (typeof v === 'string') return v;
        return JSON.stringify(v);
      } catch (_) {
        try { return String(v); } catch { return ''; }
      }
    };

    const headerCandidate = values[0] || [];
    const headerJoined = norm(headerCandidate.join(' '));
    const hasHeader =
      headerJoined.includes('timestamp') ||
      headerJoined.includes('date') ||
      headerJoined.includes('action') ||
      headerJoined.includes('utilisateur') ||
      headerJoined.includes('user');

    const header = hasHeader ? values[0] : null;
    const dataRows = values.slice(hasHeader ? 1 : 0);

    const reT = (tour === 2)
      ? /(^|[^a-z0-9])t2([^a-z0-9]|$)/
      : /(^|[^a-z0-9])t1([^a-z0-9]|$)/;

    const reTourWord = (tour === 2) ? /tour2/ : /tour1/;

    const isMatch = (row) => {
      if (!Array.isArray(row)) return false;

      // Format long (logAudit): entity/entityId en colonnes C/D
      let entity = '';
      let entityId = '';
      let detailsStr = '';

      if (row.length >= 7) {
        entity = row[2] ?? '';
        entityId = row[3] ?? '';
        detailsStr = `${row[4] ?? ''} ${row[5] ?? ''}`.trim();
      } else if (row.length >= 4) {
        // Format court (AuditService.log): details JSON en colonne D
        detailsStr = row[3] ?? '';
      }

      // Si details est un JSON (cas format court), tenter d'extraire entity/entityId
      const det = String(detailsStr ?? '').trim();
      if (det && (det.startsWith('{') || det.startsWith('['))) {
        try {
          const obj = JSON.parse(det);
          entity = entity || (obj?.entity ?? obj?.sheet ?? '');
          entityId = entityId || (obj?.entityId ?? obj?.id ?? '');
          detailsStr = safeStringify(obj);
        } catch (_) {
          // ignore
        }
      }

      const hay = `${norm(entity)} ${norm(entityId)} ${norm(detailsStr)}`;

      return reT.test(hay) || reTourWord.test(hay);
    };

    const kept = [];
    let removed = 0;

    for (const row of dataRows) {
      if (isMatch(row)) removed += 1;
      else kept.push(row);
    }

    // Réécriture (clear + append) pour éviter la suppression ligne par ligne
    await this.clearSheet(sheetName);

    const out = [];
    if (header) out.push(header);
    out.push(...kept);

    if (out.length > 0) {
      await this.appendRows(sheetName, out);
    }

    // Invalidation caches + broadcast
    this._cache.clear();
    try {
      window.dispatchEvent(new CustomEvent('sheets:changed', { detail: { sheetName } }));
    } catch (_) {}

    return { removed, kept: kept.length };
  }

// ==================== UTILITAIRES ====================

  async appendRows(sheetName, rows) {
    const normalizedSheet = this.normalizeSheetName(sheetName);
    const a1 = this.a1Path(normalizedSheet, 'A:Z');
    this._cache.clear();

    // ici on garde /values/{range}:append (fonctionne bien car range simple A:Z, même si onglet accentué)
    return await this.makeRequest(
      `/values/${encodeURIComponent(a1)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify({ values: rows }) }
    );
  }

  async clearSheet(sheetName) {
    const normalizedSheet = this.normalizeSheetName(sheetName);
    const a1 = this.a1Path(normalizedSheet, 'A:Z');
    this._cache.clear();
    return await this.makeRequest(`/values/${encodeURIComponent(a1)}:clear`, { method: 'POST' });
  }
}

export default new GoogleSheetsService();
