// src/hooks/useAuth.js
import { useState, useEffect } from 'react';
import authService from '../services/authService';

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const authenticated = authService.isAuthenticated();
      setIsAuthenticated(authenticated);
      
      if (authenticated) {
        const userInfo = await authService.getUserInfo();
        setUser(userInfo);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async () => {
    try {
      setLoading(true);
      setError(null);
      await authService.signIn();
      await checkAuth();
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signOut = () => {
    authService.signOut();
    setIsAuthenticated(false);
    setUser(null);
  };

  return {
    isAuthenticated,
    user,
    loading,
    error,
    signIn,
    signOut
  };
}

// src/hooks/useGoogleSheets.js
import { useState, useCallback } from 'react';
import googleSheetsService from '../services/googleSheetsService';
import auditService from '../services/auditService';

export function useGoogleSheets() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const execute = useCallback(async (operation, ...args) => {
    try {
      setLoading(true);
      setError(null);
      const result = await operation(...args);
      return result;
    } catch (err) {
      setError(err.message);
      auditService.logCritical('useGoogleSheets', err.message, err.stack);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Config
  const getConfig = useCallback(() => 
    execute(googleSheetsService.getConfig.bind(googleSheetsService))
  , [execute]);

  const updateConfig = useCallback((key, value) =>
    execute(googleSheetsService.updateConfig.bind(googleSheetsService), key, value)
  , [execute]);

  // Bureaux
  const getBureaux = useCallback(() =>
    execute(googleSheetsService.getBureaux.bind(googleSheetsService))
  , [execute]);

  const updateBureau = useCallback((bureauId, data) =>
    execute(googleSheetsService.updateBureau.bind(googleSheetsService), bureauId, data)
  , [execute]);

  // Candidats
  const getCandidats = useCallback(() =>
    execute(googleSheetsService.getCandidats.bind(googleSheetsService))
  , [execute]);

  const addCandidat = useCallback((candidat) =>
    execute(googleSheetsService.addCandidat.bind(googleSheetsService), candidat)
  , [execute]);

  const updateCandidat = useCallback((listeId, data) =>
    execute(googleSheetsService.updateCandidat.bind(googleSheetsService), listeId, data)
  , [execute]);

  // Participation
  const getParticipation = useCallback((tour) =>
    execute(googleSheetsService.getParticipation.bind(googleSheetsService), tour)
  , [execute]);

  const saveParticipation = useCallback((tour, data) =>
    execute(googleSheetsService.saveParticipation.bind(googleSheetsService), tour, data)
  , [execute]);

  // Résultats
  const getResultats = useCallback((tour) =>
    execute(googleSheetsService.getResultats.bind(googleSheetsService), tour)
  , [execute]);

  const saveResultatsBureau = useCallback((tour, bureauId, data) =>
    execute(googleSheetsService.saveResultatsBureau.bind(googleSheetsService), tour, bureauId, data)
  , [execute]);

  const validerResultatsBureau = useCallback((tour, bureauId) =>
    execute(googleSheetsService.validerResultatsBureau.bind(googleSheetsService), tour, bureauId)
  , [execute]);

  // State
  const getElectionState = useCallback(() =>
    execute(googleSheetsService.getElectionState.bind(googleSheetsService))
  , [execute]);

  const updateElectionState = useCallback((key, value) =>
    execute(googleSheetsService.updateElectionState.bind(googleSheetsService), key, value)
  , [execute]);

  return {
    loading,
    error,
    getConfig,
    updateConfig,
    getBureaux,
    updateBureau,
    getCandidats,
    addCandidat,
    updateCandidat,
    getParticipation,
    saveParticipation,
    getResultats,
    saveResultatsBureau,
    validerResultatsBureau,
    getElectionState,
    updateElectionState
  };
}

// src/hooks/useElectionState.js
import { useState, useEffect } from 'react';
import { useGoogleSheets } from './useGoogleSheets';

export function useElectionState() {
  const [state, setState] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const { getConfig, getElectionState } = useGoogleSheets();

  useEffect(() => {
    loadState();
  }, []);

  const loadState = async () => {
    try {
      setLoading(true);
      const [configData, stateData] = await Promise.all([
        getConfig(),
        getElectionState()
      ]);
      setConfig(configData);
      setState(stateData);
    } catch (error) {
      console.error('Erreur chargement état:', error);
    } finally {
      setLoading(false);
    }
  };

  const refresh = () => {
    loadState();
  };

  const currentTour = config?.CURRENT_TOUR || 1;
  const t1Status = state?.T1_STATUS?.value || 'NON_OUVERT';
  const t2Status = state?.T2_STATUS?.value || 'NON_OUVERT';

  return {
    state,
    config,
    loading,
    refresh,
    currentTour,
    t1Status,
    t2Status
  };
}
