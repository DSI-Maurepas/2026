import React from 'react';
const ConfigurationT2 = ({ electionState}) => {  return (
    <div className="config-t2">
      <h3>⚙️ Configuration 2nd tour</h3>

      <div
        className="card"
        style={{
          padding: '1rem',
          borderRadius: 14,
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 10px 26px rgba(0,0,0,0.06)',
          background: 'rgba(255,255,255,0.92)',
          marginTop: '0.75rem'
        }}
      >
        <p style={{ marginTop: 0, marginBottom: '0.75rem' }}>
          Cette section est réservée aux <strong>paramètres officiels</strong> du 2nd tour.
          Le classement du 1er tour (proposition) est affiché au-dessus ; la <strong>qualification</strong> n’est effective
          qu’après confirmation du passage au 2nd tour.
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{
            flex: '1 1 220px',
            padding: '0.75rem',
            borderRadius: 12,
            background: 'rgba(0,0,0,0.03)',
            border: '1px solid rgba(0,0,0,0.06)'
          }}>
            <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.8, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Date du 2nd tour
            </div>
            <div style={{ marginTop: 6, fontSize: 18, fontWeight: 900 }}>
              {electionState?.dateT2 ? new Date(electionState.dateT2).toLocaleDateString('fr-FR') : '—'}
            </div>
          </div>

          <div style={{
            flex: '1 1 220px',
            padding: '0.75rem',
            borderRadius: 12,
            background: 'rgba(0,0,0,0.03)',
            border: '1px solid rgba(0,0,0,0.06)'
          }}>
            <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.8, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Horaires
            </div>
            <div style={{ marginTop: 6, fontSize: 18, fontWeight: 900 }}>
              08h00 – 20h00
            </div>
          </div>
        </div>

        {!electionState?.candidatsQualifies || electionState.candidatsQualifies.length !== 2 ? (
          <div className="message warning" style={{ marginTop: '0.9rem' }}>
            Le passage au 2nd tour n'a pas encore été effectué.
          </div>
        ) : (
          <div className="message success" style={{ marginTop: '0.9rem' }}>
            ✅ Passage au 2nd tour confirmé : <strong>{electionState.candidatsQualifies?.[0]?.nom || electionState.candidatsQualifies?.[0]?.nomListe}</strong> et{' '}
            <strong>{electionState.candidatsQualifies?.[1]?.nom || electionState.candidatsQualifies?.[1]?.nomListe}</strong>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConfigurationT2;
