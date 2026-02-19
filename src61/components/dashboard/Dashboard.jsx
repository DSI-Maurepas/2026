// src/components/dashboard/Dashboard.jsx
import React, { useEffect, useState } from "react";
import authService from "../../services/authService";
import calculService from "../../services/calculService";
import { useGoogleSheets } from "../../hooks/useGoogleSheets";
import googleSheetsService from "../../services/googleSheetsService";

/**
 * Tableau de bord principal
 * Vue d'ensemble de l'élection en cours
 */
export default function Dashboard({ onNavigate, electionState }) {
  const { data: bureaux, load: loadBureaux } = useGoogleSheets("Bureaux");
  const { data: candidats, load: loadCandidats } = useGoogleSheets("Candidats");

  // Participation : on charge T1 ou T2 selon le tour actuel (sans hook conditionnel)
  const { data: participationT1, load: loadParticipationT1 } = useGoogleSheets("Participation_T1");
  const { data: participationT2, load: loadParticipationT2 } = useGoogleSheets("Participation_T2");

  const [stats, setStats] = useState({
    totalInscrits: 0,
    totalVotants: 0,
    tauxParticipation: 0,
    bureaux: 0,
    candidats: 0,
  });

  const isAuthed = Boolean(authService.getAccessToken());
  const tourActuel = electionState?.tourActuel ?? 1;

  /* ===========================
     TEST MINIMAL GOOGLE SHEETS
     =========================== */
  useEffect(() => {
    (async () => {
      // ✅ Ne teste pas Sheets tant que le token n'existe pas
      if (!authService.getAccessToken()) return;

      try {
        const cfg = await googleSheetsService.getConfig();
        console.log("✅ Google Sheets OK - Config:", cfg);
      } catch (e) {
        console.error("❌ Sheets KO:", e);
      }
    })();
  }, []);

  /* ===========================
     CHARGEMENT DES DONNÉES
     =========================== */
  useEffect(() => {
    if (!authService.getAccessToken()) return;

    const participationLoader = tourActuel === 2 ? loadParticipationT2 : loadParticipationT1;

    Promise.all([loadBureaux(), loadCandidats(), participationLoader()]).catch((e) => {
      console.error("Erreur chargement Dashboard:", e);
    });
  }, [loadBureaux, loadCandidats, loadParticipationT1, loadParticipationT2, tourActuel, isAuthed]);

  /* ===========================
     CALCUL DES STATISTIQUES
     =========================== */
  useEffect(() => {
    const participation = tourActuel === 2 ? participationT2 : participationT1;

    const agg = calculService.calcParticipationCommune(participation);

    // Compte uniquement les candidats actifs pour le tour en cours
    let nbCandidats = 0;
    if (Array.isArray(candidats)) {
      if (tourActuel === 2) {
        // Tour 2 : compter uniquement ceux avec actifT2 = TRUE
        nbCandidats = candidats.filter(c => c.actifT2 === true).length;
      } else {
        // Tour 1 : compter uniquement ceux avec actifT1 = TRUE
        nbCandidats = candidats.filter(c => c.actifT1 === true).length;
      }
    }

    setStats({
      bureaux: Array.isArray(bureaux) ? bureaux.length : 0,
      candidats: nbCandidats,
      totalInscrits: agg.totalInscrits,
      totalVotants: agg.totalVotants,
      tauxParticipation: agg.tauxParticipation,
    });
  }, [bureaux, candidats, participationT1, participationT2, tourActuel]);

  const {
    tour1Verrouille,
    tour2Verrouille,
    dateT1,
    dateT2,
  } = electionState;

  const today = new Date().toISOString().split("T")[0];
  const isJourScrutin = today === dateT1 || today === dateT2;
  const isTour1 = today === dateT1;
  const isTour2 = today === dateT2;

  /* ===========================
     RENDER
     =========================== */
  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>📊 Tableau de bord</h2>
        {isJourScrutin && (
          <div className={`jour-scrutin-alert ${isTour1 ? "tour1" : "tour2"}`}>
            ⚠️ <strong>JOUR DU SCRUTIN</strong> – {isTour1 ? "1er tour" : "2nd tour"}
          </div>
        )}
      </div>

      <div className="dashboard-grid">
        {/* État de l'élection */}
        <div className="dashboard-card election-state">
          <h3>🗳️ État de l'élection</h3>
          <div className="card-content">
            <div className="stat-row">
              <span className="label">Tour actuel :</span>
              <span className={`value tour-badge tour-${tourActuel}`}>
                {tourActuel === 1 ? "1er tour" : "2nd tour"}
              </span>
            </div>
            <div className="stat-row">
              <span className="label">Statut :</span>
              <span
                className={`value ${
                  (tourActuel === 1 && tour1Verrouille) ||
                  (tourActuel === 2 && tour2Verrouille)
                    ? "locked"
                    : "active"
                }`}
              >
                {(tourActuel === 1 && tour1Verrouille) ||
                (tourActuel === 2 && tour2Verrouille)
                  ? "🔒 Verrouillé"
                  : "🔓 En cours"}
              </span>
            </div>
            <div className="stat-row">
              <span className="label">Date 1er tour :</span>
              <span className="value">
                {new Date(dateT1).toLocaleDateString("fr-FR", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
            <div className="stat-row">
              <span className="label">Date 2nd tour :</span>
              <span className="value">
                {new Date(dateT2).toLocaleDateString("fr-FR", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
          </div>
        </div>

        {/* Configuration */}
        <div className="dashboard-card configuration">
          <h3>⚙️ Configuration</h3>
          <div className="card-content">
            <div className="stat-row">
              <span className="label">Bureaux de vote :</span>
              <span className="value highlight">{stats.bureaux}</span>
            </div>
            <div className="stat-row">
              <span className="label">Candidats (T{tourActuel}) :</span>
              <span className="value highlight">{stats.candidats}</span>
            </div>
            <div className="stat-row">
              <span className="label">Horaires :</span>
              <span className="value">08h00 – 20h00</span>
            </div>
          </div>
        </div>

        {/* Participation */}
        <div className="dashboard-card participation">
          <h3>📋 Participation</h3>
          <div className="card-content">
            <div className="stat-row large">
              <span className="label">Taux :</span>
              <span className="value participation-rate">
                {Number.isFinite(stats.tauxParticipation) ? stats.tauxParticipation.toFixed(2) : "0.00"} %
              </span>
            </div>

            <button
              className="action-btn primary"
              onClick={() => onNavigate("participation")}
              disabled={!isAuthed}
              title={!isAuthed ? "Connexion requise" : ""}
            >
              📋 Saisir la participation
            </button>
          </div>
        </div>

        {/* Actions rapides */}
        <div className="dashboard-card actions">
          <h3>⚡ Actions rapides</h3>
          <div className="card-content">
            {!tour1Verrouille && tourActuel === 1 && (
              <>
                <button
                  onClick={() => onNavigate("participation")}
                  className="action-btn"
                  disabled={!isAuthed}
                  title={!isAuthed ? "Connexion requise" : ""}
                >
                  📋 Participation
                </button>
                <button
                  onClick={() => onNavigate("resultats")}
                  className="action-btn"
                  disabled={!isAuthed}
                  title={!isAuthed ? "Connexion requise" : ""}
                >
                  🗳️ Résultats
                </button>
              </>
            )}

            {tour1Verrouille && tourActuel === 1 && (
              <button
                onClick={() => onNavigate("passage-t2")}
                className="action-btn primary"
                disabled={!isAuthed}
                title={!isAuthed ? "Connexion requise" : ""}
              >
                ➡️ Générer le 2nd tour
              </button>
            )}

            {tourActuel === 2 && !tour2Verrouille && (
              <>
                <button
                  onClick={() => onNavigate("participation")}
                  className="action-btn"
                  disabled={!isAuthed}
                  title={!isAuthed ? "Connexion requise" : ""}
                >
                  📋 Participation T2
                </button>
                <button
                  onClick={() => onNavigate("resultats")}
                  className="action-btn"
                  disabled={!isAuthed}
                  title={!isAuthed ? "Connexion requise" : ""}
                >
                  🗳️ Résultats T2
                </button>
              </>
            )}

            {((tour1Verrouille && tourActuel === 1) ||
              (tour2Verrouille && tourActuel === 2)) && (
              <button
                onClick={() => onNavigate("sieges")}
                className="action-btn success"
                disabled={!isAuthed}
                title={!isAuthed ? "Connexion requise" : ""}
              >
                🪑 Calcul des sièges
              </button>
            )}

            <button
              onClick={() => onNavigate("exports")}
              className="action-btn"
              disabled={!isAuthed}
              title={!isAuthed ? "Connexion requise" : ""}
            >
              📄 Exports
            </button>

            <button
              onClick={() => onNavigate("admin")}
              className="action-btn"
              disabled={!isAuthed}
              title={!isAuthed ? "Connexion requise" : ""}
            >
              ⚙️ Administration
            </button>
          </div>
        </div>
      </div>

      <div className="dashboard-alerts">
        {!isJourScrutin && (
          <div className="alert info">
            ℹ️ Les bureaux ouvrent à <strong>08h00</strong> le jour du scrutin
          </div>
        )}
        {isJourScrutin && (
          <div className="alert warning">
            ⚠️ <strong>Jour du scrutin</strong> – toutes les actions sont tracées
          </div>
        )}
      </div>
    </div>
  );
}
