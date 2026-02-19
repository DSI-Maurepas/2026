import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useGoogleSheets } from "../../hooks/useGoogleSheets";
import "./../../styles/components/informations.css";

/**
 * InformationsParticipation — Page « Participation » du profil INFO
 *
 * Affiche le(s) tableau(x) de consolidation de la participation
 * en PLEINE PAGE, optimisé pour projection grand écran (élus / maire).
 *
 * ─ Tour 1 uniquement : 1 seul bloc « Données de la participation - Tour 1 »
 *   → Pleine page, SANS scroll vertical (tableau dimensionné pour tenir à l'écran)
 *
 * ─ Tour 2 activé : 2 blocs empilés (scroll vertical autorisé)
 *   1. « Données de la participation - Tour 2 »
 *   2. « Données de la participation - Tour 1 »
 *   → Les tableaux gardent la même taille, scroll vertical possible
 *
 * Lecture seule — zéro écriture Sheets — bouton Rafraîchir manuel
 */
export default function InformationsParticipation({ electionState }) {
  const tourActuel = electionState?.tourActuel === 2 ? 2 : 1;
  const t2Enabled = !!(
    electionState?.secondTourEnabled ||
    electionState?.tour1Verrouille ||
    tourActuel === 2
  );

  const [lastRefresh, setLastRefresh] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // ── Données Sheets ──────────────────────────────────────────────
  const { data: bureaux, load: loadBureaux } = useGoogleSheets("Bureaux");
  const {
    data: participationT1,
    load: loadParticipationT1,
  } = useGoogleSheets("Participation_T1");
  const {
    data: participationT2,
    load: loadParticipationT2,
  } = useGoogleSheets("Participation_T2");

  const loadAll = useCallback(
    async (silent = true) => {
      const loaders = [
        loadBureaux({}, { silent }),
        loadParticipationT1({}, { silent }),
      ];
      if (t2Enabled) {
        loaders.push(loadParticipationT2({}, { silent }));
      }
      await Promise.allSettled(loaders);
    },
    [loadBureaux, loadParticipationT1, loadParticipationT2, t2Enabled]
  );

  useEffect(() => {
    loadAll(true);
    setLastRefresh(new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await loadAll(false);
      setLastRefresh(new Date());
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, loadAll]);

  // ── Helpers ─────────────────────────────────────────────────────
  const HOURS = useMemo(
    () => ["09h", "10h", "11h", "12h", "13h", "14h", "15h", "16h", "17h", "18h", "19h", "20h"],
    []
  );

  const coerceInt = (v) => {
    if (v == null) return 0;
    if (typeof v === "number") return Number.isFinite(v) ? Math.trunc(v) : 0;
    const s = String(v)
      .trim()
      .replace(/[\s\u00A0\u202F]/g, "")
      .replace(",", ".")
      .replace(/[^0-9.\-]/g, "");
    const n = Number(s);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  };

  const normalizeBureauId = (value) => {
    if (value === null || value === undefined) return "";
    const s = String(value).trim().toUpperCase();
    const m = s.match(/(\d+)/);
    return m ? m[1] : s;
  };

  const fmtInt = (n) => {
    try {
      return new Intl.NumberFormat("fr-FR").format(Number(n) || 0);
    } catch {
      return String(Number(n) || 0);
    }
  };

  const pctStr = (votants, inscrits) => {
    const v = Number(votants) || 0;
    const i = Number(inscrits) || 0;
    if (i <= 0) return "—";
    return ((v / i) * 100).toFixed(2).replace(".", ",") + "%";
  };

  const formatTime = (d) => {
    if (!d) return "";
    try {
      return new Intl.DateTimeFormat("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(d);
    } catch {
      return d.toLocaleTimeString();
    }
  };

  // ── Construction des données tableau pour un tour donné ─────────
  const buildTableData = (participationData, tour) => {
    const activeBureaux = (Array.isArray(bureaux) ? bureaux : []).filter(
      (b) => b && b.actif === true
    );
    const partList = Array.isArray(participationData) ? participationData : [];

    const rows = activeBureaux.map((bureau) => {
      const normalized = normalizeBureauId(bureau.id);
      const partRow = partList.find(
        (p) => normalizeBureauId(p.bureauId) === normalized
      );
      const inscrits = coerceInt(bureau?.inscrits) || 0;

      const heures = HOURS.map((h) => {
        const votants = coerceInt(partRow?.[`votants${h}`]);
        return { h, votants };
      });

      return {
        id: bureau.id,
        nom: bureau.nom || bureau.id,
        inscrits,
        heures,
      };
    });

    // Totaux
    const totalInscrits = rows.reduce((s, r) => s + r.inscrits, 0);
    const totauxHeures = HOURS.map((h, idx) => {
      const votants = rows.reduce((s, r) => s + r.heures[idx].votants, 0);
      return { h, votants };
    });

    // Dernier votant total (20h ou dernière heure renseignée)
    let lastTotalVotants = 0;
    for (const th of totauxHeures) {
      if (th.votants > 0) lastTotalVotants = th.votants;
    }

    return { rows, totalInscrits, totauxHeures, lastTotalVotants, tour };
  };

  const dataT1 = useMemo(
    () => buildTableData(participationT1, 1),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bureaux, participationT1]
  );

  const dataT2 = useMemo(
    () => buildTableData(participationT2, 2),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bureaux, participationT2]
  );

  // ── Rendu d'un bloc tableau ─────────────────────────────────────
  const renderTableBlock = (data, label, isFullScreen) => {
    const { rows, totalInscrits, totauxHeures, lastTotalVotants, tour } = data;

    const tourClass = tour === 2 ? "info-particip-block--t2" : "info-particip-block--t1";

    return (
      <article
        className={`info-particip-block ${tourClass}${isFullScreen ? " info-particip-block--fullscreen" : ""}`}
      >
        <div className={`info-particip-block-header info-particip-block-header--t${tour}`}>
          <h2 className="info-particip-block-title">
            <span className="info-particip-block-icon">📊</span>
            {label}
          </h2>
          <div className="info-particip-block-meta">
            <span className="info-particip-meta-pill">
              <strong>{fmtInt(totalInscrits)}</strong> inscrits
            </span>
            <span className="info-particip-meta-pill info-particip-meta-pill--accent">
              <strong>{fmtInt(lastTotalVotants)}</strong> votants
            </span>
            <span className="info-particip-meta-pill">
              {pctStr(lastTotalVotants, totalInscrits)} participation
            </span>
          </div>
        </div>

        <div className="info-particip-table-wrap">
          <table className={`info-particip-table info-particip-table--t${tour}`}>
            <thead>
              <tr>
                <th className="info-particip-th-bureau">Bureau</th>
                <th className="info-particip-th-inscrits">Inscrits</th>
                {HOURS.map((h) => (
                  <th key={h} className="info-particip-th-hour">
                    {h.toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr
                  key={row.id}
                  className={rowIdx % 2 === 0 ? "info-particip-row-even" : "info-particip-row-odd"}
                >
                  <td className="info-particip-td-bureau">{row.nom}</td>
                  <td className="info-particip-td-inscrits">
                    {fmtInt(row.inscrits)}
                  </td>
                  {row.heures.map((cell) => {
                    const filled = cell.votants > 0;
                    return (
                      <td
                        key={cell.h}
                        className={`info-particip-td-hour ${filled ? "is-filled" : "is-empty"}`}
                      >
                        <div className="info-particip-votants">
                          {fmtInt(cell.votants)}
                        </div>
                        <div className="info-particip-pct">
                          {pctStr(cell.votants, row.inscrits)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="info-particip-total-row">
                <td className="info-particip-td-bureau">
                  <strong>TOTAL COMMUNAL</strong>
                </td>
                <td className="info-particip-td-inscrits">
                  <strong>{fmtInt(totalInscrits)}</strong>
                </td>
                {totauxHeures.map((cell) => (
                  <td key={cell.h} className="info-particip-td-hour">
                    <div className="info-particip-votants">
                      <strong>{fmtInt(cell.votants)}</strong>
                    </div>
                    <div className="info-particip-pct">
                      <strong>{pctStr(cell.votants, totalInscrits)}</strong>
                    </div>
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </article>
    );
  };

  // ── Déterminer le mode ──────────────────────────────────────────
  // T1 seul  → 1 bloc pleine page sans scroll
  // T2 activé → 2 blocs empilés avec scroll vertical
  const showT2 = t2Enabled;
  const singleBlock = !showT2;

  return (
    <div className={`info-particip-page${singleBlock ? " info-particip-page--single" : " info-particip-page--dual"}`}>
      {/* ── HEADER ── */}
      <header className="info-particip-header">
        <div className="info-particip-header-left">
          <div className="info-kicker">Élections Municipales 2026 — Maurepas</div>
          <h1 className="info-particip-h1">
            Consolidation de la participation
          </h1>
          <div className="info-refresh-zone">
            <button
              className={`info-refresh-btn${refreshing ? " refreshing" : ""}`}
              onClick={handleRefresh}
              disabled={refreshing}
              type="button"
            >
              <span className="info-refresh-icon" aria-hidden="true">↺</span>
              {refreshing ? "Chargement…" : "Rafraîchir"}
            </button>
            {lastRefresh && (
              <span className="info-last-refresh">
                MàJ à {formatTime(lastRefresh)}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ── CONTENU ── */}
      <div className="info-particip-content">
        {showT2 && renderTableBlock(dataT2, "Données de la participation — Tour 2", false)}
        {renderTableBlock(dataT1, "Données de la participation — Tour 1", singleBlock)}
      </div>

      <footer className="info-bottom">
        <div className="info-footnote">
          Synthèse en lecture seule — consolidation de la participation. Projection optimisée grand écran.
        </div>
      </footer>
    </div>
  );
}
