import React, { useEffect, useMemo, useState } from 'react';
import { useGoogleSheets } from '../../hooks/useGoogleSheets';
import { getAuthState, isBV } from '../../services/authService';

/**
 * Normalise les bureauId pour un matching robuste
 */
const normalizeBureauId = (value) => {
  if (value === null || value === undefined) return '';
  const s = String(value).trim().toUpperCase();
  const m = s.match(/(\d+)/);
  return m ? m[1] : s;
};

/**
 * Consolidation des résultats
 * * ⚠️ CORRECTION (2026-02-09) :
 * - Les BV voient les inscrits communaux en CONTEXTE uniquement
 * - Les calculs (participation, abstentions) utilisent les données du BUREAU pour les BV
 * - Les Global/Admin voient la consolidation complète communale
 *
 * IMPORTANT :
 * - Ne touche pas à Participation
 * - Ne modifie pas les données dans Sheets (affichage/consolidation locale uniquement)
 */
const ResultatsConsolidation = ({ electionState}) => {
  // Détection du profil utilisateur
  const auth = useMemo(() => getAuthState(), []);
  const isBureau = isBV(auth);
  const bureauId = auth?.bureauId ?? null;

  const { data: bureaux, load: loadBureaux } = useGoogleSheets('Bureaux');
  const { data: candidats, load: loadCandidats } = useGoogleSheets('Candidats');
  const { data: resultats, load: loadResultats } = useGoogleSheets(
    electionState.tourActuel === 1 ? 'Resultats_T1' : 'Resultats_T2'
  );

  // ⚠️ ADMIN uniquement : données T1/T2 pour statistiques et progression
  const { data: resultatsT1, load: loadResultatsT1 } = useGoogleSheets('Resultats_T1');
  const { data: resultatsT2, load: loadResultatsT2 } = useGoogleSheets('Resultats_T2');

  const [totaux, setTotaux] = useState({
    inscrits: 0,
    votants: 0,
    blancs: 0,
    nuls: 0,
    exprimes: 0
  });

  const [totauxCommunaux, setTotauxCommunaux] = useState({
    inscrits: 0,
    votants: 0,
    blancs: 0,
    nuls: 0,
    exprimes: 0
  });

  const [classementCandidats, setClassementCandidats] = useState([]);

  // ---------- Helpers ----------
  const clampPct = (v) => Math.min(100, Math.max(0, Number(v) || 0));

  const isValidHexColor = (hex) =>
    typeof hex === 'string' && /^#([0-9a-fA-F]{6})$/.test(hex.trim());

  const getCandidateDisplayName = (c) => {
    if (!c) return '';
    const nomListe = (c.nomListe || '').toString().trim();
    const prenom = (c.teteListePrenom || '').toString().trim();
    const nom = (c.teteListeNom || '').toString().trim();
    if (nomListe) return nomListe;
    const full = `${prenom} ${nom}`.trim();
    return full || (c.listeId || c.id || '—');
  };

  // Palette stable (fallback si Couleur absente ou invalide)
  const PALETTE = useMemo(
    () => ['#2D7FF9', '#22C55E', '#F97316', '#A855F7', '#EF4444', '#14B8A6', '#EAB308', '#64748B'],
    []
  );

  const hashToIndex = (str) => {
    const s = String(str ?? '');
    let h = 0;
    for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  };

  const getCandidateColor = (candidat, fallbackIndex = 0) => {
    const explicit = candidat?.couleur;
    if (isValidHexColor(explicit)) return explicit.trim();
    const key = candidat?.listeId || candidat?.id || candidat?.nomListe || '';
    const idx = (hashToIndex(key) + fallbackIndex) % PALETTE.length;
    return PALETTE[idx];
  };

  // ---------- Chargements ----------
  useEffect(() => {
    loadBureaux();
    loadCandidats();
    loadResultats();

    // ADMIN : on charge aussi T1/T2 pour les stats inter-tours (sans impact BV)
    if (!isBureau) {
      loadResultatsT1();
      loadResultatsT2();
    }
  }, [loadBureaux, loadCandidats, loadResultats, loadResultatsT1, loadResultatsT2, isBureau]);

  // ---------- Consolidation locale ----------
  useEffect(() => {
    if (bureaux.length === 0 && resultats.length === 0) {
      setTotaux({ inscrits: 0, votants: 0, blancs: 0, nuls: 0, exprimes: 0 });
      setTotauxCommunaux({ inscrits: 0, votants: 0, blancs: 0, nuls: 0, exprimes: 0 });
      setClassementCandidats([]);
      return;
    }

    // ⚠️ CORRECTION : Totaux communaux (TOUS les bureaux - pour contexte)
    const totalInscritsCommune = bureaux.reduce((sum, b) => sum + (Number(b.inscrits) || 0), 0);
    const totalVotantsCommune = resultats.reduce((sum, r) => sum + (Number(r.votants) || 0), 0);
    const totalBlancsCommune = resultats.reduce((sum, r) => sum + (Number(r.blancs) || 0), 0);
    const totalNulsCommune = resultats.reduce((sum, r) => sum + (Number(r.nuls) || 0), 0);
    const totalExprimesRawCommune = resultats.reduce((sum, r) => sum + (Number(r.exprimes) || 0), 0);
    const totalExprimesSafeCommune =
      totalExprimesRawCommune > 0 ? totalExprimesRawCommune : Math.max(0, totalVotantsCommune - totalBlancsCommune - totalNulsCommune);

    setTotauxCommunaux({
      inscrits: totalInscritsCommune,
      votants: totalVotantsCommune,
      blancs: totalBlancsCommune,
      nuls: totalNulsCommune,
      exprimes: totalExprimesSafeCommune
    });

    // ⚠️ CORRECTION : Pour les BV, utiliser les données du BUREAU uniquement
    let totalInscrits, totalVotants, totalBlancs, totalNuls, totalExprimesSafe;

    if (isBureau && bureauId) {
      // Filtrer les données du bureau uniquement
      const normalized = normalizeBureauId(bureauId);
      const bureauData = bureaux.find((b) => normalizeBureauId(b?.id ?? '') === normalized);
      const resultatsBureau = resultats.filter((r) => normalizeBureauId(r?.bureauId ?? '') === normalized);

      totalInscrits = bureauData ? Number(bureauData.inscrits) || 0 : 0;
      totalVotants = resultatsBureau.reduce((sum, r) => sum + (Number(r.votants) || 0), 0);
      totalBlancs = resultatsBureau.reduce((sum, r) => sum + (Number(r.blancs) || 0), 0);
      totalNuls = resultatsBureau.reduce((sum, r) => sum + (Number(r.nuls) || 0), 0);
      
      const totalExprimesRaw = resultatsBureau.reduce((sum, r) => sum + (Number(r.exprimes) || 0), 0);
      totalExprimesSafe = totalExprimesRaw > 0 ? totalExprimesRaw : Math.max(0, totalVotants - totalBlancs - totalNuls);
    } else {
      // Global/Admin : utiliser les totaux communaux
      totalInscrits = totalInscritsCommune;
      totalVotants = totalVotantsCommune;
      totalBlancs = totalBlancsCommune;
      totalNuls = totalNulsCommune;
      totalExprimesSafe = totalExprimesSafeCommune;
    }

    setTotaux({
      inscrits: totalInscrits,
      votants: totalVotants,
      blancs: totalBlancs,
      nuls: totalNuls,
      exprimes: totalExprimesSafe
    });

    // Candidats actifs selon le tour
    const candidatsActifs = (candidats || []).filter((c) =>
      electionState.tourActuel === 1 ? !!c.actifT1 : !!c.actifT2
    );

    // Classement candidats (jointure sur listeId <-> voix[Lx])
    if (candidatsActifs.length > 0) {
      // ⚠️ CORRECTION : Pour les BV, utiliser uniquement les résultats de LEUR bureau
      const resultsForClassement = isBureau && bureauId
        ? resultats.filter((r) => normalizeBureauId(r?.bureauId ?? '') === normalizeBureauId(bureauId))
        : resultats;

      const candidatsAvecTotaux = candidatsActifs.map((candidat) => {
        const listeId = candidat?.listeId;
        const totalVoix = resultsForClassement.reduce((sum, r) => {
          const voix = r?.voix?.[listeId];
          return sum + (Number(voix) || 0);
        }, 0);

        return {
          ...candidat,
          totalVoix,
          pourcentage: totalExprimesSafe > 0 ? (totalVoix / totalExprimesSafe) * 100 : 0,
          displayName: getCandidateDisplayName(candidat)
        };
      });

      candidatsAvecTotaux.sort((a, b) => (Number(b.totalVoix) || 0) - (Number(a.totalVoix) || 0));
      setClassementCandidats(candidatsAvecTotaux);
    } else {
      setClassementCandidats([]);
    }
  }, [resultats, candidats, bureaux, electionState.tourActuel, isBureau, bureauId]);

  const nbBureaux = bureaux.length;

  const nbBureauxDeclares = useMemo(() => {
    if (nbBureaux === 0) return 0;
    const declaredSet = new Set(resultats.map((r) => r.bureauId));
    return bureaux.filter((b) => declaredSet.has(b.id)).length;
  }, [bureaux, resultats, nbBureaux]);

  const tauxParticipation = useMemo(() => {
    if (!totaux.inscrits) return 0;
    return (totaux.votants / totaux.inscrits) * 100;
  }, [totaux]);

  const totalAbstentions = useMemo(() => {
    const a = (Number(totaux.inscrits) || 0) - (Number(totaux.votants) || 0);
    return a < 0 ? 0 : a;
  }, [totaux]);

  const tauxBlancs = useMemo(() => {
    if (!totaux.votants) return 0;
    return (totaux.blancs / totaux.votants) * 100;
  }, [totaux]);

  const tauxNuls = useMemo(() => {
    if (!totaux.votants) return 0;
    return (totaux.nuls / totaux.votants) * 100;
  }, [totaux]);


  // -------------------- ADMIN : statistiques par bureau (Tour courant) --------------------
  const bureauxStats = useMemo(() => {
    // BV : pas de stats globales (évite charge + régression UI)
    if (isBureau) return [];
    if (!Array.isArray(bureaux) || bureaux.length === 0) return [];

    // Index résultats par bureauId (sur le tour courant)
    const resultsByBureau = new Map();
    for (const r of (resultats || [])) {
      const bid = normalizeBureauId(r?.bureauId ?? '');
      if (!bid) continue;
      const agg = resultsByBureau.get(bid) || { votants: 0, blancs: 0, nuls: 0, exprimes: 0, voixSum: 0 };
      agg.votants += Number(r?.votants) || 0;
      agg.blancs += Number(r?.blancs) || 0;
      agg.nuls += Number(r?.nuls) || 0;
      agg.exprimes += Number(r?.exprimes) || 0;

      const voixObj = r?.voix;
      if (voixObj && typeof voixObj === 'object') {
        for (const v of Object.values(voixObj)) agg.voixSum += Number(v) || 0;
      }
      resultsByBureau.set(bid, agg);
    }

    const getLabel = (b) => {
      const id = b?.id ?? '';
      const nom = b?.nom ?? b?.label ?? b?.bureau ?? b?.libelle ?? b?.lieu ?? '';
      const idNorm = normalizeBureauId(id);
      if (nom) return `BV${idNorm} — ${nom}`;
      return `BV${idNorm}`;
    };

    return (bureaux || []).map((b) => {
      const idNorm = normalizeBureauId(b?.id ?? '');
      const r = resultsByBureau.get(idNorm) || { votants: 0, blancs: 0, nuls: 0, exprimes: 0, voixSum: 0 };
      const inscrits = Number(b?.inscrits) || 0;
      const votants = r.votants || 0;
      const blancs = r.blancs || 0;
      const nuls = r.nuls || 0;
      const exprimes = (r.exprimes > 0 ? r.exprimes : Math.max(0, votants - blancs - nuls)) || 0;

      const participationPct = inscrits > 0 ? (votants / inscrits) * 100 : 0;
      const abstentions = Math.max(0, inscrits - votants);
      const abstentionPct = inscrits > 0 ? (abstentions / inscrits) * 100 : 0;
      const nulsPct = votants > 0 ? (nuls / votants) * 100 : 0;
      const blancsPct = votants > 0 ? (blancs / votants) * 100 : 0;

      return {
        id: idNorm,
        label: getLabel(b),
        inscrits,
        votants,
        blancs,
        nuls,
        exprimes,
        participationPct,
        abstentions,
        abstentionPct,
        nulsPct,
        blancsPct,
      };
    });
  }, [isBureau, bureaux, resultats]);

  // -------------------- ADMIN : progression votants T1 -> T2 (uniquement quand Tour 2) --------------------
  const bureauxProgressionT1T2 = useMemo(() => {
    if (isBureau) return [];
    if (electionState.tourActuel !== 2) return [];
    if (!Array.isArray(bureaux) || bureaux.length === 0) return [];

    const aggTour = (rows) => {
      const map = new Map();
      for (const r of (rows || [])) {
        const bid = normalizeBureauId(r?.bureauId ?? '');
        if (!bid) continue;
        const prev = map.get(bid) || { votants: 0 };
        prev.votants += Number(r?.votants) || 0;
        map.set(bid, prev);
      }
      return map;
    };

    const t1 = aggTour(resultatsT1);
    const t2 = aggTour(resultatsT2);

    return (bureaux || []).map((b) => {
      const idNorm = normalizeBureauId(b?.id ?? '');
      const inscrits = Number(b?.inscrits) || 0;
      const vot1 = (t1.get(idNorm)?.votants) || 0;
      const vot2 = (t2.get(idNorm)?.votants) || 0;

      const pct1 = inscrits > 0 ? (vot1 / inscrits) * 100 : 0;
      const pct2 = inscrits > 0 ? (vot2 / inscrits) * 100 : 0;

      return {
        id: idNorm,
        label: b?.nom ?? b?.label ?? b?.bureau ?? b?.libelle ?? '',
        inscrits,
        vot1,
        vot2,
        deltaVotants: vot2 - vot1,
        deltaPts: pct2 - pct1,
      };
    });
  }, [isBureau, electionState.tourActuel, bureaux, resultatsT1, resultatsT2]);

  const adminExtremes = useMemo(() => {
    if (isBureau) return null;
    const rows = bureauxStats;
    if (!rows || rows.length === 0) return null;

    const byMax = (key) => rows.reduce((best, r) => (best === null || (r[key] ?? -Infinity) > (best[key] ?? -Infinity) ? r : best), null);
    const byMin = (key) => rows.reduce((best, r) => (best === null || (r[key] ?? Infinity) < (best[key] ?? Infinity) ? r : best), null);

    const plusPart = byMax('participationPct');
    const moinsPart = byMin('participationPct');

    const plusAbs = byMax('abstentionPct');
    const moinsAbs = byMin('abstentionPct');

    const plusNuls = byMax('nulsPct');
    const moinsNuls = byMin('nulsPct');

    const plusBlancs = byMax('blancs');
    const moinsBlancs = byMin('blancs');

    let progMax = null;
    let progMin = null;
    if (electionState.tourActuel === 2 && Array.isArray(bureauxProgressionT1T2) && bureauxProgressionT1T2.length > 0) {
      progMax = bureauxProgressionT1T2.reduce((best, r) => (best === null || (r.deltaVotants ?? -Infinity) > (best.deltaVotants ?? -Infinity) ? r : best), null);
      progMin = bureauxProgressionT1T2.reduce((best, r) => (best === null || (r.deltaVotants ?? Infinity) < (best.deltaVotants ?? Infinity) ? r : best), null);
    }

    return { plusPart, moinsPart, plusAbs, moinsAbs, plusNuls, moinsNuls, plusBlancs, moinsBlancs, progMax, progMin };
  }, [isBureau, bureauxStats, bureauxProgressionT1T2, electionState.tourActuel]);
  const top1 = classementCandidats[0];
  const top2 = classementCandidats[1];

  const ecartVoix = useMemo(() => {
    if (!top1 || !top2) return null;
    return (Number(top1.totalVoix) || 0) - (Number(top2.totalVoix) || 0);
  }, [top1, top2]);

  const ecartLabel = useMemo(() => {
    if (!top1 || !top2) return 'N/A';
    return `${getCandidateDisplayName(top1)} vs ${getCandidateDisplayName(top2)}`;
  }, [top1, top2]);

  return (
    <div className="resultats-consolidation">

      <style>{`
        /* ===== RésultatsConsolidation — ajouts UI (scopés) ===== */
        .resultats-consolidation .stats-grid-3 {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
          margin-bottom: 14px;
        }
        .resultats-consolidation .stats-grid-1 {
          display: grid;
          grid-template-columns: 1fr;
          gap: 14px;
        }
        .resultats-consolidation .stats-card {
          padding: 20px 24px;
          border-radius: 18px;
          box-shadow: 0 10px 18px rgba(2, 6, 23, 0.08);
        }
        .resultats-consolidation .stats-card-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.95rem;
          font-weight: 800;
          color: rgba(15, 23, 42, 0.7);
          margin-bottom: 12px;
        }
        .resultats-consolidation .stats-card-value {
          font-size: 2.2rem;
          font-weight: 900;
          color: #0f172a;
          line-height: 1;
        }
        .resultats-consolidation .stats-card-meta {
          margin-top: 8px;
          font-size: 0.95rem;
          font-weight: 700;
          color: rgba(15, 23, 42, 0.6);
        }

        /* Responsive: passage en 1 colonne sur mobile */
        @media (max-width: 900px) {
          .resultats-consolidation .stats-grid-3 {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div style={{ marginTop: 22 }}>
        {/* Titre principal */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>
                🏛️ Consolidation {isBureau ? 'du bureau' : 'communale'} - Tour {electionState.tourActuel}
              </div>
            </div>
            {isBureau && (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 999,
                fontWeight: 800,
                background: 'rgba(59, 130, 246, 0.10)',
                border: '1px solid rgba(59, 130, 246, 0.30)',
                color: '#0f172a',
                fontSize: '0.85rem'
              }}>
                📊 Bureau BV{bureauId}
              </div>
            )}
          </div>
        </div>
        {(isBureau && electionState.tourActuel === 2) ? (
          <>
            {/* ===== BV — Tour 2 : 6 blocs (2 lignes) ===== */}
            <div className="stats-grid-3">
          {/* Inscrits */}
          <div className="stats-card" style={{
            border: '2px solid rgba(34, 197, 94, 0.55)',
            background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.11) 0%, rgba(134, 239, 172, 0.07) 100%)'
          }}>
            <div className="stats-card-label">
              📋 Inscrits {isBureau ? '(votre bureau)' : ''}
            </div>
            <div className="stats-card-value">
              {(Number(totaux.inscrits) || 0).toLocaleString('fr-FR')}
            </div>
            {isBureau && (
              <div className="stats-card-meta" style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                Contexte communal : {(Number(totauxCommunaux.inscrits) || 0).toLocaleString('fr-FR')} inscrits ({nbBureaux} bureaux)
              </div>
            )}
            {!isBureau && (
              <div className="stats-card-meta">
                {nbBureaux} bureau{nbBureaux > 1 ? 'x' : ''}
              </div>
            )}
          </div>

          {/* Participation */}
          <div className="stats-card" style={{
            border: '2px solid rgba(59, 130, 246, 0.55)',
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.11) 0%, rgba(147, 197, 253, 0.07) 100%)'
          }}>
            <div className="stats-card-label">
              ✅ Participation {isBureau ? '(votre bureau)' : ''}
            </div>
            <div className="stats-card-value">
              {clampPct(tauxParticipation).toFixed(2)}%
            </div>
            <div className="stats-card-meta">
              {(Number(totaux.votants) || 0).toLocaleString('fr-FR')} / {(Number(totaux.inscrits) || 0).toLocaleString('fr-FR')}
            </div>
          </div>

          {/* Écart 1er/2ème */}
          <div className="stats-card" style={{
            border: '2px solid rgba(168, 85, 247, 0.55)',
            background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.11) 0%, rgba(192, 132, 252, 0.07) 100%)'
          }}>
            <div className="stats-card-label">
              📈 Écart entre liste 1 et 2
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
              <div className="stats-card-value">
                {ecartVoix !== null ? ecartVoix.toLocaleString('fr-FR') : 'N/A'} voix
              </div>
              <div className="stats-card-meta" style={{ fontSize: '1.1rem' }}>
                {ecartLabel}
              </div>
            </div>
          </div>
            </div>

            <div className="stats-grid-3">
          {/* Taux de blancs */}
          <div className="stats-card" style={{
            border: '2px solid rgba(148, 163, 184, 0.55)',
            background: 'linear-gradient(135deg, rgba(148, 163, 184, 0.11) 0%, rgba(203, 213, 225, 0.07) 100%)'
          }}>
            <div className="stats-card-label">
              📄 Taux de blancs
            </div>
            <div className="stats-card-value">
              {clampPct(tauxBlancs).toFixed(2)}%
            </div>
            <div className="stats-card-meta">
              {(Number(totaux.blancs) || 0).toLocaleString('fr-FR')} / {(Number(totaux.votants) || 0).toLocaleString('fr-FR')}
            </div>
          </div>

          {/* Taux de nuls */}
          <div className="stats-card" style={{
            border: '2px solid rgba(239, 68, 68, 0.55)',
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.11) 0%, rgba(248, 113, 113, 0.07) 100%)'
          }}>
            <div className="stats-card-label">
              🚫 Taux de nuls
            </div>
            <div className="stats-card-value">
              {clampPct(tauxNuls).toFixed(2)}%
            </div>
            <div className="stats-card-meta">
              {(Number(totaux.nuls) || 0).toLocaleString('fr-FR')} / {(Number(totaux.votants) || 0).toLocaleString('fr-FR')}
            </div>
          </div>
          {/* Abstentions */}
          <div className="stats-card" style={{
            border: '2px solid rgba(249, 115, 22, 0.55)',
            background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.11) 0%, rgba(251, 146, 60, 0.07) 100%)'
          }}>
            <div className="stats-card-label">
              ❌ Abstentions
            </div>
            <div className="stats-card-value">
              {totalAbstentions.toLocaleString('fr-FR')}
            </div>
            <div className="stats-card-meta">
              {clampPct(100 - tauxParticipation).toFixed(2)}%
            </div>
          </div>
            </div>
          </>
        ) : (
          <>


        {/* ===== Première ligne : 3 blocs ===== */}
        <div className="stats-grid-3">
          {/* Inscrits */}
          <div className="stats-card" style={{
            border: '2px solid rgba(34, 197, 94, 0.55)',
            background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.11) 0%, rgba(134, 239, 172, 0.07) 100%)'
          }}>
            <div className="stats-card-label">
              📋 Inscrits {isBureau ? '(votre bureau)' : ''}
            </div>
            <div className="stats-card-value">
              {(Number(totaux.inscrits) || 0).toLocaleString('fr-FR')}
            </div>
            {isBureau && (
              <div className="stats-card-meta" style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                Contexte communal : {(Number(totauxCommunaux.inscrits) || 0).toLocaleString('fr-FR')} inscrits ({nbBureaux} bureaux)
              </div>
            )}
            {!isBureau && (
              <div className="stats-card-meta">
                {nbBureaux} bureau{nbBureaux > 1 ? 'x' : ''}
              </div>
            )}
          </div>

          {/* Participation */}
          <div className="stats-card" style={{
            border: '2px solid rgba(59, 130, 246, 0.55)',
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.11) 0%, rgba(147, 197, 253, 0.07) 100%)'
          }}>
            <div className="stats-card-label">
              ✅ Participation {isBureau ? '(votre bureau)' : ''}
            </div>
            <div className="stats-card-value">
              {clampPct(tauxParticipation).toFixed(2)}%
            </div>
            <div className="stats-card-meta">
              {(Number(totaux.votants) || 0).toLocaleString('fr-FR')} / {(Number(totaux.inscrits) || 0).toLocaleString('fr-FR')}
            </div>
          </div>

          {/* Abstentions */}
          <div className="stats-card" style={{
            border: '2px solid rgba(249, 115, 22, 0.55)',
            background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.11) 0%, rgba(251, 146, 60, 0.07) 100%)'
          }}>
            <div className="stats-card-label">
              ❌ Abstentions
            </div>
            <div className="stats-card-value">
              {totalAbstentions.toLocaleString('fr-FR')}
            </div>
            <div className="stats-card-meta">
              {clampPct(100 - tauxParticipation).toFixed(2)}%
            </div>
          </div>
        </div>

        {/* ===== Deuxième ligne : 3 blocs (MODIFIÉ) ===== */}
        <div className="stats-grid-3">
          
          {/* LOGIQUE CONDITIONNELLE : Si Bureau -> Écart, Sinon -> Bureaux déclarés */}
          {isBureau ? (
             /* Bloc Écart (Format carré pour s'intégrer) */
             <div className="stats-card" style={{
               border: '2px solid rgba(168, 85, 247, 0.55)',
               background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.11) 0%, rgba(192, 132, 252, 0.07) 100%)'
             }}>
               <div className="stats-card-label">
                 📈 Écart liste 1 / 2
               </div>
               <div className="stats-card-value">
                 {ecartVoix !== null ? ecartVoix.toLocaleString('fr-FR') : 'N/A'}
               </div>
               <div className="stats-card-meta" style={{ fontSize: '0.85rem', lineHeight: 1.2 }}>
                 {ecartLabel}
               </div>
             </div>
          ) : (
             /* Bloc Bureaux déclarés (Considéré comme admin ou global) */
             <div className="stats-card" style={{
               border: '2px solid rgba(34, 197, 94, 0.55)',
               background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.11) 0%, rgba(134, 239, 172, 0.07) 100%)'
             }}>
               <div className="stats-card-label">
                 📊 Bureaux déclarés
               </div>
               <div className="stats-card-value">
                 {nbBureauxDeclares} / {nbBureaux}
               </div>
               <div className="stats-card-meta">
                 {nbBureaux > 0 ? ((nbBureauxDeclares / nbBureaux) * 100).toFixed(0) : 0}%
               </div>
             </div>
          )}

          {/* Taux de blancs */}
          <div className="stats-card" style={{
            border: '2px solid rgba(148, 163, 184, 0.55)',
            background: 'linear-gradient(135deg, rgba(148, 163, 184, 0.11) 0%, rgba(203, 213, 225, 0.07) 100%)'
          }}>
            <div className="stats-card-label">
              📄 Taux de blancs
            </div>
            <div className="stats-card-value">
              {clampPct(tauxBlancs).toFixed(2)}%
            </div>
            <div className="stats-card-meta">
              {(Number(totaux.blancs) || 0).toLocaleString('fr-FR')} / {(Number(totaux.votants) || 0).toLocaleString('fr-FR')}
            </div>
          </div>

          {/* Taux de nuls */}
          <div className="stats-card" style={{
            border: '2px solid rgba(239, 68, 68, 0.55)',
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.11) 0%, rgba(248, 113, 113, 0.07) 100%)'
          }}>
            <div className="stats-card-label">
              🚫 Taux de nuls
            </div>
            <div className="stats-card-value">
              {clampPct(tauxNuls).toFixed(2)}%
            </div>
            <div className="stats-card-meta">
              {(Number(totaux.nuls) || 0).toLocaleString('fr-FR')} / {(Number(totaux.votants) || 0).toLocaleString('fr-FR')}
            </div>
          </div>
        </div>

        {/* ===== Troisième ligne : 1 bloc pleine largeur (Masqué pour BV qui l'a déjà au dessus) ===== */}
        {!isBureau && (
          <div className="stats-grid-1">
            {/* Écart 1er/2ème (Format large) */}
            <div className="stats-card" style={{
              border: '2px solid rgba(168, 85, 247, 0.55)',
              background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.11) 0%, rgba(192, 132, 252, 0.07) 100%)'
            }}>
              <div className="stats-card-label">
                📈 Écart entre liste 1 et 2
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
                <div className="stats-card-value">
                  {ecartVoix !== null ? ecartVoix.toLocaleString('fr-FR') : 'N/A'} voix
                </div>
                <div className="stats-card-meta" style={{ fontSize: '1.1rem' }}>
                  {ecartLabel}
                </div>
              </div>
            </div>
          </div>
        )}

        
          </>
        )}

        
        {/* ===== ADMIN uniquement : blocs statistiques (2 par ligne) ===== */}
        {!isBureau && adminExtremes && (
          <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
            {/* Ligne 3 : Participation */}
            <div className="stats-card" style={{ border: '2px solid rgba(59,130,246,0.10)', background: 'linear-gradient(135deg, rgba(59,130,246,0.55) 0%, rgba(147,197,253,0.08) 100%)' }}>
              <div className="stats-card-label">📈 Bureau avec la plus forte participation</div>
              <div className="stats-card-value" style={{ fontSize: '0.90rem' }}>{adminExtremes.plusPart?.label || '—'}</div>
              <div className="stats-card-meta">
                {(adminExtremes.plusPart?.votants ?? 0).toLocaleString('fr-FR')} votants • {clampPct(adminExtremes.plusPart?.participationPct ?? 0).toFixed(2)}%
              </div>
            </div>

            <div className="stats-card" style={{ border: '2px solid rgba(99,102,241,0.55)', background: 'linear-gradient(135deg, rgba(99,102,241,0.05) 100%, rgba(199,210,254,0.08) 0%)' }}>
              <div className="stats-card-label">📉 Bureau avec la moins forte participation</div>
              <div className="stats-card-value" style={{ fontSize: '0.90rem' }}>{adminExtremes.moinsPart?.label || '—'}</div>
              <div className="stats-card-meta">
                {(adminExtremes.moinsPart?.votants ?? 0).toLocaleString('fr-FR')} votants • {clampPct(adminExtremes.moinsPart?.participationPct ?? 0).toFixed(2)}%
              </div>
            </div>

            {/* Ligne 4 : Abstention */}
            <div className="stats-card" style={{ border: '2px solid rgba(244,63,94,0.55)', background: 'linear-gradient(135deg, rgba(244,63,94,0.10) 0%, rgba(254,205,211,0.08) 100%)' }}>
              <div className="stats-card-label">🚫 Bureau avec la plus forte abstention</div>
              <div className="stats-card-value" style={{ fontSize: '0.90rem' }}>{adminExtremes.plusAbs?.label || '—'}</div>
              <div className="stats-card-meta">
                {(adminExtremes.plusAbs?.abstentions ?? 0).toLocaleString('fr-FR')} • {clampPct(adminExtremes.plusAbs?.abstentionPct ?? 0).toFixed(2)}%
              </div>
            </div>

            <div className="stats-card" style={{ border: '2px solid rgba(16,185,129,0.55)', background: 'linear-gradient(135deg, rgba(16,185,129,0.10) 0%, rgba(167,243,208,0.08) 100%)' }}>
              <div className="stats-card-label">✅ Bureau avec la moins forte abstention</div>
              <div className="stats-card-value" style={{ fontSize: '0.90rem' }}>{adminExtremes.moinsAbs?.label || '—'}</div>
              <div className="stats-card-meta">
                {(adminExtremes.moinsAbs?.abstentions ?? 0).toLocaleString('fr-FR')} • {clampPct(adminExtremes.moinsAbs?.abstentionPct ?? 0).toFixed(2)}%
              </div>
            </div>

            {/* Ligne 5 : Nuls */}
            <div className="stats-card" style={{ border: '2px solid rgba(234,179,8,0.55)', background: 'linear-gradient(135deg, rgba(234,179,8,0.10) 0%, rgba(253,230,138,0.10) 100%)' }}>
              <div className="stats-card-label">⚫⬆️ Bureau avec le taux de nuls le plus élevé</div>
              <div className="stats-card-value" style={{ fontSize: '0.90rem' }}>{adminExtremes.plusNuls?.label || '—'}</div>
              <div className="stats-card-meta">
                {(adminExtremes.plusNuls?.nuls ?? 0).toLocaleString('fr-FR')} • {clampPct(adminExtremes.plusNuls?.nulsPct ?? 0).toFixed(2)}%
              </div>
            </div>

            <div className="stats-card" style={{ border: '2px solid rgba(148,163,184,0.65)', background: 'linear-gradient(135deg, rgba(148,163,184,0.14) 0%, rgba(226,232,240,0.10) 100%)' }}>
              <div className="stats-card-label">⚫⬇️ Bureau avec le taux de nuls le moins élevé</div>
              <div className="stats-card-value" style={{ fontSize: '0.90rem' }}>{adminExtremes.moinsNuls?.label || '—'}</div>
              <div className="stats-card-meta">
                {(adminExtremes.moinsNuls?.nuls ?? 0).toLocaleString('fr-FR')} • {clampPct(adminExtremes.moinsNuls?.nulsPct ?? 0).toFixed(2)}%
              </div>
            </div>

            {/* Ligne 6 : Blancs */}
            <div className="stats-card" style={{ border: '2px solid rgba(147,51,234,0.95)', background: 'linear-gradient(135deg, rgba(147,51,234,0.30) 0%, rgba(233,213,255,0.10) 100%)' }}>
              <div className="stats-card-label">⬜ Bureau avec le plus de bulletins blancs</div>
              <div className="stats-card-value" style={{ fontSize: '0.90rem' }}>{adminExtremes.plusBlancs?.label || '—'}</div>
              <div className="stats-card-meta">
                {(adminExtremes.plusBlancs?.blancs ?? 0).toLocaleString('fr-FR')} • {clampPct(adminExtremes.plusBlancs?.blancsPct ?? 0).toFixed(2)}%
              </div>
            </div>

            <div className="stats-card" style={{ border: '2px solid rgba(55,55,55,5.85)', background: 'linear-gradient(135deg, rgba(203,213,225,0.68) 100%, rgba(155,245,249,0.72) 0%)' }}>
              <div className="stats-card-label">⚪ Bureau avec le moins de bulletins blancs</div>
              <div className="stats-card-value" style={{ fontSize: '0.90rem' }}>{adminExtremes.moinsBlancs?.label || '—'}</div>
              <div className="stats-card-meta">
                {(adminExtremes.moinsBlancs?.blancs ?? 0).toLocaleString('fr-FR')} • {clampPct(adminExtremes.moinsBlancs?.blancsPct ?? 0).toFixed(2)}%
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default ResultatsConsolidation;