import React, { useEffect, useMemo, useState } from 'react';
import { useGoogleSheets } from '../../hooks/useGoogleSheets';

// Normalisation robuste des booléens venant de Google Sheets (TRUE/VRAI/OUI/1/X/✓...)
const parseBool = (v) => {
  if (v === true || v === 1) return true;
  if (v === false || v === 0 || v == null) return false;
  const s = String(v).trim().toLowerCase();
  return ['true','vrai','oui','yes','1','x','✓','y','on'].includes(s);
};


/**
 * Statistiques temps réel de la participation
 *
 * Correctifs critiques (lecture / affichage uniquement) :
 * - Gestion des heures non renseignées : si une heure vaut 0 après des valeurs >0, on "propage" la dernière valeur connue
 *   (cas typique : saisie en cours, BV1 à 16h=523 et 17h/18h/19h/20h encore à 0).
 * - Cela évite les absurdités : "0 votants à 20h" et "abstention = inscrits" alors qu'il y a déjà des votants.
 */
const ParticipationStats = ({ electionState, isBureauVote = false }) => {
  // Bureaux
  const { data: bureaux, load: loadBureaux } = useGoogleSheets('Bureaux');

  // Participation (tour 1 / 2)
  const {
    data: participation,
    load: loadParticipation
  } = useGoogleSheets(electionState.tourActuel === 1 ? 'Participation_T1' : 'Participation_T2');

  // Résultats (optionnel pour % blancs / nuls)
  const {
    data: resultats,
    load: loadResultats
  } = useGoogleSheets(electionState.tourActuel === 1 ? 'Resultats_T1' : 'Resultats_T2');

  const heures = useMemo(() => (
    ['09h', '10h', '11h', '12h', '13h', '14h', '15h', '16h', '17h', '18h', '19h', '20h']
  ), []);

  const getNum = (v) => {
    if (v == null) return 0;
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;

    // Google Sheets peut renvoyer des chaînes avec espaces/nbsp/narrow-nbsp, etc.
    const s = String(v)
      .trim()
      .replace(/[\s\u00A0\u202F]/g, '')
      .replace(',', '.')
      .replace(/[^0-9.\-]/g, '');

    if (s === '' || s === '-' || s === '.' || s === '-.') return 0;
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };

  /**
   * Renvoie la valeur cumulée "fiable" à une heure donnée :
   * - si l'heure est à 0 mais qu'il y a eu des valeurs >0 avant, on considère que c'est "non renseigné" et on garde
   *   la dernière valeur connue (monotonicité).
   */
  const getCumulSafe = (p, heure) => {
    const idx = heures.indexOf(heure);
    if (idx < 0) return 0;

    let last = 0;
    for (let i = 0; i <= idx; i++) {
      const h = heures[i];
      const v = getNum(p?.[`votants${h}`]);
      if (v > 0) last = v;
    }
    // Si aucune valeur >0 avant, on garde la valeur brute (souvent 0 le matin si pas commencé)
    const brute = getNum(p?.[`votants${heure}`]);
    return (brute === 0 && last > 0) ? last : brute;
  };

  /**
   * Votants "fin de journée" :
   * - si votants20h est >0 : on le prend
   * - sinon : on prend la dernière valeur cumulée connue (propagée)
   */
  const getVotantsFinJournee = (p) => {
    const direct = getNum(p?.votants20h ?? p?.votants20H ?? p?.votants20 ?? p?.Votants20h ?? p?.Votants20H);
    if (direct > 0) return direct;

    // Dernière valeur connue sur la grille horaire
    let last = 0;
    for (const h of heures) {
      const v = getCumulSafe(p, h);
      if (v > last) last = v;
    }
    return last;
  };

  const [stats, setStats] = useState({
    totalInscrits: 0,
    totalVotants: 0,
    tauxParticipation: 0,
    evolution: [],
    bureauMax: null,
    bureauMin: null,
    pctBlancs: null,
    pctNuls: null
  });

  useEffect(() => {
    loadBureaux();
    loadParticipation();
    loadResultats();
  }, [loadBureaux, loadParticipation, loadResultats]);

  useEffect(() => {
    if (!Array.isArray(participation) || participation.length === 0) return;

    // Totaux
    const totalInscrits = participation.reduce((sum, p) => sum + getNum(p.inscrits), 0);
    const totalVotants = participation.reduce((sum, p) => sum + getVotantsFinJournee(p), 0);
    const tauxParticipation = totalInscrits > 0 ? (totalVotants / totalInscrits) * 100 : 0;

    // % Blancs / Nuls (best-effort)
    const hasBlancs = Array.isArray(resultats) && resultats.some(r => r?.blancs != null || r?.Blancs != null);
    const hasNuls = Array.isArray(resultats) && resultats.some(r => r?.nuls != null || r?.Nuls != null);

    const totalBlancs = hasBlancs
      ? resultats.reduce((sum, r) => sum + getNum(r.blancs ?? r.Blancs), 0)
      : null;

    const totalNuls = hasNuls
      ? resultats.reduce((sum, r) => sum + getNum(r.nuls ?? r.Nuls), 0)
      : null;

    const pctBlancs = (totalBlancs != null && totalVotants > 0) ? (totalBlancs / totalVotants) * 100 : null;
    const pctNuls = (totalNuls != null && totalVotants > 0) ? (totalNuls / totalVotants) * 100 : null;

    // Évolution communale par heure (cumul propagé)
    const evolution = heures.map(heure => {
      const votants = participation.reduce((sum, p) => sum + getCumulSafe(p, heure), 0);
      return {
        heure,
        votants,
        taux: totalInscrits > 0 ? (votants / totalInscrits) * 100 : 0
      };
    });

    // Bureaux max/min (taux fin de journée)
    const bureauxAvecTaux = participation
      .map(p => {
        const bureau = Array.isArray(bureaux) ? bureaux.find(b => b.id === p.bureauId) : null;
        const inscrits = getNum(p.inscrits);
        const votants = getVotantsFinJournee(p);
        return {
          bureauId: p.bureauId,
          bureauNom: bureau?.nom || p.bureauId,
          inscrits,
          votants,
          taux: (inscrits > 0) ? (votants / inscrits) * 100 : 0
        };
      })
      .filter(b => b.inscrits > 0);

    const bureauMax = bureauxAvecTaux.reduce((max, b) =>
      b.taux > (max?.taux || 0) ? b : max, null);

    const bureauMin = bureauxAvecTaux.reduce((min, b) =>
      b.taux < (min?.taux ?? 100) ? b : min, null);

    setStats({
      totalInscrits,
      totalVotants,
      tauxParticipation,
      evolution,
      bureauMax,
      bureauMin,
      pctBlancs,
      pctNuls
    });
  }, [participation, bureaux, resultats, heures]);

  // ---------- Chiffres clés ----------
  const chiffresCles = useMemo(() => {
    if (!Array.isArray(participation) || participation.length === 0) return null;

    const bureauNameById = new Map((Array.isArray(bureaux) ? bureaux : []).map(b => [b.id, b.nom]));
    const bureauLabel = (bureauId) => bureauNameById.get(bureauId) || bureauId || '—';

    // Plus forte / plus faible progression par bureau (delta entre 2 heures)
    let maxProg = { delta: -1, bureauId: null, heureDebut: null, heureFin: null };
    let minProg = { delta: Infinity, bureauId: null, heureDebut: null, heureFin: null };

    // Plus forte abstention (inscrits - votants fin de journée)
    let maxAbst = { abst: -1, bureauId: null, inscrits: 0, votants: 0 };

    // % votants max/min (fin de journée)
    let maxTaux = { taux: -1, bureauId: null, inscrits: 0, votants: 0 };
    let minTaux = { taux: Infinity, bureauId: null, inscrits: 0, votants: 0 };

    for (const p of participation) {
      const bureauId = p.bureauId;
      const inscrits = getNum(p.inscrits);
      const votantsFin = getVotantsFinJournee(p);

      const abst = Math.max(0, inscrits - votantsFin);
      if (abst > maxAbst.abst) maxAbst = { abst, bureauId, inscrits, votants: votantsFin };

      const taux = inscrits > 0 ? (votantsFin / inscrits) * 100 : 0;
      if (inscrits > 0 && taux > maxTaux.taux) maxTaux = { taux, bureauId, inscrits, votants: votantsFin };
      if (inscrits > 0 && taux < minTaux.taux) minTaux = { taux, bureauId, inscrits, votants: votantsFin };

      for (let i = 1; i < heures.length; i++) {
        const h0 = heures[i - 1];
        const h1 = heures[i];
        const d = getCumulSafe(p, h1) - getCumulSafe(p, h0);

        if (d > maxProg.delta) maxProg = { delta: d, bureauId, heureDebut: h0, heureFin: h1 };
        if (d > 0 && d < minProg.delta) minProg = { delta: d, bureauId, heureDebut: h0, heureFin: h1 };
      }
    }

    if (!Number.isFinite(minProg.delta)) {
      minProg = { delta: 0, bureauId: maxProg.bureauId, heureDebut: maxProg.heureDebut, heureFin: maxProg.heureFin };
    }

    // Heure communale la plus chargée / la plus calme (delta)
    const cumulByHeure = new Map();
    for (const h of heures) {
      const total = participation.reduce((sum, p) => sum + getCumulSafe(p, h), 0);
      cumulByHeure.set(h, total);
    }

    let maxHeure = { delta: -1, heureDebut: null, heureFin: null };
    let minHeure = { delta: Infinity, heureDebut: null, heureFin: null };

    for (let i = 1; i < heures.length; i++) {
      const h0 = heures[i - 1];
      const h1 = heures[i];
      const d = (cumulByHeure.get(h1) || 0) - (cumulByHeure.get(h0) || 0);

      if (d > maxHeure.delta) maxHeure = { delta: d, heureDebut: h0, heureFin: h1 };
      if (d >= 0 && d < minHeure.delta) minHeure = { delta: d, heureDebut: h0, heureFin: h1 };
    }

    return {
      maxProg: { ...maxProg, bureauLabel: maxProg.bureauId ? bureauLabel(maxProg.bureauId) : '—' },
      minProg: { ...minProg, bureauLabel: minProg.bureauId ? bureauLabel(minProg.bureauId) : '—' },
      maxAbst: { ...maxAbst, bureauLabel: maxAbst.bureauId ? bureauLabel(maxAbst.bureauId) : '—' },
      maxTaux: { ...maxTaux, bureauLabel: maxTaux.bureauId ? bureauLabel(maxTaux.bureauId) : '—' },
      minTaux: { ...minTaux, bureauLabel: minTaux.bureauId ? bureauLabel(minTaux.bureauId) : '—' },
      heuresChargees: { maxHeure, minHeure }
    };
  }, [participation, bureaux, heures]);

  // Progression moyenne communale (points de % par heure) — profil ADMIN
  const progressionMoyennePctParHeure = useMemo(() => {
    const evo = stats?.evolution;
    if (!Array.isArray(evo) || evo.length < 2) return null;

    const first = Number(evo[0]?.taux ?? 0);
    const last = Number(evo[evo.length - 1]?.taux ?? 0);
    const intervals = Math.max(1, evo.length - 1);

    const avg = (last - first) / intervals;
    return Number.isFinite(avg) ? avg : null;
  }, [stats]);


  return (
    <div className="participation-stats">
      <h3>📈 Statistiques de participation <br /> Tour {electionState.tourActuel}</h3>

      {/* Chiffres clés (KPI) */}
      <div className="stats-grid">
        <div className="stat-card stat-card--inscrits">
          <div className="stat-value">{stats.totalInscrits.toLocaleString('fr-FR')}</div>
          <div className="stat-label">Inscrits</div>
        </div>

        <div className="stat-card stat-card--votants">
          <div className="stat-value">{stats.totalVotants.toLocaleString('fr-FR')}</div>
          <div className="stat-label">Votants (dernier état)</div>
        </div>

        <div className="stat-card stat-card--taux highlight">
          <div className="stat-value">{stats.tauxParticipation.toFixed(2)}%</div>
          <div className="stat-label">Taux de participation</div>
        </div>

        <div className="stat-card stat-card--abstentions">
          <div className="stat-value">
            {progressionMoyennePctParHeure != null
              ? `${progressionMoyennePctParHeure.toFixed(2)}%`
              : '—'}
          </div>
          <div className="stat-label">Progression moy./heure</div>
        </div>
      </div>

      {/* Évolution horaire */}
      <div className="evolution-section">
        <h3>⏱️ Évolution horaire</h3>
        <div className="evolution-chart">
          {stats.evolution.map((point) => (
            <div key={point.heure} className="chart-bar">
              <div className="bar-track">
                <div
                  className="bar"
                  style={{
                    height: `${point.taux}%`,
                    backgroundColor: `hsl(${120 - point.taux}, 70%, 50%)`
                  }}
                >
                  <span className="bar-value">{point.taux.toFixed(1)}%</span>
                </div>
              </div>
              <div className="bar-label">{point.heure}</div>
              <div className="bar-votants">{point.votants.toLocaleString('fr-FR')}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Bureaux extrêmes (max/min taux) — masqué */}
      {false && (
      <div className="extremes-section">
        <h3>🎯 Bureaux extrêmes</h3>

        <div className="extremes-table" role="table" aria-label="Participation maximale et minimale">
          <div className="extremes-row max" role="row">
            <div className="extremes-type" role="cell">
              🏆 <span>Max</span>
            </div>

            <div className="extremes-bureau" role="cell">
              <div className="bureau-name">{stats.bureauMax?.bureauNom || '—'}</div>
              <div className="bureau-details">
                {stats.bureauMax
                  ? `${stats.bureauMax.votants.toLocaleString('fr-FR')} votants / ${stats.bureauMax.inscrits.toLocaleString('fr-FR')} inscrits`
                  : 'Aucune donnée'}
              </div>
            </div>

            <div className="extremes-metric" role="cell">
              <div className="meter" aria-hidden="true">
                <div
                  className="meter-fill"
                  style={{ width: `${Math.min(100, Math.max(0, stats.bureauMax?.taux || 0))}%` }}
                />
              </div>
              <div className="meter-value">{(stats.bureauMax?.taux || 0).toFixed(2)}%</div>
            </div>
          </div>

          <div className="extremes-row min" role="row">
            <div className="extremes-type" role="cell">
              📉 <span>Min</span>
            </div>

            <div className="extremes-bureau" role="cell">
              <div className="bureau-name">{stats.bureauMin?.bureauNom || '—'}</div>
              <div className="bureau-details">
                {stats.bureauMin
                  ? `${stats.bureauMin.votants.toLocaleString('fr-FR')} votants / ${stats.bureauMin.inscrits.toLocaleString('fr-FR')} inscrits`
                  : 'Aucune donnée'}
              </div>
            </div>

            <div className="extremes-metric" role="cell">
              <div className="meter" aria-hidden="true">
                <div
                  className="meter-fill"
                  style={{ width: `${Math.min(100, Math.max(0, stats.bureauMin?.taux || 0))}%` }}
                />
              </div>
              <div className="meter-value">{(stats.bureauMin?.taux || 0).toFixed(2)}%</div>
            </div>
          </div>
        </div>
      </div>

      )}

      {/* Chiffres clés (Insights renommés) */}
      <div className="analysis-section">
        <h3>📌 Chiffres clés</h3>

        {!chiffresCles ? (
          <div className="metric-card">
            <div className="metric-value">Aucune donnée disponible.</div>
          </div>
        ) : (
          <div className="analysis-diagrams">
            <div className="metric-card">
              <div className="metric-head">
                <span className="metric-emoji">🚀</span>
                <span className="metric-title">Plus forte progression (votants)</span>
              </div>
              <div className="metric-value">
                {!isBureauVote && <>{chiffresCles.maxProg.bureauLabel} — </>}{chiffresCles.maxProg.heureDebut}→{chiffresCles.maxProg.heureFin} :
                <strong> +{chiffresCles.maxProg.delta.toLocaleString('fr-FR')}</strong>
              </div>
              <div className="mini-bar" aria-hidden="true"><div className="mini-bar-fill" style={{ width: `${Math.min(100, Math.max(0, chiffresCles.maxProg.delta > 0 ? 100 : 0))}%` }} /></div>
            </div>

            <div className="metric-card">
              <div className="metric-head">
                <span className="metric-emoji">🐢</span>
                <span className="metric-title">Moins forte progression (votants)</span>
              </div>
              <div className="metric-value">
                {!isBureauVote && <>{chiffresCles.minProg.bureauLabel} — </>}{chiffresCles.minProg.heureDebut}→{chiffresCles.minProg.heureFin} :
                <strong> +{chiffresCles.minProg.delta.toLocaleString('fr-FR')}</strong>
              </div>
              <div className="mini-bar" aria-hidden="true"><div className="mini-bar-fill" style={{ width: `${Math.min(100, Math.max(0, chiffresCles.maxProg.delta > 0 ? (chiffresCles.minProg.delta / chiffresCles.maxProg.delta) * 100 : 0))}%` }} /></div>
            </div>


{/* Tuile Progression moyenne déplacée dans le bloc KPI en remplacement des Abstentions */}

            {false && (
<div className="metric-card">
              <div className="metric-head">
                <span className="metric-emoji">🧍‍♂️</span>
                <span className="metric-title">Plus forte abstention</span>
              </div>
              <div className="metric-value">
                {chiffresCles.maxAbst.bureauLabel} :
                <strong> {chiffresCles.maxAbst.abst.toLocaleString('fr-FR')} abstentions</strong>
                {chiffresCles.maxAbst.inscrits > 0 ? ` (sur ${chiffresCles.maxAbst.inscrits.toLocaleString('fr-FR')} inscrits)` : ''}
              </div>
              <div className="mini-bar" aria-hidden="true"><div className="mini-bar-fill" style={{ width: `${Math.min(100, Math.max(0, chiffresCles.maxAbst.inscrits > 0 ? (chiffresCles.maxAbst.abst / chiffresCles.maxAbst.inscrits) * 100 : 0))}%` }} /></div>
            </div>
            )}

            {false && (
<div className="metric-card">
              <div className="metric-head">
                <span className="metric-emoji">🏅</span>
                <span className="metric-title">% votants le plus élevé</span>
              </div>
              <div className="metric-value">
                {chiffresCles.maxTaux.bureauLabel} :
                <strong> {chiffresCles.maxTaux.taux.toFixed(2)}%</strong>
                {' '}({chiffresCles.maxTaux.votants.toLocaleString('fr-FR')} / {chiffresCles.maxTaux.inscrits.toLocaleString('fr-FR')})
              </div>
              <div className="mini-bar" aria-hidden="true"><div className="mini-bar-fill" style={{ width: `${Math.min(100, Math.max(0, chiffresCles.maxTaux.taux))}%` }} /></div>
            </div>
            )}

            {false && (
<div className="metric-card">
              <div className="metric-head">
                <span className="metric-emoji">🧊</span>
                <span className="metric-title">% votants le plus faible</span>
              </div>
              <div className="metric-value">
                {chiffresCles.minTaux.bureauLabel} :
                <strong> {chiffresCles.minTaux.taux.toFixed(2)}%</strong>
                {' '}({chiffresCles.minTaux.votants.toLocaleString('fr-FR')} / {chiffresCles.minTaux.inscrits.toLocaleString('fr-FR')})
              </div>
              <div className="mini-bar" aria-hidden="true"><div className="mini-bar-fill" style={{ width: `${Math.min(100, Math.max(0, chiffresCles.minTaux.taux))}%` }} /></div>
            </div>
            )}


          </div>
        )}
      </div>
    </div>
  );
};

export default ParticipationStats;