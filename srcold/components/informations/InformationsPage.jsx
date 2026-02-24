// src/components/informations/InformationsPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useGoogleSheets } from "../../hooks/useGoogleSheets";
import calculService from "../../services/calculService";
import "../../styles/components/informations.css";

/**
 * Page "Informations" (lecture seule)
 * - Destinée à la projection Full HD (1920x1080)
 * - Accessible uniquement aux profils ADMIN et INFO (filtré par authConfig / Navigation / App)
 * - AUCUNE saisie / AUCUNE modification
 *
 * L'objectif est de proposer une vue synthétique, claire et institutionnelle, des indicateurs essentiels
 * du tour en cours (T1/T2), sans scroll horizontal, et avec un scroll vertical minimal.
 */
export default function InformationsPage({ electionState }) {
  const tourActuel = electionState?.tourActuel || 1;

  // Données structurantes
  const { data: bureaux, load: loadBureaux, loading: loadingBureaux, error: errorBureaux } = useGoogleSheets("Bureaux");
  const { data: candidats, load: loadCandidats, loading: loadingCandidats, error: errorCandidats } = useGoogleSheets("Candidats");

  // Participation & Résultats selon tour
  const participationSheet = tourActuel === 2 ? "Participation_T2" : "Participation_T1";
  const resultatsSheet = tourActuel === 2 ? "Resultats_T2" : "Resultats_T1";

  const { data: participationRows, load: loadParticipation, loading: loadingParticipation, error: errorParticipation } = useGoogleSheets(participationSheet);
  const { data: resultatsRows, load: loadResultats, loading: loadingResultats, error: errorResultats } = useGoogleSheets(resultatsSheet);

  // Rafraîchissement auto (projection)
  const [lastRefreshTs, setLastRefreshTs] = useState(Date.now());

  useEffect(() => {
    // Chargements init
    loadBureaux({}, { silent: true });
    loadCandidats({}, { silent: true });
    loadParticipation({}, { silent: true });
    loadResultats({}, { silent: true });

    // Rafraîchissement régulier : 30s (suffisant pour TV/projo, limite les quotas)
    const t = setInterval(() => {
      // silent=true : pas de throw, conserve l'UI en cas de souci token
      loadParticipation({}, { silent: true });
      loadResultats({}, { silent: true });
      setLastRefreshTs(Date.now());
    }, 30000);

    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participationSheet, resultatsSheet]);

  const activeBureaux = useMemo(() => (Array.isArray(bureaux) ? bureaux.filter((b) => b?.actif !== false) : []), [bureaux]);
  const totalBureaux = activeBureaux.length || 13;

  // --- Participation commune (calculService) ---
  const participationCommune = useMemo(() => {
    return calculService.calcParticipationCommune(participationRows || []);
  }, [participationRows]);

  const hoursKeys = useMemo(() => ([
    "votants09h","votants10h","votants11h","votants12h","votants13h","votants14h","votants15h",
    "votants16h","votants17h","votants18h","votants19h","votants20h"
  ]), []);

  const derniereHeure = useMemo(() => {
    let last = null;
    for (const k of hoursKeys) {
      const hasAny = (participationRows || []).some((r) => Number(r?.[k] || 0) > 0);
      if (hasAny) last = k;
    }
    if (!last) return "—";
    const hh = last.replace("votants", "").replace("h", "");
    return `${hh}h`;
  }, [participationRows, hoursKeys]);

  const bureauxParticipationSaisis = useMemo(() => {
    const rows = Array.isArray(participationRows) ? participationRows : [];
    let count = 0;
    for (const r of rows) {
      const has = hoursKeys.some((k) => Number(r?.[k] || 0) > 0);
      if (has) count += 1;
    }
    return count;
  }, [participationRows, hoursKeys]);

  const bureauxManquantsParticipation = useMemo(() => {
    const rows = Array.isArray(participationRows) ? participationRows : [];
    const filled = new Set(rows.filter((r) => hoursKeys.some((k) => Number(r?.[k] || 0) > 0)).map((r) => r?.bureauId));
    return activeBureaux
      .map((b) => b?.id)
      .filter(Boolean)
      .filter((id) => !filled.has(id));
  }, [participationRows, hoursKeys, activeBureaux]);

  // --- Résultats consolidation (totaux + classement listes) ---
  const candidatsActifsTour = useMemo(() => {
    const rows = Array.isArray(candidats) ? candidats : [];
    const key = tourActuel === 2 ? "actifT2" : "actifT1";
    return rows
      .filter((c) => c?.listeId)
      .filter((c) => c?.[key] !== false)
      .sort((a, b) => (a?.ordre || 0) - (b?.ordre || 0));
  }, [candidats, tourActuel]);

  const resultatsSynthese = useMemo(() => {
    const rows = Array.isArray(resultatsRows) ? resultatsRows : [];
    const totals = rows.reduce(
      (acc, r) => {
        acc.inscrits += Number(r?.inscrits || 0);
        acc.votants += Number(r?.votants || 0);
        acc.blancs += Number(r?.blancs || 0);
        acc.nuls += Number(r?.nuls || 0);
        acc.exprimes += Number(r?.exprimes || 0);
        return acc;
      },
      { inscrits: 0, votants: 0, blancs: 0, nuls: 0, exprimes: 0 }
    );

    // Somme des voix par liste (L1..L6) selon data existante
    const voixParListe = {};
    for (const r of rows) {
      const v = r?.voix || {};
      for (const [listeKey, voix] of Object.entries(v)) {
        voixParListe[listeKey] = (voixParListe[listeKey] || 0) + (Number(voix || 0) || 0);
      }
    }

    // Construction d'un classement lisible
    const items = candidatsActifsTour.length > 0
      ? candidatsActifsTour.map((c) => ({
          listeId: c.listeId,
          nomListe: c.nomListe,
          voix: voixParListe[c.listeId] || 0
        }))
      : Object.keys(voixParListe).sort().map((k) => ({ listeId: k, nomListe: k, voix: voixParListe[k] || 0 }));

    const ranked = items
      .map((it) => ({
        ...it,
        pct: totals.exprimes > 0 ? (it.voix / totals.exprimes) * 100 : 0
      }))
      .sort((a, b) => (b.voix || 0) - (a.voix || 0));

    // Couverture / saisie résultats
    const bureauxSaisis = rows.filter((r) => Number(r?.exprimes || 0) > 0 || Number(r?.votants || 0) > 0).length;

    return {
      totals,
      ranked,
      bureauxSaisis
    };
  }, [resultatsRows, candidatsActifsTour]);

  const bureauxManquantsResultats = useMemo(() => {
    const rows = Array.isArray(resultatsRows) ? resultatsRows : [];
    const filled = new Set(rows.filter((r) => Number(r?.exprimes || 0) > 0 || Number(r?.votants || 0) > 0).map((r) => r?.bureauId));
    return activeBureaux
      .map((b) => b?.id)
      .filter(Boolean)
      .filter((id) => !filled.has(id));
  }, [resultatsRows, activeBureaux]);

  // Formatters
  const fmtInt = (n) => {
    const x = Number(n || 0);
    return Number.isFinite(x) ? x.toLocaleString("fr-FR") : "0";
  };
  const fmtPct = (n) => {
    const x = Number(n || 0);
    return `${x.toFixed(2).replace(".", ",")} %`;
  };
  const fmtTime = (ts) => new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  const isLoading = loadingBureaux || loadingCandidats || loadingParticipation || loadingResultats;
  const hasError = errorBureaux || errorCandidats || errorParticipation || errorResultats;

  return (
    <div className="infoPage">
      <header className="infoHeader">
        <div className="infoHeaderLeft">
          <div className="infoTitle">Informations — Tour {tourActuel}</div>
          <div className="infoSubtitle">
            Vue synthèse (lecture seule) • Projection Full HD • Rafraîchissement {fmtTime(lastRefreshTs)}
          </div>
        </div>
        <div className="infoHeaderRight">
          <div className="infoBadge">Bureaux actifs : {totalBureaux}</div>
          <div className="infoBadge infoBadgeMuted">Dernière heure participation : {derniereHeure}</div>
        </div>
      </header>

      {hasError && (
        <div className="infoAlert">
          <strong>Attention :</strong> certaines données n'ont pas pu être chargées. La page reste affichée.
          <div className="infoAlertDetails">{String(hasError)}</div>
        </div>
      )}

      <section className="infoGridPrimary" aria-label="Indicateurs essentiels">
        <div className="infoCard">
          <div className="infoCardHeader">
            <div className="infoCardTitle">Participation (commune)</div>
            <div className="infoCardMeta">{bureauxParticipationSaisis}/{totalBureaux} bureaux saisis</div>
          </div>
          <div className="infoCardBody infoKPIs">
            <div className="kpi">
              <div className="kpiLabel">Inscrits</div>
              <div className="kpiValue">{fmtInt(participationCommune.totalInscrits)}</div>
            </div>
            <div className="kpi">
              <div className="kpiLabel">Votants</div>
              <div className="kpiValue">{fmtInt(participationCommune.totalVotants)}</div>
            </div>
            <div className="kpi">
              <div className="kpiLabel">Taux</div>
              <div className="kpiValue">{fmtPct(participationCommune.tauxParticipation)}</div>
            </div>
          </div>
          <div className="infoCardFooter">
            <div className="infoSmall">
              Bureaux manquants :{" "}
              {bureauxManquantsParticipation.length ? bureauxManquantsParticipation.join(", ") : "Aucun"}
            </div>
          </div>
        </div>

        <div className="infoCard">
          <div className="infoCardHeader">
            <div className="infoCardTitle">Résultats (commune)</div>
            <div className="infoCardMeta">{resultatsSynthese.bureauxSaisis}/{totalBureaux} bureaux saisis</div>
          </div>
          <div className="infoCardBody infoKPIs">
            <div className="kpi">
              <div className="kpiLabel">Exprimés</div>
              <div className="kpiValue">{fmtInt(resultatsSynthese.totals.exprimes)}</div>
            </div>
            <div className="kpi">
              <div className="kpiLabel">Blancs</div>
              <div className="kpiValue">{fmtInt(resultatsSynthese.totals.blancs)}</div>
            </div>
            <div className="kpi">
              <div className="kpiLabel">Nuls</div>
              <div className="kpiValue">{fmtInt(resultatsSynthese.totals.nuls)}</div>
            </div>
          </div>
          <div className="infoCardFooter">
            <div className="infoSmall">
              Bureaux manquants :{" "}
              {bureauxManquantsResultats.length ? bureauxManquantsResultats.join(", ") : "Aucun"}
            </div>
          </div>
        </div>

        <div className="infoCard infoCardWide">
          <div className="infoCardHeader">
            <div className="infoCardTitle">Classement listes</div>
            <div className="infoCardMeta">Tri : voix décroissantes</div>
          </div>

          <div className="infoCardBody">
            <div className="infoTable">
              <div className="infoTableRow infoTableHeader">
                <div>#</div>
                <div>Liste</div>
                <div className="alignRight">Voix</div>
                <div className="alignRight">%</div>
              </div>

              {(resultatsSynthese.ranked || []).slice(0, 6).map((it, idx) => (
                <div key={it.listeId || idx} className={"infoTableRow" + (idx === 0 ? " infoTableRowLeader" : "")}>
                  <div className="muted">{idx + 1}</div>
                  <div className="ellipsis" title={it.nomListe || it.listeId}>{it.nomListe || it.listeId}</div>
                  <div className="alignRight">{fmtInt(it.voix)}</div>
                  <div className="alignRight">{fmtPct(it.pct)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="infoCardFooter">
            <div className="infoSmall">
              Astuce projection : plein écran navigateur (F11) pour maximiser la lisibilité.
            </div>
          </div>
        </div>
      </section>

      <section className="infoGridSecondary" aria-label="Indicateurs complémentaires">
        <div className="infoCard">
          <div className="infoCardHeader">
            <div className="infoCardTitle">Synthèse rapide</div>
            <div className="infoCardMeta">Lecture</div>
          </div>
          <div className="infoCardBody infoText">
            <div className="infoLine"><span className="label">Tour en cours :</span> <span className="value">Tour {tourActuel}</span></div>
            <div className="infoLine"><span className="label">Participation (dernière heure) :</span> <span className="value">{fmtPct(participationCommune.tauxParticipation)}</span></div>
            <div className="infoLine"><span className="label">Résultats (exprimés) :</span> <span className="value">{fmtInt(resultatsSynthese.totals.exprimes)}</span></div>
            <div className="infoLine"><span className="label">Chargement :</span> <span className="value">{isLoading ? "En cours…" : "OK"}</span></div>
          </div>
        </div>

        <div className="infoCard">
          <div className="infoCardHeader">
            <div className="infoCardTitle">Contrôles de cohérence</div>
            <div className="infoCardMeta">Basiques</div>
          </div>
          <div className="infoCardBody infoText">
            <div className="infoLine">
              <span className="label">Total votants (résultats) :</span>
              <span className="value">{fmtInt(resultatsSynthese.totals.votants)}</span>
            </div>
            <div className="infoLine">
              <span className="label">Inscrits (résultats) :</span>
              <span className="value">{fmtInt(resultatsSynthese.totals.inscrits)}</span>
            </div>
            <div className="infoLine">
              <span className="label">Expr. + blancs + nuls :</span>
              <span className="value">{fmtInt(resultatsSynthese.totals.exprimes + resultatsSynthese.totals.blancs + resultatsSynthese.totals.nuls)}</span>
            </div>
            <div className="infoLine">
              <span className="label">Écart vs votants :</span>
              <span className="value">{fmtInt((resultatsSynthese.totals.exprimes + resultatsSynthese.totals.blancs + resultatsSynthese.totals.nuls) - resultatsSynthese.totals.votants)}</span>
            </div>
            <div className="infoHint">
              (Contrôle indicatif : un écart non nul doit être analysé, sans bloquer l'affichage.)
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
