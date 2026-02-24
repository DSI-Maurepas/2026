import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useGoogleSheets } from '../../hooks/useGoogleSheets';
import auditService from '../../services/auditService';
import authService from '../../services/authService';
import googleSheetsService from '../../services/googleSheetsService';

// IMPORTANT:
// On N'INSTANCIE PAS useElectionState ici.
// La source unique de vérité est dans App.jsx (évite désynchronisations + besoin de rafraîchir).
const PassageSecondTour = ({
  electionState,
  passerSecondTour,
  reloadElectionState,
  revenirPremierTour,
  accessAuth,

}) => {
  const { data: candidats, load: loadCandidats } = useGoogleSheets('Candidats');
  const { data: resultats, load: loadResultats } = useGoogleSheets('Resultats_T1');

  const [classement, setClassement] = useState([]);
  const [candidatsQualifies, setCandidatsQualifies] = useState([]);
  const [egalite, setEgalite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [adminPwd, setAdminPwd] = useState('');
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [showConfirmT2Modal, setShowConfirmT2Modal] = useState(false);
  const [showSuccessT2Modal, setShowSuccessT2Modal] = useState(false);
  const [showConfirmBackModal, setShowConfirmBackModal] = useState(false);
  const [pendingQualified, setPendingQualified] = useState([]);
  const [successQualified, setSuccessQualified] = useState([]);

  // ─── NOUVEAU : gestion désistements & renommages ───────────────────────────
  // Chaque entrée : { ...candidat, actif: bool, nomFinal: string, enEdition: bool, nomEdition: string }
  const [gestionListes, setGestionListes] = useState([]);

  // Flag piloté par l'Administration (ElectionsState: secondTourEnabled)
  // Tolérant aux types (booléen, number, string)
  const secondTourEnabled = useMemo(() => {
    if (!electionState) return false;

    const raw =
      electionState.secondTourEnabled ??
      electionState.passageSecondTourEnabled ??
      electionState.t2Enabled ??
      electionState['secondTourEnabled'];

    if (raw === true) return true;
    if (raw === false) return false;

    if (typeof raw === 'number') return raw === 1;

    if (typeof raw === 'string') {
      const s = raw.trim().toLowerCase();
      if (!s) return false;
      return (
        s === 'true' ||
        s === '1' ||
        s === 'oui' ||
        s === 'vrai' ||
        s === 'actif' ||
        s === 'enabled' ||
        s === 'on' ||
        s === 'yes'
      );
    }

    return false;
  }, [electionState]);

  // Détecte si l'application est déjà en 2nd tour (tourActuel/tour/currentTour)
  const t2Confirmed = useMemo(() => {
    const raw =
      electionState?.tourActuel ??
      electionState?.tour ??
      electionState?.currentTour ??
      electionState?.['tourActuel'] ??
      electionState?.['tour'];

    const n = Number(raw);
    return n === 2;
  }, [electionState]);

  useEffect(() => {
    loadCandidats?.();
    loadResultats?.();
  }, [loadCandidats, loadResultats]);

  useEffect(() => {
    if (!Array.isArray(resultats) || !Array.isArray(candidats)) return;
    if (resultats.length === 0 || candidats.length === 0) return;

    const totalExprimes = resultats.reduce((sum, r) => sum + (r?.exprimes || 0), 0);

    // Candidats T1 (par défaut : ceux marqués ActifT1). Si la colonne n'existe pas, on garde tout.
    const candidatsT1 = (candidats || []).filter((c) => {
      const raw = c?.actifT1 ?? c?.ActifT1;
      if (raw === undefined || raw === null) return true;
      return raw === true || raw === 'TRUE' || raw === 'true' || raw === 1 || raw === '1';
    });

    const candidatsAvecVoix = candidatsT1.map((candidat) => {
      const candidatKey =
        candidat?.listeId ??
        candidat?.listeID ??
        candidat?.ListeID ??
        candidat?.id ??
        candidat?.ID ??
        candidat?.key;

      const voix = resultats.reduce((sum, r) => {
        const v = r?.voix || {};
        const k = candidatKey != null ? String(candidatKey) : '';
        return sum + (parseInt(v?.[k]) || 0);
      }, 0);

      const displayName =
        candidat?.nomListe ??
        candidat?.NomListe ??
        candidat?.nom ??
        candidat?.Nom ??
        candidat?.listeId ??
        candidat?.ListeID ??
        candidat?.id ??
        '—';

      return {
        ...candidat,
        id: candidatKey ?? candidat?.id,
        nom: displayName,
        voix,
        pourcentage: totalExprimes > 0 ? (voix / totalExprimes) * 100 : 0,
      };
    });

    candidatsAvecVoix.sort((a, b) => (b.voix || 0) - (a.voix || 0));
    setClassement(candidatsAvecVoix);

    // Règle française : sont qualifiés au 2nd tour toutes les listes ayant >= 10% des suffrages exprimés
    const SEUIL_QUALIFICATION = 10; // 10%
    
    // Filtrer les listes qui atteignent le seuil de 10%
    const listesAuDessusDuSeuil = candidatsAvecVoix.filter(c => (c.pourcentage || 0) >= SEUIL_QUALIFICATION);
    
    if (candidatsAvecVoix.length >= 2) {
      const premier = candidatsAvecVoix[0];
      const second = candidatsAvecVoix[1];

      // Cas 1 : Égalité parfaite entre 1er et 2ème
      if ((premier?.voix || 0) === (second?.voix || 0)) {
        setEgalite(true);
        setCandidatsQualifies([]);
      } 
      // Cas 2 : Au moins 2 listes atteignent 10% → toutes sont qualifiées
      else if (listesAuDessusDuSeuil.length >= 2) {
        setEgalite(false);
        setCandidatsQualifies(listesAuDessusDuSeuil);
        setMessage((prev) => (prev?.type === 'warning' ? null : prev));
      }
      // Cas 3 : Moins de 2 listes atteignent 10% → les 2 premières sont qualifiées (règle de repli)
      else {
        setEgalite(false);
        setCandidatsQualifies([premier, second]);
        setMessage({
          type: 'warning',
          text: `⚠️ Aucune ou une seule liste n'atteint 10%. Les 2 premières sont qualifiées par défaut.`
        });
      }
    }
  }, [resultats, candidats]);

  // ─── NOUVEAU : initialise gestionListes dès que candidatsQualifies change ──
  // Ne réinitialise pas si l'utilisateur a déjà fait des modifications
  // (on vérifie que les ids correspondent encore, sinon on réinitialise)
  useEffect(() => {
    if (!Array.isArray(candidatsQualifies) || candidatsQualifies.length === 0) {
      setGestionListes([]);
      return;
    }
    setGestionListes((prev) => {
      // Si prev est vide ou les ids ont changé → réinitialisation complète
      const prevIds = prev.map((l) => String(l.id ?? l.nom));
      const newIds = candidatsQualifies.map((c) => String(c.id ?? c.nom));
      const idsMatch =
        prevIds.length === newIds.length && newIds.every((id) => prevIds.includes(id));
      if (idsMatch) return prev; // Conserver les modifications manuelles
      // Réinitialisation
      return candidatsQualifies.map((c) => ({
        ...c,
        actif: true,
        nomFinal: c.nom ?? '',
        enEdition: false,
        nomEdition: c.nom ?? '',
      }));
    });
  }, [candidatsQualifies]);

  // ─── NOUVEAU : actions sur gestionListes ────────────────────────────────────

  /** Active ou désiste une liste */
  const toggleActifListe = useCallback((id) => {
    setGestionListes((prev) =>
      prev.map((l) =>
        String(l.id ?? l.nom) === String(id)
          ? { ...l, actif: !l.actif, enEdition: false }
          : l
      )
    );
  }, []);

  /** Ouvre/ferme le champ de renommage */
  const toggleEditionNom = useCallback((id) => {
    setGestionListes((prev) =>
      prev.map((l) =>
        String(l.id ?? l.nom) === String(id)
          ? { ...l, enEdition: !l.enEdition, nomEdition: l.nomFinal }
          : { ...l, enEdition: false }
      )
    );
  }, []);

  /** Met à jour le champ texte en cours d'édition */
  const handleNomEditionChange = useCallback((id, valeur) => {
    setGestionListes((prev) =>
      prev.map((l) =>
        String(l.id ?? l.nom) === String(id) ? { ...l, nomEdition: valeur } : l
      )
    );
  }, []);

  /** Valide le renommage */
  const validerNomEdition = useCallback((id) => {
    setGestionListes((prev) =>
      prev.map((l) => {
        if (String(l.id ?? l.nom) !== String(id)) return l;
        const nouveau = (l.nomEdition ?? '').trim();
        return {
          ...l,
          nomFinal: nouveau || l.nom, // jamais vide
          enEdition: false,
          nomEdition: nouveau || l.nom,
        };
      })
    );
  }, []);

  /** Annule le renommage */
  const annulerNomEdition = useCallback((id) => {
    setGestionListes((prev) =>
      prev.map((l) =>
        String(l.id ?? l.nom) === String(id)
          ? { ...l, enEdition: false, nomEdition: l.nomFinal }
          : l
      )
    );
  }, []);

  /** Réinitialise le nom d'une liste au nom d'origine */
  const reinitialiserNom = useCallback((id) => {
    setGestionListes((prev) =>
      prev.map((l) =>
        String(l.id ?? l.nom) === String(id)
          ? { ...l, nomFinal: l.nom, enEdition: false, nomEdition: l.nom }
          : l
      )
    );
  }, []);

  // ─── Listes actives (celles qui participent au 2nd tour) ───────────────────
  const listesActives = useMemo(
    () => gestionListes.filter((l) => l.actif),
    [gestionListes]
  );

  // ─── Listes avec nom modifié (pour mise à jour Google Sheets) ──────────────
  const listesAvecNomModifie = useMemo(
    () => gestionListes.filter((l) => l.nomFinal !== l.nom),
    [gestionListes]
  );

  // ────────────────────────────────────────────────────────────────────────────

  const handlePassageT2 = async () => {
    if (!secondTourEnabled) {
      setMessage({
        type: 'warning',
        text: "⛔ Le passage au 2nd tour est désactivé. Active-le via l'Administration.",
      });
      return;
    }

    if (listesActives.length < 1) {
      setMessage({
        type: 'error',
        text: 'Il faut au minimum 1 liste active pour confirmer le passage au 2nd tour.',
      });
      return;
    }

    // Préparer les candidats avec leur nom final (fusion / renommage pris en compte)
    const candidatsPourT2 = listesActives.map((l) => ({
      ...l,
      nom: l.nomFinal, // Le nom final remplace le nom original
    }));

    setPendingQualified(candidatsPourT2);
    setShowConfirmT2Modal(true);
  };

  const confirmPassageT2 = async () => {
    const candidatsFinal = Array.isArray(pendingQualified) ? pendingQualified : [];
    if (candidatsFinal.length < 1) {
      setMessage({ type: 'error', text: 'Impossible de confirmer : aucune liste sélectionnée.' });
      setShowConfirmT2Modal(false);
      return;
    }
    try {
      setLoading(true);

      // ─── NOUVEAU : mise à jour Google Sheets pour les listes renommées ──────
      // On itère sur les listes dont le nom a changé et on met à jour l'onglet Candidats
      if (listesAvecNomModifie.length > 0) {
        for (const liste of listesAvecNomModifie) {
          try {
            // Recherche de la ligne de la liste dans l'onglet Candidats
            // On tente la mise à jour via googleSheetsService si disponible
            if (
              googleSheetsService &&
              typeof googleSheetsService.updateCandidatNom === 'function'
            ) {
              await googleSheetsService.updateCandidatNom(liste.id, liste.nomFinal);
            } else if (
              googleSheetsService &&
              typeof googleSheetsService.updateRow === 'function'
            ) {
              await googleSheetsService.updateRow('Candidats', liste.id, {
                nomListe: liste.nomFinal,
                NomListe: liste.nomFinal,
                nom: liste.nomFinal,
                Nom: liste.nomFinal,
              });
            }
            // Si aucune méthode n'est disponible, on continue sans bloquer :
            // le nom est quand même mis à jour dans l'état local et sera reflété dans T2
          } catch (renomErr) {
            console.warn(
              `Mise à jour du nom de liste "${liste.id}" dans Google Sheets échouée (non bloquant) :`,
              renomErr
            );
          }
        }
      }
      // ──────────────────────────────────────────────────────────────────────

      await passerSecondTour(candidatsFinal);
      // S'assure que l'état global (App + Navigation) est à jour immédiatement
      await reloadElectionState?.();

      try {
        await auditService.log('PASSAGE_SECOND_TOUR', {
          candidats: candidatsFinal.map((c) => ({ id: c.id, nom: c.nom, voix: c.voix })),
          desistements: gestionListes
            .filter((l) => !l.actif)
            .map((l) => ({ id: l.id, nom: l.nom })),
          renommages: listesAvecNomModifie.map((l) => ({
            id: l.id,
            nomOriginal: l.nom,
            nomFinal: l.nomFinal,
          })),
        });
      } catch (e) {
        console.warn('Audit log failed (PASSAGE_SECOND_TOUR):', e);
      }

      // Sauvegarder les candidats pour la modale de succès AVANT de vider pendingQualified
      setSuccessQualified(candidatsFinal);
      // Afficher la modale de succès bleue (style 2nd tour)
      setShowSuccessT2Modal(true);
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Erreur: ${error?.message || 'Erreur inconnue'}`,
      });
    } finally {
      setLoading(false);
      setShowConfirmT2Modal(false);
      setPendingQualified([]);
    }
  };

  const confirmRetourT1 = async () => {
    if (typeof revenirPremierTour !== 'function') {
      setMessage({ type: 'warning', text: "Action indisponible : fonction 'revenirPremierTour' manquante." });
      setShowConfirmBackModal(false);
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      await revenirPremierTour();

      // Recharge l'état depuis la source unique (App.jsx)
      if (typeof reloadElectionState === 'function') {
        await reloadElectionState();
      }

      try {
        auditService?.log?.('ADMIN_RETOUR_T1', {
          when: new Date().toISOString(),
          user: authService?.getUser?.() || null,
        });
      } catch (e) {
        // ne jamais casser l'UI pour un audit
      }

      setMessage({ type: 'success', text: 'Retour au 1er tour effectué.' });
    } catch (e) {
      setMessage({
        type: 'warning',
        text: `Erreur lors du retour au 1er tour : ${e?.message || e}`,
      });
    } finally {
      setLoading(false);
      setShowConfirmBackModal(false);
    }
  };


  const cancelPassageT2 = () => {
    setShowConfirmT2Modal(false);
    setPendingQualified([]);
  };

  const handleValidateAdmin = () => {
    const ok = authService?.adminSignIn ? authService.adminSignIn(adminPwd) : false;
    if (ok) {
      setAdminUnlocked(true);
      setAdminError('');
    } else {
      setAdminUnlocked(false);
      setAdminError('Mot de passe administrateur incorrect.');
    }
  };

  // ====== Styles inline (pour ne pas dépendre d'une feuille CSS externe et éviter les régressions) ======
  const styles = {
    card: {
      background: '#fff',
      borderRadius: 14,
      boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
      padding: 16,
      border: '1px solid rgba(0,0,0,0.06)',
    },
    cardTitle: {
      margin: 0,
      marginBottom: 12,
      fontSize: 18,
      fontWeight: 800,
    },
    tableWrap: {
      overflowX: 'auto',
      borderRadius: 14,
      border: '1px solid rgba(0,0,0,0.06)',
    },
    table: {
      width: '100%',
      borderCollapse: 'separate',
      borderSpacing: 0,
      overflow: 'hidden',
    },
    th: {
      textAlign: 'left',
      fontSize: 12,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      opacity: 0.9,
      padding: '12px 12px',
      borderBottom: '1px solid rgba(0,0,0,0.08)',
      background: 'rgba(0,0,0,0.03)',
      position: 'sticky',
      top: 0,
      zIndex: 1,
    },
    td: {
      padding: '12px 12px',
      borderBottom: '1px solid rgba(0,0,0,0.06)',
      verticalAlign: 'middle',
    },
    trQualified: {
      background: 'rgba(34, 197, 94, 0.08)', // vert clair
    },
    badge: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 10px',
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 700,
      background: 'rgba(34, 197, 94, 0.12)',
      border: '1px solid rgba(34, 197, 94, 0.35)',
    },
    hintBox: {
      background: 'rgba(0,0,0,0.03)',
      borderRadius: 14,
      boxShadow: '0 6px 18px rgba(0,0,0,0.06)',
      padding: 14,
      border: '1px solid rgba(0,0,0,0.06)',
      marginBottom: 12,
    },
    qualifiesGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      gap: 12,
      marginTop: 12,
    },
    miniCard: (accent = 'rgba(34,197,94,0.75)') => ({
      background: '#fff',
      borderRadius: 14,
      boxShadow: '0 8px 20px rgba(0,0,0,0.08)',
      padding: 14,
      border: `1px solid rgba(0,0,0,0.06)`,
      outline: `2px solid ${accent}`,
      outlineOffset: -2,
    }),
    miniTop: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginBottom: 10,
      gap: 10,
    },
    miniRank: {
      fontWeight: 900,
      fontSize: 12,
      textTransform: 'uppercase',
      opacity: 0.8,
      letterSpacing: 0.6,
    },
    miniName: {
      fontWeight: 900,
      fontSize: 16,
      lineHeight: 1.1,
    },
    miniNumber: {
      fontWeight: 900,
      fontSize: 18,
    },
    barWrap: {
      height: 10,
      background: 'rgba(0,0,0,0.06)',
      borderRadius: 999,
      overflow: 'hidden',
    },
    bar: (pct) => ({
      height: '100%',
      width: `${Math.max(0, Math.min(100, pct))}%`,
      background: 'rgba(34,197,94,0.8)',
      borderRadius: 999,
      transition: 'width 450ms ease',
    }),

    // Modal charté (remplace window.confirm)
    modalOverlay: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 18,
      zIndex: 9999,
    },
    modalCard: {
      width: 'min(720px, 100%)',
      background: '#fff',
      borderRadius: 16,
      boxShadow: '0 18px 60px rgba(0,0,0,0.35)',
      border: '1px solid rgba(0,0,0,0.10)',
      overflow: 'hidden',
    },
    modalHeader: {
      padding: '14px 16px',
      background: 'rgba(37, 99, 235, 0.12)', // bleu T2
      borderBottom: '1px solid rgba(37, 99, 235, 0.25)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    modalTitle: {
      margin: 0,
      fontSize: 16,
      fontWeight: 900,
      color: '#0f2f6b',
    },
    modalBody: {
      padding: 16,
      fontSize: 14,
      color: 'rgba(0,0,0,0.78)',
      lineHeight: 1.4,
    },
    modalList: {
      marginTop: 10,
      marginBottom: 0,
      paddingLeft: 18,
    },
    modalFooter: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 10,
      padding: 16,
      borderTop: '1px solid rgba(0,0,0,0.08)',
      background: 'rgba(0,0,0,0.02)',
    },
    modalBtn: {
      height: 44,
      minWidth: 120,
      padding: '0 16px',
      borderRadius: 12,
      border: '1px solid rgba(0,0,0,0.10)',
      fontWeight: 800,
      fontSize: 14,
      cursor: 'pointer',
    },
    modalBtnCancel: {
      background: '#fff',
      color: 'rgba(0,0,0,0.85)',
    },
    modalBtnConfirm: {
      background: 'rgba(37, 99, 235, 0.95)',
      border: '1px solid rgba(37, 99, 235, 0.95)',
      color: '#fff',
      boxShadow: '0 10px 24px rgba(37, 99, 235, 0.22)',
    },
    modalBtnDanger: {
      background: 'rgba(220, 38, 38, 0.95)',
      border: '1px solid rgba(220, 38, 38, 0.95)',
      color: '#fff',
      boxShadow: '0 10px 24px rgba(220, 38, 38, 0.22)',
    },
  };

  const maxVoix = useMemo(() => {
    if (!Array.isArray(classement) || classement.length === 0) return 0;
    return classement.reduce((m, c) => Math.max(m, c?.voix || 0), 0);
  }, [classement]);

  return (
    <>
      <div className="passage-t2">
      <h3>➡️ Passage au 2nd tour</h3>

      <style>{`
        .tour-info-card{
          margin: 14px 0 0 0;
          padding: 14px;
          border-radius: 14px;
          border: 1px solid rgba(0,0,0,0.06);
          background: rgba(255,255,255,0.92);
          box-shadow: 0 10px 26px rgba(0,0,0,0.06);
        }
        .tour-info-row{
          display:flex;
          gap: 14px;
          flex-wrap: wrap;
          align-items: stretch;
        }
        .tour-info-item{
          flex: 1 1 220px;
          padding: 10px 12px;
          border-radius: 12px;
          background: rgba(34,197,94,0.08);
          border: 1px solid rgba(0,0,0,0.06);
        }
        .tour-info-item .label{
          font-size: 12px;
          font-weight: 800;
          opacity: 0.8;
          text-transform: uppercase;
          letter-spacing: .4px;
        }
        .tour-info-item .value{
          margin-top: 6px;
          font-size: 18px;
          font-weight: 900;
        }

        /* ── Gestion désistements & renommages ── */
        .gestion-t2-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 12px;
          margin-bottom: 8px;
          border: 1px solid rgba(0,0,0,0.07);
          background: rgba(255,255,255,0.95);
          transition: opacity 0.2s ease, background 0.2s ease;
        }
        .gestion-t2-row.desiste {
          opacity: 0.45;
          background: rgba(220,38,38,0.04);
          border-color: rgba(220,38,38,0.15);
        }
        .gestion-t2-toggle {
          flex-shrink: 0;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 2px solid rgba(0,0,0,0.12);
          background: transparent;
          cursor: pointer;
          font-size: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.18s ease;
        }
        .gestion-t2-toggle.actif {
          border-color: rgba(34,197,94,0.6);
          background: rgba(34,197,94,0.10);
        }
        .gestion-t2-toggle.desiste {
          border-color: rgba(220,38,38,0.4);
          background: rgba(220,38,38,0.08);
        }
        .gestion-t2-infos {
          flex: 1;
          min-width: 0;
        }
        .gestion-t2-nom {
          font-weight: 800;
          font-size: 15px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .gestion-t2-nom-modifie {
          font-size: 11px;
          color: rgba(37,99,235,0.85);
          font-weight: 700;
          margin-top: 2px;
        }
        .gestion-t2-voix {
          font-size: 12px;
          opacity: 0.7;
          margin-top: 2px;
        }
        .gestion-t2-actions {
          display: flex;
          gap: 6px;
          flex-shrink: 0;
        }
        .btn-gestion {
          height: 32px;
          padding: 0 10px;
          border-radius: 8px;
          border: 1px solid rgba(0,0,0,0.12);
          background: rgba(0,0,0,0.04);
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.15s ease;
          white-space: nowrap;
        }
        .btn-gestion:hover { background: rgba(0,0,0,0.09); }
        .btn-gestion.bleu {
          border-color: rgba(37,99,235,0.3);
          background: rgba(37,99,235,0.08);
          color: rgba(37,99,235,0.9);
        }
        .btn-gestion.bleu:hover { background: rgba(37,99,235,0.15); }
        .btn-gestion.vert {
          border-color: rgba(34,197,94,0.4);
          background: rgba(34,197,94,0.10);
          color: rgba(21,128,61,0.9);
        }
        .btn-gestion.vert:hover { background: rgba(34,197,94,0.2); }
        .btn-gestion.rouge {
          border-color: rgba(220,38,38,0.3);
          background: rgba(220,38,38,0.07);
          color: rgba(185,28,28,0.9);
        }
        .btn-gestion.rouge:hover { background: rgba(220,38,38,0.14); }
        .edition-nom-wrap {
          display: flex;
          gap: 6px;
          align-items: center;
          margin-top: 6px;
          flex-wrap: wrap;
        }
        .edition-nom-input {
          flex: 1;
          min-width: 160px;
          height: 34px;
          border-radius: 8px;
          border: 1px solid rgba(37,99,235,0.4);
          padding: 0 10px;
          font-size: 13px;
          font-weight: 700;
          outline: none;
          box-shadow: 0 0 0 2px rgba(37,99,235,0.10);
        }
        .recap-t2-box {
          margin-top: 10px;
          padding: 10px 14px;
          border-radius: 12px;
          background: rgba(37,99,235,0.06);
          border: 1px solid rgba(37,99,235,0.18);
          font-size: 13px;
        }
        .recap-t2-box strong { color: rgba(37,99,235,0.9); }

        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          25% { transform: translateY(-20px); }
          50% { transform: translateY(-10px); }
          75% { transform: translateY(-15px); }
        }
      `}</style>


      {!secondTourEnabled && (
        <div className="message warning" style={{ marginBottom: 12 }}>
          ⛔ Le passage au 2nd tour est actuellement <strong>désactivé</strong>. Active-le via{' '}
          <strong>Administration</strong> (Passage au 2nd tour = Actif / Inactif).
        </div>
      )}

      {/* Bloc clair arrondi + ombre portée */}
      <div style={{ ...styles.hintBox, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 16 }}>📊 Classement 1er tour</div>
            <div style={{ opacity: 0.85, fontSize: 13, marginTop: 4 }}>
              {candidatsQualifies.length === 2 
                ? "Les 2 premiers sont qualifiés (sauf égalité)."
                : `Toutes les listes avec ≥ 10% sont qualifiées (${candidatsQualifies.length} liste${candidatsQualifies.length > 1 ? 's' : ''}).`
              }
            </div>
          </div>
          {candidatsQualifies.length >= 2 && !egalite && (
            <span style={styles.badge}>✅ {candidatsQualifies.length} qualifié{candidatsQualifies.length > 1 ? 's' : ''} détecté{candidatsQualifies.length > 1 ? 's' : ''}</span>
          )}
        </div>
      </div>

      {/* Tableau arrondi + candidats qualifiés (≥ 10%) en vert */}
      <div style={{ ...styles.card, padding: 14, marginBottom: 16 }}>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Rang</th>
                <th style={styles.th}>Candidat</th>
                <th style={styles.th}>Voix</th>
                <th style={styles.th}>%</th>
                <th style={styles.th}>Qualifié</th>
              </tr>
            </thead>
            <tbody>
              {classement.map((c, index) => {
                // Un candidat est qualifié s'il a >= 10% des suffrages exprimés
                const isQualified = (c.pourcentage || 0) >= 10;
                const pctBar = maxVoix > 0 ? ((c?.voix || 0) / maxVoix) * 100 : 0;

                return (
                  <tr key={`${c.id || c.nom || c.candidat || index}`} style={isQualified ? styles.trQualified : undefined}>
                    <td style={styles.td}>{index + 1}</td>
                    <td style={styles.td}>
                      <strong>{c.nom}</strong>
                    </td>
                    <td style={styles.td}>
                      <div style={{ display: 'grid', gap: 6 }}>
                        <div style={{ fontWeight: 800 }}>{(c.voix || 0).toLocaleString('fr-FR')}</div>
                        {/* mini graphique (barre animée) */}
                        <div style={styles.barWrap} title="Visualisation relative (voix)">
                          <div style={styles.bar(pctBar)} />
                        </div>
                      </div>
                    </td>
                    <td style={styles.td}>{(c.pourcentage || 0).toFixed(2)}%</td>
                    <td style={styles.td}>{isQualified ? '✅' : '❌'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {egalite && (
          <div className="message warning" style={{ marginTop: 12 }}>
            ⚠️ Égalité parfaite entre les 2 premiers candidats. Décision admin requise.
          </div>
        )}
      </div>

      {message && <div className={`message ${message.type}`}>{message.text}</div>}

      {/* Bloc "Candidats qualifiés" (lecture seule - résultat du 1er tour) */}
      {!egalite && candidatsQualifies.length >= 2 && (
        <div style={{ ...styles.card, marginBottom: 16 }}>
          <h3 style={styles.cardTitle}>🏁 Candidats qualifiés pour le 2nd tour</h3>
          <div style={{ opacity: 0.85, fontSize: 13, marginBottom: 12 }}>
            {candidatsQualifies.length === 2 
              ? "2 listes qualifiées - Vérifie les noms et les voix avant confirmation."
              : `${candidatsQualifies.length} listes qualifiées (≥ 10% des suffrages exprimés) - Vérifie avant confirmation.`
            }
          </div>

          <div style={styles.qualifiesGrid}>
            {candidatsQualifies.map((candidat, index) => {
              const rang = index === 0 ? '1er' : index === 1 ? '2ème' : `${index + 1}ème`;
              const couleurIntensity = Math.max(0.35, 0.65 - (index * 0.1)); // Dégrade la couleur
              
              return (
                <div key={candidat.id || index} style={styles.miniCard(`rgba(34,197,94,${couleurIntensity})`)}>
                  <div style={styles.miniTop}>
                    <div style={styles.miniRank}>{rang}</div>
                    <div style={{ ...styles.miniNumber }}>{(candidat.voix || 0).toLocaleString('fr-FR')} voix</div>
                  </div>
                  <div style={styles.miniName}>{candidat.nom}</div>
                  <div style={{ marginTop: 8, opacity: 0.85, fontSize: 13 }}>
                    {(candidat.pourcentage || 0).toFixed(2)}%
                  </div>
                  <div style={{ marginTop: 10, ...styles.barWrap }}>
                    <div style={styles.bar(maxVoix > 0 ? ((candidat.voix || 0) / maxVoix) * 100 : 0)} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          NOUVEAU BLOC : Désistements & Regroupements
          Affiché uniquement si des listes qualifiées ont été détectées
          ════════════════════════════════════════════════════════════════════ */}
      {!egalite && gestionListes.length >= 2 && (
        <div style={{ ...styles.card, marginBottom: 16, border: '1px solid rgba(37,99,235,0.15)' }}>
          <h3 style={{ ...styles.cardTitle, color: '#1e3a8a' }}>
            ✏️ Désistements &amp; Regroupements
          </h3>
          <div style={{ opacity: 0.8, fontSize: 13, marginBottom: 14 }}>
            Gérez ici les désistements et les fusions de listes <strong>avant</strong> de confirmer le passage au 2nd tour.
            Les modifications de noms seront répercutées dans Google Sheets lors de la confirmation.
          </div>

          {/* ─── Ligne par liste qualifiée ─── */}
          {gestionListes.map((liste) => {
            const cleUnique = String(liste.id ?? liste.nom);
            const nomAffiche = liste.nomFinal || liste.nom;
            const nomModifie = liste.nomFinal !== liste.nom;

            return (
              <div
                key={cleUnique}
                className={`gestion-t2-row${liste.actif ? '' : ' desiste'}`}
              >
                {/* Toggle actif / désisté */}
                <button
                  type="button"
                  className={`gestion-t2-toggle${liste.actif ? ' actif' : ' desiste'}`}
                  onClick={() => toggleActifListe(cleUnique)}
                  title={liste.actif ? 'Marquer comme désisté' : 'Réactiver cette liste'}
                  aria-label={liste.actif ? `Désister ${nomAffiche}` : `Réactiver ${nomAffiche}`}
                >
                  {liste.actif ? '✅' : '🚫'}
                </button>

                {/* Infos & édition du nom */}
                <div className="gestion-t2-infos">
                  <div className="gestion-t2-nom">
                    {nomAffiche}
                    {liste.actif && !liste.enEdition && (
                      <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, opacity: 0.55, fontStyle: 'italic' }}>
                        {liste.actif ? '→ participera au 2nd tour' : ''}
                      </span>
                    )}
                  </div>
                  {nomModifie && !liste.enEdition && (
                    <div className="gestion-t2-nom-modifie">
                      🔄 Renommé depuis : <em>{liste.nom}</em>
                    </div>
                  )}
                  <div className="gestion-t2-voix">
                    {(liste.voix || 0).toLocaleString('fr-FR')} voix — {(liste.pourcentage || 0).toFixed(2)}%
                  </div>

                  {/* Champ d'édition du nom (affiché uniquement si enEdition) */}
                  {liste.enEdition && (
                    <div className="edition-nom-wrap">
                      <input
                        type="text"
                        className="edition-nom-input"
                        value={liste.nomEdition}
                        onChange={(e) => handleNomEditionChange(cleUnique, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') validerNomEdition(cleUnique);
                          if (e.key === 'Escape') annulerNomEdition(cleUnique);
                        }}
                        placeholder="Nouveau nom de liste / fusion"
                        autoFocus
                        maxLength={120}
                        aria-label={`Nouveau nom pour ${liste.nom}`}
                      />
                      <button
                        type="button"
                        className="btn-gestion vert"
                        onClick={() => validerNomEdition(cleUnique)}
                        title="Valider le nouveau nom"
                      >
                        ✔ Valider
                      </button>
                      <button
                        type="button"
                        className="btn-gestion rouge"
                        onClick={() => annulerNomEdition(cleUnique)}
                        title="Annuler la modification"
                      >
                        ✖ Annuler
                      </button>
                    </div>
                  )}
                </div>

                {/* Actions : renommer / réinitialiser */}
                {!liste.enEdition && liste.actif && (
                  <div className="gestion-t2-actions">
                    <button
                      type="button"
                      className="btn-gestion bleu"
                      onClick={() => toggleEditionNom(cleUnique)}
                      title="Renommer cette liste (fusion, regroupement…)"
                    >
                      ✏️ Renommer
                    </button>
                    {nomModifie && (
                      <button
                        type="button"
                        className="btn-gestion"
                        onClick={() => reinitialiserNom(cleUnique)}
                        title="Rétablir le nom d'origine"
                      >
                        ↺ Réinitialiser
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* ─── Récapitulatif ─── */}
          <div className="recap-t2-box">
            <strong>{listesActives.length}</strong> liste{listesActives.length > 1 ? 's' : ''} retenue{listesActives.length > 1 ? 's' : ''} pour le 2nd tour
            {gestionListes.filter((l) => !l.actif).length > 0 && (
              <span style={{ marginLeft: 12, color: 'rgba(220,38,38,0.85)' }}>
                · <strong>{gestionListes.filter((l) => !l.actif).length}</strong> désisté{gestionListes.filter((l) => !l.actif).length > 1 ? 'es' : 'e'}
              </span>
            )}
            {listesAvecNomModifie.length > 0 && (
              <span style={{ marginLeft: 12, color: 'rgba(37,99,235,0.85)' }}>
                · <strong>{listesAvecNomModifie.length}</strong> renommée{listesAvecNomModifie.length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {listesActives.length === 0 && (
            <div className="message warning" style={{ marginTop: 10 }}>
              ⚠️ Aucune liste active. Réactivez au moins une liste pour pouvoir confirmer le passage.
            </div>
          )}
        </div>
      )}
      {/* ════════════════════════════════════════════════════════════════════ */}


      {/* 📅 Infos officielles du 2nd tour (évite doublon avec ConfigurationT2) */}
      <div className="tour-info-card">
        <div className="tour-info-row">
          <div className="tour-info-item">
            <div className="label">Date du 2nd tour</div>
            <div className="value">
              {electionState?.dateT2 ? new Date(electionState.dateT2).toLocaleDateString('fr-FR') : '—'}
            </div>
          </div>
          <div className="tour-info-item">
            <div className="label">Horaires</div>
            <div className="value">08h00 – 20h00</div>
          </div>
        </div>
      </div>

      <div className="actions" style={{ display: 'flex', gap: 12, alignItems: 'stretch', flexWrap: 'wrap' }}>
        <input
          type="password"
          value={adminPwd}
          onChange={(e) => {
            setAdminPwd(e.target.value);
            if (adminError) setAdminError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleValidateAdmin();
          }}
          placeholder="Saisissez le mot de passe administrateur"
          aria-label="Mot de passe administrateur"
          style={{
            flex: 1,
            minWidth: 260,
            height: 44,
            padding: '0 14px',
            borderRadius: 12,
            border: '1px solid rgba(0,0,0,0.12)',
            outline: 'none',
          }}
        />

        <button
          type="button"
          className="btn-primary"
          onClick={handleValidateAdmin}
          style={{ height: 44, padding: '0 18px', background: 'rgba(15,23,42,0.92)' }}
        >
          Valider
        </button>

        <button
          className="btn-primary"
          disabled={!adminUnlocked || !secondTourEnabled || egalite || t2Confirmed || listesActives.length === 0}
          onClick={handlePassageT2}
          style={{
            height: 44,
            padding: '0 18px',
            background: adminUnlocked && listesActives.length > 0 ? 'rgba(37,99,235,0.92)' : 'rgba(156,163,175,0.7)',
          }}
          title={
            !adminUnlocked
              ? 'Saisissez et validez le mot de passe administrateur'
              : !secondTourEnabled
              ? 'Passage au 2nd tour désactivé'
              : egalite
              ? 'Égalité parfaite : décision admin requise'
              : listesActives.length === 0
              ? 'Aucune liste active — réactivez au moins une liste'
              : t2Confirmed
              ? 'Passage déjà confirmé'
              : ''
          }
        >
          {adminUnlocked ? 'Passage au 2nd tour actif' : '➡️ Confirmer passage au 2nd tour'}
        </button>
        {adminUnlocked && secondTourEnabled && (
          <button
            type="button"
            onClick={() => setShowConfirmBackModal(true)}
            disabled={loading}
            className="action-btn"
            style={{
              background: 'rgba(220, 38, 38, 0.10)',
              border: '1px solid rgba(220, 38, 38, 0.35)',
              color: 'rgba(220, 38, 38, 0.95)',
            }}
            title="Revenir au 1er tour (action administrative)"
          >
            ↩️ Repasser au 1er tour
          </button>
        )}

      </div>
      {adminError && (
        <div className="message warning" style={{ marginTop: 10 }}>
          {adminError}
        </div>
      )}
      </div>

      {showConfirmT2Modal && (
        <div style={styles.modalOverlay} role="dialog" aria-modal="true">
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Confirmer le passage au 2nd tour</h3>
            </div>
            <div style={styles.modalBody}>
              <div>Vous allez confirmer officiellement le passage au 2nd tour avec :</div>
              <ol style={styles.modalList}>
                {pendingQualified.map((c, idx) => (
                  <li key={c?.id || c?.nom || idx}>
                    <strong>{c?.nom || '-'}</strong>
                    {/* Affiche l'ancien nom si renommage */}
                    {gestionListes.find((l) => String(l.id ?? l.nom) === String(c?.id ?? c?.nom))?.nom !== c?.nom && (
                      <span style={{ fontSize: 12, opacity: 0.65, marginLeft: 8 }}>
                        (anciennement : {gestionListes.find((l) => String(l.id ?? l.nom) === String(c?.id ?? c?.nom))?.nom})
                      </span>
                    )}
                  </li>
                ))}
              </ol>
              {/* Désistements */}
              {gestionListes.filter((l) => !l.actif).length > 0 && (
                <div style={{ marginTop: 14, fontSize: 13, color: 'rgba(185,28,28,0.85)' }}>
                  <strong>Désistements :</strong>
                  <ul style={{ ...styles.modalList, marginTop: 4 }}>
                    {gestionListes.filter((l) => !l.actif).map((l, idx) => (
                      <li key={l?.id || idx}>{l.nom}</li>
                    ))}
                  </ul>
                </div>
              )}
              {listesAvecNomModifie.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(37,99,235,0.8)' }}>
                  ℹ️ Les noms modifiés seront mis à jour dans Google Sheets.
                </div>
              )}
            </div>
            <div style={styles.modalFooter}>
              <button
                type="button"
                onClick={() => setShowConfirmT2Modal(false)}
                style={{ ...styles.modalBtn, ...styles.modalBtnCancel }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmPassageT2}
                disabled={loading}
                style={{
                  ...styles.modalBtn,
                  ...styles.modalBtnConfirm,
                  ...(loading ? { opacity: 0.65, cursor: 'not-allowed' } : null),
                }}
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}


      {showConfirmBackModal && (
        <div style={styles.modalOverlay} role="dialog" aria-modal="true">
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Repasser au 1er tour</h3>
            </div>
            <div style={styles.modalBody}>
              <div>
                <strong>Attention :</strong> vous allez réactiver le 1er tour et désactiver le 2nd tour.
              </div>
              <div style={{ marginTop: 10, opacity: 0.9 }}>
                Cette action est administrative et doit être confirmée.
              </div>
            </div>
            <div style={styles.modalFooter}>
              <button
                type="button"
                onClick={() => setShowConfirmBackModal(false)}
                disabled={loading}
                style={{
                  ...styles.modalBtn,
                  ...styles.modalBtnCancel,
                  ...(loading ? { opacity: 0.65, cursor: 'not-allowed' } : null),
                }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmRetourT1}
                disabled={loading}
                style={{
                  ...styles.modalBtn,
                  ...styles.modalBtnDanger,
                  ...(loading ? { opacity: 0.65, cursor: 'not-allowed' } : null),
                }}
              >
                Confirmer retour T1
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale de succès - Passage au 2nd tour confirmé */}
      {showSuccessT2Modal && (
        <div 
          style={styles.modalOverlay} 
          role="dialog" 
          aria-modal="true"
          onClick={() => {
            setShowSuccessT2Modal(false);
            setSuccessQualified([]);
          }}
        >
          <div 
            style={{
              ...styles.modalCard,
              background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.95) 0%, rgba(59, 130, 246, 0.92) 100%)',
              border: '2px solid rgba(255,255,255,0.3)',
              boxShadow: '0 25px 50px rgba(37, 99, 235, 0.4)',
              maxWidth: 500,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: 'center', padding: '32px 24px' }}>
              <div style={{
                fontSize: 72,
                marginBottom: 20,
                animation: 'bounce 0.6s ease-in-out',
              }}>
                🗳️
              </div>
              <h3 style={{
                margin: 0,
                marginBottom: 16,
                fontSize: 28,
                fontWeight: 900,
                color: '#fff',
                textShadow: '0 2px 4px rgba(0,0,0,0.2)',
              }}>
                Passage au 2nd tour confirmé !
              </h3>
              <div style={{
                fontSize: 16,
                color: 'rgba(255,255,255,0.95)',
                lineHeight: 1.6,
                marginBottom: 8,
              }}>
                {successQualified.length === 1
                  ? "La liste retenue est :"
                  : successQualified.length === 2 
                  ? "Les deux listes qualifiées sont :"
                  : `Les ${successQualified.length} listes qualifiées sont :`
                }
              </div>
              <div style={{
                background: 'rgba(255,255,255,0.2)',
                borderRadius: 12,
                padding: '16px',
                margin: '16px 0',
                backdropFilter: 'blur(10px)',
              }}>
                {successQualified.map((candidat, index) => (
                  <div key={candidat?.id || index} style={{
                    fontSize: 18,
                    fontWeight: 900,
                    color: '#fff',
                    marginBottom: index < successQualified.length - 1 ? 8 : 0,
                  }}>
                    ✅ {candidat?.nom || '—'}
                  </div>
                ))}
              </div>
              <div style={{
                fontSize: 14,
                color: 'rgba(255,255,255,0.9)',
                marginTop: 16,
                marginBottom: 24,
              }}>
                L'application est maintenant configurée pour le 2nd tour
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowSuccessT2Modal(false);
                  setSuccessQualified([]);
                }}
                style={{
                  background: 'rgba(255,255,255,0.95)',
                  color: '#2563eb',
                  border: 'none',
                  borderRadius: 12,
                  padding: '12px 32px',
                  fontSize: 16,
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'scale(1.05)';
                  e.target.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'scale(1)';
                  e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                }}
              >
                Parfait, continuer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PassageSecondTour;
