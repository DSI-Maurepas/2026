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
//   - Saisie toutes les 100 unités dépouillées (9 paliers fixes)
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
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import googleSheetsService from '../../services/googleSheetsService';
import { useGoogleSheets } from '../../hooks/useGoogleSheets';

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

const PALIERS     = [100, 200, 300, 400, 500, 600, 700, 800, 900];
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

const tourColors = (t) =>
  t === 2
    ? { solid: '#2563eb', light: '#dbeafe', text: '#1e40af', bg: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)' }
    : { solid: '#047857', light: '#d1fae5', text: '#065f46', bg: 'linear-gradient(135deg, #065f46 0%, #047857 100%)' };

// ─────────────────────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────────────────────

export default function EnDirect({ electionState }) {
  const tourActuel = electionState?.tourActuel === 2 ? 2 : 1;
  const [viewTour, setViewTour] = useState(tourActuel);

  const sheet          = viewTour === 2 ? 'EnDirect_T2'   : 'EnDirect_T1';
  const resultatsSheet = viewTour === 2 ? 'Resultats_T2'  : 'Resultats_T1';

  const { data: bureaux   } = useGoogleSheets('Bureaux');
  const { data: candidats } = useGoogleSheets('Candidats');
  const { data: resultats } = useGoogleSheets(resultatsSheet);

  // inputs = source de vérité pour l'affichage (initialisé depuis Sheets au montage)
  const [inputs,      setInputs]      = useState({});
  const [savingCell,  setSavingCell]  = useState(null);
  const [loading,     setLoading]     = useState(false);

  const isSavingRef      = useRef(null);
  const pendingRowIdxRef = useRef({});
  const inputsRef        = useRef({});

  // ── Bureaux actifs triés ────────────────────────────────────────────────
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

  // ── Candidats actifs ────────────────────────────────────────────────────
  const candidatsActifs = useMemo(() => {
    const list = Array.isArray(candidats) ? candidats : [];
    const filtered = list.filter((c) => viewTour === 1 ? !!c.actifT1 : !!c.actifT2);
    filtered.sort((a, b) => (Number(a.ordre) || 0) - (Number(b.ordre) || 0));
    return filtered;
  }, [candidats, viewTour]);

  // ── Votants par bureau (lecture seule) ──────────────────────────────────
  const votantsMap = useMemo(() => {
    const map = {};
    (Array.isArray(resultats) ? resultats : []).forEach((r) => {
      const bvId = normalizeBvId(r?.bureauId);
      if (bvId) map[bvId] = toInt(r?.votants);
    });
    return map;
  }, [resultats]);

  // ── Chargement direct depuis Sheets (pattern identique à ParticipationSaisie) ─
  const loadFromSheets = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await googleSheetsService.getData(sheet);
      pendingRowIdxRef.current = {};

      // Construire inputs depuis les données Sheets
      const next = {};
      (Array.isArray(rows) ? rows : []).forEach((r) => {
        const bvId    = normalizeBvId(r?.bureauId);
        const listeId = String(r?.listeId ?? '').trim();
        if (!bvId || !listeId) return;
        const rowKey = `${bvId}_${listeId}`;
        const paliers = {};
        PALIER_KEYS.forEach((pk) => {
          paliers[pk] = r[pk] !== undefined && r[pk] !== null ? String(r[pk]) : '';
        });
        next[rowKey] = paliers;
        if (r.rowIndex !== undefined && r.rowIndex !== null) {
          pendingRowIdxRef.current[rowKey] = r.rowIndex;
        }
      });
      setInputs(next);
    } catch (e) {
      console.error('[EnDirect] Erreur chargement:', e);
    } finally {
      setLoading(false);
    }
  }, [sheet]);

  // ── Chargement au montage et au changement de tour ───────────────────────
  useEffect(() => {
    loadFromSheets();
  }, [loadFromSheets]);

  // ── Changement (buffer) ─────────────────────────────────────────────────
  // Buffer de frappe : stocke UNIQUEMENT la valeur en cours d'édition
  const handleChange = useCallback((rowKey, pk, value) => {
    setInputs((prev) => ({
      ...prev,
      [rowKey]: { ...(prev[rowKey] || {}), [pk]: value },
    }));
  }, []);

  // ── Navigation clavier : Tab / Entrée → toujours vers le bas ──────────────
  // Règle : même palier, liste suivante. Fin du bureau → bureau suivant, même palier.
  // On ne change JAMAIS de palier automatiquement.
  const handleKeyDown = useCallback(
    (e, bvId, listeId, pk) => {
      if (e.key !== 'Tab' && e.key !== 'Enter') return;
      e.preventDefault();

      const listeIdx  = candidatsActifs.findIndex(c => c.listeId === listeId);
      const bureauIdx = bureauxList.findIndex(b => normalizeBvId(b.id) === bvId);

      let nextListeIdx  = listeIdx + 1;
      let nextBureauIdx = bureauIdx;

      if (nextListeIdx >= candidatsActifs.length) {
        nextListeIdx  = 0;
        nextBureauIdx = bureauIdx + 1;
        if (nextBureauIdx >= bureauxList.length) nextBureauIdx = 0;
      }

      const nextBvId    = normalizeBvId(bureauxList[nextBureauIdx]?.id);
      const nextListeId = candidatsActifs[nextListeIdx]?.listeId;
      const nextKey     = `${nextBvId}_${nextListeId}_${pk}`;

      const el = inputsRef.current[nextKey];
      if (el) { el.focus(); el.select(); }
    },
    [candidatsActifs, bureauxList]
  );

  // ── Sauvegarde sur blur ─────────────────────────────────────────────────
  const handleBlur = useCallback(
    async (bvId, listeId, pk) => {
      const rowKey  = `${bvId}_${listeId}`;
      const cellKey = `${rowKey}_${pk}`;

      if (isSavingRef.current === cellKey) return;

      const raw = inputs[rowKey]?.[pk] ?? '';
      if (raw === '') return;

      const n = parseInt(raw, 10);
      if (!Number.isFinite(n) || n < 0) return;

      isSavingRef.current = cellKey;
      setSavingCell(cellKey);

      try {
        const existingRowIdx = pendingRowIdxRef.current[rowKey];

        const rowData = {
          bureauId: bvId,
          listeId,
          ...PALIER_KEYS.reduce(
            (acc, k) => ({ ...acc, [k]: toInt(inputs[rowKey]?.[k]) }),
            {}
          ),
          [pk]: n,
        };

        if (existingRowIdx !== undefined && existingRowIdx !== null) {
          await googleSheetsService.updateRow(sheet, existingRowIdx, rowData);
        } else {
          const appended = await googleSheetsService.appendRow(sheet, rowData);
          if (appended?.rowIndex !== undefined) {
            pendingRowIdxRef.current[rowKey] = appended.rowIndex;
          }
        }
        // Confirmer la valeur immédiatement dans inputs (pas de flash)
        setInputs((prev) => ({
          ...prev,
          [rowKey]: { ...(prev[rowKey] || {}), [pk]: String(n) },
        }));
      } catch (e) {
        console.error('[EnDirect] Erreur sauvegarde:', e);
      } finally {
        isSavingRef.current = null;
        setSavingCell(null);
      }
    },
    [inputs, sheet, loadFromSheets]
  );

  // ── Totaux par liste ────────────────────────────────────────────────────
  const totauxParListe = useMemo(() => {
    const res = {};
    candidatsActifs.forEach((c) => {
      res[c.listeId] = {};
      PALIER_KEYS.forEach((pk) => {
        res[c.listeId][pk] = bureauxList.reduce((s, b) => {
          const bvId   = normalizeBvId(b.id);
          const rowKey = `${bvId}_${c.listeId}`;
          // Priorité : buffer frappe > Sheets
          return s + toInt(inputs[rowKey]?.[pk]);
        }, 0);
      });
    });
    return res;
  }, [inputs, bureauxList, candidatsActifs]);

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

  // ── Graphique : cumul voix par liste (barres horizontales) ─────────────
  const chartData = useMemo(
    () => {
      const totalVoix = candidatsActifs.reduce((s, c) =>
        s + PALIER_KEYS.reduce((ss, pk) => ss + (totauxParListe[c.listeId]?.[pk] || 0), 0), 0);
      return candidatsActifs.map((c) => {
        const cumul = PALIER_KEYS.reduce(
          (s, pk) => s + (totauxParListe[c.listeId]?.[pk] || 0),
          0
        );
        return {
          name: `${c.teteListePrenom || ''} ${c.teteListeNom || ''}`.trim() || c.listeId,
          nomListe: String(c.nomListe || '').replace(/^Liste /i, ''),
          voix: cumul,
          pct: totalVoix > 0 ? ((cumul / totalVoix) * 100).toFixed(1) : null,
          couleur: c.couleur || '#94a3b8',
          listeId: c.listeId,
        };
      });
    },
    [totauxParListe, candidatsActifs]
  );

  // ── Paliers visibles : 4 fixes + suivant si precedent renseigne ──────────
  const palierVisibles = useMemo(() => {
    const visible = [];
    for (let i = 0; i < PALIER_KEYS.length; i++) {
      const pk = PALIER_KEYS[i];
      if (i < 4) {
        visible.push(pk);
      } else {
        const pkPrev = PALIER_KEYS[i - 1];
        const prevRenseigne = bureauxList.some((b) => {
          const bvId = normalizeBvId(b.id);
          return candidatsActifs.some((c) =>
            toInt(inputs[`${bvId}_${c.listeId}`]?.[pkPrev]) > 0
          );
        });
        if (prevRenseigne) visible.push(pk);
        else break;
      }
    }
    return visible;
  }, [inputs, bureauxList, candidatsActifs]);

  // ── Statistiques rapides ────────────────────────────────────────────────
  const totalInscrits = useMemo(
    () => bureauxList.reduce((s, b) => s + (Number(b.inscrits) || 0), 0),
    [bureauxList]
  );

  const dernierPalierRenseigne = useMemo(() => {
    let last = 0;
    PALIER_KEYS.forEach((pk, i) => {
      if ((totalParPalier[pk] || 0) > 0) last = PALIERS[i];
    });
    return last;
  }, [totalParPalier]);

  const tc       = tourColors(viewTour);
  const nListes  = candidatsActifs.length;

  // ─────────────────────────────────────────────────────────────────────────
  // Rendu — layout full-width
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── STYLE PAGE FULL-WIDTH ─────────────────────────────────────── */}
      <style>{`
        /* ── Casse le conteneur parent sur toute la chaîne ── */
        .endirect-breakout {
          width: 100vw !important;
          position: relative !important;
          left: 50% !important;
          right: 50% !important;
          margin-left: -50vw !important;
          margin-right: -50vw !important;
          padding-left: 18px !important;
          padding-right: 18px !important;
          box-sizing: border-box !important;
        }
        .endirect-grid {
          display: grid;
          grid-template-columns: 3fr 2fr;
          gap: 16px;
          align-items: start;
          width: 100%;
        }
        @media (max-width: 1200px) {
          .endirect-grid { grid-template-columns: 1fr; }
        }
        .endirect-table-wrap {
          overflow-x: auto;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.09);
          border: 1px solid #e2e8f0;
          width: 100%;
        }
        .endirect-table {
          border-collapse: collapse;
          font-size: 12px;
          background: #fff;
          width: 100%;
          min-width: 900px;
        }
        .endirect-th {
          background: #1e3c72;
          color: #fff;
          padding: 7px 6px;
          font-size: 10px;
          font-weight: 700;
          text-align: center;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          white-space: nowrap;
          border-right: 1px solid rgba(255,255,255,0.12);
        }
        .endirect-input {
          width: 52px;
          padding: 3px 3px;
          border-radius: 4px;
          font-size: 12px;
          text-align: center;
          outline: none;
          font-variant-numeric: tabular-nums;
          box-sizing: border-box;
        }
      `}</style>

      <div className="endirect-breakout">

        {/* ── EN-TÊTE ─────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#1e293b' }}>
            📡 Dépouillement En Direct
          </h2>

          {/* Sélecteur tour */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[1, 2].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setViewTour(t)}
                style={{
                  padding: '5px 18px', borderRadius: 20, border: 'none',
                  fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  background: viewTour === t ? (t === 1 ? '#047857' : '#2563eb') : '#e2e8f0',
                  color: viewTour === t ? '#fff' : '#475569',
                  transition: 'all 0.2s',
                }}
              >
                Tour {t}
              </button>
            ))}
          </div>

          <span style={{
            background: tc.light, color: tc.text,
            fontSize: 11, fontWeight: 700, padding: '3px 12px',
            borderRadius: 20, border: `1px solid ${tc.solid}`,
          }}>
            {bureauxList.length} bureaux &bull; {totalInscrits.toLocaleString('fr-FR')} inscrits
            {dernierPalierRenseigne > 0 && <> &bull; Dernier palier : <strong>{dernierPalierRenseigne}</strong></>}
          </span>

          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>
            💾 Sauvegarde auto à chaque sortie de cellule
          </span>
        </div>

        {/* ── AVERTISSEMENT PAS DE LISTE ──────────────────────────────── */}
        {nListes === 0 && (
          <div style={{ padding: 20, background: '#fef3c7', borderRadius: 8, border: '1px solid #fde68a', color: '#92400e' }}>
            ⚠️ Aucune liste active pour le Tour {viewTour}.
          </div>
        )}

        {nListes > 0 && (
          <>
            {/* ── GRILLE PRINCIPALE : TABLEAU GAUCHE | GRAPHIQUE DROITE ── */}
            <div className="endirect-grid">

              {/* ── TABLEAU DE SAISIE ──────────────────────────────────── */}
              <div>
                <div className="endirect-table-wrap">
                  <table className="endirect-table">
                    <thead>
                      <tr>
                        <th className="endirect-th" style={{ textAlign: 'left', width: 70, minWidth: 70, position: 'sticky', left: 0, zIndex: 5, background: '#1e3c72' }}>Bureau</th>
                        <th className="endirect-th" style={{ width: 54, minWidth: 54 }}>Inscrits</th>
                        <th className="endirect-th" style={{ width: 54, minWidth: 54 }}>Votants*</th>
                        <th className="endirect-th" style={{ textAlign: 'left', minWidth: 200 }}>Candidat tête de liste</th>
                        {palierVisibles.map((pk) => (
                          <th key={pk} className="endirect-th" style={{ minWidth: 50 }}>
                            {pk.replace('p', '')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {bureauxList.flatMap((bureau, bIdx) => {
                        const bvId    = normalizeBvId(bureau.id);
                        const inscrits = Number(bureau.inscrits) || 0;
                        const votants  = votantsMap[bvId] || 0;
                        const bgRow    = bIdx % 2 === 0 ? '#fff' : '#f8fafc';

                        return candidatsActifs.map((c, cIdx) => {
                          const rowKey  = `${bvId}_${c.listeId}`;
                          const isFirst = cIdx === 0;
                          const isLast  = cIdx === nListes - 1;
                          const bdrBtm  = isLast ? '2px solid #cbd5e1' : '1px solid #e8ecf0';

                          return (
                            <tr key={rowKey} style={{ background: bgRow }}>

                              {/* Bureau (rowspan) */}
                              {isFirst && (
                                <td rowSpan={nListes} style={{
                                  padding: '4px 5px', fontWeight: 700, fontSize: 11,
                                  background: bgRow, position: 'sticky', left: 0, zIndex: 2,
                                  borderRight: '2px solid #cbd5e1', borderBottom: '2px solid #cbd5e1',
                                  verticalAlign: 'middle', width: 70,
                                }}>
                                  <div style={{ color: '#1e293b', fontSize: 11 }}>{bvId}</div>
                                  <div style={{ color: '#64748b', fontWeight: 400, fontSize: 10, whiteSpace: 'normal', lineHeight: 1.3 }}>
                                    {bureau.nom}
                                  </div>
                                </td>
                              )}

                              {/* Inscrits (rowspan) */}
                              {isFirst && (
                                <td rowSpan={nListes} style={{
                                  padding: '4px 3px', textAlign: 'center', fontWeight: 700,
                                  fontSize: 11, verticalAlign: 'middle', width: 54,
                                  borderRight: '1px solid #e8ecf0', borderBottom: '2px solid #cbd5e1',
                                  background: bgRow, color: '#374151',
                                }}>
                                  {inscrits.toLocaleString('fr-FR')}
                                </td>
                              )}

                              {/* Votants (rowspan, lecture seule) */}
                              {isFirst && (
                                <td rowSpan={nListes} style={{
                                  padding: '4px 3px', textAlign: 'center',
                                  fontWeight: votants > 0 ? 700 : 400, fontSize: 11,
                                  verticalAlign: 'middle', width: 54,
                                  borderRight: '2px solid #cbd5e1', borderBottom: '2px solid #cbd5e1',
                                  background: bgRow, color: votants > 0 ? '#047857' : '#94a3b8',
                                }}>
                                  {votants > 0 ? votants.toLocaleString('fr-FR') : '—'}
                                </td>
                              )}

                              {/* Candidat tête de liste */}
                              <td style={{ padding: '3px 8px', borderBottom: bdrBtm, borderRight: '2px solid #cbd5e1', minWidth: 200 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ width: 9, height: 9, borderRadius: 2, background: c.couleur || '#94a3b8', flexShrink: 0, display: 'inline-block' }} />
                                  <div style={{ lineHeight: 1.3 }}>
                                    <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 11, whiteSpace: 'nowrap' }}>
                                      {`${c.teteListePrenom || ''} ${c.teteListeNom || ''}`.trim() || '—'}
                                    </div>
                                    <div style={{ color: '#64748b', fontSize: 10, whiteSpace: 'nowrap' }}>
                                      {String(c.nomListe || '').replace(/^Liste /i, '')}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* Cellules saisie — paliers visibles uniquement */}
                              {palierVisibles.map((pk) => {
                                const cellKey = `${rowKey}_${pk}`;
                                const isSaving = savingCell === cellKey;
                                const val    = inputs[rowKey]?.[pk] ?? '';
                                const hasVal = val !== '' && val !== '0' && toInt(val) > 0;

                                return (
                                  <td key={pk} style={{ padding: '2px 2px', borderBottom: bdrBtm, borderRight: '1px solid #f1f5f9', textAlign: 'center' }}>
                                    <input
                                      ref={(el) => {
                                        const refKey = `${bvId}_${c.listeId}_${pk}`;
                                        if (el) inputsRef.current[refKey] = el;
                                        else delete inputsRef.current[refKey];
                                      }}
                                      type="text"
                                      inputMode="numeric"
                                      pattern="\d*"
                                      value={val}
                                      onChange={(e) => handleChange(rowKey, pk, e.target.value)}
                                      onFocus={() => { if (String(val) === '0') handleChange(rowKey, pk, ''); }}
                                      onBlur={() => handleBlur(bvId, c.listeId, pk)}
                                      onKeyDown={(e) => handleKeyDown(e, bvId, c.listeId, pk)}
                                      disabled={isSaving}
                                      aria-label={`${bvId} ${c.listeId} palier ${pk.replace('p', '')}`}
                                      className="endirect-input"
                                      style={{
                                        border: `1.5px solid ${isSaving ? '#fbbf24' : hasVal ? (c.couleur || '#93c5fd') : '#e2e8f0'}`,
                                        background: isSaving ? '#fef9c3' : hasVal ? `${c.couleur}1a` : '#fff',
                                        fontWeight: hasVal ? 700 : 400,
                                        color: hasVal ? '#1e293b' : '#94a3b8',
                                        cursor: isSaving ? 'wait' : 'text',
                                      }}
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        });
                      })}

                      {/* Total communal */}
                      <tr>
                        <td colSpan={4} style={{ padding: '7px 10px', fontWeight: 800, fontSize: 11, background: '#1e293b', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.5px', position: 'sticky', left: 0, zIndex: 2, borderTop: '2px solid #334155' }}>
                          Total communal
                        </td>
                        {palierVisibles.map((pk) => (
                          <td key={pk} style={{ textAlign: 'center', fontWeight: 800, fontSize: 12, background: '#1e293b', color: '#fff', padding: '7px 3px', borderTop: '2px solid #334155', borderRight: '1px solid #334155' }}>
                            {totalParPalier[pk] > 0 ? totalParPalier[pk].toLocaleString('fr-FR') : '—'}
                          </td>
                        ))}
                      </tr>


                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
                  * Votants : lecture seule depuis les résultats officiels — Onglet : <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>{sheet}</code>
                </div>
              </div>

              {/* ── GRAPHIQUE RECHARTS ─────────────────────────────────── */}
              <div style={{
                background: '#fff', borderRadius: 10,
                border: '1px solid #e2e8f0', padding: '20px 16px 12px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
                position: 'sticky', top: 12,
              }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: 15, fontWeight: 800, color: '#1e293b' }}>
                  📊 Progression des voix — Tour {viewTour}
                </h3>
                <p style={{ margin: '0 0 16px 0', fontSize: 11, color: '#94a3b8' }}>
                  Barres horizontales — voix cumulées toutes tranches confondues
                </p>

                <ResponsiveContainer width="100%" height={Math.max(180, candidatsActifs.length * 56 + 40)}>
                  <BarChart
                    layout="vertical"
                    data={chartData}
                    margin={{ top: 6, right: 110, left: 10, bottom: 10 }}
                    barCategoryGap="25%"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickFormatter={(v) => v.toLocaleString('fr-FR')}
                      label={{
                        value: 'Voix cumulées',
                        position: 'insideBottom',
                        offset: -2,
                        fontSize: 10,
                        fill: '#94a3b8',
                      }}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 11, fill: '#1e293b', fontWeight: 600 }}
                      width={140}
                    />
                    <Tooltip
                      formatter={(value) => [`${value.toLocaleString('fr-FR')} voix`, 'Cumul']}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                    />
                    <Bar
                      dataKey="voix"
                      radius={[0, 4, 4, 0]}
                      label={(props) => {
                        const { x, y, width, height, value, index } = props;
                        const entry = chartData[index];
                        if (!entry || value <= 0) return null;
                        const cx = x + width + 8;
                        const cy = y + height / 2;
                        return (
                          <g>
                            <text x={cx} y={cy} dominantBaseline="middle" fontSize={12} fontWeight={700} fill="#1e293b">
                              {value.toLocaleString('fr-FR')}
                            </text>
                            {entry.pct !== null && (
                              <text x={cx + String(value.toLocaleString('fr-FR')).length * 7 + 4} y={cy} dominantBaseline="middle" fontSize={12} fontWeight={700} fill={entry.couleur === '#FFFFFF' || entry.couleur === '#ffffff' ? '#94a3b8' : entry.couleur}>
                                {entry.pct}%
                              </text>
                            )}
                          </g>
                        );
                      }}
                    >
                      {chartData.map((entry) => (
                        <Cell key={entry.listeId} fill={entry.couleur} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                {/* ── Tableau totaux par liste par palier ── */}
                <div style={{ marginTop: 20, overflowX: 'auto', borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 1px 6px rgba(0,0,0,0.07)' }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: 12, background: '#fff', width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ background: '#1e3c72', color: '#fff', padding: '7px 10px', fontSize: 10, fontWeight: 700, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.3px', whiteSpace: 'nowrap', borderRight: '2px solid rgba(255,255,255,0.2)', minWidth: 140 }}>
                          Liste
                        </th>
                        {palierVisibles.map((pk) => (
                          <th key={pk} style={{ background: '#1e3c72', color: '#fff', padding: '7px 5px', fontSize: 10, fontWeight: 700, textAlign: 'center', textTransform: 'uppercase', whiteSpace: 'nowrap', borderRight: '1px solid rgba(255,255,255,0.12)', minWidth: 50 }}>
                            {pk.replace('p', '')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {/* Ligne total toutes listes */}
                      <tr style={{ background: '#1e293b' }}>
                        <td style={{ padding: '6px 10px', fontWeight: 800, fontSize: 11, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.4px', borderRight: '2px solid #334155', borderBottom: '1px solid #334155' }}>
                          Total
                        </td>
                        {palierVisibles.map((pk) => (
                          <td key={pk} style={{ textAlign: 'center', fontWeight: 800, fontSize: 12, color: '#fff', padding: '6px 4px', borderRight: '1px solid #334155', borderBottom: '1px solid #334155' }}>
                            {totalParPalier[pk] > 0 ? totalParPalier[pk].toLocaleString('fr-FR') : '—'}
                          </td>
                        ))}
                      </tr>
                      {/* Une ligne par liste */}
                      {candidatsActifs.map((c, idx) => (
                        <tr key={c.listeId} style={{ background: idx % 2 === 0 ? (c.couleur ? `${c.couleur}0d` : '#fff') : (c.couleur ? `${c.couleur}18` : '#f8fafc') }}>
                          <td style={{ padding: '5px 10px', borderBottom: '1px solid #e2e8f0', borderRight: '2px solid #cbd5e1' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ width: 10, height: 10, borderRadius: 2, background: c.couleur || '#94a3b8', display: 'inline-block', flexShrink: 0 }} />
                              <div style={{ lineHeight: 1.3 }}>
                                <div style={{ fontWeight: 700, fontSize: 11, color: '#1e293b', whiteSpace: 'nowrap' }}>
                                  {`${c.teteListePrenom || ''} ${c.teteListeNom || ''}`.trim() || '—'}
                                </div>
                                <div style={{ fontSize: 10, color: '#64748b', whiteSpace: 'nowrap' }}>
                                  {String(c.nomListe || '').replace(/^Liste /i, '')}
                                </div>
                              </div>
                            </div>
                          </td>
                          {palierVisibles.map((pk) => {
                            const val   = totauxParListe[c.listeId]?.[pk] || 0;
                            const total = totalParPalier[pk] || 0;
                            const pct   = total > 0 ? ((val / total) * 100).toFixed(1) : null;
                            return (
                              <td key={pk} style={{ textAlign: 'center', padding: '4px 3px', borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #f1f5f9' }}>
                                <div style={{ fontWeight: val > 0 ? 700 : 400, fontSize: 12, color: val > 0 ? '#1e293b' : '#cbd5e1' }}>
                                  {val > 0 ? val.toLocaleString('fr-FR') : '—'}
                                </div>
                                {pct !== null && (
                                  <div style={{ fontSize: 10, color: c.couleur || '#64748b', fontWeight: 700, lineHeight: 1.2 }}>
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
              </div>

            </div>
          </>
        )}
      </div>
    </>
  );
}
