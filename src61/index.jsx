// src/components/auth/LoginPage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks';
import { ELECTION_CONFIG, ROUTES } from '../../utils/constants';

function LoginPage() {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { signIn, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate(ROUTES.DASHBOARD);
    }
  }, [isAuthenticated, navigate]);

  const handleSignIn = async () => {
    try {
      setLoading(true);
      setError(null);
      await signIn();
    } catch (err) {
      setError(err.message || 'Erreur lors de l\'authentification');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container container-sm" style={{ paddingTop: '4rem' }}>
      <div className="card text-center">
        <div style={{ 
          background: 'linear-gradient(135deg, #0055A4 0%, #003D7A 100%)',
          color: 'white',
          padding: '2rem',
          borderRadius: '0.5rem 0.5rem 0 0',
          marginTop: '-1.5rem',
          marginLeft: '-1.5rem',
          marginRight: '-1.5rem',
          marginBottom: '2rem'
        }}>
          <h1 style={{ color: 'white', margin: '0 0 0.5rem 0' }}>
            Élections Municipales 2026
          </h1>
          <p style={{ margin: 0, opacity: 0.9 }}>
            {ELECTION_CONFIG.COMMUNE_NAME}
          </p>
        </div>

        <div style={{ padding: '1rem' }}>
          <h2>Connexion requise</h2>
          <p className="text-muted">
            Authentifiez-vous avec votre compte Google pour accéder à l'application de gestion électorale.
          </p>

          {error && (
            <div className="alert alert-error">
              {error}
            </div>
          )}

          <button
            onClick={handleSignIn}
            disabled={loading}
            className="btn btn-primary"
            style={{ marginTop: '2rem' }}
          >
            {loading ? 'Connexion en cours...' : 'Se connecter avec Google'}
          </button>

          <div style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '1px solid var(--color-gray-200)' }}>
            <h3>Informations</h3>
            <div style={{ textAlign: 'left', marginTop: '1rem' }}>
              <p><strong>1er tour:</strong> {ELECTION_CONFIG.ELECTION_DATE_T1}</p>
              <p><strong>2nd tour:</strong> {ELECTION_CONFIG.ELECTION_DATE_T2}</p>
              <p><strong>Horaires:</strong> {ELECTION_CONFIG.VOTING_HOURS_START} - {ELECTION_CONFIG.VOTING_HOURS_END}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;

// src/components/dashboard/Dashboard.jsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useElectionState, useGoogleSheets } from '../../hooks';
import { ROUTES } from '../../utils/constants';
import { formatStatut, formatTour } from '../../utils/formatters';

function Dashboard() {
  const { config, currentTour, t1Status, t2Status, loading: stateLoading } = useElectionState();
  const { getBureaux, getCandidats } = useGoogleSheets();
  const [bureaux, setBureaux] = useState([]);
  const [candidats, setCandidats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [bureauxData, candidatsData] = await Promise.all([
        getBureaux(),
        getCandidats()
      ]);
      setBureaux(bureauxData);
      setCandidats(candidatsData);
    } catch (error) {
      console.error('Erreur chargement dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || stateLoading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  const candidatsT1 = candidats.filter(c => c.actifT1);
  const candidatsT2 = candidats.filter(c => c.actifT2);
  const bureauxActifs = bureaux.filter(b => b.actif);
  const totalInscrits = bureauxActifs.reduce((sum, b) => sum + b.inscrits, 0);

  return (
    <div className="container">
      <h1>Tableau de Bord - Élections Municipales 2026</h1>

      {/* Statut élection */}
      <div className="grid grid-3">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Tour Actuel</h3>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--color-primary)' }}>
            {formatTour(currentTour)}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Statut Tour 1</h3>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }} className={`statut-${t1Status.toLowerCase().replace('_', '-')}`}>
            {formatStatut(t1Status)}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Statut Tour 2</h3>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }} className={`statut-${t2Status.toLowerCase().replace('_', '-')}`}>
            {formatStatut(t2Status)}
          </div>
        </div>
      </div>

      {/* Informations principales */}
      <div className="grid grid-2">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Bureaux de Vote</h3>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--color-primary)' }}>
                {bureauxActifs.length}
              </div>
              <div className="text-muted">bureaux actifs</div>
            </div>
            <div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                {totalInscrits.toLocaleString('fr-FR')}
              </div>
              <div className="text-muted">inscrits totaux</div>
            </div>
          </div>
          <Link to={ROUTES.ADMIN_BUREAUX} className="btn btn-outline" style={{ marginTop: '1rem', width: '100%' }}>
            Gérer les bureaux
          </Link>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Candidats / Listes</h3>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--color-primary)' }}>
                {candidatsT1.length}
              </div>
              <div className="text-muted">Tour 1</div>
            </div>
            <div>
              <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--color-secondary)' }}>
                {candidatsT2.length}
              </div>
              <div className="text-muted">Tour 2</div>
            </div>
          </div>
          <Link to={ROUTES.ADMIN_CANDIDATS} className="btn btn-outline" style={{ marginTop: '1rem', width: '100%' }}>
            Gérer les candidats
          </Link>
        </div>
      </div>

      {/* Actions rapides */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Actions Rapides</h3>
        </div>
        <div className="grid grid-3">
          <Link to={ROUTES.PARTICIPATION_T1} className="btn btn-primary">
            📊 Participation T1
          </Link>
          {currentTour === 2 && (
            <Link to={ROUTES.PARTICIPATION_T2} className="btn btn-primary">
              📊 Participation T2
            </Link>
          )}
          <Link to={ROUTES.RESULTATS_T1} className="btn btn-success">
            📋 Résultats T1
          </Link>
          {currentTour === 2 && (
            <Link to={ROUTES.RESULTATS_T2} className="btn btn-success">
              📋 Résultats T2
            </Link>
          )}
          <Link to={ROUTES.SIEGES_MUNICIPAL} className="btn btn-secondary">
              🏛️ Sièges CM
          </Link>
          <Link to={ROUTES.EXPORTS} className="btn btn-warning">
            📥 Exports
          </Link>
        </div>
      </div>

      {/* Candidats */}
      {candidatsT1.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Listes - Tour 1</h3>
          </div>
          <table>
            <thead>
              <tr>
                <th>Liste</th>
                <th>Tête de liste</th>
                <th>Statut T2</th>
              </tr>
            </thead>
            <tbody>
              {candidatsT1.map(c => (
                <tr key={c.listeId}>
                  <td>
                    <span style={{ 
                      display: 'inline-block',
                      width: '12px',
                      height: '12px',
                      backgroundColor: c.couleur,
                      borderRadius: '2px',
                      marginRight: '8px'
                    }}></span>
                    {c.nomListe}
                  </td>
                  <td>{c.teteListePrenom} {c.teteListeNom}</td>
                  <td>
                    {c.actifT2 ? (
                      <span className="badge badge-success">Qualifié</span>
                    ) : (
                      <span className="badge">Non qualifié</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Configuration */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Configuration</h3>
        </div>
        <div className="grid grid-2">
          <div>
            <strong>Sièges Conseil Municipal:</strong> {config?.SEATS_MUNICIPAL_TOTAL || 35}
          </div>
          <div>
            <strong>Sièges Conseil Communautaire:</strong> {config?.SEATS_COMMUNITY_TOTAL || 7}
          </div>
          <div>
            <strong>Seuil éligibilité:</strong> {config?.SEATS_THRESHOLD_PCT || 5}%
          </div>
          <div>
            <strong>Commune:</strong> {config?.COMMUNE_NAME} ({config?.COMMUNE_CODE})
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
