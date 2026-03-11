// src/components/resultats/ResultatsSaisieBureau.jsx
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import googleSheetsService from '../../services/googleSheetsService';
import auditService from '../../services/auditService';
import { getAuthState, isBV } from '../../services/authService';
import { useElectionState } from '../../hooks/useElectionState';
import { useGoogleSheets } from '../../hooks/useGoogleSheets';

/**
 * Normalise les bureauId pour un matching robuste
 */
const normalizeBureauId = (value) => {
  if (value === null || value === undefined) return '';
  const s = String(value).trim().toUpperCase();
  const m = s.match(/(\d+)/);
  return m ? m[1] : s;
};

export default function ResultatsSaisieBureau({ electionState: electionStateProp } = {}) {
  const auth = useMemo(() => getAuthState(), []);
  // ⚠️ CORRECTION : préfixe "BV" conservé pour cohérence avec les onglets Google Sheets (BV1..BV13)
  const forcedBureauId = isBV(auth) ? `BV${auth.bureauId}` : null;
  const isAdmin = !isBV(auth); // Admin peut toujours modifier
  // ⚠️ CORRECTION : BV = exprimés toujours calculé automatiquement (jamais saisissable)
  const isBureauVote = !isAdmin;

  const { state: electionStateHook } = useElectionState();
  const electionState = electionStateProp || electionStateHook;
  const tourActuel = electionState?.tourActuel === 2 ? 2 : 1;
  const resultatsSheet = tourActuel === 2 ? 'Resultats_T2' : 'Resultats_T1';

  const { data: bureaux } = useGoogleSheets('Bureaux');
  const { data: candidats } = useGoogleSheets('Candidats');
  const { data: resultats, load: reloadResultats, loading: loadingResultats } = useGoogleSheets(resultatsSheet);

  const [selectedBureauId, setSelectedBureauId] = useState(forcedBureauId || '');
  const [row, setRow] = useState(null);
  const [isLocked, setIsLocked] = useState(false); // État de verrouillage BV
  const [showConfirmModal, setShowConfirmModal] = useState(false); // Modal de confirmation BV
  const [showSuccessModal, setShowSuccessModal] = useState(false); // Modal de succès BV
  
  // États pour le verrouillage ADMIN
  const [adminValidated, setAdminValidated] = useState(false); // État de validation admin globale
  const [showAdminConfirmModal, setShowAdminConfirmModal] = useState(false); // Modal confirmation admin
  const [showAdminSuccessModal, setShowAdminSuccessModal] = useState(false); // Modal succès admin
  const [showAdminUnlockModal, setShowAdminUnlockModal] = useState(false); // Modal déverrouillage admin
  const [showAdminUnlockSuccessModal, setShowAdminUnlockSuccessModal] = useState(false); // Modal succès après déverrouillage

  const [inputsMain, setInputsMain] = useState({
    inscrits: '',
    votants: '',
    procurations: '',
    blancs: '',
    nuls: '',
    exprimes: '',
  });

  const [inputsVoix, setInputsVoix] = useState({});

  // ── Verrous anti-doublon ─────────────────────────────────────────────────────
  // isSavingRef : empêche deux sauvegardes concurrentes (onBlur multiples rapides)
  const isSavingRef = useRef(false);
  // appendedRowIndexRef : après un premier appendRow réussi, mémorise le rowIndex
  // pour que les sauvegardes suivantes utilisent updateRow même si row state est stale
  const appendedRowIndexRef = useRef(null);

  useEffect(() => {
    if (forcedBureauId) setSelectedBureauId(forcedBureauId);
  }, [forcedBureauId]);

  // Charger le statut de validation admin depuis Config (pour TOUS les profils)
// IMPORTANT: éviter toute surconsommation Google Sheets (quota Read/min/user)
// - polling plus espacé
// - anti-burst (requêtes concurrentes bloquées)
// - backoff automatique en cas de HTTP 429 (quota exceeded)
useEffect(() => {
  let cancelled = false;

  // État interne de polling (évite les doublons et gère le backoff)
  const pollState = {
    prevValidated: null,
    inFlight: null,
    lastFetchAt: 0,
    nextAllowedAt: 0,
    backoffMs: 0,
  };

  const MIN_GAP_MS = 5000; // sécurité anti-burst (même si plusieurs triggers)
  const BASE_INTERVAL_MS = isAdmin ? 10000 : 15000; // BV = moins agressif (quota)
  const MAX_BACKOFF_MS = 60000;

  const loadAdminStatus = async (reason = 'poll') => {
    if (cancelled) return;

    const now = Date.now();

    // Pas de requêtes concurrentes
    if (pollState.inFlight) return pollState.inFlight;

    // Backoff actif
    if (now < pollState.nextAllowedAt) return;

    // Anti-burst
    if (now - pollState.lastFetchAt < MIN_GAP_MS) return;

    pollState.lastFetchAt = now;

    pollState.inFlight = (async () => {
      try {
        const config = await googleSheetsService.getConfig();
        const key = tourActuel === 1 ? 'VALIDATION_ADMIN_T1' : 'VALIDATION_ADMIN_T2';
        const validated = config[key] === 'TRUE' || config[key] === true;

        if (!cancelled && pollState.prevValidated !== validated) {
          setAdminValidated(validated);
          pollState.prevValidated = validated;
        }

        // Reset backoff si OK
        pollState.backoffMs = 0;
        pollState.nextAllowedAt = 0;
      } catch (e) {
        const msg = String(e?.message || '');
        const status = e?.status || e?.code;

        // Gestion spécifique quota (HTTP 429)
        const is429 =
          status === 429 ||
          msg.includes('HTTP 429') ||
          msg.includes('Quota exceeded') ||
          msg.includes('Too Many Requests');

        if (is429) {
          pollState.backoffMs = pollState.backoffMs
            ? Math.min(pollState.backoffMs * 2, MAX_BACKOFF_MS)
            : 10000; // 10s au premier 429

          pollState.nextAllowedAt = Date.now() + pollState.backoffMs;

          // Log non bloquant (1 ligne claire)
          console.warn(
            `[Config] Quota Google Sheets (429) pendant lecture validation admin (${reason}). Pause ${Math.round(
              pollState.backoffMs / 1000
            )}s.`
          );
        } else {
          console.error('Erreur chargement validation admin:', e);
        }
      } finally {
        pollState.inFlight = null;
      }
    })();

    return pollState.inFlight;
  };

  // Chargement initial
  loadAdminStatus('init');

  // Polling (espacé) du statut admin global (critique pour bloquer les profils BV)
  const interval = setInterval(() => {
    loadAdminStatus('interval');
  }, BASE_INTERVAL_MS);

  return () => {
    cancelled = true;
    clearInterval(interval);
  };
}, [tourActuel, isAdmin]);


  const bureauOptions = useMemo(() => {
    const list = Array.isArray(bureaux) ? bureaux : [];
    return list
      .filter((b) => b && (b.actif === true || b.actif === 'TRUE' || b.actif === 1))
      .map((b) => ({ id: String(b.id ?? ''), nom: String(b.nom ?? b.id ?? '') }));
  }, [bureaux]);

  const candidatsActifs = useMemo(() => {
    const list = Array.isArray(candidats) ? candidats : [];
    const filtered = list.filter((c) => (tourActuel === 1 ? !!c.actifT1 : !!c.actifT2));
    filtered.sort((a, b) => (Number(a.ordre) || 0) - (Number(b.ordre) || 0));
    return filtered;
  }, [candidats, tourActuel]);

  const findRowForBureau = useCallback((bureauId) => {
    const list = Array.isArray(resultats) ? resultats : [];
    const normalized = normalizeBureauId(bureauId);
    return list.find((r) => normalizeBureauId(r?.bureauId ?? '') === normalized) || null;
  }, [resultats]);

  const getInscritsForBureau = useCallback((bureauId) => {
    const list = Array.isArray(bureaux) ? bureaux : [];
    const normalized = normalizeBureauId(bureauId);
    const bureau = list.find((b) => normalizeBureauId(b?.id ?? '') === normalized);
    return bureau ? Number(bureau.inscrits) || 0 : 0;
  }, [bureaux]);

  useEffect(() => {
    // Reset des verrous anti-doublon à chaque changement de bureau
    isSavingRef.current = false;
    appendedRowIndexRef.current = null;

    if (!selectedBureauId) {
      setRow(null);
      setInputsMain({ inscrits: '', votants: '', procurations: '', blancs: '', nuls: '', exprimes: '' });
      setInputsVoix({});
      setIsLocked(false);
      return;
    }

    const current = findRowForBureau(selectedBureauId);
    setRow(current);

    // Charger le statut de verrouillage depuis Google Sheets
    const locked = current?.validePar ? true : false; // Si validePar existe, c'est verrouillé
    setIsLocked(locked);

    const inscritsFromBureaux = getInscritsForBureau(selectedBureauId);

    const nextMain = {
      inscrits: String(inscritsFromBureaux || ''),
      votants: current ? String(current.votants ?? '') : '',
      procurations: current ? String(current.procurations ?? '') : '',
      blancs: current ? String(current.blancs ?? '') : '',
      nuls: current ? String(current.nuls ?? '') : '',
      exprimes: current ? String(current.exprimes ?? '') : '',
    };
    setInputsMain(nextMain);

    const nextVoix = {};
    for (const c of candidatsActifs) {
      const key = String(c?.listeId ?? '').trim();
      if (!key) continue;
      const v = current?.voix?.[key];
      nextVoix[key] = (v === null || v === undefined) ? '' : String(v);
    }
    setInputsVoix(nextVoix);
  }, [selectedBureauId, tourActuel, candidatsActifs, findRowForBureau, getInscritsForBureau]);


  // ⚠️ CORRECTION : Pour les BV, exprimés = votants - (blancs + nuls), calculé automatiquement
  useEffect(() => {
    if (!isBureauVote) return;
    const votants = parseInt(inputsMain.votants, 10) || 0;
    const blancs  = parseInt(inputsMain.blancs,  10) || 0;
    const nuls    = parseInt(inputsMain.nuls,    10) || 0;
    const exprimes = Math.max(0, votants - (blancs + nuls));
    setInputsMain((prev) => ({ ...prev, exprimes: String(exprimes) }));
  }, [isBureauVote, inputsMain.votants, inputsMain.blancs, inputsMain.nuls]);

  const coerceInt = (v) => {
    const s = String(v ?? '').trim();
    if (s === '') return 0;
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : 0;
  };

  const buildRowData = useCallback(() => {
    const voix = {};
    for (const c of candidatsActifs) {
      const key = String(c?.listeId ?? '').trim();
      if (!key) continue;
      voix[key] = coerceInt(inputsVoix[key]);
    }

    const votants = coerceInt(inputsMain.votants);
    const blancs = coerceInt(inputsMain.blancs);
    const nuls = coerceInt(inputsMain.nuls);
    const exprimes = coerceInt(inputsMain.exprimes);

    return {
      bureauId: selectedBureauId,
      inscrits: coerceInt(inputsMain.inscrits),
      votants: votants,
      procurations: coerceInt(inputsMain.procurations),
      blancs: blancs,
      nuls: nuls,
      exprimes: exprimes,
      voix,
      saisiPar: row?.saisiPar ?? '',
      validePar: row?.validePar ?? '',
      timestamp: row?.timestamp ?? '',
    };
  }, [candidatsActifs, inputsMain, inputsVoix, row, selectedBureauId]);

  const saveCurrentRow = useCallback(async (fieldLabelForAudit) => {
    if (!selectedBureauId) return;

    // ── Verrou anti-doublon : si une sauvegarde est déjà en cours, on abandonne ──
    if (isSavingRef.current) {
      console.warn('[ResultatsSaisieBureau] saveCurrentRow ignorée : sauvegarde en cours');
      return;
    }
    isSavingRef.current = true;

    try {
      const rowData = buildRowData();

      // rowIndex source : état React (row) OU ref mémorisée après un premier appendRow
      const effectiveRowIndex = row?.rowIndex ?? appendedRowIndexRef.current;

      if (effectiveRowIndex !== undefined && effectiveRowIndex !== null) {
        await googleSheetsService.updateRow(resultatsSheet, effectiveRowIndex, rowData);
      } else {
        const appended = await googleSheetsService.appendRow(resultatsSheet, rowData);
        // Mémoriser le rowIndex retourné pour éviter tout appendRow ultérieur sur ce bureau
        if (appended?.rowIndex !== undefined && appended?.rowIndex !== null) {
          appendedRowIndexRef.current = appended.rowIndex;
        }
      }

      try {
        await auditService.log?.('RESULTATS_SAISIE', {
          tour: tourActuel,
          bureauId: selectedBureauId,
          champ: fieldLabelForAudit || 'SAVE',
        });
      } catch (_) {}

      // reloadResultats() retourne le tableau frais directement (résultat de load()).
      // On l'utilise immédiatement pour alimenter appendedRowIndexRef SANS dépendre
      // du state React (qui n'est pas encore mis à jour dans la même frame async).
      const freshData = await reloadResultats();
      const freshRows = Array.isArray(freshData) ? freshData : [];
      const refreshed = freshRows.find(
        r => String(r?.bureauId ?? '').trim().toUpperCase().replace(/\D/g, '') ===
             String(selectedBureauId ?? '').trim().toUpperCase().replace(/\D/g, '')
      ) || null;

      if (refreshed !== null) {
        setRow(refreshed);
        // Mémoriser le rowIndex frais — évite tout appendRow ultérieur sur ce bureau
        if (refreshed.rowIndex !== undefined && refreshed.rowIndex !== null) {
          appendedRowIndexRef.current = refreshed.rowIndex;
        }
      }
    } finally {
      isSavingRef.current = false;
    }
  }, [buildRowData, reloadResultats, resultatsSheet, row, selectedBureauId, tourActuel]);

  const onBlurMain = async (field) => {
    // ── Validations de cohérence avant sauvegarde ─────────────────
    const inscrits = getInscritsForBureau(selectedBureauId);
    const rawVotants = parseInt(inputsMain.votants, 10);
    // plafond réel = inscrits (même si votants est lui-même invalide)
    const votantsVal = Number.isFinite(rawVotants) ? rawVotants : 0;
    const plafondVotants = inscrits > 0 ? Math.min(votantsVal, inscrits) : votantsVal;

    if (field === 'votants') {
      if (inscrits > 0 && Number.isFinite(rawVotants) && rawVotants > inscrits) {
        setInputsMain((prev) => ({ ...prev, votants: '' }));
        return;
      }
    }
    if (field === 'procurations') {
      const val = parseInt(inputsMain.procurations, 10);
      if (Number.isFinite(val) && val > plafondVotants) {
        setInputsMain((prev) => ({ ...prev, procurations: '' }));
        return;
      }
    }
    if (field === 'blancs') {
      const val = parseInt(inputsMain.blancs, 10);
      if (Number.isFinite(val) && val > plafondVotants) {
        setInputsMain((prev) => ({ ...prev, blancs: '' }));
        return;
      }
    }
    if (field === 'nuls') {
      const val = parseInt(inputsMain.nuls, 10);
      if (Number.isFinite(val) && val > plafondVotants) {
        setInputsMain((prev) => ({ ...prev, nuls: '' }));
        return;
      }
    }
    try {
      await saveCurrentRow(field);
    } catch (e) {
      console.error(e);
    }
  };

  const onBlurVoix = async (listeId) => {
    try {
      await saveCurrentRow(`voix_${listeId}`);
    } catch (e) {
      console.error(e);
    }
  };

  const loading = loadingResultats;

  // Couleurs selon le tour
  const tourColor = tourActuel === 1 ? {
    bg: 'linear-gradient(135deg, #065f46 0%, #047857 100%)', // Vert foncé T1
    text: '#fff'
  } : {
    bg: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)', // Bleu T2
    text: '#fff'
  };


  const bureauMeta = useMemo(() => {
    const list = Array.isArray(bureaux) ? bureaux : [];
    const normalized = normalizeBureauId(selectedBureauId);
    const b = list.find((x) => normalizeBureauId(x?.id ?? '') === normalized) || null;
    if (!b) return { nom: selectedBureauId || '—', president: '—', vicePresident: '—', secretaire: '—' };

    const nom = String(b?.nom ?? b?.libelle ?? b?.bureau ?? b?.id ?? selectedBureauId ?? '—');

    const president =
      String(
        b?.president ??
          b?.nomPresident ??
          b?.presidentNom ??
          b?.president_prenomNom ??
          b?.pres ??
          ''
      ).trim() || '—';

    const vicePresident =
      String(
        b?.vicePresident ??
          b?.vice_president ??
          b?.vicePresidentNom ??
          b?.adjoint ??
          ''
      ).trim() || '—';

    const secretaire =
      String(
        b?.secretaire ??
          b?.nomSecretaire ??
          b?.secretaireNom ??
          b?.secret ??
          ''
      ).trim() || '—';

    const suppleant =
      String(
        b?.SecretaireSuppleant ??
          b?.secretaireSuppleant ??
          ''
      ).trim() || '—';

    return { nom, president, vicePresident, secretaire, suppleant };
  }, [bureaux, selectedBureauId]);

  const controles = useMemo(() => {
    const votants = coerceInt(inputsMain.votants);
    const blancs = coerceInt(inputsMain.blancs);
    const nuls = coerceInt(inputsMain.nuls);
    const exprimes = coerceInt(inputsMain.exprimes);

    let sommeVoix = 0;
    for (const c of candidatsActifs) {
      const key = String(c?.listeId ?? '').trim();
      if (!key) continue;
      sommeVoix += coerceInt(inputsVoix[key]);
    }

    // Si tout est à 0 : aucune donnée saisie → contrôles rouges obligatoirement
    const hasData = votants > 0 || blancs > 0 || nuls > 0 || exprimes > 0 || sommeVoix > 0;

    const ctrl1Ok = hasData && votants === (blancs + nuls + exprimes);
    const ctrl2Ok = hasData && sommeVoix === exprimes;

    return { votants, blancs, nuls, exprimes, sommeVoix, ctrl1Ok, ctrl2Ok, hasData };
  }, [candidatsActifs, inputsMain, inputsVoix]);

  // Vérifier si tous les champs sont remplis
  const allFieldsFilled = useMemo(() => {
    // Champs principaux (sauf inscrits qui est readonly)
    const mainFilled = inputsMain.votants && inputsMain.blancs && inputsMain.nuls && inputsMain.exprimes;
    
    // Toutes les voix doivent être remplies
    const voixFilled = candidatsActifs.every(c => {
      const key = String(c?.listeId ?? '').trim();
      return inputsVoix[key] && String(inputsVoix[key]).trim() !== '';
    });

    return mainFilled && voixFilled;
  }, [inputsMain, inputsVoix, candidatsActifs]);

  // Le bouton est activable si : tous champs remplis + ctrl1 OK + ctrl2 OK + pas encore verrouillé
  const votantsExceedsInscrits = useMemo(() => {
    const inscrits = getInscritsForBureau(selectedBureauId);
    const votants = coerceInt(inputsMain.votants);
    return inscrits > 0 && votants > inscrits;
  }, [selectedBureauId, inputsMain.votants, getInscritsForBureau]);

  const canLock = allFieldsFilled && controles.ctrl1Ok && controles.ctrl2Ok && !isLocked && !votantsExceedsInscrits;

  // Fonction de verrouillage
  const handleLockBureau = useCallback(async () => {
    try {
      // Sauvegarder avec le champ validePar
      const rowData = buildRowData();
      rowData.validePar = auth.email || auth.username || 'BV'; // Marquer qui a validé
      rowData.timestamp = new Date().toISOString();

      if (row) {
        await googleSheetsService.updateRow(resultatsSheet, row.rowIndex, rowData);
      } else {
        await googleSheetsService.appendRow(resultatsSheet, rowData);
      }

      try {
        await auditService.log?.('RESULTATS_VERROUILLAGE', {
          tour: tourActuel,
          bureauId: selectedBureauId,
        });
      } catch (_) {}

      await reloadResultats();
      
      setIsLocked(true);
      setShowConfirmModal(false);
      setShowSuccessModal(true);

      // Fermer la modal de succès après 3 secondes
      setTimeout(() => setShowSuccessModal(false), 3000);

    } catch (e) {
      console.error('Erreur verrouillage:', e);
      alert('Erreur lors du verrouillage : ' + e.message);
    }
  }, [auth, buildRowData, reloadResultats, resultatsSheet, row, selectedBureauId, tourActuel]);

  // Fonction de validation ADMIN globale
  const handleAdminValidate = useCallback(async () => {
    try {
      // 1. Marquer la validation admin dans Config
      const key = tourActuel === 1 ? 'VALIDATION_ADMIN_T1' : 'VALIDATION_ADMIN_T2';
      await googleSheetsService.setConfig(key, 'TRUE');

      // 2. Verrouiller TOUS les bureaux qui n'ont pas encore de validePar
      const resultatsSheet = tourActuel === 1 ? 'Resultats_T1' : 'Resultats_T2';
      const resultatsData = await googleSheetsService.getData(resultatsSheet);
      
      if (Array.isArray(resultatsData)) {
        const updates = [];
        
        for (let i = 0; i < resultatsData.length; i++) {
          const bureau = resultatsData[i];
          
          // Si le bureau n'a pas encore été verrouillé par un BV, on le verrouille avec "ADMIN"
          if (!bureau.validePar) {
            const rowData = {
              ...bureau,
              validePar: 'ADMIN',
              timestamp: new Date().toISOString()
            };
            
            updates.push({
              rowIndex: i,
              rowData: rowData
            });
          }
        }
        
        // Appliquer les mises à jour en batch
        if (updates.length > 0) {
          await googleSheetsService.batchUpdate(resultatsSheet, updates);
        }
      }

      try {
        await auditService.log?.('ADMIN_VALIDATION_GLOBALE', {
          tour: tourActuel,
          action: 'VERROUILLAGE',
          bureauxVerrouilles: resultatsData?.filter(r => !r.validePar).length || 0
        });
      } catch (_) {}

      await reloadResultats();

      setAdminValidated(true);
      setShowAdminConfirmModal(false);
      setShowAdminSuccessModal(true);

      setTimeout(() => setShowAdminSuccessModal(false), 3000);

    } catch (e) {
      console.error('Erreur validation admin:', e);
      alert('Erreur lors de la validation : ' + e.message);
    }
  }, [tourActuel, reloadResultats]);

  // Fonction de déverrouillage ADMIN
  const handleAdminUnlock = useCallback(async () => {
    try {
      // 1. Retirer la validation admin dans Config
      const key = tourActuel === 1 ? 'VALIDATION_ADMIN_T1' : 'VALIDATION_ADMIN_T2';
      await googleSheetsService.setConfig(key, 'FALSE');

      // 2. Déverrouiller UNIQUEMENT les bureaux verrouillés par 'ADMIN'
      const resultatsSheet = tourActuel === 1 ? 'Resultats_T1' : 'Resultats_T2';
      const resultatsData = await googleSheetsService.getData(resultatsSheet);
      
      if (Array.isArray(resultatsData)) {
        const updates = [];
        
        for (let i = 0; i < resultatsData.length; i++) {
          const bureau = resultatsData[i];
          
          // Déverrouiller UNIQUEMENT si validePar = 'ADMIN'
          // Si validePar = email du BV, on ne touche PAS
          if (bureau.validePar === 'ADMIN') {
            const rowData = {
              ...bureau,
              validePar: '',  // Effacer le verrouillage
              timestamp: ''   // Effacer le timestamp
            };
            
            updates.push({
              rowIndex: i,
              rowData: rowData
            });
          }
        }
        
        // Appliquer les mises à jour en batch
        if (updates.length > 0) {
          await googleSheetsService.batchUpdate(resultatsSheet, updates);
        }
      }

      try {
        await auditService.log?.('ADMIN_VALIDATION_GLOBALE', {
          tour: tourActuel,
          action: 'DEVERROUILLAGE',
          bureauxDeverrouilles: resultatsData?.filter(r => r.validePar === 'ADMIN').length || 0
        });
      } catch (_) {}

      await reloadResultats();

      setAdminValidated(false);
      setShowAdminUnlockModal(false);
      setShowAdminUnlockSuccessModal(true);

      setTimeout(() => setShowAdminUnlockSuccessModal(false), 3000);

    } catch (e) {
      console.error('Erreur déverrouillage admin:', e);
      alert('Erreur lors du déverrouillage : ' + e.message);
    }
  }, [tourActuel, reloadResultats]);

  // Pour l'ADMIN : calculer le statut de verrouillage de tous les bureaux
  const bureauxStatuses = useMemo(() => {
    if (!isAdmin) return [];
    
    const list = Array.isArray(bureaux) ? bureaux : [];
    const resultsList = Array.isArray(resultats) ? resultats : [];
    
    return list
      .filter((b) => b && (b.actif === true || b.actif === 'TRUE' || b.actif === 1))
      .map((bureau) => {
        const bureauId = String(bureau.id ?? '');
        const bureauNom = String(bureau.nom ?? bureau.id ?? '');
        
        // Trouver la ligne de résultats pour ce bureau
        const normalized = normalizeBureauId(bureauId);
        const resultatRow = resultsList.find((r) => normalizeBureauId(r?.bureauId ?? '') === normalized);
        
        // Vérifier si verrouillé
        const isLocked = resultatRow?.validePar ? true : false;
        
        return {
          id: bureauId,
          nom: bureauNom,
          isLocked
        };
      });
  }, [isAdmin, bureaux, resultats]);

  return (
    <div style={{ marginTop: 20 }}>
      {/* Modal de confirmation de verrouillage */}
      {showConfirmModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20
        }}>
          <div style={{
            background: tourColor.bg,
            color: tourColor.text,
            borderRadius: 16,
            maxWidth: 500,
            width: '100%',
            padding: 32,
            boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
            <h2 style={{ margin: '0 0 16px 0', color: 'white', fontSize: 24, fontWeight: 800 }}>
              Confirmation de validation
            </h2>
            <p style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 24, opacity: 0.95 }}>
              Vous confirmez que les éléments saisis sont conformes aux résultats de votre bureau de vote ?
            </p>
            <p style={{ fontSize: 14, marginBottom: 32, opacity: 0.9, fontStyle: 'italic' }}>
              ⚠️ Après validation, vous ne pourrez plus modifier les données.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={() => setShowConfirmModal(false)}
                style={{
                  padding: '12px 24px',
                  borderRadius: 8,
                  border: '2px solid rgba(255,255,255,0.3)',
                  background: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleLockBureau}
                style={{
                  padding: '12px 32px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#fff',
                  color: tourActuel === 1 ? '#065f46' : '#1e40af',
                  fontSize: 16,
                  fontWeight: 800,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                ✅ Valider et verrouiller
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de succès */}
      {showSuccessModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20
        }}>
          <div style={{
            background: tourColor.bg,
            color: tourColor.text,
            borderRadius: 16,
            maxWidth: 450,
            width: '100%',
            padding: 40,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            textAlign: 'center',
            animation: 'fadeIn 0.3s ease-in'
          }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
            <h2 style={{ margin: '0 0 16px 0', color : 'white', fontSize: 28, fontWeight: 800 }}>
              Saisie validée !
            </h2>
            <p style={{ fontSize: 18, lineHeight: 1.6, opacity: 0.95 }}>
              Les résultats de votre bureau de vote sont maintenant verrouillés.
            </p>
          </div>
        </div>
      )}

      {/* ========== MODALS ADMIN ========== */}
      
      {/* Modal de confirmation ADMIN - Verrouillage global */}
      {showAdminConfirmModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20
        }}>
          <div style={{
            background: tourColor.bg,
            color: tourColor.text,
            borderRadius: 16,
            maxWidth: 550,
            width: '100%',
            padding: 32,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔐</div>
            <h2 style={{ margin: '0 0 16px 0', color : 'white', fontSize: 24, fontWeight: 800 }}>
              Validation globale - Administrateur
            </h2>
            <p style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 16, opacity: 0.95 }}>
              Vous confirmez la validation des résultats de <strong>tous les bureaux de vote</strong> pour le Tour {tourActuel} ?
            </p>
            <p style={{ 
              fontSize: 13, 
              marginBottom: 24, 
              opacity: 0.9, 
              background: 'rgba(255,255,255,0.1)',
              padding: 12,
              borderRadius: 8
            }}>
              ⚠️ <strong>Attention :</strong> Cette action bloque toute modification par les profils BV, même pour les bureaux non encore verrouillés.
            </p>
            <p style={{ fontSize: 14, marginBottom: 32, opacity: 0.9, fontStyle: 'italic' }}>
              ℹ️ Cette validation ajoute un badge visuel sur tous les bureaux.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={() => setShowAdminConfirmModal(false)}
                style={{
                  padding: '12px 24px',
                  borderRadius: 8,
                  border: '2px solid rgba(255,255,255,0.3)',
                  background: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleAdminValidate}
                style={{
                  padding: '12px 32px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#fff',
                  color: tourActuel === 1 ? '#065f46' : '#1e40af',
                  fontSize: 16,
                  fontWeight: 800,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                ✅ Valider tous les bureaux
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de succès ADMIN */}
      {showAdminSuccessModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20
        }}>
          <div style={{
            background: tourColor.bg,
            color: tourColor.text,
            borderRadius: 16,
            maxWidth: 450,
            width: '100%',
            padding: 40,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            textAlign: 'center',
            animation: 'fadeIn 0.3s ease-in'
          }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
            <h2 style={{ margin: '0 0 16px 0', color : 'white', fontSize: 28, fontWeight: 800 }}>
              Validation administrative effectuée !
            </h2>
            <p style={{ fontSize: 18, lineHeight: 1.6, opacity: 0.95 }}>
              Tous les bureaux de vote sont maintenant validés administrativement.
            </p>
          </div>
        </div>
      )}

      {/* Modal de déverrouillage ADMIN */}
      {showAdminUnlockModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20
        }}>
          <div style={{
            background: tourColor.bg,
            color: tourColor.text,
            borderRadius: 16,
            maxWidth: 550,
            width: '100%',
            padding: 32,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔓</div>
            <h2 style={{ margin: '0 0 16px 0', color : 'white', fontSize: 24, fontWeight: 800 }}>
              Déverrouillage administratif
            </h2>
            <p style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 16, opacity: 0.95 }}>
              Vous souhaitez retirer la validation administrative du Tour {tourActuel} ?
            </p>
            <p style={{ fontSize: 14, marginBottom: 24, opacity: 0.9, fontStyle: 'italic' }}>
              ⚠️ À utiliser uniquement pour une modification exceptionnelle.
            </p>
            <p style={{ 
              fontSize: 13, 
              marginBottom: 32, 
              opacity: 0.85, 
              background: 'rgba(255,255,255,0.1)',
              padding: 12,
              borderRadius: 8
            }}>
              ℹ️ <strong>Important :</strong> Les bureaux déjà verrouillés par les BV resteront verrouillés. Seuls les bureaux non verrouillés pourront être modifiés.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={() => setShowAdminUnlockModal(false)}
                style={{
                  padding: '12px 24px',
                  borderRadius: 8,
                  border: '2px solid rgba(255,255,255,0.3)',
                  background: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleAdminUnlock}
                style={{
                  padding: '12px 32px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#fff',
                  color: tourActuel === 1 ? '#065f46' : '#1e40af',
                  fontSize: 16,
                  fontWeight: 800,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                🔓 Déverrouiller
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de succès ADMIN - Déverrouillage */}
      {showAdminUnlockSuccessModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20
        }}>
          <div style={{
            background: tourColor.bg,
            color: tourColor.text,
            borderRadius: 16,
            maxWidth: 450,
            width: '100%',
            padding: 40,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            textAlign: 'center',
            animation: 'fadeIn 0.3s ease-in'
          }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🔓</div>
            <h2 style={{ margin: '0 0 16px 0', color : 'white', fontSize: 28, fontWeight: 800 }}>
              Déverrouillage effectué !
            </h2>
            <p style={{ fontSize: 18, lineHeight: 1.6, opacity: 0.95 }}>
              La main pour verrouiller les résultats a de nouveau été rendue aux bureaux de vote.
            </p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }

        @keyframes bounce {
          0%, 100% { 
            transform: translateX(-50%) translateY(0);
          }
          50% { 
            transform: translateX(-50%) translateY(-8px);
          }
        }

        /* Bloc du bouton VERROUILLER en responsive */
        @media (max-width: 1200px) {
          .btn-verrouiller-container {
            flex-basis: 100% !important;
            margin-top: 10px;
          }
        }

        /* Responsive pour la grille des champs */
        .resultats-saisie-grid {
          display: grid;
          grid-template-columns: repeat(6, minmax(110px, 1fr));
          gap: 8px;
          margin: 10px 0 16px;
        }

        /* Mobile : réorganisation demandée
           Ligne 1 : INSCRITS + EXPRIMÉS
           Ligne 2 : VOTANTS + BLANCS + NULS
        */
        @media (max-width: 768px) {
          .resultats-saisie-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            grid-template-areas:
              "inscrits exprimes exprimes"
              "votants  blancs   nuls";
          }

          .resultats-field-inscrits { grid-area: inscrits; }
          .resultats-field-exprimes { grid-area: exprimes; }
          .resultats-field-votants { grid-area: votants; }
          .resultats-field-blancs { grid-area: blancs; }
          .resultats-field-nuls { grid-area: nuls; }
        }

        /* Très petit écran : on conserve l’ordre logique, mais on évite l’écrasement */
        @media (max-width: 480px) {
          .resultats-saisie-grid {
            /* Toujours 2 lignes : INSCRITS + EXPRIMÉS / VOTANTS + BLANCS + NULS */
            grid-template-columns: repeat(3, minmax(0, 1fr));
            grid-template-areas:
              "inscrits exprimes exprimes"
              "votants  blancs   nuls";
            gap: 8px;
          }
        }

        /* Tableau des voix : wrapper scroll horizontal + 1ère colonne sticky (Liste)
           IMPORTANT : on n’impose aucune couleur, pour respecter le style existant (th bleu, arrondis, ombres, hover…)
        */
        .resultats-voix-scroll {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        /* En responsive, on force une largeur minimale pour activer le scroll horizontal */
        @media (max-width: 768px) {
          .resultats-voix-scroll table {
            min-width: 640px;
          }
        }

        .resultats-voix-scroll table th,
        .resultats-voix-scroll table td {
          white-space: nowrap;
        }

        .resultats-voix-box {
          border-radius: 12px;
          box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
          overflow: hidden; /* garde les bords arrondis avec le scroll */
        }

        /* Ajustement des largeurs (flexible mais pas "trop large") */
        .resultats-voix-scroll table th:first-child,
        .resultats-voix-scroll table td:first-child {
          max-width: 220px;
          min-width: 140px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .resultats-voix-scroll table th:nth-child(2),
        .resultats-voix-scroll table td:nth-child(2) {
          min-width: 220px;
        }

        .resultats-voix-scroll table th:nth-child(3),
        .resultats-voix-scroll table td:nth-child(3) {
          min-width: 190px;
        }

        /* Colonne 1 sticky : header inchangé, corps avec fond blanc pour éviter la superposition */
        .resultats-voix-scroll table th:first-child,
        .resultats-voix-scroll table td:first-child {
          position: sticky;
          left: 0;
        }

        .resultats-voix-scroll table thead th:first-child {
          z-index: 4;
        }

        .resultats-voix-scroll table tbody td:first-child {
          z-index: 2;
          background: #fff;
        }

        /* Scroll horizontal des tuiles BV en responsive */
        .bureaux-grid-container {
          display: grid;
          grid-template-columns: repeat(13, 1fr);
          gap: 8px;
          padding-top: 30px;
          padding-bottom: 40px;
        }

        @media (max-width: 900px) {
          .bureaux-grid-container {
            display: flex;
            overflow-x: auto;           /* Scroll dans le conteneur */
            overflow-y: visible;
            -webkit-overflow-scrolling: touch;
            scroll-snap-type: x mandatory;
            gap: 12px;
            padding-left: 8px;
            padding-right: 8px;
            padding-top: 30px;
            padding-bottom: 40px;
            /* CRITIQUE : Limiter la largeur à la page pour que le scroll soit dans le conteneur */
            max-width: 100%;            /* Ne dépasse JAMAIS la page */
            width: 100%;                /* Prend toute la largeur disponible */
          }
          
          .bureaux-grid-container > div {
            flex: 0 0 110px !important; /* !important écrase style inline */
            min-width: 110px !important; /* !important écrase style inline */
            width: 110px !important; /* !important écrase style inline */
            min-height: 110px !important; /* !important écrase style inline */
            height: auto !important; /* Permet flex content mais min 110px */
            max-width: 110px !important; /* Empêche agrandissement */
            scroll-snap-align: start;
            padding: 12px 8px !important; /* Padding équilibré vertical/horizontal */
            justify-content: center !important; /* Centre le contenu verticalement */
          }
        }

      `}</style>

      {loading ? (
        <p>Chargement…</p>
      ) : (
        <>
          {/* CONTENEUR ENGLOBANT TOUT (H3 + message + dropdown + État validation) */}
          <div style={{
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
            border: '2px solid #e5e7eb',
            padding: 20,
            margin: '0 0 20px 0'
          }}>
            <h3>Résultats — Saisie bureau (Tour {tourActuel})</h3>

            {/* Message d'instruction - Compact au-dessus du sélecteur */}
            {!selectedBureauId && !forcedBureauId && (
              <div style={{
                background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                border: '2px solid #3b82f6',
                borderRadius: 8,
                padding: '12px 20px',
                margin: '0 0 12px 0',
                display: 'flex',
                alignItems: 'center',
                gap: 12
              }}>
                <span style={{ fontSize: 24 }}>📝</span>
                <span style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#1e40af'
                }}>
                  ✅ Validation des résultats - Tour {tourActuel} : Choisir un bureau dans la liste ci-dessous
                </span>
              </div>
            )}

            {!forcedBureauId && !isAdmin && (
              <div style={{ margin: '10px 0' }}>
                <label style={{ marginRight: 8 }}>Bureau :</label>
                <select
                  value={selectedBureauId}
                  onChange={(e) => setSelectedBureauId(String(e.target.value))}
                >
                  <option value="">— Sélectionner —</option>
                  {bureauOptions.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.id} — {b.nom}
                    </option>
                  ))}
                </select>
              </div>
            )}

          {/* Tableau de visualisation des bureaux (ADMIN uniquement) - TOUJOURS VISIBLE */}
          {isAdmin && bureauxStatuses.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ 
                fontWeight: 800, 
                fontSize: 16, 
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <span>📊</span>
                <span>État de validation des bureaux de vote - Tour {tourActuel}</span>
              </div>
              
              <div 
                className="bureaux-grid-container"
              >
                {bureauxStatuses.map((bureau) => {
                  // Couleur selon l'état et le tour
                  let bgColor, textColor, icon;
                  const isSelected = isAdmin && selectedBureauId === bureau.id;
                  
                  if (bureau.isLocked) {
                    if (tourActuel === 1) {
                      // Vert foncé T1
                      bgColor = 'linear-gradient(135deg, #065f46 0%, #047857 100%)';
                      textColor = '#fff';
                      icon = '🔒';
                    } else {
                      // Bleu T2
                      bgColor = 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)';
                      textColor = '#fff';
                      icon = '🔒';
                    }
                  } else {
                    // Gris - non verrouillé
                    bgColor = '#e5e7eb';
                    textColor = '#6b7280';
                    icon = '⏳';
                  }
                  
                  return (
                    <div
                      key={bureau.id}
                      style={{
                        background: bgColor,
                        color: textColor,
                        padding: '10px 6px',
                        borderRadius: 8,
                        textAlign: 'center',
                        fontSize: 11,
                        fontWeight: 700,
                        transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                        cursor: isAdmin ? 'pointer' : 'default',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 3,
                        minWidth: 0,
                        position: 'relative',
                        // Effet tuile sélectionnée - HYPER VISIBLE
                        transform: isSelected ? 'translateY(-20px) scale(1.15)' : 'translateY(0) scale(1)',
                        border: isSelected 
                          ? `4px solid ${tourActuel === 1 ? '#10b981' : '#3b82f6'}` 
                          : '2px solid transparent',
                        boxShadow: isSelected 
                          ? `0 12px 40px ${tourActuel === 1 ? 'rgba(16, 185, 129, 0.6)' : 'rgba(59, 130, 246, 0.6)'}, 0 0 0 4px ${tourActuel === 1 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)'}`
                          : bureau.isLocked ? '0 4px 12px rgba(0, 0, 0, 0.15)' : 'none',
                        zIndex: isSelected ? 10 : 1
                      }}
                      onClick={isAdmin ? () => setSelectedBureauId(bureau.id) : undefined}
                      onMouseEnter={isAdmin && !isSelected ? (e) => {
                        e.currentTarget.style.transform = 'translateY(-2px) scale(1)';
                        e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.25)';
                      } : undefined}
                      onMouseLeave={isAdmin && !isSelected ? (e) => {
                        e.currentTarget.style.transform = 'translateY(0) scale(1)';
                        e.currentTarget.style.boxShadow = bureau.isLocked ? '0 4px 12px rgba(0, 0, 0, 0.15)' : 'none';
                      } : undefined}
                      title={bureau.isLocked ? `${bureau.nom} - Verrouillé` : `${bureau.nom} - En attente`}
                    >
                      {/* Badge validation admin */}
                      {adminValidated && (
                        <div style={{
                          position: 'absolute',
                          top: -4,
                          right: -4,
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          background: tourActuel === 1 ? '#10b981' : '#3b82f6',
                          border: '2px solid #fff',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 10
                        }}>
                          ✓
                        </div>
                      )}
                      
                      <div style={{ fontSize: 16 }}>{icon}</div>
                      <div style={{ fontSize: 13, fontWeight: 800 }}>{bureau.id}</div>
                      <div style={{ fontSize: 10, opacity: 0.9, fontWeight: 600 }}>
                        {bureau.isLocked ? 'Validé' : 'Attente'}
                      </div>
                      
                      {/* Indicateur tuile sélectionnée - Emoji doigt */}
                      {isSelected && (
                        <div style={{
                          position: 'absolute',
                          bottom: -30,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          fontSize: 24,
                          animation: 'bounce 1s infinite'
                        }}>
                          👆
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              
              {/* Légende */}
              <div style={{
                marginTop: 16,
                paddingTop: 16,
                borderTop: '1px solid #e5e7eb',
                display: 'flex',
                gap: 20,
                flexWrap: 'wrap',
                fontSize: 13,
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                {/* Légendes à gauche */}
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      background: '#e5e7eb'
                    }} />
                    <span style={{ color: '#6b7280' }}>En attente</span>
                  </div>
                  
                  {tourActuel === 1 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 20,
                        height: 20,
                        borderRadius: 4,
                        background: 'linear-gradient(135deg, #065f46 0%, #047857 100%)'
                      }} />
                      <span style={{ color: '#065f46', fontWeight: 600 }}>Verrouillé (T1)</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 20,
                        height: 20,
                        borderRadius: 4,
                        background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)'
                      }} />
                      <span style={{ color: '#1e40af', fontWeight: 600 }}>Verrouillé (T2)</span>
                    </div>
                  )}
                </div>

                {/* Bouton ADMIN VERROUILLER à droite */}
                <button
                  onClick={() => {
                    if (adminValidated) {
                      setShowAdminUnlockModal(true);
                    } else {
                      setShowAdminConfirmModal(true);
                    }
                  }}
                  style={{
                    padding: '14px 32px',
                    borderRadius: 10,
                    border: 'none',
                    background: adminValidated 
                      ? 'linear-gradient(135deg, #64748b 0%, #475569 100%)'  // Gris si validé
                      : (tourActuel === 1 
                          ? 'linear-gradient(135deg, #047857 0%, #065f46 100%)'  // Vert foncé T1
                          : 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)'),  // Bleu T2
                    color: '#fff',
                    fontSize: 16,
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: adminValidated 
                      ? '0 6px 20px rgba(100, 116, 139, 0.3)'
                      : (tourActuel === 1 
                          ? '0 6px 20px rgba(4, 120, 87, 0.4)'
                          : '0 6px 20px rgba(37, 99, 235, 0.4)'),
                    transition: 'all 0.3s',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    minWidth: 280,
                    justifyContent: 'center'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.transform = 'translateY(-2px)';
                    e.target.style.boxShadow = adminValidated 
                      ? '0 8px 24px rgba(100, 116, 139, 0.4)'
                      : (tourActuel === 1 
                          ? '0 8px 24px rgba(4, 120, 87, 0.5)'
                          : '0 8px 24px rgba(37, 99, 235, 0.5)');
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = 'translateY(0)';
                    e.target.style.boxShadow = adminValidated 
                      ? '0 6px 20px rgba(100, 116, 139, 0.3)'
                      : (tourActuel === 1 
                          ? '0 6px 20px rgba(4, 120, 87, 0.4)'
                          : '0 6px 20px rgba(37, 99, 235, 0.4)');
                  }}
                  title={adminValidated 
                    ? 'Cliquer pour déverrouiller (modification exceptionnelle)' 
                    : 'Valider administrativement tous les bureaux de vote'}
                >
                  <span style={{ fontSize: 24 }}>{adminValidated ? '🔓' : '🔐'}</span>
                  <span>{adminValidated ? 'Déverrouiller' : 'Verrouiller tous les bureaux'}</span>
                </button>
              </div>
            </div>
          )}
          </div>
          {/* FIN CONTENEUR ENGLOBANT */}

          {!selectedBureauId ? null : (
            <>
          {/* Bloc principaux - RESPONSIVE */}
          <div className="resultats-saisie-grid">
            {/* INSCRITS */}
            <div className="resultats-field-inscrits">
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4, fontWeight: 700 }}>INSCRITS</div>
              <input
                type="text"
                inputMode="numeric"
                value={inputsMain.inscrits}
                readOnly
                disabled
                style={{ width: '100%', padding: 6, background: '#f0f0f0', cursor: 'not-allowed', fontWeight: 700 }}
                title="Inscrits pré-remplis depuis l'onglet Bureaux (lecture seule)"
              />
            </div>

            {/* VOTANTS */}
            <div className="resultats-field-votants">
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>VOTANTS</div>
              <input
                type="text"
                inputMode="numeric"
                value={inputsMain.votants}
                onChange={(e) => setInputsMain((prev) => ({ ...prev, votants: e.target.value }))}
                onBlur={() => onBlurMain('votants')}
                disabled={isLocked && !isAdmin}
                style={{ 
                  width: '100%', 
                  padding: 6,
                  background: (isLocked && !isAdmin) ? '#f0f0f0' : '#fff',
                  borderColor: votantsExceedsInscrits ? '#ef4444' : undefined,
                  cursor: (isLocked && !isAdmin) ? 'not-allowed' : 'text'
                }}
              />
              {votantsExceedsInscrits && (
                <div style={{ fontSize: 11, color: '#ef4444', marginTop: 2, fontWeight: 600 }}>
                  ⚠️ Dépasse les inscrits ({getInscritsForBureau(selectedBureauId)})
                </div>
              )}
            </div>

            {/* PROCURATIONS */}
            <div className="resultats-field-procurations">
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>PROCURATIONS</div>
              <input
                type="text"
                inputMode="numeric"
                value={inputsMain.procurations}
                onChange={(e) => setInputsMain((prev) => ({ ...prev, procurations: e.target.value }))}
                onBlur={() => onBlurMain('procurations')}
                disabled={isLocked && !isAdmin}
                style={{
                  width: '100%',
                  padding: 6,
                  background: (isLocked && !isAdmin) ? '#f0f0f0' : '#fff',
                  cursor: (isLocked && !isAdmin) ? 'not-allowed' : 'text'
                }}
              />
            </div>

            {/* BLANCS */}
            <div className="resultats-field-blancs">
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>BLANCS</div>
              <input
                type="text"
                inputMode="numeric"
                value={inputsMain.blancs}
                onChange={(e) => setInputsMain((prev) => ({ ...prev, blancs: e.target.value }))}
                onBlur={() => onBlurMain('blancs')}
                disabled={isLocked && !isAdmin}
                style={{ 
                  width: '100%', 
                  padding: 6,
                  background: (isLocked && !isAdmin) ? '#f0f0f0' : '#fff',
                  cursor: (isLocked && !isAdmin) ? 'not-allowed' : 'text'
                }}
              />
            </div>

            {/* NULS */}
            <div className="resultats-field-nuls">
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>NULS</div>
              <input
                type="text"
                inputMode="numeric"
                value={inputsMain.nuls}
                onChange={(e) => setInputsMain((prev) => ({ ...prev, nuls: e.target.value }))}
                onBlur={() => onBlurMain('nuls')}
                disabled={isLocked && !isAdmin}
                style={{ 
                  width: '100%', 
                  padding: 6,
                  background: (isLocked && !isAdmin) ? '#f0f0f0' : '#fff',
                  cursor: (isLocked && !isAdmin) ? 'not-allowed' : 'text'
                }}
              />
            </div>

            {/* EXPRIMÉS */}
            <div className="resultats-field-exprimes">
              {/* ⚠️ CORRECTION : label indique le calcul automatique pour BV */}
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4, fontWeight: 700 }}>
                EXPRIMÉS {isBureauVote && <span style={{ fontWeight: 400, fontStyle: 'italic', opacity: 0.7 }}>(calculé)</span>}
              </div>
              <input
                type="text"
                inputMode="numeric"
                value={inputsMain.exprimes}
                onChange={isBureauVote ? undefined : (e) => setInputsMain((prev) => ({ ...prev, exprimes: e.target.value }))}
                onBlur={isBureauVote ? undefined : () => onBlurMain('exprimes')}
                readOnly={isBureauVote}
                disabled={isBureauVote || ((isLocked || adminValidated) && !isAdmin)}
                title={isBureauVote ? 'Calculé automatiquement : Votants − (Blancs + Nuls)' : ''}
                style={{
                  width: '100%',
                  padding: 6,
                  background: (isBureauVote || ((isLocked || adminValidated) && !isAdmin)) ? '#f0f0f0' : '#fff',
                  cursor: (isBureauVote || ((isLocked || adminValidated) && !isAdmin)) ? 'not-allowed' : 'text',
                  fontWeight: 700,
                  color: isBureauVote ? '#555' : 'inherit'
                }}
              />
            </div>
          </div>


          {/* Infos bureau + contrôles + BOUTON VERROUILLER (4ème position) */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, margin: '0 0 14px' }}>
            <div style={{
              flex: '1 1 280px',
              background: '#dbeafe',
              border: '1px solid #bfdbfe',
              borderRadius: 10,
              padding: 10
            }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>ℹ️ Infos bureau</div>
              <div style={{ fontSize: 14, lineHeight: 1.35 }}>
                <div><strong>Bureau :</strong> {bureauMeta.nom}</div>
                <div><strong>Président :</strong> {bureauMeta.president}</div>
                <div><strong>Vice-Président :</strong> {bureauMeta.vicePresident}</div>
                <div><strong>Secrétaire :</strong> {bureauMeta.secretaire}</div>
                <div><strong>Suppléant(e) :</strong> {bureauMeta.suppleant}</div>
              </div>
            </div>

            <div style={{
              flex: '1 1 280px',
              background: !controles.hasData ? '#fef3c7' : controles.ctrl1Ok ? '#dcfce7' : '#fee2e2',
              border: `1px solid ${!controles.hasData ? '#fde68a' : controles.ctrl1Ok ? '#86efac' : '#fca5a5'}`,
              borderRadius: 10,
              padding: 10
            }}>
              <div style={{ fontWeight: 800, marginBottom: 6, color: !controles.hasData ? '#92400e' : 'inherit' }}>
                {!controles.hasData ? '⚠️' : controles.ctrl1Ok ? '✅' : '❌'} Contrôle ⬆️
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.35 }}>
                {!controles.hasData
                  ? <span style={{ color: '#92400e' }}>Aucune donnée saisie — veuillez remplir les champs avant validation.</span>
                  : <>Votants = Blancs + Nuls + Exprimés<br />
                    <strong>{controles.votants.toLocaleString('fr-FR')}</strong>
                    {' = '}
                    {controles.blancs.toLocaleString('fr-FR')}
                    {' + '}
                    {controles.nuls.toLocaleString('fr-FR')}
                    {' + '}
                    {controles.exprimes.toLocaleString('fr-FR')}
                  </>
                }
              </div>
            </div>

            <div style={{
              flex: '1 1 280px',
              background: !controles.hasData ? '#fef3c7' : controles.ctrl2Ok ? '#dcfce7' : '#fee2e2',
              border: `1px solid ${!controles.hasData ? '#fde68a' : controles.ctrl2Ok ? '#86efac' : '#fca5a5'}`,
              borderRadius: 10,
              padding: 10
            }}>
              <div style={{ fontWeight: 800, marginBottom: 6, color: !controles.hasData ? '#92400e' : 'inherit' }}>
                {!controles.hasData ? '⚠️' : controles.ctrl2Ok ? '✅' : '❌'} Contrôle ⬇️
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.35 }}>
                {!controles.hasData
                  ? <span style={{ color: '#92400e' }}>Aucune donnée saisie — veuillez remplir les champs avant validation.</span>
                  : <>Somme des voix = Exprimés<br />
                    <strong>{controles.sommeVoix.toLocaleString('fr-FR')}</strong>
                    {' = '}
                    {controles.exprimes.toLocaleString('fr-FR')}
                  </>
                }
              </div>
            </div>

            {/* Bouton VERROUILLER en 4ème position — BV ET ADMIN */}
            {(isAdmin ? selectedBureauId : true) && (
              <div 
                className="btn-verrouiller-container"
                style={{
                  flex: '1 1 280px',
                  background: adminValidated
                    ? '#f3f4f6'  // Gris très clair si admin a validé
                    : (isLocked 
                        ? '#94a3b8'  // Gris si BV a verrouillé
                        : (canLock 
                            ? '#fef3c7'  // Jaune clair si activable
                            : '#f3f4f6')),  // Gris très clair si désactivé
                  border: adminValidated
                    ? '1px solid #d1d5db'
                    : (isLocked 
                        ? '1px solid #64748b' 
                        : (canLock 
                            ? '1px solid #fbbf24' 
                            : '1px solid #e5e7eb')),
                  borderRadius: 10,
                  padding: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  cursor: (adminValidated || !canLock) ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  minHeight: 80,
                  opacity: adminValidated ? 0.6 : 1
                }}
                onClick={() => {
                  if (!adminValidated && canLock) {
                    setShowConfirmModal(true);
                  }
                }}
                title={
                  adminValidated
                    ? 'Verrouillage bloqué : l\'administrateur a validé tous les bureaux'
                    : (isLocked 
                        ? 'Saisie déjà verrouillée' 
                        : (canLock 
                            ? 'Cliquer pour verrouiller la saisie'
                            : 'Remplir tous les champs et valider les contrôles'))
                }
              >
                <div style={{ 
                  fontSize: 32, 
                  marginBottom: 4,
                  opacity: adminValidated ? 0.4 : (canLock || isLocked ? 1 : 0.5)
                }}>
                  {adminValidated ? '🔒' : (isLocked ? '🔒' : '🔐')}
                </div>
                <div style={{ 
                  fontWeight: 800, 
                  fontSize: 13,
                  textAlign: 'center',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  opacity: adminValidated ? 0.4 : (canLock || isLocked ? 1 : 0.5),
                  color: adminValidated ? '#9ca3af' : (isLocked ? '#475569' : (canLock ? '#f59e0b' : '#9ca3af'))
                }}>
                  {adminValidated ? 'Admin validé' : (isLocked ? `Verrouillé` : `Verrouiller ${selectedBureauId || ''}`)}
                </div>
              </div>
            )}
          </div>

          {/* Tableau voix */}
          <div className="resultats-voix-box"><div className="resultats-voix-scroll">
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6, width: '32%' }}>Liste</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6, width: '10%' }}>Voix</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6, width: '8%' }}>%</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>Tête de liste</th>
              </tr>
            </thead>
            <tbody>
              {candidatsActifs.map((c) => {
                const listeId = String(c?.listeId ?? '').trim();
                const nomListe = String(c?.nomListe ?? '').trim();
                const tete = `${String(c?.teteListePrenom ?? '').trim()} ${String(c?.teteListeNom ?? '').trim()}`.trim();

                const voix = parseInt(inputsVoix[listeId] ?? '', 10);
                const expVoix = controles.exprimes || 0;
                const pctVoix = (Number.isFinite(voix) && expVoix > 0)
                  ? ((voix / expVoix) * 100).toFixed(1).replace('.', ',') + ' %'
                  : '—';

                return (
                  <tr key={listeId || nomListe || Math.random().toString(16).slice(2)}>
                    <td style={{ borderBottom: '1px solid #f0f0f0', padding: 6 }}>{listeId || '—'} {nomListe ? `— ${nomListe}` : ''}</td>
                    <td style={{ borderBottom: '1px solid #f0f0f0', padding: 6 }}>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={inputsVoix[listeId] ?? ''}
                        onChange={(e) => setInputsVoix((prev) => ({ ...prev, [listeId]: e.target.value }))}
                        onBlur={() => onBlurVoix(listeId)}
                        disabled={(isLocked || adminValidated) && !isAdmin}
                        style={{
                          width: '100%',
                          padding: 6,
                          background: ((isLocked || adminValidated) && !isAdmin) ? '#f0f0f0' : '#fff',
                          cursor: ((isLocked || adminValidated) && !isAdmin) ? 'not-allowed' : 'text'
                        }}
                      />
                    </td>
                    <td style={{ borderBottom: '1px solid #f0f0f0', padding: 6, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {pctVoix}
                    </td>
                    <td style={{ borderBottom: '1px solid #f0f0f0', padding: 6 }}>{tete || '—'}</td>
                  </tr>
                );
              })}
              {candidatsActifs.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: 10, opacity: 0.8 }}>
                    Aucun candidat actif pour le tour {tourActuel}.
                  </td>
                </tr>
              )}
            </tbody>
            </table>
          </div>
        </div>
        </>
      )}
        </>
      )}
    </div>
  );
}
