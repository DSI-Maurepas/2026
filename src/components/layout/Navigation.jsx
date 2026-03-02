import React, { useEffect, useState, useRef, useLayoutEffect } from "react";
import { canAccessPage } from "../../config/authConfig";

/**
 * Navigation principale de l'application
 * Menu contextuel selon le tour et l'état de verrouillage
 *
 * Ajout (2026): Filtrage d'accès BV / Global / Admin (codes applicatifs)
 * - Aucun changement de logique métier du tour/verrouillage.
 */
const Navigation = ({ currentPage, onNavigate, isAuthenticated, onSignIn, onSignOut, electionState, accessAuth, onAccessLogout }) => {
  const { tourActuel, tour1Verrouille, tour2Verrouille } = electionState || {};
  const isInfo = accessAuth?.role === 'INFO';

  const isTourLocked = (tourActuel === 1 && tour1Verrouille) || (tourActuel === 2 && tour2Verrouille);

  const getScrutinStatus = () => {
    const now = new Date();
    const tour1Date = new Date(2026, 2, 15);
    const tour2Date = new Date(2026, 2, 22);
    const electionDate = tourActuel === 2 ? tour2Date : tour1Date;

    const start = new Date(electionDate);
    start.setHours(8, 0, 0, 0);
    const end = new Date(electionDate);
    end.setHours(20, 0, 0, 0);

    const sameDay =
      now.getFullYear() === electionDate.getFullYear() &&
      now.getMonth() === electionDate.getMonth() &&
      now.getDate() === electionDate.getDate();

    if (!sameDay) {
      if (now < start) return { label: "Avant ouverture", tone: "warn" };
      return { label: "Scrutin clos", tone: "danger" };
    }

    if (now < start) return { label: "Avant ouverture", tone: "warn" };
    if (now <= end) return { label: "Scrutin ouvert", tone: "ok" };
    return { label: "Scrutin clos", tone: "danger" };
  };

  const scrutinStatus = isTourLocked ? { label: "Tour verrouillé", tone: "locked" } : getScrutinStatus();

  const renderStatusIcon = () => {
    if (scrutinStatus.tone === "ok") return "🟢";
    if (scrutinStatus.tone === "warn") return "🟠";
    if (scrutinStatus.tone === "locked") return "⚪";
    return "🔴";
  };

  // Mapping page -> pageKey (mêmes clés que App.jsx / authConfig)
  const pageKeyFor = (page) => {
    switch (page) {
      case "participation": return "participation_saisie";
      case "resultats": return "resultats_saisie_bureau";
      case "passage-t2": return "passage_second_tour";
      case "sieges": return "sieges";
      case "exports": return "exports";
      case "informations": return "informations";
      case "admin": return "admin_bureaux";
      case "dashboard":
      default:
        return "dashboard";
    }
  };

  const menuItems = [
    { id: "dashboard", label: "📊 Tableau de bord", page: "dashboard" },
    { id: "participation", label: "📋 Participation", page: "participation" },
    { id: "resultats", label: "🗳️ Résultats", page: "resultats" },
    { id: "passage-t2", label: "➡️ Passage T2", page: "passage-t2", disabled: !(tourActuel === 1 && !tour1Verrouille), disabledHint: "Disponible uniquement en Tour 1 (non verrouillé)." },
    { id: "sieges", label: "🪑 Sièges", page: "sieges" },
    { id: "exports", label: "📄 Exports", page: "exports" },
    { id: "informations", label: "ℹ️ Informations", page: "informations" },
    { id: "admin", label: "⚙️ Administration", page: "admin" },
  ];

  // Filtrage d'accès (BV/Global/Admin)
  const visibleItems = menuItems.filter((item) => canAccessPage(accessAuth, pageKeyFor(item.page)));

  // === Responsive nav buttons: même largeur (celle du plus grand) en mobile uniquement ===
  const btnRefs = useRef([]);
  const [mobileBtnWidth, setMobileBtnWidth] = useState(null);
  const [isMobile, setIsMobile] = useState(false);

  useLayoutEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const compute = () => {
      setIsMobile(mq.matches);
      if (!mq.matches) {
        setMobileBtnWidth(null);
        return;
      }
      const widths = btnRefs.current.filter(Boolean).map((el) => Math.ceil(el.getBoundingClientRect().width));
      const max = widths.length ? Math.max(...widths) : null;
      setMobileBtnWidth(max);
    };

    compute();
    window.addEventListener("resize", compute);
    mq.addEventListener?.("change", compute);

    return () => {
      window.removeEventListener("resize", compute);
      mq.removeEventListener?.("change", compute);
    };
  }, [currentPage]);

  return (
    <nav className={`main-navigation${accessAuth?.role === "BV" ? " is-bv" : ""}${isInfo ? " is-info" : ""}`} aria-label="Navigation principale">
      {/* Badge TOUR flottant — visible en mobile ET pour profil INFO en desktop */}
      <div 
        className={`tour-indicator-floating tour-indicator-badge tour-indicator-badge--${tourActuel === 2 ? 2 : 1}`}
      >
        <span className="tour-indicator-icon">{tourActuel === 2 ? "🔵" : "🟢"}</span>
        <span className="tour-indicator-text">{tourActuel === 2 ? "TOUR 2" : "TOUR 1"}</span>
      </div>

      <div className="nav-header">
        <h1 className="app-title" aria-label="Élections Municipales 2026">
          <span className="app-title-main">Élections Municipales</span>
          <span className="app-title-year">2026</span>
        </h1>

        <div className="nav-header-right">
          <div className="election-status" role="status" aria-live="polite">
            <span className={["tour-pill", "tour-pill--t1", tourActuel === 1 ? "is-active" : "is-inactive"].join(" ")} aria-label="Tour 1">
              1er Tour
            </span>

            <span className={["tour-pill", "tour-pill--t2", tourActuel === 2 ? "is-active" : "is-inactive"].join(" ")} aria-label="Tour 2">
              2nd Tour
            </span>

            <span className={["scrutin-status", scrutinStatus.tone, scrutinStatus.tone === "ok" ? "is-pulsing" : ""].join(" ")}>
              {renderStatusIcon()} {scrutinStatus.label}
            </span>
          </div>
        </div>
      </div>

      <div 
        className="nav-menu-row" 
        style={{ 
          display: "flex", 
          alignItems: "center", 
          justifyContent: isInfo ? "flex-start" : "space-between", 
          gap: "1rem", 
          flexWrap: "wrap" 
        }}
      >
        <ul 
          className="nav-menu" 
          style={{
            ...(mobileBtnWidth ? { "--nav-btn-w": `${mobileBtnWidth}px` } : {}),
            ...(isInfo && isMobile ? { 
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: '12px',
              width: '100%'
            } : {}),
            ...(isInfo && !isMobile ? {
              display: 'flex',
              gap: '12px'
            } : {})
          }}
        >
          {/* Badge indicateur de tour — premier élément de la ligne de boutons (desktop) */}
          <li data-menu-id="tour-indicator" style={isInfo ? { display: 'none' } : undefined}>
            <span className={`tour-indicator-badge tour-indicator-badge--${tourActuel === 2 ? 2 : 1}`}>
              <span className="tour-indicator-icon">{tourActuel === 2 ? "🔵" : "🟢"}</span>
              <span className="tour-indicator-text">{tourActuel === 2 ? "TOUR 2" : "TOUR 1"}</span>
            </span>
          </li>
          {visibleItems.map((item, idx) => (
            <li key={item.id} data-menu-id={item.id} style={isInfo && isMobile ? { width: '100%' } : undefined}>
              <button
                data-menu-id={item.id}
                ref={(el) => {
                  btnRefs.current[idx] = el;
                }}
                className={`nav-item nav-item--${item.id} ${currentPage === item.page ? "active" : ""} ${item.disabled ? "is-disabled" : ""}`}
                onClick={() => {
                  if (!item.disabled) onNavigate(item.page);
                }}
                type="button"
                disabled={!!item.disabled}
                title={item.disabled ? item.disabledHint || "Indisponible" : ""}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>

        <div 
          className="nav-menu-actions" 
          style={{ 
            display: "flex", 
            gap: "0.75rem", 
            alignItems: "center", 
            justifyContent: "flex-end", 
            flex: "0 0 auto",
            marginLeft: isInfo ? "auto" : undefined
          }}
        >
          {!isAuthenticated ? (
            <button className="nav-item nav-item--google-auth" type="button" onClick={onSignIn}>Connexion Google</button>
          ) : (
            <button className="nav-item nav-item--google-auth" type="button" onClick={onSignOut}>Déconnexion Google</button>
          )}
          <button className="nav-item nav-item--quit" type="button" onClick={onAccessLogout}>Quitter la Session</button>
        </div>
      </div>

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
            <div className="info-value">
              {isAuthenticated ? "Connecté 🟢" : "Non connecté 🔴"}
            </div>
          </div>

          <div className="info-block info-block--access">
            <div className="info-label">Session</div>
            <div className="info-value">{accessAuth?.role === "BV" ? `🗳️ Bureau de vote ${String(accessAuth?.bureauId || '').replace(/^BV/i, '')}` : accessAuth?.role === "GLOBAL" ? "ADMIN BUREAUX" : accessAuth?.role === "INFO" ? "Tableau de centralisation" : (accessAuth?.role || "—")}</div>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
