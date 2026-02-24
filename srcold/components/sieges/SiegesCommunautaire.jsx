import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGoogleSheets } from '../../hooks/useGoogleSheets';
import calculService from '../../services/calculService';
import googleSheetsService from '../../services/googleSheetsService';
import { useElectionState } from '../../hooks/useElectionState';
import { ELECTION_CONFIG, SHEET_NAMES } from '../../utils/constants';

const SiegesCommunautaire = ({ electionState }) => {
  const { state } = useElectionState();

  // Configuration : nombre de sièges CC
  const { data: config } = useGoogleSheets('Config');

  // Source prioritaire : tableau Google Sheets (voix municipales consolidées par liste)
  const { data: seatsCommunity } = useGoogleSheets('Seats_Community');

  // Source de repli (calcul automatique)
  const { data: candidats } = useGoogleSheets('Candidats');
  const { data: resultats } = useGoogleSheets(state.tourActuel === 1 ? 'Resultats_T1' : 'Resultats_T2');

  const [sieges, setSieges] = useState([]);
  const [totalSieges, setTotalSieges] = useState(ELECTION_CONFIG?.SEATS_COMMUNITY_TOTAL || 7);
  const persistedRef = useRef(false);

  // Lecture du nombre de sièges CC depuis Config (prioritaire sur la constante)
  useEffect(() => {
    if (!config || config.length === 0) return;
    
    const seatsCCRow = config.find(row => {
      const cle = row[0] || row['0'] || '';
      return cle === 'SEATS_COMMUNITY_TOTAL';
    });
    
    if (seatsCCRow) {
      const rawValue = seatsCCRow[1] || seatsCCRow['1'] || ELECTION_CONFIG?.SEATS_COMMUNITY_TOTAL || 7;
      const cleanedValue = String(rawValue).trim();
      const value = Number(cleanedValue);
      
      if (value > 0) {
        setTotalSieges(value);
      }
    }
  }, [config]);

  const seatsCommunityRows = useMemo(() => {
    return (seatsCommunity || [])
      .filter(r => (r?.nomListe || r?.listeId || r?.ListeID || r?.NomListe))
      .map(r => ({
        listeId: (r.listeId || r.ListeID || '').toString().trim(),
        nomListe: (r.nomListe || r.NomListe || r.listeId || r.ListeID || '—').toString().trim(),
        voix: Number(r.voixMunicipal ?? r.VoixMunicipal ?? r.voix ?? r.Voix ?? 0) || 0,
        pctVoix: Number(r.pctMunicipal ?? r.PctMunicipal ?? r.pourcentage ?? r.PctVoix ?? 0) || 0,
        eligible: typeof r.eligible === 'boolean' ? r.eligible : String(r.Eligible ?? '').toUpperCase() === 'TRUE',
        _raw: r
      }));
  }, [seatsCommunity]);

  useEffect(() => {
    // 1) Si Seats_Community est renseigné : on l'utilise comme source de VOIX, puis on calcule
    if (seatsCommunityRows.length > 0) {
      const computed = calculService
        .calculerSiegesCommunautairesDepuisListes(seatsCommunityRows, totalSieges)
        .map(r => {
          const prime = Number(r?.siegesPrime ?? 0) || 0;
          const prop = Number(r?.siegesProportionnels ?? 0) || 0;
          const methode = prime > 0
            ? `Prime (${prime}) + Proportionnelle (${prop})`
            : `Proportionnelle (${prop})`;
          return { ...r, methode };
        });
      setSieges(Array.isArray(computed) ? computed : []);
      return;
    }

    // 2) Calcul de repli : consolider les voix depuis Resultats_T2 + Candidats
    if (!resultats?.length || !candidats?.length) {
      setSieges([]);
      return;
    }

    // Filtrer les candidats actifs au tour actuel
    const candidatsActifs = candidats.filter(c => state.tourActuel === 1 ? c.actifT1 : c.actifT2);
    
    if (candidatsActifs.length === 0) {
      setSieges([]);
      return;
    }

    // Consolider les voix par candidat (somme de tous les bureaux)
    const listesConsolidees = candidatsActifs.map(candidat => {
      const listeId = candidat.listeId || candidat.ListeID || '';
      const nomListe = candidat.nomListe || candidat.NomListe || listeId;
      
      // Somme des voix pour cette liste sur tous les bureaux
      // Les voix sont dans bureau.voix qui est un objet {L1: 770, L2: 249, L3: 200, ...}
      const totalVoix = resultats.reduce((sum, bureau) => {
        const voixObj = bureau.voix || {};
        const voix = Number(voixObj[listeId]) || 0;
        return sum + voix;
      }, 0);
      
      return {
        listeId,
        nomListe,
        voixMunicipal: totalVoix,
        eligible: true
      };
    });

    // Calculer la répartition avec la fonction qui fonctionne
    const normalized = calculService
      .calculerSiegesCommunautairesDepuisListes(listesConsolidees, totalSieges)
      .map(r => {
        const prime = Number(r?.siegesPrime ?? 0) || 0;
        const prop = Number(r?.siegesProportionnels ?? 0) || 0;
        const methode = prime > 0
          ? `Prime (${prime}) + Proportionnelle (${prop})`
          : `Proportionnelle (${prop})`;
        return { ...r, methode };
      });
    
    setSieges(normalized);

    // ── Persistance Google Sheets (Seats_Community) — une seule fois ──
    if (normalized.length > 0 && !persistedRef.current) {
      persistedRef.current = true;
      const totalVoixAll = normalized.reduce((s, r) => s + (Number(r?.voix) || 0), 0);
      const rows = normalized.map(r => [
        r.listeId || '',                                            // A ListeID
        r.nom || r.nomListe || '',                                  // B NomListe
        Number(r.voix) || 0,                                        // C VoixMunicipal
        totalVoixAll > 0 ? ((Number(r.voix) || 0) / totalVoixAll * 100).toFixed(2) : '0', // D PctMunicipal
        Number(r.sieges) || 0,                                      // E SiegesCommunautaires
        (Number(r.pourcentage) || 0) >= 5 ? 'TRUE' : 'FALSE'       // F Eligible
      ]);
      (async () => {
        try {
          await googleSheetsService.clearSheet(SHEET_NAMES.SEATS_COMMUNITY);
          // Écriture header + données
          const header = ['ListeID', 'NomListe', 'VoixMunicipal', 'PctMunicipal', 'SiegesCommunautaires', 'Eligible'];
          await googleSheetsService.appendRows(SHEET_NAMES.SEATS_COMMUNITY, [header, ...rows]);
          console.log('[SiegesCommunautaire] Persistance Sheets OK:', rows.length, 'lignes');
        } catch (e) {
          console.warn('[SiegesCommunautaire] Erreur persistance Sheets:', e);
        }
      })();
    }
  }, [seatsCommunityRows, resultats, candidats, totalSieges, state.tourActuel]);

  return (
    <div 
      className="sieges-communautaire"
      style={{
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
        border: '2px solid #e5e7eb',
        borderTop: '4px solid #3b82f6',
        padding: 0,
        marginBottom: 24,
        overflow: 'hidden'
      }}
    >

      <style>{`
/* Sticky + scroll uniquement pour les tableaux Sièges */
.sieges-scroll {
  position: relative;
  display: block;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: visible;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-x;
  overscroll-behavior-x: contain;
}

/* IMPORTANT: neutralise toute "responsive table" globale (empêche l'empilement en mode mobile) */
.sieges-scroll table { display: table !important; }
.sieges-scroll thead { display: table-header-group !important; }
.sieges-scroll tbody { display: table-row-group !important; }
.sieges-scroll tr { display: table-row !important; }
.sieges-scroll th,
.sieges-scroll td { display: table-cell !important; }

/* Le tableau doit s'adapter à la largeur disponible */
.sieges-scroll table {
  border-collapse: separate;
  border-spacing: 0;
  display: table !important;
  table-layout: fixed;
  width: 100%;
  max-width: 100%;
}

.sieges-scroll thead th {
  position: -webkit-sticky;
  position: sticky;
  top: 0;
  z-index: 20;
  background: #1e3c72;
  color: #fff;
  white-space: nowrap;
  padding: 12px 16px;
}

.sieges-scroll tbody td {
  padding: 10px 16px;
  border-bottom: 1px solid #e0e0e0;
}

/* Largeurs minimales des colonnes pour éviter les chevauchements */
.sieges-scroll th:nth-child(1),
.sieges-scroll td:nth-child(1) { 
  width: 18%; 
  min-width: 140px; 
  white-space: normal !important;  /* Permet retour à ligne */
  word-wrap: break-word;
  line-height: 1.3;
}
.sieges-scroll td:nth-child(1) {
  font-size: 13px;  /* Police réduite pour les noms de listes */
  padding: 8px 12px;
}
.sieges-scroll th:nth-child(2),
.sieges-scroll td:nth-child(2) { width: 12%; min-width: 90px; text-align: right; }
.sieges-scroll th:nth-child(3),
.sieges-scroll td:nth-child(3) { width: 8%; min-width: 70px; text-align: right; }
.sieges-scroll th:nth-child(4),
.sieges-scroll td:nth-child(4) { width: 10%; min-width: 80px; text-align: center; }
.sieges-scroll th:nth-child(5),
.sieges-scroll td:nth-child(5) { width: 10%; min-width: 80px; text-align: center; }
.sieges-scroll th:nth-child(6),
.sieges-scroll td:nth-child(6) { width: 14%; min-width: 100px; text-align: center; }
.sieges-scroll th:nth-child(7),
.sieges-scroll td:nth-child(7) { width: 28%; min-width: 180px; }

.sieges-scroll td { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sieges-scroll td:nth-child(7) { white-space: normal; overflow: visible; }

/* 1ère colonne sticky */
.sieges-scroll th:first-child,
.sieges-scroll td:first-child {
  position: -webkit-sticky;
  position: sticky;
  left: 0;
  z-index: 30;
  background: #fff;
  background-clip: padding-box;
  box-shadow: 2px 0 8px rgba(0,0,0,0.12);
}
.sieges-scroll thead th:first-child {
  z-index: 40;
  background: #1e3c72;
  color: #fff;
}
.sieges-scroll tbody tr:nth-child(even) td:first-child {
  background: #f3f3f3;
}

/* Responsive : scroll horizontal + 1ère colonne 35% plus large */
@media (max-width: 900px) {
  .sieges-scroll {
    overflow-x: auto;
  }
  
  .sieges-scroll table {
    display: inline-table !important;
    min-width: 800px;
    width: 800px;
  }
  
  /* 1ère colonne 35% plus large en responsive */
  .sieges-scroll th:nth-child(1),
  .sieges-scroll td:nth-child(1) { 
    width: 24%; /* 18% + 35% de 18% ≈ 24% */
    min-width: 190px; 
  }
}

      `}</style>

      {/* Header compact moderne */}
      <div style={{ 
        padding: '16px 20px',
        borderBottom: '2px solid #f3f4f6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16
      }}>
        {/* Titre */}
        <div style={{ 
          fontSize: 18, 
          fontWeight: 800, 
          color: '#1e293b',
          display: 'flex', 
          alignItems: 'center', 
          gap: 10
        }}>
          <span style={{ fontSize: 20 }}>🪑</span>
          <span>Répartition des sièges — Conseil Communautaire (SQY)</span>
        </div>

        {/* Total sièges inline */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 6,
          fontSize: 14,
          color: '#64748b'
        }}>
          <span>Total sièges à attribuer :</span>
          <span style={{ fontWeight: 800, color: '#1e293b', fontSize: 18 }}>
            {totalSieges}
          </span>
        </div>
      </div>

      {/* Corps du bloc - Tableau */}
      <div style={{ padding: 20 }}>

      <div className="sieges-scroll">
        <table className="sieges-table">
          <thead>
            <tr>
              <th>LISTE</th>
              <th>VOIX</th>
              <th>%</th>
              <th>PRIME</th>
              <th>PROP.</th>
              <th>TOTAL SIÈGES</th>
              <th>MÉTHODE</th>
            </tr>
          </thead>
          <tbody>
            {sieges.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '16px' }}>
                  Aucune donnée de sièges disponible (vérifier <strong>Seats_Community</strong> ou la consolidation Résultats).
                </td>
              </tr>
            ) : (
              <>
                {sieges.map(s => (
                <tr key={s.candidatId || s.listeId}>
                  <td><strong>{s.nom || s.nomListe}</strong></td>
                  <td>{Number(s.voix || 0).toLocaleString('fr-FR')}</td>
                  <td>{Number(s.pourcentage || 0).toFixed(2)}%</td>
                  <td className="sieges-number">{Number(s.siegesPrime || 0)}</td>
                  <td className="sieges-number">{Number(s.siegesProportionnels || 0)}</td>
                  <td className="sieges-number">{Number(s.sieges || 0)}</td>
                  <td>{s.methode}</td>
                </tr>
                ))}
                {/* Ligne de total — Prime + Proportionnelle + Total sièges */}
                <tr style={{ fontWeight: 'bold', background: '#f5f5f5', borderTop: '2px solid #333' }}>
                  <td><strong>TOTAL</strong></td>
                  <td>{sieges.reduce((sum, s) => sum + (Number(s.voix) || 0), 0).toLocaleString('fr-FR')}</td>
                  <td>100%</td>
                  <td className="sieges-number">{sieges.reduce((sum, s) => sum + (Number(s.siegesPrime) || 0), 0)}</td>
                  <td className="sieges-number">{sieges.reduce((sum, s) => sum + (Number(s.siegesProportionnels) || 0), 0)}</td>
                  <td className="sieges-number">{sieges.reduce((sum, s) => sum + (Number(s.sieges) || 0), 0)}</td>
                  <td>—</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Bloc méthode de calcul moderne */}
      <div style={{
        background: 'rgba(251, 191, 36, 0.08)',
        borderLeft: '4px solid #f59e0b',
        borderRadius: 8,
        padding: '14px 18px',
        marginTop: 16
      }}>
        <div style={{ 
          fontSize: 13, 
          fontWeight: 700, 
          color: '#92400e', 
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}>
          <span>ℹ️</span>
          <span>Méthode de calcul</span>
        </div>
        <div style={{ fontSize: 12, color: '#78350f', lineHeight: 1.6 }}>
          <div style={{ marginBottom: 4 }}>• Prime majoritaire : 50% des sièges (arrondi au supérieur) à la liste en tête</div>
          <div>• Reste : proportionnelle à la plus forte moyenne, seuil 5%</div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default SiegesCommunautaire;
