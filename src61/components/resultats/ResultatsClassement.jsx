import React, { useMemo } from 'react';
import useGoogleSheets from '../../hooks/useGoogleSheets';
import { getAuthState, isBV } from '../../services/authService';

const COLORS = ['#2563eb', '#16a34a', '#f97316', '#a855f7', '#ef4444', '#14b8a6', '#f59e0b'];

const n = (v) => {
  const num = Number(String(v ?? '').replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(num) ? num : 0;
};

const getCandidateName = (c, idx) => {
  const nomListe = (c?.nomListe ?? '').toString().trim();
  if (nomListe) return nomListe;
  const prenom = (c?.teteListePrenom ?? '').toString().trim();
  const nom = (c?.teteListeNom ?? '').toString().trim();
  const full = [prenom, nom].filter(Boolean).join(' ');
  if (full) return full;
  const legacy = c?.nom ?? c?.name ?? c?.Nom ?? c?.label;
  return (legacy && String(legacy).trim()) ? String(legacy).trim() : `Candidat ${idx + 1}`;
};

const getCandidateId = (c, idx) => {
  const listeId = c?.listeId ?? c?.id ?? c?.code ?? c?.key;
  if (listeId && String(listeId).trim()) return String(listeId).trim();
  return `L${idx + 1}`;
};

const ResultatsClassement = ({ electionState }) => {
  const auth = useMemo(() => getAuthState(), []);
  const isBureau = isBV(auth);

  const tourActuel = electionState?.tourActuel || 1;
  const isTour1 = tourActuel === 1;

  const { data: candidats } = useGoogleSheets('Candidats');
  const { data: resultatsRaw } = useGoogleSheets(tourActuel === 1 ? 'Resultats_T1' : 'Resultats_T2');
  
  const resultats = Array.isArray(resultatsRaw) ? resultatsRaw : [];
  const candidatsArray = useMemo(() => {
    const list = Array.isArray(candidats) ? candidats : [];
    return list.filter((c) => (tourActuel === 1 ? !!c.actifT1 : !!c.actifT2));
  }, [candidats, tourActuel]);

  const totalExprimes = useMemo(() => {
    return resultats.reduce((acc, r) => acc + n(r.exprimes ?? r.Exprimes), 0);
  }, [resultats]);

  const classement = useMemo(() => {
    if (!candidatsArray.length) return [];

    const totals = candidatsArray.map((c, idx) => {
      const id = getCandidateId(c, idx);
      const totalVoix = resultats.reduce((acc, r) => {
        const voixObj = r.voix || r.Voix || {};
        const v = voixObj[id] ?? voixObj[`${id}_Voix`] ?? voixObj[`${id}Voix`];
        return acc + n(v);
      }, 0);
      return { id, name: getCandidateName(c, idx), totalVoix };
    });

    const sorted = totals
      .slice()
      .sort((a, b) => b.totalVoix - a.totalVoix)
      .map((c) => ({
        ...c,
        pct: totalExprimes > 0 ? (c.totalVoix / totalExprimes) * 100 : 0,
      }));

    return sorted;
  }, [candidatsArray, resultats, totalExprimes]);

  const SEUIL_QUALIFICATION = 10;
  
  // Logique de qualification selon le tour
  let top2OrQualifies, others;
  
  if (isTour1) {
    // Tour 1 : tous ceux >= 10% sont qualifiés
    const qualifies = classement.filter(c => c.pct >= SEUIL_QUALIFICATION);
    top2OrQualifies = qualifies.length >= 2 ? qualifies : classement.slice(0, 2);
    others = classement.filter(c => !top2OrQualifies.includes(c));
  } else {
    // Tour 2 : seul le 1er est qualifié (gagnant)
    top2OrQualifies = classement.slice(0, 1);
    others = classement.slice(1);
  }

  // --- RENDU DES CARTES INDIVIDUELLES ---
  const classementContent = (
    <>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',  // Réduit de 300px à 250px
        gap: 16,
        marginBottom: 24
      }}>
        {top2OrQualifies.map((candidat, index) => {
          const rank = classement.findIndex(c => c.id === candidat.id) + 1;
          const color = COLORS[(rank - 1) % COLORS.length];
          
          // Logique de qualification selon le tour
          const isQualifie = isTour1 
            ? (candidat.pct >= SEUIL_QUALIFICATION || rank <= 2)
            : (rank === 1);
          
          // Texte du badge selon le tour
          const badgeText = isTour1 
            ? "✅ LISTE QUALIFIÉ"
            : "🏆 LISTE ÉLUE";
          
          return (
            <div
              key={`${candidat.id}-${rank}`}
              style={{
                background: '#fff',
                borderRadius: 12,
                border: `3px solid ${color}`,
                padding: 16,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
              }}
            >
              {/* Badge au-dessus du nom */}
              <div style={{
                background: isQualifie ? '#10b981' : '#ef4444',
                color: '#fff',
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
                whiteSpace: 'nowrap',
                textAlign: 'center',
                marginBottom: 12
              }}>
                {isQualifie ? badgeText : "⛔ ÉLIMINÉ"}
              </div>

              {/* Rang et Nom */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                <div style={{
                  fontSize: 32,
                  fontWeight: 900,
                  color,
                  lineHeight: 1,
                  minWidth: 40
                }}>
                  {rank}
                </div>
                <div style={{ flex: 1, paddingTop: 4 }}>
                  <div style={{
                    fontSize: 18,
                    fontWeight: 800,
                    color: '#1e293b',
                    lineHeight: 1.3
                  }}>
                    {candidat.name}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                marginTop: 12
              }}>
                <div style={{
                  fontSize: 24,
                  fontWeight: 900,
                  color: '#1e293b'
                }}>
                  {candidat.totalVoix.toLocaleString('fr-FR')}
                </div>
                <div style={{
                  fontSize: 24,
                  fontWeight: 900,
                  color
                }}>
                  {candidat.pct.toFixed(2)}%
                </div>
              </div>

              {/* Barre de progression seulement si qualifié */}
              {isQualifie && (
                <div style={{
                  marginTop: 12,
                  background: '#e5e7eb',
                  borderRadius: 999,
                  height: 8,
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${candidat.pct}%`,
                    height: '100%',
                    background: color,
                    borderRadius: 999,
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {others.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{
            fontSize: 16,
            fontWeight: 700,
            color: '#64748b',
            marginBottom: 12,
            paddingLeft: 4
          }}>
            {isTour1 ? 'Autres candidats' : 'Autres listes'}
          </div>
          
          <div style={{
            display: 'grid',
            gap: 12
          }}>
            {others.map((candidat) => {
              const rank = classement.findIndex(c => c.id === candidat.id) + 1;
              const color = COLORS[(rank - 1) % COLORS.length];
              return (
                <div
                  key={`${candidat.id}-${rank}`}
                  style={{
                    background: '#fff',
                    borderRadius: 10,
                    border: '2px solid #e5e7eb',
                    borderLeft: `4px solid ${color}`,
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                    position: 'relative'
                  }}
                >
                  {/* Rang */}
                  <div style={{
                    fontSize: 20,
                    fontWeight: 900,
                    color,
                    minWidth: 30
                  }}>
                    {rank}
                  </div>

                  {/* Nom */}
                  <div style={{
                    flex: '1 1 150px',
                    fontSize: 15,
                    fontWeight: 700,
                    color: '#1e293b'
                  }}>
                    {candidat.name}
                  </div>

                  {/* Stats */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    flex: '0 0 auto'
                  }}>
                    <div style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: '#64748b'
                    }}>
                      {candidat.totalVoix.toLocaleString('fr-FR')}
                    </div>
                    <div style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color
                    }}>
                      {candidat.pct.toFixed(2)}%
                    </div>
                  </div>

                  {/* Badge ÉLIMINÉ à la place de la barre de progression */}
                  {isTour1 && (
                    <div style={{
                      flex: '1 1 100%',
                      marginTop: 8,
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: 6,
                      padding: '6px 12px',
                      textAlign: 'center'
                    }}>
                      <span style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#dc2626'
                      }}>
                        ⛔ LISTE ÉLIMINÉE
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );

  // Modification ici : on affiche si Admin, quel que soit le tour, pour bénéficier du design T2
  const shouldShowOfficialWrap = !isBureau;

  // Configuration dynamique des couleurs selon le tour
  const headerStyle = isTour1
    ? {
        background: 'linear-gradient(135deg, #2e8c71 20%, #6cb29e 100%)', // Vert Émeraude (T1)
        color: '#fff',
        iconColor: '#d1fae5'
      }
    : {
        background: 'linear-gradient(135deg, #0055a4 30%, #297cdb 100%)', // Bleu Royal (T2)
        color: '#fff',
        iconColor: '#dbeafe'
      };

  return (
    <section className="resultats-section">
      {shouldShowOfficialWrap ? (
        <div
          className="resultats-card classement-officiel"
          style={{
            background: '#fff',  // Fond blanc au lieu du gradient
            color: '#1e293b',
            borderRadius: 16,
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            padding: 0,  // Pas de padding pour que le header prenne toute la largeur
            border: `2px solid ${isTour1 ? '#10b981' : '#3b82f6'}`,
            marginBottom: 24,
            overflow: 'hidden'
          }}
        >
          {/* En-tête avec gradient et stats */}
          <div style={{ 
            background: headerStyle.background,
            color: headerStyle.color,
            padding: 20,
            marginBottom: 20 
          }}>
            <div style={{ 
              fontSize: 20, 
              fontWeight: 800, 
              marginBottom: 16, 
              display: 'flex', 
              alignItems: 'center', 
              gap: 8 
            }}>
              <span>🏆</span> Classement officiel <br /> Tour {tourActuel}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              
              {/* Statistique 1 : Exprimés */}
              <div style={{
                background: 'rgba(6, 98, 72, 0.6)',
                backdropFilter: 'blur(8px)',
                borderRadius: 12,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                border: '2px solid rgba(255, 255, 255, 0.8)'
              }}>
                <div style={{ fontSize: 24 }}>🗳️</div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>
                    {totalExprimes.toLocaleString('fr-FR')}
                  </span>
                  <span style={{ fontSize: 17, fontWeight: 500, opacity: 1 }}>
                    Suffrages exprimés
                  </span>
                </div>
              </div>

              {/* Statistique 2 : Qualifiés */}
              <div style={{
                background: 'rgba(6, 98, 72, 0.6)',
                backdropFilter: 'blur(8px)',
                borderRadius: 12,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                border: '2px solid rgba(255, 255, 255, 0.8)'
              }}>
                <div style={{ fontSize: 24 }}>✨</div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>
                    {top2OrQualifies.length}
                  </span>
                  <span style={{ fontSize: 17, fontWeight: 500, opacity: 1 }}>
                    {top2OrQualifies.length === 1 ? 'Liste qualifiée' : 'Listes qualifiées'}
                  </span>
                </div>
              </div>

            </div>
          </div>

          {/* Contenu des cartes */}
          <div style={{ padding: 20 }}>
            {classementContent}
          </div>
        </div>
      ) : (
        classementContent
      )}
    </section>
  );
};

export default ResultatsClassement;