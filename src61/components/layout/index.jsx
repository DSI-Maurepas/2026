// src/components/layout/Header.jsx
import React from 'react';
import { useAuth } from '../../hooks';
import { ELECTION_CONFIG } from '../../utils/constants';

function Header() {
  const { user, signOut } = useAuth();

  return (
    <header className="app-header">
      <div className="container header-content">
        <div>
          <h1 className="header-title">
            Élections Municipales 2026
          </h1>
          <div className="header-subtitle">
            {ELECTION_CONFIG.COMMUNE_NAME} - {ELECTION_CONFIG.COMMUNE_CODE}
          </div>
        </div>
        
        {user && (
          <div className="header-user">
            <span>{user.email}</span>
            <button onClick={signOut} className="btn btn-outline">
              Déconnexion
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

export default Header;

// src/components/layout/Navigation.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import { useElectionState } from '../../hooks';
import { ROUTES } from '../../utils/constants';

function Navigation() {
  const { currentTour } = useElectionState();

  return (
    <nav className="app-nav">
      <div className="container">
        <ul className="nav-list">
          <li className="nav-item">
            <NavLink to={ROUTES.DASHBOARD} className="nav-link">
              Tableau de bord
            </NavLink>
          </li>
          
          <li className="nav-item">
            <NavLink to={ROUTES.PARTICIPATION_T1} className="nav-link">
              Participation T1
            </NavLink>
          </li>
          
          {currentTour === 2 && (
            <li className="nav-item">
              <NavLink to={ROUTES.PARTICIPATION_T2} className="nav-link">
                Participation T2
              </NavLink>
            </li>
          )}
          
          <li className="nav-item">
            <NavLink to={ROUTES.RESULTATS_T1} className="nav-link">
              Résultats T1
            </NavLink>
          </li>
          
          {currentTour === 2 && (
            <li className="nav-item">
              <NavLink to={ROUTES.RESULTATS_T2} className="nav-link">
                Résultats T2
              </NavLink>
            </li>
          )}
          
          <li className="nav-item">
            <NavLink to={ROUTES.SECOND_TOUR} className="nav-link">
              Second Tour
            </NavLink>
          </li>
          
          <li className="nav-item">
            <NavLink to={ROUTES.SIEGES_MUNICIPAL} className="nav-link">
              Sièges CM
            </NavLink>
          </li>
          
          <li className="nav-item">
            <NavLink to={ROUTES.SIEGES_COMMUNAUTAIRE} className="nav-link">
              Sièges CC
            </NavLink>
          </li>
          
          <li className="nav-item">
            <NavLink to={ROUTES.EXPORTS} className="nav-link">
              Exports
            </NavLink>
          </li>
          
          <li className="nav-item">
            <NavLink to={ROUTES.ADMIN_CANDIDATS} className="nav-link">
              Admin
            </NavLink>
          </li>
        </ul>
      </div>
    </nav>
  );
}

export default Navigation;

// src/components/layout/Footer.jsx
import React from 'react';
import { ELECTION_CONFIG } from '../../utils/constants';

function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="app-footer">
      <div className="container footer-content">
        <div>
          © {currentYear} Mairie de {ELECTION_CONFIG.COMMUNE_NAME} - Tous droits réservés
        </div>
        <div className="text-muted">
          Application Élections Municipales v1.0.0
        </div>
      </div>
    </footer>
  );
}

export default Footer;
