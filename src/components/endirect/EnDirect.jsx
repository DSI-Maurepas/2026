// src/components/endirect/EnDirect.jsx
//
// Page "Dépouillement En Direct"
// Accessible aux profils : ADMIN, GLOBAL, DIRECT
//
// Données lues (lecture seule) :
//   - Bureaux      → noms, inscrits
//   - Candidats    → listes, couleurs, actifT1/T2
//   - Resultats_Tx → votants par bureau (non saisissable ici)
//
// Données écrites :
//   - EnDirect_T1 / EnDirect_T2
//     Colonnes : bureauId | listeId | p100 | p200 | ... | p900
//
// Règles métier :
//   - Saisie toutes les 100 unités dépouillées (9 paliers)
//   - Validation uniquement au onBlur (jamais au onChange)
//   - onFocus : si valeur === "0", vider le champ
//   - T1 et T2 sont indépendants (données conservées au basculement)
//   - Aucune relation avec les onglets Resultats_Tx (lecture votants uniquement)

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import googleSheetsService from '../../services/googleSheetsService';
import { useGoogleSheets } from '../../hooks/useGoogleSheets';

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

const PALIERS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const PALIER_KEYS = PALIERS.map((p) => `p${p}`);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const normalizeBvId = (v) => {
  if (!v) return '';
  const s = String(v).trim().toUpperCase();
  const m = s.match(/(\d+)/);
  return m ? `BV${m[1]}` : s;
};

const toInt = (v) => {
  const n = parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

// Couleurs selon le tour
const tourColors = (t) =>
  t === 2
    ? { solid: '#2563eb', light: '#dbeafe', text: '#1e40af', bg: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)' }
    : { solid: '#047857', light: '#d1fae5', text: '#065f46', bg: 'linear-gradient(135deg, #065f46 0%, #047857 100%)' };

// ─────────────────────────────────────────────────────────────────────────────
// Sous-composants de cellule (évite les fonctions inline dans le render)
// ─────────────────────────────────────────────────────────────────────────────

const TH = ({ children, style = {} }) => (
  <th
    style={{
      background: '#1e3c72',
      color: '#fff',
      padding: '8px 6px',
      fontSize: 11,
      fontWeight: 700,
      textAlign: 'center',
      textTransform: 'uppercase',
      letterSpacing: '0.3px',
      whiteSpace: 'nowrap',
      borderRight: '1px solid rgba(255,255,255,0.12)',
      ...style,
    }}
  >
    {children}
  </th>
);

// ─────────────────────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────────────────────

export default function EnDirect({ electionState }) {
  const tourActuel = electionState?.tourActuel === 2 ? 2 : 1;

  // L'utilisateur peut afficher T1 ou T2 indépendamment
  const [viewTour, setViewTour] = useState(tourActuel);

  const sheet = viewTour === 2 ? 'EnDirect_T2' : 'EnDirect_T1';
  const resultatsSheet = viewTour === 2 ? 'Resultats_T2' : 'Resultats_T1';

  // ── Sources de données ─────────────────────────────────────────────────
  const { data: bureaux } = useGoogleSheets('Bureaux');
  const { data: candidats } = useGoogleSheets('Candidats');
  const { data: resultats } = useGoogleSheets(resultatsSheet);
  const { data: enDirectData, load: reloadEnDirect } = useGoogleSheets(sheet);

  // ── État local ──────────────────────────────────────────────────────────
  // inputs : { [rowKey]: { p100: '', p200: '', ..., p900: '' } }
  const [inputs, setInputs] = useState({});
  const [savingCell, setSavingCell] = useState(null);

  // Anti-doublon sauvegarde concurrente
  const isSavingRef = useRef(null);
  // Mémorise les rowIndex après appendRow (avant que reloadEnDirect retourne)
  const pendingRowIdxRef = useRef({});

  // ── Bureaux actifs triés ───────────────────────────────────────────────
  const bureauxList = useMemo(() => {
    const list = Array.isArray(bureaux) ? bureaux : [];
    return list
      .filter((b) => b.actif === true || b.actif === 'TRUE' || b.actif === 1)
      .sort((a, b) => {
        const na = parseInt(String(a.id).replace(/\D/g, ''), 10) || 0;
        const nb = parseInt(String(b.id).replace(/\D/g, ''), 10) || 0;
        return na - nb;
      });
  }, [bureaux]);

  // ── Candidats actifs pour ce tour ─────────────────────────────────────
  const candidatsActifs = useMemo(() => {
    const list = Array.isArray(candidats) ? candidats : [];
    const filtered = list.filter((c) =>
      viewTour === 1 ? !!c.actifT1 : !!c.actifT2
    );
    filtered.sort((a, b) => (Number(a.ordre) || 0) - (Number(b.ordre) || 0));
    return filtered;
  }, [candidats, viewTour]);

  // ── Map EnDirect : "BV1_L1" → row ─────────────────────────────────────
  const enDirectMap = useMemo(() => {
    const map = {};
    (Array.isArray(enDirectData) ? enDirectData : []).forEach((r) => {
      const bvId = normalizeBvId(r?.bureauId);
      const listeId = String(r?.listeId ?? '').trim();
      if (bvId && listeId) map[`${bvId}_${listeId}`] = r;
    });
    return map;
  }, [enDirectData]);

  // ── Votants par bureau (lecture seule depuis Resultats_Tx) ─────────────
  const votantsMap = useMemo(() => {
    const map = {};
    (Array.isArray(resultats) ? resultats : []).forEach((r) => {
      const bvId = normalizeBvId(r?.bureauId);
      if (bvId) map[bvId] = toInt(r?.votants);
    });
    return map;
  }, [resultats]);

  // ── Initialisation des inputs depuis les données Google Sheets ─────────
  useEffect(() => {
    pendingRowIdxRef.current = {}; // reset après chaque rechargement
    const next = {};
    bureauxList.forEach((b) => {
      const bvId = normalizeBvId(b.id);
      candidatsActifs.forEach((c) => {
        const rowKey = `${bvId}_${c.listeId}`;
        const row = enDirectMap[rowKey];
        const paliers = {};
        PALIER_KEYS.forEach((pk) => {
          paliers[pk] = row ? String(row[pk] ?? '') : '';
        });
        next[rowKey] = paliers;
      });
    });
    setInputs(next);
  }, [enDirectMap, bureauxList, candidatsActifs]);

  // ── Changement de valeur (buffer, aucune validation pendant la frappe) ─
  const handleChange = useCallback((rowKey, pk, value) => {
    setInputs((prev) => ({
      ...prev,
      [rowKey]: { ...prev[rowKey], [pk]: value },
    }));
  }, []);

  // ── Sauvegarde sur blur ────────────────────────────────────────────────
  const handleBlur = useCallback(
    async (bvId, listeId, pk) => {
      const rowKey = `${bvId}_${listeId}`;
      const cellKey = `${rowKey}_${pk}`;

      // Anti-doublon
      if (isSavingRef.current === cellKey) return;

      const raw = inputs[rowKey]?.[pk] ?? '';
      // Ne pas sauvegarder si champ vide
      if (raw === '') return;

      const n = parseInt(raw, 10);
      if (!Number.isFinite(n) || n < 0) return;

      isSavingRef.current = cellKey;
      setSavingCell(cellKey);

      try {
        const existingRow = enDirectMap[rowKey];
        // Utilise le rowIndex depuis la map OU depuis le ref (appendRow précédent)
        const existingRowIdx =
          existingRow?.rowIndex ?? pendingRowIdxRef.current[rowKey];

        // Construit la ligne complète avec toutes les valeurs courantes
        const rowData = {
          bureauId: bvId,
          listeId,
          ...PALIER_KEYS.reduce(
            (acc, k) => ({ ...acc, [k]: toInt(inputs[rowKey]?.[k]) }),
            {}
          ),
          [pk]: n, // écrase avec la valeur validée
        };

        if (existingRowIdx !== undefined && existingRowIdx !== null) {
          await googleSheetsService.updateRow(sheet, existingRowIdx, rowData);
        } else {
          const appended = await googleSheetsService.appendRow(sheet, rowData);
          // Mémorise le rowIndex pour les sauvegardes suivantes sur cette ligne
          if (appended?.rowIndex !== undefined) {
            pendingRowIdxRef.current[rowKey] = appended.rowIndex;
          }
        }

        await reloadEnDirect();
      } catch (e) {
        console.error('[EnDirect] Erreur sauvegarde:', e);
      } finally {
        isSavingRef.current = null;
        setSavingCell(null);
      }
    },
    [inputs, enDirectMap, sheet, reloadEnDirect]
  );

  // ── Totaux par liste et par palier (toutes communes confondues) ────────
  const totauxParListe = useMemo(() => {
    const res = {};
    candidatsActifs.forEach((c) => {
      res[c.listeId] = {};
      PALIER_KEYS.forEach((pk) => {
        res[c.listeId][pk] = bureauxList.reduce((s, b) => {
          const bvId = normalizeBvId(b.id);
          return s + toInt(inputs[`${bvId}_${c.listeId}`]?.[pk]);
        }, 0);
      });
    });
    return res;
  }, [inputs, bureauxList, candidatsActifs]);

  // ── Total voix toutes listes par palier ───────────────────────────────
  const totalParPalier = useMemo(() => {
    const res = {};
    PALIER_KEYS.forEach((pk) => {
      res[pk] = candidatsActifs.reduce(
        (s, c) => s + (totauxParListe[c.listeId]?.[pk] || 0),
        0
      );
    });
    return res;
  }, [totauxParListe, candidatsActifs]);

  // ── Données graphique ─────────────────────────────────────────────────
  const chartData = useMemo(
    () =>
      PALIERS.map((p, i) => {
        const pk = PALIER_KEYS[i];
        const entry = { name: String(p) };
        candidatsActifs.forEach((c) => {
          entry[c.listeId] = totauxParListe[c.listeId]?.[pk] || 0;
        });
        return entry;
      }),
    [totauxParListe, candidatsActifs]
  );

  // ── Stats rapides ──────────────────────────────────────────────────────
  const totalInscrits = useMemo(
    () => bureauxList.reduce((s, b) => s + (Number(b.inscrits) || 0), 0),
    [bureauxList]
  );

  // Dernier palier renseigné (pour indiquer l'avancement)
  const dernierPalierRenseigne = useMemo(() => {
    let last = 0;
    PALIER_KEYS.forEach((pk, i) => {
      const total = totalParPalier[pk] || 0;
      if (total > 0) last = PALIERS[i];
    });
    return last;
  }, [totalParPalier]);

  const tc = tourColors(viewTour);
  const nListes = candidatsActifs.length;

  // ─────────────────────────────────────────────────────────────────────
  // Rendu
  // ─────────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '0 0 48px 0' }}>

      {/* ── EN-TÊTE ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#1e293b' }}>
          📡 Dépouillement En Direct
        </h2>

        {/* Sélecteur de tour */}
        <div style={{ display: 'flex', gap: 6 }}>
          {[1, 2].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setViewTour(t)}
              style={{
                padding: '5px 18px',
                borderRadius: 20,
                border: 'none',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                background:
                  viewTour === t
                    ? t === 1
                      ? '#047857'
                      : '#2563eb'
                    : '#e2e8f0',
                color: viewTour === t ? '#fff' : '#475569',
                transition: 'all 0.2s',
              }}
            >
              Tour {t}
            </button>
          ))}
        </div>

        <span
          style={{
            background: tc.light,
            color: tc.text,
            fontSize: 11,
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: 20,
            border: `1px solid ${tc.solid}`,
          }}
        >
          {bureauxList.length} bureaux &bull; {totalInscrits.toLocaleString('fr-FR')} inscrits
          {dernierPalierRenseigne > 0 && (
            <> &bull; Dernier palier : <strong>{dernierPalierRenseigne}</strong></>
          )}
        </span>
      </div>

      {/* ── AUCUNE LISTE ACTIVE ─────────────────────────────────────── */}
      {nListes === 0 && (
        <div
          style={{
            padding: 20,
            background: '#fef3c7',
            borderRadius: 8,
            border: '1px solid #fde68a',
            color: '#92400e',
          }}
        >
          ⚠️ Aucune liste active pour le Tour {viewTour}. Vérifiez la configuration
          des candidats dans l&apos;onglet Administration.
        </div>
      )}

      {/* ── TABLEAU + GRAPHIQUE ─────────────────────────────────────── */}
      {nListes > 0 && (
        <>
          {/* ── TABLEAU DE SAISIE ──────────────────────────────────── */}
          <div
            style={{
              overflowX: 'auto',
              borderRadius: 10,
              boxShadow: '0 2px 14px rgba(0,0,0,0.09)',
              border: '1px solid #e2e8f0',
              marginBottom: 28,
            }}
          >
            <table
              style={{
                borderCollapse: 'collapse',
                fontSize: 12,
                background: '#fff',
                minWidth: 860,
              }}
            >
              <thead>
                <tr>
                  <TH style={{ textAlign: 'left', minWidth: 110, position: 'sticky', left: 0, zIndex: 5 }}>
                    Bureau
                  </TH>
                  <TH style={{ minWidth: 64 }}>Inscrits</TH>
                  <TH style={{ minWidth: 64 }}>Votants&nbsp;*</TH>
                  <TH style={{ textAlign: 'left', minWidth: 140 }}>Liste</TH>
                  {PALIERS.map((p) => (
                    <TH key={p} style={{ minWidth: 54 }}>
                      {p}
                    </TH>
                  ))}
                </tr>
              </thead>

              <tbody>
                {bureauxList.flatMap((bureau, bIdx) => {
                  const bvId = normalizeBvId(bureau.id);
                  const inscrits = Number(bureau.inscrits) || 0;
                  const votants = votantsMap[bvId] || 0;
                  const bgRow = bIdx % 2 === 0 ? '#fff' : '#f8fafc';

                  return candidatsActifs.map((c, cIdx) => {
                    const rowKey = `${bvId}_${c.listeId}`;
                    const isFirst = cIdx === 0;
                    const isLast = cIdx === nListes - 1;
                    const bdrBtm = isLast
                      ? '2px solid #cbd5e1'
                      : '1px solid #e8ecf0';

                    return (
                      <tr key={rowKey} style={{ background: bgRow }}>

                        {/* ── Bureau (rowspan) ── */}
                        {isFirst && (
                          <td
                            rowSpan={nListes}
                            style={{
                              padding: '6px 8px',
                              fontWeight: 700,
                              fontSize: 11,
                              background: bgRow,
                              position: 'sticky',
                              left: 0,
                              zIndex: 2,
                              borderRight: '2px solid #cbd5e1',
                              borderBottom: '2px solid #cbd5e1',
                              verticalAlign: 'middle',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <div style={{ color: '#1e293b', fontSize: 12 }}>{bvId}</div>
                            <div
                              style={{
                                color: '#64748b',
                                fontWeight: 400,
                                fontSize: 10,
                                maxWidth: 96,
                                whiteSpace: 'normal',
                                lineHeight: 1.3,
                              }}
                            >
                              {bureau.nom}
                            </div>
                          </td>
                        )}

                        {/* ── Inscrits (rowspan) ── */}
                        {isFirst && (
                          <td
                            rowSpan={nListes}
                            style={{
                              padding: '4px 6px',
                              textAlign: 'center',
                              fontWeight: 700,
                              fontSize: 12,
                              verticalAlign: 'middle',
                              borderRight: '1px solid #e8ecf0',
                              borderBottom: '2px solid #cbd5e1',
                              background: bgRow,
                              color: '#374151',
                            }}
                          >
                            {inscrits.toLocaleString('fr-FR')}
                          </td>
                        )}

                        {/* ── Votants (rowspan, lecture seule) ── */}
                        {isFirst && (
                          <td
                            rowSpan={nListes}
                            style={{
                              padding: '4px 6px',
                              textAlign: 'center',
                              fontWeight: votants > 0 ? 700 : 400,
                              fontSize: 12,
                              verticalAlign: 'middle',
                              borderRight: '2px solid #cbd5e1',
                              borderBottom: '2px solid #cbd5e1',
                              background: bgRow,
                              color: votants > 0 ? '#047857' : '#94a3b8',
                            }}
                          >
                            {votants > 0 ? votants.toLocaleString('fr-FR') : '—'}
                          </td>
                        )}

                        {/* ── Nom de la liste ── */}
                        <td
                          style={{
                            padding: '3px 7px',
                            whiteSpace: 'nowrap',
                            borderBottom: bdrBtm,
                            borderRight: '2px solid #cbd5e1',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 5,
                            }}
                          >
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 2,
                                background: c.couleur || '#94a3b8',
                                flexShrink: 0,
                                display: 'inline-block',
                              }}
                            />
                            <span
                              style={{
                                fontWeight: 700,
                                color: '#1e293b',
                                fontSize: 11,
                              }}
                            >
                              {c.listeId}
                            </span>
                            <span
                              style={{
                                color: '#64748b',
                                fontSize: 10,
                                maxWidth: 90,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {String(c.nomListe || '').replace(/^Liste /i, '')}
                            </span>
                          </div>
                        </td>

                        {/* ── Cellules de saisie (9 paliers) ── */}
                        {PALIER_KEYS.map((pk) => {
                          const cellKey = `${rowKey}_${pk}`;
                          const isSaving = savingCell === cellKey;
                          const val = inputs[rowKey]?.[pk] ?? '';
                          const hasVal =
                            val !== '' && val !== '0' && toInt(val) > 0;

                          return (
                            <td
                              key={pk}
                              style={{
                                padding: '2px 3px',
                                borderBottom: bdrBtm,
                                borderRight: '1px solid #f1f5f9',
                                textAlign: 'center',
                              }}
                            >
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="\d*"
                                value={val}
                                onChange={(e) =>
                                  handleChange(rowKey, pk, e.target.value)
                                }
                                onFocus={() => {
                                  if (String(val) === '0')
                                    handleChange(rowKey, pk, '');
                                }}
                                onBlur={() =>
                                  handleBlur(bvId, c.listeId, pk)
                                }
                                disabled={isSaving}
                                aria-label={`${bvId} ${c.listeId} dépouillement ${pk.replace('p', '')}`}
                                style={{
                                  width: 48,
                                  padding: '3px 4px',
                                  border: `1.5px solid ${
                                    isSaving
                                      ? '#fbbf24'
                                      : hasVal
                                      ? c.couleur || '#93c5fd'
                                      : '#e2e8f0'
                                  }`,
                                  borderRadius: 4,
                                  fontSize: 12,
                                  textAlign: 'center',
                                  background: isSaving
                                    ? '#fef9c3'
                                    : hasVal
                                    ? `${c.couleur}1a`
                                    : '#fff',
                                  outline: 'none',
                                  fontVariantNumeric: 'tabular-nums',
                                  fontWeight: hasVal ? 700 : 400,
                                  color: hasVal ? '#1e293b' : '#94a3b8',
                                  cursor: isSaving ? 'wait' : 'text',
                                  boxSizing: 'border-box',
                                }}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  });
                })}

                {/* ── TOTAL COMMUNAL — ligne d'en-tête ────────────────── */}
                <tr>
                  <td
                    colSpan={4}
                    style={{
                      padding: '7px 10px',
                      fontWeight: 800,
                      fontSize: 11,
                      background: '#1e293b',
                      color: '#fff',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      position: 'sticky',
                      left: 0,
                      zIndex: 2,
                      borderTop: '2px solid #334155',
                    }}
                  >
                    Total communal
                  </td>
                  {PALIER_KEYS.map((pk) => (
                    <td
                      key={pk}
                      style={{
                        textAlign: 'center',
                        fontWeight: 800,
                        fontSize: 12,
                        background: '#1e293b',
                        color: '#fff',
                        padding: '7px 4px',
                        borderTop: '2px solid #334155',
                        borderRight: '1px solid #334155',
                      }}
                    >
                      {totalParPalier[pk] > 0
                        ? totalParPalier[pk].toLocaleString('fr-FR')
                        : '—'}
                    </td>
                  ))}
                </tr>

                {/* ── TOTAL PAR LISTE ─────────────────────────────────── */}
                {candidatsActifs.map((c) => (
                  <tr
                    key={`total_${c.listeId}`}
                    style={{
                      background: c.couleur ? `${c.couleur}10` : '#f8fafc',
                    }}
                  >
                    <td
                      colSpan={4}
                      style={{
                        padding: '5px 10px',
                        position: 'sticky',
                        left: 0,
                        zIndex: 2,
                        background: c.couleur ? `${c.couleur}10` : '#f8fafc',
                        borderBottom: '1px solid #e2e8f0',
                        borderRight: '2px solid #cbd5e1',
                      }}
                    >
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 7 }}
                      >
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            background: c.couleur || '#94a3b8',
                            display: 'inline-block',
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ fontWeight: 700, fontSize: 11 }}>
                          {c.listeId}
                        </span>
                        <span style={{ fontSize: 10, color: '#475569' }}>
                          {`${c.teteListePrenom || ''} ${c.teteListeNom || ''}`.trim()}
                          {c.nomListe
                            ? ` — ${String(c.nomListe).replace(/^Liste /i, '')}`
                            : ''}
                        </span>
                      </div>
                    </td>
                    {PALIER_KEYS.map((pk) => {
                      const val = totauxParListe[c.listeId]?.[pk] || 0;
                      const total = totalParPalier[pk] || 0;
                      const pct =
                        total > 0
                          ? ((val / total) * 100).toFixed(1)
                          : null;
                      return (
                        <td
                          key={pk}
                          style={{
                            textAlign: 'center',
                            padding: '4px 4px',
                            borderBottom: '1px solid #e2e8f0',
                            borderRight: '1px solid #f1f5f9',
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: 12,
                              color: val > 0 ? '#1e293b' : '#cbd5e1',
                            }}
                          >
                            {val > 0 ? val.toLocaleString('fr-FR') : '—'}
                          </div>
                          {pct !== null && (
                            <div
                              style={{
                                fontSize: 10,
                                color: c.couleur || '#64748b',
                                fontWeight: 600,
                                lineHeight: 1.2,
                              }}
                            >
                              {pct}%
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── NOTE BAS DE TABLEAU ──────────────────────────────────── */}
          <div
            style={{
              marginBottom: 24,
              fontSize: 11,
              color: '#94a3b8',
              display: 'flex',
              gap: 20,
              flexWrap: 'wrap',
            }}
          >
            <span>💾 Sauvegarde automatique à chaque sortie de cellule</span>
            <span>* Votants : lecture seule depuis les résultats officiels</span>
            <span>
              📋 Onglet :{' '}
              <code
                style={{
                  background: '#f1f5f9',
                  padding: '1px 5px',
                  borderRadius: 3,
                  fontSize: 11,
                }}
              >
                {sheet}
              </code>
            </span>
          </div>

          {/* ── GRAPHIQUE BARRES EMPILÉES ────────────────────────────── */}
          <div
            style={{
              background: '#fff',
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              padding: '20px 20px 8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            <h3
              style={{
                margin: '0 0 4px 0',
                fontSize: 15,
                fontWeight: 800,
                color: '#1e293b',
              }}
            >
              📊 Progression des voix — Total communal — Tour {viewTour}
            </h3>
            <p
              style={{
                margin: '0 0 16px 0',
                fontSize: 11,
                color: '#94a3b8',
              }}
            >
              Barres empilées par tranche de 100 dépouillements — couleur par
              liste
            </p>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={chartData}
                margin={{ top: 6, right: 24, left: 0, bottom: 30 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  label={{
                    value: 'Nombre de bulletins dépouillés',
                    position: 'insideBottom',
                    offset: -18,
                    fontSize: 11,
                    fill: '#64748b',
                  }}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value, name) => [
                    `${value.toLocaleString('fr-FR')} voix`,
                    name,
                  ]}
                  contentStyle={{ fontSize: 12, borderRadius: 6 }}
                />
                <Legend
                  iconType="square"
                  wrapperStyle={{ fontSize: 11, paddingTop: 10 }}
                />
                {candidatsActifs.map((c) => (
                  <Bar
                    key={c.listeId}
                    dataKey={c.listeId}
                    name={`${c.listeId} — ${String(c.nomListe || '').replace(/^Liste /i, '')}`}
                    stackId="a"
                    fill={c.couleur || '#94a3b8'}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
