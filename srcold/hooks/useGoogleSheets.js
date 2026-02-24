import { useState, useCallback, useEffect, useRef } from 'react';
import googleSheetsService from '../services/googleSheetsService';
import authService from '../services/authService';

/**
 * Hook personnalisé pour simplifier les interactions avec Google Sheets
 * Gère le chargement, les erreurs, et les opérations CRUD
 *
 * Objectif non-régressable :
 * - Ne JAMAIS appeler l'API Sheets si le token OAuth est absent/expiré
 * - Éviter tout "Uncaught (in promise)" lors des auto-load / reload déclenchés par useEffect
 * - Conserver le comportement d'erreur pour les appels explicites (load/create/update/...)
 */
export const useGoogleSheets = (sheetName) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const lastFiltersRef = useRef({});
  const reloadTimerRef = useRef(null);
  const hasLoadedOnceRef = useRef(false);

  const hasOAuthToken = useCallback(() => {
    try {
      return !!authService.getAccessToken?.();
    } catch (_) {
      return false;
    }
  }, []);

  /**
   * Charger les données
   * @param {object} filters
   * @param {{silent?: boolean}} options
   *  - silent=true : ne throw pas (utile pour auto-load / reload) afin d'éviter les promesses non catchées
   */
  const load = useCallback(
    async (filters = {}, options = {}) => {
      const { silent = false } = options || {};
      lastFiltersRef.current = filters || {};

      // Garde-fou : pas d'appel réseau sans token OAuth.
      if (!hasOAuthToken()) {
        const err = new Error('Non authentifié - Token manquant');
        setError(err.message);
        // On ne force pas setData([]) pour ne pas "vider" l'UI si l'utilisateur perd le token en cours de session.
        if (!silent) throw err;
        return [];
      }

      try {
        setLoading(true);
        setError(null);

        const result = await googleSheetsService.getData(sheetName, filters);
        setData(result);

        // Marqueur : utile pour auto-load au montage sans provoquer de boucles.
        hasLoadedOnceRef.current = true;

        return result;
      } catch (err) {
        console.error(`Erreur chargement ${sheetName}:`, err);
        setError(err?.message || String(err));
        if (!silent) throw err;
        return [];
      } finally {
        setLoading(false);
      }
    },
    [sheetName, hasOAuthToken]
  );

  // Réinitialiser le marqueur de chargement quand sheetName change
  // (ex : passage T1→T2 dans la page Informations).
  // Sans ce reset, hasLoadedOnceRef reste à true et l'auto-load ci-dessous
  // ne se déclenche jamais pour le nouvel onglet → données stale.
  const prevSheetRef = useRef(sheetName);
  useEffect(() => {
    if (prevSheetRef.current !== sheetName) {
      hasLoadedOnceRef.current = false;
      prevSheetRef.current = sheetName;
      // Vider immédiatement les données de l'ancien onglet pour éviter
      // qu'un changement T1↔T2 affiche des données périmées du mauvais tour
      // pendant la durée du fetch suivant.
      setData([]);
    }
  }, [sheetName]);

  // Auto-chargement au montage (et lors d'un changement de sheetName)
  // IMPORTANT : certaines vues consomment uniquement `data` sans appeler `load()`.
  // - En dev React 18, les effects peuvent être invoqués deux fois (StrictMode).
  // - On utilise silent=true + garde token pour éviter la console spam et les Uncaught promise.
  useEffect(() => {
    if (!sheetName) return;
    if (hasLoadedOnceRef.current) return;

    // Auto-load non bloquant : ne jamais throw ici
    load(lastFiltersRef.current, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetName, load]);

  // Debounce reload pour éviter de dépasser les quotas Sheets en cas d'enchaînement d'écritures
  const scheduleReload = useCallback(() => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => {
      load(lastFiltersRef.current, { silent: true });
    }, 250);
  }, [load]);

  // Écoute un événement global pour rafraîchir les données après une écriture ailleurs
  useEffect(() => {
    const handler = (evt) => {
      const target = evt?.detail?.sheetName;
      if (target && target === sheetName) {
        scheduleReload();
      }
    };
    window.addEventListener('sheets:changed', handler);
    return () => {
      window.removeEventListener('sheets:changed', handler);
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    };
  }, [sheetName, scheduleReload]);

  // Créer une nouvelle ligne
  const create = useCallback(
    async (rowData) => {
      try {
        setLoading(true);
        setError(null);

        const result = await googleSheetsService.appendRow(sheetName, rowData);

        // Recharger les données (appel explicite => throw si token manquant)
        await load();

        return result;
      } catch (err) {
        console.error(`Erreur création ${sheetName}:`, err);
        setError(err?.message || String(err));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [sheetName, load]
  );

  // Mettre à jour une ligne
  const update = useCallback(
    async (rowIndex, rowData) => {
      try {
        setLoading(true);
        setError(null);

        const result = await googleSheetsService.updateRow(sheetName, rowIndex, rowData);

        // Recharger les données (appel explicite => throw si token manquant)
        await load();

        return result;
      } catch (err) {
        console.error(`Erreur mise à jour ${sheetName}:`, err);
        setError(err?.message || String(err));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [sheetName, load]
  );

  // Supprimer une ligne
  const remove = useCallback(
    async (rowIndex) => {
      try {
        setLoading(true);
        setError(null);

        await googleSheetsService.deleteRow(sheetName, rowIndex);

        // Recharger les données (appel explicite => throw si token manquant)
        await load();
      } catch (err) {
        console.error(`Erreur suppression ${sheetName}:`, err);
        setError(err?.message || String(err));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [sheetName, load]
  );

  // Créer ou mettre à jour en masse
  const batchUpdate = useCallback(
    async (rows) => {
      try {
        setLoading(true);
        setError(null);

        const result = await googleSheetsService.batchUpdate(sheetName, rows);

        // Recharger les données (appel explicite => throw si token manquant)
        await load();

        return result;
      } catch (err) {
        console.error(`Erreur batch update ${sheetName}:`, err);
        setError(err?.message || String(err));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [sheetName, load]
  );

  // Rafraîchir les données
  const refresh = useCallback(async () => {
    return load({}, { silent: false });
  }, [load]);

  // Réinitialiser l'erreur
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    data,
    loading,
    error,
    load,
    create,
    update,
    remove,
    batchUpdate,
    refresh,
    clearError,
  };
};

export default useGoogleSheets;
