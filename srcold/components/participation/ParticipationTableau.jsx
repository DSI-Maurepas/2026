import React, { useEffect, useState, useMemo } from 'react';
import { useGoogleSheets } from '../../hooks/useGoogleSheets';
import { isBV, getAuthState } from '../../services/authService';

/**
 * Tableau de consolidation de la participation
 * Vue globale tous bureaux (ADMIN/GLOBAL) ou vue verticale (BV)
 */
const ParticipationTableau = ({ electionState }) => {
  const { data: bureaux, load: loadBureaux } = useGoogleSheets('Bureaux');
  const { 
    data: participation, 
    load: loadParticipation 
  } = useGoogleSheets(electionState.tourActuel === 1 ? 'Participation_T1' : 'Participation_T2');

  const [totaux, setTotaux] = useState({
    inscrits: 0,
    '09h': 0,
    '10h': 0,
    '11h': 0,
    '12h': 0,
    '13h': 0,
    '14h': 0,
    '15h': 0,
    '16h': 0,
    '17h': 0,
    '18h': 0,
    '19h': 0,
    '20h': 0
  });

  // Détecter si l'utilisateur est un BV
  const isBureauVote = useMemo(() => isBV(getAuthState()), []);
  const currentBureauId = useMemo(() => {
    const auth = getAuthState();
    return auth?.bureauId || null;
  }, []);

  // ⚠️ CORRECTION : Fonction de normalisation des IDs (extrait le numéro)
  const normalizeBureauId = (value) => {
    if (value === null || value === undefined) return '';
    const s = String(value).trim().toUpperCase();
    const m = s.match(/(\d+)/);
    return m ? m[1] : s;
  };

  useEffect(() => {
    loadBureaux();
    loadParticipation();
  }, [loadBureaux, loadParticipation]);

  useEffect(() => {
    // Calculer les totaux
    const newTotaux = participation.reduce((acc, p) => {
      return {
        inscrits: acc.inscrits + (p.inscrits || 0),
        '09h': acc['09h'] + (p.votants09h || 0),
        '10h': acc['10h'] + (p.votants10h || 0),
        '11h': acc['11h'] + (p.votants11h || 0),
        '12h': acc['12h'] + (p.votants12h || 0),
        '13h': acc['13h'] + (p.votants13h || 0),
        '14h': acc['14h'] + (p.votants14h || 0),
        '15h': acc['15h'] + (p.votants15h || 0),
        '16h': acc['16h'] + (p.votants16h || 0),
        '17h': acc['17h'] + (p.votants17h || 0),
        '18h': acc['18h'] + (p.votants18h || 0),
        '19h': acc['19h'] + (p.votants19h || 0),
        '20h': acc['20h'] + (p.votants20h || 0)
      };
    }, {
      inscrits: 0,
      '09h': 0,
      '10h': 0,
      '11h': 0,
      '12h': 0,
      '13h': 0,
      '14h': 0,
      '15h': 0,
      '16h': 0,
      '17h': 0,
      '18h': 0,
      '19h': 0,
      '20h': 0
    });

    setTotaux(newTotaux);
  }, [participation]);

  // ⚠️ CORRECTION : Normaliser les IDs pour la comparaison
  const getBureauData = (bureauId) => {
    const normalized = normalizeBureauId(bureauId);
    return participation.find(p => normalizeBureauId(p.bureauId) === normalized);
  };

  const calculateRate = (votants, inscrits) => {
    if (!inscrits) return 0;
    return ((votants / inscrits) * 100).toFixed(2);
  };

  const HOURS = ['09h','10h','11h','12h','13h','14h','15h','16h','17h','18h','19h','20h'];

  // ========== AFFICHAGE VERTICAL POUR BV ==========
  if (isBureauVote && currentBureauId) {
    const bureau = bureaux.find(b => normalizeBureauId(b.id) === normalizeBureauId(currentBureauId));
    const data = getBureauData(currentBureauId);
    const inscrits = bureau?.inscrits || 0;

    return (
      <div className="participation-tableau participation-tableau--vertical">
        <h3>📊 Consolidation de la participation <br /> Tour {electionState.tourActuel}</h3>
        
        <div className="bureau-info">
          <strong>Bureau :</strong> {bureau?.nom || currentBureauId} <br />
          <strong>Inscrits :</strong> {inscrits.toLocaleString('fr-FR')}
        </div>

        <div className="tableau-vertical-container">
          <table className="participation-table participation-table--vertical">
            <thead>
              <tr>
                <th className="hour-col-vertical">Heure</th>
                <th className="votants-col-vertical">Votants</th>
                <th className="percent-col-vertical">Pourcentage</th>
              </tr>
            </thead>
            <tbody>
              {HOURS.map((h) => {
                const field = `votants${h}`;
                const votants = data?.[field] || 0;
                const rate = calculateRate(votants, inscrits);
                const isEmpty = votants === 0;

                return (
                  <tr key={h} className={isEmpty ? 'is-empty' : 'is-filled'}>
                    <td className="hour-label"><strong>{h}</strong></td>
                    <td className="number">{votants.toLocaleString('fr-FR')}</td>
                    <td className="percent">{rate}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="legend">
          <p><span className="legend-item cell-empty" aria-hidden="true"></span> Cellule heure non renseignée (fond rouge)</p>
        </div>

        <style>{`
/* ⚠️ CORRECTION : Styles pour affichage vertical avec bords arrondis + ombre */
.participation-tableau--vertical .bureau-info {
  background: #e3f2fd;
  padding: 12px 20px;
  margin: 16px 0;
  border-left: 4px solid #2196F3;
  font-size: 1rem;
}

.tableau-vertical-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  margin: 16px 0;
}

.participation-table--vertical {
  width: 100%;
  border-collapse: collapse;
  margin: 0;
}

.participation-table--vertical th {
  background: #1e3c72;
  color: white;
  padding: 12px;
  text-align: left;
  font-weight: 600;
}

.participation-table--vertical td {
  padding: 10px 12px;
  border-bottom: 1px solid #e0e0e0;
}

.participation-table--vertical .hour-label {
  font-weight: bold;
  width: 100px;
}

.participation-table--vertical .number,
.participation-table--vertical .percent {
  text-align: right;
}

/* ⚠️ CORRECTION : Alternance de couleurs pour lisibilité */
.participation-table--vertical tbody tr:nth-child(odd) td {
  background: white;
}

.participation-table--vertical tbody tr:nth-child(even) td {
  background: #f9f9f9;
}

.participation-table--vertical tr.is-empty td {
  background: #ffe0e0 !important;
}

.participation-table--vertical tbody tr:hover td {
  background: #f0f0f0 !important;
}
        `}</style>
      </div>
    );
  }

  // ========== AFFICHAGE HORIZONTAL POUR ADMIN/GLOBAL ==========
  return (
    <div className="participation-tableau">
      <h3>📊 Consolidation de la participation <br /> Tour {electionState.tourActuel}</h3>

      <div className="tableau-scroll">
        <table className="participation-table participation-table--compact">
          <thead>
            <tr>
              <th className="bureau-col">Bureau</th>
              <th className="inscrits-col">Inscrits</th>
              {HOURS.map((h) => (
                <th key={h} className="hour-col">{h}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {bureaux.map((bureau, index) => {
              const data = getBureauData(bureau.id);
              const inscrits = bureau.inscrits || 0;

              return (
                <tr
                  key={bureau.id ?? `${bureau.nom}-${index}`}
                  className={data ? 'has-data' : 'no-data'}
                >
                  <td className="bureau-name">{bureau.nom}</td>
                  <td className="number">{inscrits.toLocaleString('fr-FR')}</td>

                  {HOURS.map((h) => {
                    const field = `votants${h}`;
                    const votants = data?.[field] || 0;
                    const rate = calculateRate(votants, inscrits);
                    return (
                      <td key={`${bureau.id}-${h}`} className={`hour-cell ${votants > 0 ? "is-filled" : "is-empty"}`}>
                        <div className="hour-votants">{votants.toLocaleString('fr-FR')}</div>
                        <div className="hour-percent">{rate}%</div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>

          <tfoot>
            <tr className="total-row has-data">
              <td><strong>TOTAL COMMUNAL</strong></td>
              <td className="number"><strong>{totaux.inscrits.toLocaleString('fr-FR')}</strong></td>

              {HOURS.map((h) => (
                <td key={`total-${h}`} className="hour-cell">
                  <div className="hour-votants"><strong>{(totaux[h] || 0).toLocaleString('fr-FR')}</strong></div>
                  <div className="hour-percent"><strong>{calculateRate((totaux[h] || 0), totaux.inscrits)}%</strong></div>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="legend">
        <p><span className="legend-item cell-empty" aria-hidden="true"></span> Cellule heure non renseignée (fond rouge)</p>
      </div>
    </div>
  );
};

export default ParticipationTableau;
