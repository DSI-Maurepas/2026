// src/App.jsx
import React, { Suspense, useEffect, useMemo, useState } from "react";
import authService, { loginWithCode, getAuthState, logoutAccess, isBV } from "./services/authService";
import uiService from "./services/uiService";
import googleSheetsService from "./services/googleSheetsService";
import auditService from "./services/auditService";
import { useElectionState } from "./hooks/useElectionState";

import Navigation from "./components/layout/Navigation";
import Footer from "./components/layout/Footer";

// ⚡ Lazy loading : chaque page n'est chargée qu'à la navigation
const Dashboard = React.lazy(() => import("./components/dashboard/Dashboard"));
const ParticipationSaisie = React.lazy(() => import("./components/participation/ParticipationSaisie"));
const ParticipationTableau = React.lazy(() => import("./components/participation/ParticipationTableau"));
const ParticipationStats = React.lazy(() => import("./components/participation/ParticipationStats"));
const ResultatsSaisieBureau = React.lazy(() => import("./components/resultats/ResultatsSaisieBureau"));
const ResultatsConsolidation = React.lazy(() => import("./components/resultats/ResultatsConsolidation"));
const ResultatsValidation = React.lazy(() => import("./components/resultats/ResultatsValidation"));
const ResultatsClassement = React.lazy(() => import("./components/resultats/ResultatsClassement"));
const PassageSecondTour = React.lazy(() => import("./components/secondTour/PassageSecondTour"));
const ConfigurationT2 = React.lazy(() => import("./components/secondTour/ConfigurationT2"));
const SiegesMunicipal = React.lazy(() => import("./components/sieges/SiegesMunicipal"));
const SiegesCommunautaire = React.lazy(() => import("./components/sieges/SiegesCommunautaire"));
const ConfigBureaux = React.lazy(() => import("./components/admin/ConfigBureaux"));
const ConfigCandidats = React.lazy(() => import("./components/admin/ConfigCandidats"));
const AuditLog = React.lazy(() => import("./components/admin/AuditLog"));
const ExportPDF = React.lazy(() => import("./components/exports/ExportPDF"));
const ExportExcel = React.lazy(() => import("./components/exports/ExportExcel"));
const Informations = React.lazy(() => import("./components/informations/Informations"));
const InformationsParticipation = React.lazy(() => import("./components/informations/InformationsParticipation"));

import { canAccessPage } from "./config/authConfig";

// CSS: tout est centralisé dans styles/App.css (chargé par main.jsx)

function AccessGate({ onAuthenticated }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    const auth = loginWithCode(code);
    if (!auth) {
      setError("Code invalide");
      return;
    }
    setError(null);
    onAuthenticated(auth);
  };

  return (
    <div style={{ padding: 40, maxWidth: 460, margin: "80px auto" }}>
      <h2>Accès sécurisé</h2>
      <p style={{ marginTop: 8, opacity: 0.85 }}>
        Saisissez votre code d'accès. (Exemples : BV1, BV2, … ou admin.)
      </p>
      <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Code d'accès"
          style={{ width: "100%", padding: 10, marginBottom: 10 }}
          autoFocus
        />
        <button type="submit" style={{ width: "100%", padding: 10 }}>
          Entrer
        </button>
        {error && <div style={{ color: "red", marginTop: 10 }}>{error}</div>}
      </form>
    </div>
  );
}

export default function App() {
  // ⚠️ IMPORTANT: Tous les hooks doivent être appelés à chaque rendu, sans return anticipé,
  // sinon React déclenche "Rendered fewer hooks than expected" (ex: lors d'une déconnexion).

  // Accès applicatif (BV / GLOBAL / ADMIN)
  const [accessAuth, setAccessAuth] = useState(() => getAuthState());

  // App V3 (navigation interne)
  const [currentPage, setCurrentPage] = useState("dashboard");

  // OAuth Google (token)
  const [authToken, setAuthToken] = useState(() => authService.getAccessToken());

  // UI (toasts + confirm modal)
  const [uiToasts, setUiToasts] = useState([]);
  const [uiConfirm, setUiConfirm] = useState({
    open: false,
    title: "",
    message: "",
    confirmText: "Confirmer",
    cancelText: "Annuler",
    _resolve: null,
  });

  // Modals de succès personnalisés (centré, gros, 10 secondes)
  const [showUnlockT1Success, setShowUnlockT1Success] = useState(false);
  const [showUnlockT2Success, setShowUnlockT2Success] = useState(false);
  const [showTour1ActiveSuccess, setShowTour1ActiveSuccess] = useState(false);
  const [showTour2ActiveSuccess, setShowTour2ActiveSuccess] = useState(false);
  const [unlockCount, setUnlockCount] = useState(0);

  const showToast = ({ type = "info", title = "", message = "", durationMs = 4000 }) => {
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setUiToasts((prev) => [...prev, { id, type, title, message }]);
    window.setTimeout(() => {
      setUiToasts((prev) => prev.filter((t) => t.id !== id));
    }, Math.max(1500, durationMs));
  };

  const showConfirm = ({ title, message, confirmText, cancelText }) => {
    return new Promise((resolve) => {
      setUiConfirm({ open: true, title, message, confirmText, cancelText, _resolve: resolve });
    });
  };

  useEffect(() => {
    uiService.init({ showToast, showConfirm });
  }, []);

  // État global élection (source de vérité V3)
  const { state: electionState, loadState, passerSecondTour, revenirPremierTour } = useElectionState();

  const safeElectionState = electionState || { tourActuel: 1, tour1Verrouille: false, tour2Verrouille: false };
  
  // Synchronisation OAuth au montage
  useEffect(() => {
    setAuthToken(authService.getAccessToken());
  }, []);

  const isAuthenticated = useMemo(() => Boolean(authToken), [authToken]);

  // ⚠️ CORRECTION : Détecter si l'utilisateur est un BV
  const isBureauVote = useMemo(() => isBV(accessAuth), [accessAuth]);

  // --- Mapping page -> pageKey (utilisé pour la restriction d'accès) ---
  const pageKeyFor = (page) => {
  switch (page) {
    case "participation":
      return "participation_saisie";
    case "resultats":
      return "resultats_saisie_bureau";
    case "passage-t2":
      return "passage_second_tour";
    case "sieges":
      return "sieges";
    case "exports":
      return "exports";
    case "informations":
      return "informations";
    case "info-participation":
      return "info_participation";
    case "admin":
      return "admin_bureaux";
    case "dashboard":
    default:
      return "dashboard";
  }
};

  const navigateSafe = (page) => {
    // Si pas d'accès applicatif (déconnexion), on ne navigue pas
    if (!accessAuth) return;

    const key = pageKeyFor(page);
    if (!canAccessPage(accessAuth, key)) {
      // BV : forcer Participation
      if (accessAuth?.role === "BV") {
        setCurrentPage("participation");
      } else {
        setCurrentPage("dashboard");
      }
      return;
    }
    setCurrentPage(page);
  };

  // Au changement d'accès: BV => participation, INFO => informations, Global/Admin => dashboard
  useEffect(() => {
    if (!accessAuth) return;
    if (accessAuth.role === "BV") {
      setCurrentPage("participation");
    } else if (accessAuth.role === "INFO") {
      setCurrentPage("informations");
    } else {
      setCurrentPage("dashboard");
    }
  }, [accessAuth]);

  // Bloque pages sensibles si non connecté OAuth (sauf profil INFO qui reste sur informations)
  const authRequiredPages = new Set(["participation", "resultats", "passage-t2", "sieges", "exports", "admin", "informations", "info-participation"]);
  useEffect(() => {
    if (!isAuthenticated && authRequiredPages.has(currentPage)) {
      if (accessAuth?.role === "INFO") {
        // INFO reste sur informations (la page gère l'état non connecté)
        setCurrentPage("informations");
      } else {
        setCurrentPage("dashboard");
      }
    }
  }, [isAuthenticated, currentPage]);

  const handleSignIn = async () => {
    try {
      await authService.signIn();
      setAuthToken(authService.getAccessToken());
    } catch (e) {
      console.error("Connexion Google échouée:", e);
    }
  };

  const handleSignOut = () => {
    try {
      authService.signOut();
    } finally {
      setAuthToken(null);
      setCurrentPage("dashboard");
    }
  };

  const handleAccessLogout = () => {
    logoutAccess();
    setAccessAuth(null);
    setCurrentPage("dashboard");
    // volontairement: on ne touche pas OAuth
  };

  const renderAuthGate = () => {
    if (isAuthenticated) return null;
    return (
      <div className="auth-gate">
        <p>Connexion Google requise pour accéder aux fonctions de saisie / export.</p>
        <button className="btn btn-primary" onClick={handleSignIn} type="button">
          Se connecter avec Google
        </button>
      </div>
    );
  };

  const renderPage = () => {
    switch (currentPage) {
      case "dashboard":
        return <Dashboard electionState={safeElectionState} onNavigate={navigateSafe} />;
      case "participation":
        return (
          <>
            {renderAuthGate()}
            {isAuthenticated && (
              <>
                {/* ⚠️ CORRECTION : Layout côte à côte pour BV avec STYLE INLINE */}
                {isBureauVote ? (
                  <>
                    <style>{`
                      @media (min-width: 1025px) {
                        .participation-bv-grid {
                          display: grid !important;
                          grid-template-columns: 1fr 1fr !important;
                          gap: 24px !important;
                          margin-bottom: 24px !important;
                        }
                      }
                    `}</style>
                    <div className="participation-bv-grid">
                      <ParticipationSaisie electionState={safeElectionState} reloadElectionState={loadState} />
                      <ParticipationTableau electionState={safeElectionState} />
                    </div>
                  </>
                ) : (
                  <>
                    <ParticipationSaisie electionState={safeElectionState} reloadElectionState={loadState} />
                    <ParticipationTableau electionState={safeElectionState} />
                  </>
                )}
                <ParticipationStats electionState={safeElectionState} isBureauVote={isBureauVote} />
              </>
            )}
          </>
        );
      case "resultats":
        return (
          <>
            {renderAuthGate()}
            {isAuthenticated && (
              <>
                {/* 1. Tableau des bureaux + Formulaire de saisie */}
                <ResultatsSaisieBureau electionState={safeElectionState} />
                
                {/* 2. Validation et Classement (masqués pour les BV) */}
                {!isBureauVote && (
                  <>
                    <ResultatsValidation electionState={safeElectionState} />
                    <ResultatsClassement electionState={safeElectionState} />
                  </>
                )}
                
                {/* 3. Consolidation communale EN DERNIER (statistiques) */}
                <ResultatsConsolidation electionState={safeElectionState} />
              </>
            )}
          </>
        );
      case "passage-t2":
        return (
          <>
            {renderAuthGate()}
            {isAuthenticated && (
              <>
                <PassageSecondTour
                  electionState={safeElectionState}
                  passerSecondTour={passerSecondTour}
                  revenirPremierTour={revenirPremierTour}
                  accessAuth={accessAuth}
                />
                <ConfigurationT2 electionState={safeElectionState} />
              </>
            )}
          </>
        );
      case "sieges":
        return (
          <>
            {renderAuthGate()}
            {isAuthenticated && (
              <>
                <SiegesMunicipal electionState={safeElectionState} />
                <SiegesCommunautaire electionState={safeElectionState} />
              </>
            )}
          </>
        );
      case "exports":
        return (
          <>
            {renderAuthGate()}
            {isAuthenticated && (
              <>
                <ExportPDF electionState={safeElectionState} />
                <ExportExcel electionState={safeElectionState} />
              </>
            )}
          </>
        );

case "informations":
  return (
    <>
      {renderAuthGate()}
      {isAuthenticated && <Informations electionState={safeElectionState} />}
    </>
  );

case "info-participation":
  return (
    <>
      {renderAuthGate()}
      {isAuthenticated && <InformationsParticipation electionState={safeElectionState} />}
    </>
  );

      case "admin":
        return (
          <>
            {renderAuthGate()}
            {isAuthenticated && (
              <>
                {/* === LIGNE AVEC 3 BLOCS : GESTION TOURS + DÉVERROUILLAGE T1 + T2 === */}
                <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
                  
                  {/* BLOC 1 : GESTION DES TOURS (2/3 de largeur) */}
                  <div style={{ flex: '2 1 0' }}>
                    <div className="card" style={{ border: '2px solid #e74c3c', background: '#fdf2f2', height: '100%' }}>
                      <h2 style={{ color: '#c0392b', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                        🔄 Gestion des Tours
                      </h2>
                      <p style={{ marginBottom: 16, color: '#555' }}>
                        Tour actuel : <strong style={{ fontSize: '1.2em', color: safeElectionState.tourActuel === 1 ? '#2563eb' : '#dc2626' }}>
                          Tour {safeElectionState.tourActuel}
                        </strong>
                        {safeElectionState.tour1Verrouille && safeElectionState.tourActuel === 1 && (
                          <span style={{ marginLeft: 12, color: '#e67e22' }}>🔒 Tour 1 verrouillé</span>
                        )}
                        {safeElectionState.tour2Verrouille && safeElectionState.tourActuel === 2 && (
                          <span style={{ marginLeft: 12, color: '#e67e22' }}>🔒 Tour 2 verrouillé</span>
                        )}
                      </p>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {safeElectionState.tourActuel === 2 && (
                          <button
                            className="btn btn-warning"
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', fontSize: '1em', fontWeight: 600 }}
                            onClick={async () => {
                              const ok = await uiService.confirm({
                                title: '⚠️ Retour au Tour 1',
                                message: 'Voulez-vous vraiment revenir au Tour 1 ?\n\nLes données du Tour 2 seront conservées mais le tour actif sera le Tour 1.',
                                confirmText: 'Oui, revenir au Tour 1',
                                cancelText: 'Annuler'
                              });
                              if (!ok) return;
                              try {
                                await revenirPremierTour();
                                setShowTour1ActiveSuccess(true);
                                setTimeout(() => {
                                  setShowTour1ActiveSuccess(false);
                                  window.location.reload();
                                }, 10000);
                              } catch (e) {
                                uiService.toast('error', { title: 'Erreur', message: 'Retour Tour 1 échoué : ' + (e?.message || e) });
                              }
                            }}
                          >
                            ⬅️ Retour au Tour 1
                          </button>
                        )}
                        {safeElectionState.tourActuel === 1 && (
                          <button
                            className="btn btn-danger"
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', fontSize: '1em', fontWeight: 600 }}
                            onClick={async () => {
                              const ok = await uiService.confirm({
                                title: '⚠️ Passage au Tour 2',
                                message: 'Voulez-vous vraiment passer au Tour 2 ?\n\nCette action changera le tour actif de l\'élection.',
                                confirmText: 'Oui, passer au Tour 2',
                                cancelText: 'Annuler'
                              });
                              if (!ok) return;
                              try {
                                await passerSecondTour();
                                setShowTour2ActiveSuccess(true);
                                setTimeout(() => {
                                  setShowTour2ActiveSuccess(false);
                                  window.location.reload();
                                }, 10000);
                              } catch (e) {
                                uiService.toast('error', { title: 'Erreur', message: 'Passage Tour 2 échoué : ' + (e?.message || e) });
                              }
                            }}
                          >
                            ➡️ Forcer passage Tour 2
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* BLOC 2 : DÉVERROUILLAGE TOUR 1 (1/6 de largeur) */}
                  <div style={{ flex: '1 1 0' }}>
                    <div 
                      className="card"
                      style={{
                        background: 'linear-gradient(135deg, #065f46 0%, #047857 100%)',
                        border: '2px solid #047857',
                        padding: 20,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: 140,
                        cursor: 'pointer',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        height: '100%'
                      }}
                      onClick={async () => {
                        const ok = await uiService.confirm({
                          title: '⚠️ Déverrouillage global - Tour 1',
                          message: 'Voulez-vous annuler TOUS les verrouillages (BV et Admin) pour le Tour 1 ?\n\n⚠️ Les 13 bureaux pourront à nouveau modifier leurs résultats.',
                          confirmText: '🔓 Déverrouiller tous les bureaux',
                          cancelText: 'Annuler'
                        });
                        if (!ok) return;
                        try {
                          // 1. Charger les données du Tour 1
                          const resultatsData = await googleSheetsService.getData('Resultats_T1');
                          
                          // 2. Effacer validePar et timestamp pour TOUS les bureaux
                          const updates = [];
                          for (let i = 0; i < resultatsData.length; i++) {
                            const bureau = resultatsData[i];
                            
                            const rowData = {
                              ...bureau,
                              validePar: '',
                              timestamp: ''
                            };
                            
                            updates.push({
                              rowIndex: i,
                              rowData: rowData
                            });
                          }
                          
                          // 3. Appliquer les mises à jour
                          if (updates.length > 0) {
                            await googleSheetsService.batchUpdate('Resultats_T1', updates);
                          }
                          
                          // 4. Retirer la validation admin
                          await googleSheetsService.setConfig('VALIDATION_ADMIN_T1', 'FALSE');
                          
                          // 5. Log
                          await auditService.log('ADMIN_DEVERROUILLAGE_GLOBAL', {
                            tour: 1,
                            action: 'RESET_TOUS_BUREAUX',
                            count: updates.length
                          });
                          
                          // Afficher le modal de succès personnalisé
                          setUnlockCount(updates.length);
                          setShowUnlockT1Success(true);
                          
                          // Recharger la page après 10 secondes
                          setTimeout(() => window.location.reload(), 10000);
                        } catch (e) {
                          console.error('Erreur déverrouillage T1:', e);
                          uiService.toast('error', { title: 'Erreur', message: 'Déverrouillage échoué : ' + (e?.message || e) });
                        }
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 6px 20px rgba(4, 120, 87, 0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <div style={{ fontSize: 48, marginBottom: 12 }}>🔓</div>
                      <div style={{
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: 14,
                        textAlign: 'center',
                        lineHeight: 1.4
                      }}>
                        Annuler les<br />
                        verrouillages<br />
                        BV1 à BV13<br />
                        <span style={{ fontSize: 16 }}>TOUR 1</span>
                      </div>
                    </div>
                  </div>

                  {/* BLOC 3 : DÉVERROUILLAGE TOUR 2 (1/6 de largeur) */}
                  <div style={{ flex: '1 1 0' }}>
                    <div 
                      className="card"
                      style={{
                        background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)',
                        border: '2px solid #2563eb',
                        padding: 20,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: 140,
                        cursor: 'pointer',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        height: '100%'
                      }}
                      onClick={async () => {
                        const ok = await uiService.confirm({
                          title: '⚠️ Déverrouillage global - Tour 2',
                          message: 'Voulez-vous annuler TOUS les verrouillages (BV et Admin) pour le Tour 2 ?\n\n⚠️ Les 13 bureaux pourront à nouveau modifier leurs résultats.',
                          confirmText: '🔓 Déverrouiller tous les bureaux',
                          cancelText: 'Annuler'
                        });
                        if (!ok) return;
                        try {
                          // 1. Charger les données du Tour 2
                          const resultatsData = await googleSheetsService.getData('Resultats_T2');
                          
                          // 2. Effacer validePar et timestamp pour TOUS les bureaux
                          const updates = [];
                          for (let i = 0; i < resultatsData.length; i++) {
                            const bureau = resultatsData[i];
                            
                            const rowData = {
                              ...bureau,
                              validePar: '',
                              timestamp: ''
                            };
                            
                            updates.push({
                              rowIndex: i,
                              rowData: rowData
                            });
                          }
                          
                          // 3. Appliquer les mises à jour
                          if (updates.length > 0) {
                            await googleSheetsService.batchUpdate('Resultats_T2', updates);
                          }
                          
                          // 4. Retirer la validation admin
                          await googleSheetsService.setConfig('VALIDATION_ADMIN_T2', 'FALSE');
                          
                          // 5. Log
                          await auditService.log('ADMIN_DEVERROUILLAGE_GLOBAL', {
                            tour: 2,
                            action: 'RESET_TOUS_BUREAUX',
                            count: updates.length
                          });
                          
                          // Afficher le modal de succès personnalisé
                          setUnlockCount(updates.length);
                          setShowUnlockT2Success(true);
                          
                          // Recharger la page après 10 secondes
                          setTimeout(() => window.location.reload(), 10000);
                        } catch (e) {
                          console.error('Erreur déverrouillage T2:', e);
                          uiService.toast('error', { title: 'Erreur', message: 'Déverrouillage échoué : ' + (e?.message || e) });
                        }
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 6px 20px rgba(37, 99, 235, 0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <div style={{ fontSize: 48, marginBottom: 12 }}>🔓</div>
                      <div style={{
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: 14,
                        textAlign: 'center',
                        lineHeight: 1.4
                      }}>
                        Annuler les<br />
                        verrouillages<br />
                        BV1 à BV13<br />
                        <span style={{ fontSize: 16 }}>TOUR 2</span>
                      </div>
                    </div>
                  </div>

                </div>
                {/* FIN LIGNE AVEC 3 BLOCS */}
                <ConfigBureaux />
                <ConfigCandidats />
                <AuditLog />
              </>
            )}
          </>
        );
      default:
        return <Dashboard electionState={safeElectionState} onNavigate={navigateSafe} />;
    }
  };

  // --- Rendu conditionnel sans return anticipé (évite bug hooks) ---
  if (!accessAuth) {
    return <AccessGate onAuthenticated={(a) => setAccessAuth(a)} />;
  }

  return (
    <div className={`app-root theme-tour-${safeElectionState.tourActuel}`}>
      {/* Profil INFO : barre minimale (connexion + tour) avec boutons Informations / Participation */}
      {accessAuth?.role === "INFO" ? (
        <nav className="main-navigation" aria-label="Barre INFO" style={{ paddingBottom: 8 }}>
          <div className="nav-header">
            <h1 className="app-title" aria-label="Élections Municipales 2026">
              <span className="app-title-main">Élections Municipales</span>
              <span className="app-title-year">2026</span>
            </h1>
            <div className="nav-header-right">
              <div className="election-status" role="status" aria-live="polite">
                <span className={["tour-pill", "tour-pill--t1", safeElectionState.tourActuel === 1 ? "is-active" : "is-inactive"].join(" ")}>1er Tour</span>
                <span className={["tour-pill", "tour-pill--t2", safeElectionState.tourActuel === 2 ? "is-active" : "is-inactive"].join(" ")}>2nd Tour</span>
              </div>
            </div>
          </div>
          {/* ── Boutons navigation INFO : Informations + Participation + actions ── */}
          <div className="info-profile-nav-row">
            <div className="info-profile-nav-btns">
              <button
                className={`nav-item nav-item--informations${currentPage === "informations" ? " active" : ""}`}
                type="button"
                onClick={() => navigateSafe("informations")}
              >
                ℹ️ Informations
              </button>
              <button
                className={`nav-item nav-item--info-participation${currentPage === "info-participation" ? " active" : ""}`}
                type="button"
                onClick={() => navigateSafe("info-participation")}
              >
                📊 Participation
              </button>
            </div>
            <div className="info-profile-nav-actions">
              {!isAuthenticated ? (
                <button className="nav-item nav-item--google-auth" type="button" onClick={handleSignIn}>Connexion Google</button>
              ) : (
                <button className="nav-item nav-item--google-auth" type="button" onClick={handleSignOut}>Déconnexion Google</button>
              )}
              <button className="nav-item nav-item--quit" type="button" onClick={handleAccessLogout}>Quitter la Session</button>
            </div>
          </div>
          {/* Bande d'informations bleue */}
          <div className="nav-info">
            <div className="top-info-row" role="region" aria-label="Informations scrutin et connexion">
              <div className="info-block">
                <div className="info-label">1er tour</div>
                <div className="info-value">Dimanche 15 mars 2026</div>
              </div>
              <div className="info-block">
                <div className="info-label">2nd tour</div>
                <div className="info-value">Dimanche 22 mars 2026</div>
              </div>
              <div className="info-block info-block--auth">
                <div className="info-label">Base de données</div>
                <div className="info-value">{isAuthenticated ? "Connecté 🟢" : "Non connecté 🔴"}</div>
              </div>
              <div className="info-block info-block--access">
                <div className="info-label">Session</div>
                <div className="info-value">INFO</div>
              </div>
            </div>
          </div>
        </nav>
      ) : (
        <Navigation
          currentPage={currentPage}
          onNavigate={navigateSafe}
          isAuthenticated={isAuthenticated}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
          electionState={safeElectionState}
          accessAuth={accessAuth}
          onAccessLogout={handleAccessLogout}
        />
      )}

      <main className="app-main" role="main">
        <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Chargement…</div>}>
          {currentPage === "dashboard" ? renderPage() : (
            <div className="page-container">
              {renderPage()}
            </div>
          )}
        </Suspense>
      </main>

      <Footer />

      {uiConfirm?.open && (
        <div className="ui-modal-overlay" role="dialog" aria-modal="true">
          <div className="ui-modal">
            <div className="ui-modal-title">{uiConfirm.title}</div>
            <div className="ui-modal-message" style={{ whiteSpace: "pre-wrap" }}>
              {uiConfirm.message}
            </div>
            <div className="ui-modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  const r = uiConfirm._resolve;
                  setUiConfirm((p) => ({ ...p, open: false, _resolve: null }));
                  r?.(false);
                }}
              >
                {uiConfirm.cancelText || "Annuler"}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const r = uiConfirm._resolve;
                  setUiConfirm((p) => ({ ...p, open: false, _resolve: null }));
                  r?.(true);
                }}
              >
                {uiConfirm.confirmText || "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal succès déverrouillage Tour 1 - VERT FONCÉ */}
      {showUnlockT1Success && (
        <div 
          style={{
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
          }}
          onClick={() => setShowUnlockT1Success(false)}
        >
          <div style={{
            background: 'linear-gradient(135deg, #065f46 0%, #047857 100%)',
            color: '#fff',
            borderRadius: 16,
            width: '90%',
            maxWidth: 550,
            padding: 50,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            textAlign: 'center'
          }}
          onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 80, marginBottom: 20 }}>✅</div>
            <h2 style={{ margin: '0 0 20px 0', color: 'white', fontSize: 32, fontWeight: 800 }}>
              Déverrouillage T1
            </h2>
            <p style={{ fontSize: 20, lineHeight: 1.6, opacity: 0.95 }}>
              Tous les bureaux du Tour 1 ({unlockCount}) peuvent à nouveau modifier leurs résultats.
            </p>
          </div>
        </div>
      )}

      {/* Modal succès déverrouillage Tour 2 - BLEU */}
      {showUnlockT2Success && (
        <div 
          style={{
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
          }}
          onClick={() => setShowUnlockT2Success(false)}
        >
          <div style={{
            background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)',
            color: '#fff',
            borderRadius: 16,
            width: '90%',
            maxWidth: 550,
            padding: 50,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            textAlign: 'center'
          }}
          onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 80, marginBottom: 20 }}>✅</div>
            <h2 style={{ margin: '0 0 20px 0', color: 'white', fontSize: 32, fontWeight: 800 }}>
              Déverrouillage T2
            </h2>
            <p style={{ fontSize: 20, lineHeight: 1.6, opacity: 0.95 }}>
              Tous les bureaux du Tour 2 ({unlockCount}) peuvent à nouveau modifier leurs résultats.
            </p>
          </div>
        </div>
      )}

      {/* Modal succès retour Tour 1 - VERT */}
      {showTour1ActiveSuccess && (
        <div 
          style={{
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
          }}
          onClick={() => setShowTour1ActiveSuccess(false)}
        >
          <div style={{
            background: 'linear-gradient(135deg, #065f46 0%, #047857 100%)',
            color: '#fff',
            borderRadius: 16,
            width: '90%',
            maxWidth: 550,
            padding: 50,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            textAlign: 'center'
          }}
          onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 80, marginBottom: 20 }}>✅</div>
            <h2 style={{ margin: '0 0 20px 0', color: 'white', fontSize: 32, fontWeight: 800 }}>
              Tour 1 actif
            </h2>
            <p style={{ fontSize: 20, lineHeight: 1.6, opacity: 0.95 }}>
              Retour au premier tour effectué.
            </p>
          </div>
        </div>
      )}

      {/* Modal succès passage Tour 2 - BLEU */}
      {showTour2ActiveSuccess && (
        <div 
          style={{
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
          }}
          onClick={() => setShowTour2ActiveSuccess(false)}
        >
          <div style={{
            background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)',
            color: '#fff',
            borderRadius: 16,
            width: '90%',
            maxWidth: 550,
            padding: 50,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            textAlign: 'center'
          }}
          onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 80, marginBottom: 20 }}>✅</div>
            <h2 style={{ margin: '0 0 20px 0', color: 'white', fontSize: 32, fontWeight: 800 }}>
              Tour 2 actif
            </h2>
            <p style={{ fontSize: 20, lineHeight: 1.6, opacity: 0.95 }}>
              Passage au second tour effectué.
            </p>
          </div>
        </div>
      )}

      <div className="ui-toasts" aria-live="polite" aria-relevant="additions">
        {uiToasts.map((t) => (
          <div key={t.id} className={`ui-toast ${t.type || "info"}`}>
            {t.title ? <div className="ui-toast-title">{t.title}</div> : null}
            {t.message ? <div className="ui-toast-message">{t.message}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
