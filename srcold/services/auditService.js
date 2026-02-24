// src/services/auditService.js
// Service d'audit applicatif (Google Sheets)
//
// Contraintes non-régressives :
// - NE JAMAIS envoyer d'objets JS directement dans values[][] (Sheets API n'accepte que primitives)
// - sérialiser systématiquement les payloads complexes en JSON string
// - fournir les fonctions attendues par l'app (ex: setupGlobalErrorHandler)
//
// Méthodes exposées:
// - log(action, details)           → écriture AuditLog (méthode principale)
// - logAction(action, details)     → alias de log() (utilisé par ResultatsSaisieBureau)
// - logExport(...)                 → écriture AuditLog (exports PDF/Excel)
// - logError(severity, source, errLike, context) → écriture ErrorLog
// - logCritical(source, message, stack)          → alias logError('CRITICAL', ...)
// - setupGlobalErrorHandler()      → capture globale des erreurs JS
//
// Dépendances:
// - googleSheetsService.appendRow(...) pour AuditLog
// - googleSheetsService.logError(...) (si disponible) pour ErrorLog

import authService from './authService';
import googleSheetsService from './googleSheetsService';

const AUDIT_SHEET = 'AuditLog';

function safeJsonStringify(value) {
  if (value === null || value === undefined) return '';
  try {
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  } catch (e) {
    try {
      return String(value);
    } catch (_) {
      return '[détails non sérialisables]';
    }
  }
}

function getUserLabel() {
  const email = authService.getUserEmail?.() || authService.getUser?.()?.email || '';
  if (email) return email;
  const name = authService.getUser?.()?.name || authService.getUser?.()?.displayName || '';
  return name || 'admin';
}

function normalizeError(errLike) {
  if (!errLike) return { message: 'Erreur inconnue', stack: '' };

  if (errLike instanceof Error) {
    return { message: errLike.message || 'Erreur', stack: errLike.stack || '' };
  }

  if (typeof errLike === 'string') return { message: errLike, stack: '' };

  // cas unhandledrejection: evt.reason
  try {
    const msg = errLike.message || safeJsonStringify(errLike) || 'Erreur';
    const stack = errLike.stack || '';
    return { message: msg, stack };
  } catch (_) {
    return { message: 'Erreur', stack: '' };
  }
}

class AuditService {
  constructor() {
    this._globalHandlerInstalled = false;
  }

  /**
   * Ajoute une ligne dans la feuille AuditLog.
   * Colonnes : A timestamp | B user | C action | D details (JSON)
   *
   * ⚠️ Ne doit JAMAIS faire planter l'app — toute erreur est attrapée et loguée en console.
   */
  async log(action, details = {}) {
    try {
      const ts = new Date().toISOString();
      const user = getUserLabel();
      const detailsJson = safeJsonStringify(details);

      console.log('[AUDIT] ➡️ Écriture en cours:', { action, user, ts, detailsJson: detailsJson.substring(0, 100) });

      // IMPORTANT : on passe un ARRAY pour garantir l'ordre des colonnes
      const result = await googleSheetsService.appendRow(AUDIT_SHEET, [ts, user, action || '', detailsJson]);

      console.log('[AUDIT] ✅ Écriture réussie:', result);
      return result;
    } catch (e) {
      // L'audit ne doit jamais bloquer l'application
      console.error('[AUDIT] ❌ Écriture AuditLog échouée:', e, '| action:', action);
      return null;
    }
  }

  /**
   * Alias de log() — utilisé par ResultatsSaisieBureau et d'autres composants.
   * Signature identique : logAction(action, details)
   */
  async logAction(action, details = {}) {
    return await this.log(action, details);
  }

  /**
   * Journalise un export (PDF/Excel/etc.).
   *
   * Compatibilité:
   * - logExport({ type: 'PDF', ...meta })
   * - logExport('PDF', meta)
   * - logExport('EXPORT_PDF', 'PDF', meta)  (anciens appels possibles)
   *
   * Cette méthode ne doit jamais bloquer la fonctionnalité d'export.
   */
  async logExport(arg1 = {}, arg2 = undefined, arg3 = undefined) {
    try {
      let payload = {};

      // (action, type, meta)
      if (typeof arg1 === 'string' && typeof arg2 === 'string') {
        payload = { action: arg1, type: arg2, ...(arg3 && typeof arg3 === 'object' ? arg3 : {}) };
      }
      // (type, meta)
      else if (typeof arg1 === 'string') {
        payload = { type: arg1, ...(arg2 && typeof arg2 === 'object' ? arg2 : {}) };
      }
      // ({...})
      else if (arg1 && typeof arg1 === 'object') {
        payload = { ...arg1 };
      }

      const action = payload.action || 'EXPORT';
      await this.log(action, payload);
    } catch (error) {
      // On log, mais on ne casse jamais l'export.
      console.warn('Avertissement: logExport a échoué:', error);
    }
  }

  /**
   * Journalise une erreur dans la feuille ERROR_LOG via googleSheetsService.logError (si dispo).
   * Ne doit jamais faire planter l'app.
   */
  async logError(severity, source, errLike, context = {}) {
    try {
      const { message, stack } = normalizeError(errLike);

      if (typeof googleSheetsService.logError === 'function') {
        // logError gère déjà la sérialisation du context
        return await googleSheetsService.logError(severity || 'ERROR', source || 'APP', message, stack, context);
      }

      // Fallback : écrire dans AuditLog si ErrorLog indisponible
      return await this.log('ERROR', {
        severity: severity || 'ERROR',
        source: source || 'APP',
        message,
        stack,
        context: safeJsonStringify(context),
      });
    } catch (e) {
      // Silence: l'audit ne doit jamais bloquer l'appli
      console.warn('AuditService.logError failed:', e);
      return null;
    }
  }

  /**
   * Alias de logError('CRITICAL', ...) — utilisé par hooks/index.js (useGoogleSheets).
   * Signature : logCritical(source, message, stack)
   */
  async logCritical(source, message, stack = '') {
    return await this.logError('CRITICAL', source, { message, stack });
  }

  /**
   * Installe les handlers globaux (window.onerror + unhandledrejection).
   * Cette méthode est attendue par main.jsx.
   */
  setupGlobalErrorHandler() {
    if (this._globalHandlerInstalled) return;
    this._globalHandlerInstalled = true;

    // Errors JS non catchées
    window.addEventListener('error', (evt) => {
      try {
        const err = evt?.error || evt?.message || 'Erreur JS';
        this.logError('ERROR', 'window.error', err, {
          filename: evt?.filename || '',
          lineno: evt?.lineno || null,
          colno: evt?.colno || null,
        });
      } catch (e) {
        console.warn('Global error handler failed:', e);
      }
    });

    // Promesses rejetées non catchées
    window.addEventListener('unhandledrejection', (evt) => {
      try {
        const reason = evt?.reason || 'Unhandled rejection';
        this.logError('ERROR', 'unhandledrejection', reason, {});
      } catch (e) {
        console.warn('Unhandled rejection handler failed:', e);
      }
    });
  }
}

export default new AuditService();
