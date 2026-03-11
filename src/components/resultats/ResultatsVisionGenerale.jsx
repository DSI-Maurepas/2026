// src/components/resultats/ResultatsVisionGenerale.jsx
//
// Tableau de vision générale des résultats par bureau de vote.
// Profils : admin et global uniquement.
// Colonnes : BV1 à BV13 | Lignes : inscrits, votants, procurations, blancs, nuls, exprimés,
//            indicateur ctrl1, une ligne par liste, indicateur ctrl2.
// Mode lecture par défaut — basculement en écriture via modal de confirmation.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGoogleSheets } from '../../hooks/useGoogleSheets';
import googleSheetsService from '../../services/googleSheetsService';

// ── Helpers ────────────────────────────────────────────────────────────────
const normalizeBureauId = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v).trim().toUpperCase();
  const m = s.match(/(\d+)/);
  return m ? m[1] : s;
};

const coerceInt = (v) => {
  const s = String(v ?? '').trim();
  if (s === '') return 0;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
};

// Couleurs tour
const TOUR_COLORS = {
  1: { bg: 'linear-gradient(135deg, #065f46 0%, #047857 100%)', solid: '#047857', light: '#d1fae5', text: '#065f46' },
  2: { bg: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)', solid: '#2563eb', light: '#dbeafe', text: '#1e40af' },
};

// ── Composant ──────────────────────────────────────────────────────────────
export default function ResultatsVisionGenerale({ tourActuel = 1 }) {
  const resultatsSheet = tourActuel === 2 ? 'Resultats_T2' : 'Resultats_T1';
  const tc = TOUR_COLORS[tourActuel] || TOUR_COLORS[1];

  const { data: bureaux,   load: loadBureaux }   = useGoogleSheets('Bureaux');
  const { data: candidats, load: loadCandidats } = useGoogleSheets('Candidats');
  const { data: resultats, load: loadResultats } = useGoogleSheets(resultatsSheet);

  const [editMode,    setEditMode]    = useState(false);
  const [editData,    setEditData]    = useState({});   // { BV1: { inscrits, votants, ... voix: {} }, ... }
  const [showModal,   setShowModal]   = useState(false);
  const [savingCell,  setSavingCell]  = useState(null); // 'BV1_votants' etc.

  const isSavingRef = useRef(false);

  useEffect(() => {
    loadBureaux();
    loadCandidats();
    loadResultats();
  }, [loadBureaux, loadCandidats, loadResultats]);

  // ── Bureaux ordonnés ───────────────────────────────────────────────────
  const bureauxList = useMemo(() => {
    const list = Array.isArray(bureaux) ? bureaux : [];
    return list
      .filter(b => b.actif === true || b.actif === 'TRUE' || b.actif === 1)
      .sort((a, b) => {
        const na = parseInt(String(a.id).replace(/\D/g, ''), 10) || 0;
        const nb = parseInt(String(b.id).replace(/\D/g, ''), 10) || 0;
        return na - nb;
      });
  }, [bureaux]);

  // ── Candidats actifs pour ce tour ──────────────────────────────────────
  const candidatsActifs = useMemo(() => {
    const list = Array.isArray(candidats) ? candidats : [];
    const filtered = list.filter(c => tourActuel === 1 ? !!c.actifT1 : !!c.actifT2);
    filtered.sort((a, b) => {
      const oa = Number(tourActuel === 1 ? (a.ordreT1 ?? a.ordre) : (a.ordreT2 ?? a.ordre)) || 0;
      const ob = Number(tourActuel === 1 ? (b.ordreT1 ?? b.ordre) : (b.ordreT2 ?? b.ordre)) || 0;
      return oa - ob;
    });
    return filtered;
  }, [candidats, tourActuel]);

  // ── Map résultats par bureauId ──────────────────────────────────────────
  const resultatsMap = useMemo(() => {
    const map = {};
    const list = Array.isArray(resultats) ? resultats : [];
    list.forEach(r => {
      const key = 'BV' + normalizeBureauId(r?.bureauId);
      map[key] = r;
    });
    return map;
  }, [resultats]);

  // ── Récupérer valeur (edit ou lecture) ─────────────────────────────────
  const getVal = useCallback((bureauId, field, listeId = null) => {
    if (editMode && editData[bureauId]) {
      const d = editData[bureauId];
      return listeId ? (d.voix?.[listeId] ?? '') : (d[field] ?? '');
    }
    const r = resultatsMap[bureauId];
    if (!r) return '';
    return listeId ? (r.voix?.[listeId] ?? '') : (r[field] ?? '');
  }, [editMode, editData, resultatsMap]);

  // ── Contrôles par bureau ───────────────────────────────────────────────
  const getControles = useCallback((bureauId) => {
    const votants   = coerceInt(getVal(bureauId, 'votants'));
    const blancs    = coerceInt(getVal(bureauId, 'blancs'));
    const nuls      = coerceInt(getVal(bureauId, 'nuls'));
    const exprimes  = coerceInt(getVal(bureauId, 'exprimes'));
    let sommeVoix = 0;
    candidatsActifs.forEach(c => {
      sommeVoix += coerceInt(getVal(bureauId, null, c.listeId));
    });

    const hasData = votants > 0 || blancs > 0 || nuls > 0 || exprimes > 0 || sommeVoix > 0;
    const ctrl1Ok      = hasData && votants > 0 && (votants === blancs + nuls + exprimes);
    const ctrl1Warning = !hasData || votants === 0;
    const listesAZero = candidatsActifs.filter(c => coerceInt(getVal(bureauId, null, c.listeId)) === 0);
    const hasListesAZero = sommeVoix > 0 && exprimes > 0 && listesAZero.length > 0;
    // ctrl2 : ok seulement si somme juste ET aucune liste à 0
    const ctrl2Ok      = hasData && (sommeVoix === exprimes) && !hasListesAZero;
    const ctrl2Warning = sommeVoix === 0 || hasListesAZero;

    return { ctrl1Ok, ctrl1Warning, ctrl2Ok, ctrl2Warning, hasData };
  }, [getVal, candidatsActifs]);

  // ── Basculement en mode édition ────────────────────────────────────────
  const enterEditMode = useCallback(() => {
    // Initialiser editData depuis resultatsMap
    const init = {};
    bureauxList.forEach(b => {
      const r = resultatsMap[b.id] || {};
      init[b.id] = {
        inscrits:     r.inscrits    ?? '',
        votants:      r.votants     ?? '',
        procurations: r.procurations ?? '',
        blancs:       r.blancs      ?? '',
        nuls:         r.nuls        ?? '',
        exprimes:     r.exprimes    ?? '',
        voix:         { ...(r.voix || {}) },
        _rowIndex:    r.rowIndex,
        _saisiPar:    r.saisiPar    ?? '',
        _validePar:   r.validePar   ?? '',
        _timestamp:   r.timestamp   ?? '',
        _bureauId:    b.id,
      };
    });
    setEditData(init);
    setEditMode(true);
    setShowModal(false);
  }, [bureauxList, resultatsMap]);

  const exitEditMode = useCallback(() => {
    setEditMode(false);
    setEditData({});
  }, []);

  // ── Mise à jour locale ─────────────────────────────────────────────────
  const handleCellChange = useCallback((bureauId, field, value, listeId = null) => {
    setEditData(prev => {
      const d = { ...prev[bureauId] };
      if (listeId) {
        d.voix = { ...d.voix, [listeId]: value };
      } else {
        d[field] = value;
      }
      return { ...prev, [bureauId]: d };
    });
  }, []);

  // ── Sauvegarde sur blur ────────────────────────────────────────────────
  const handleCellBlur = useCallback(async (bureauId, field, listeId = null) => {
    if (!editMode) return;
    const cellKey = `${bureauId}_${listeId || field}`;
    if (isSavingRef.current === cellKey) return;
    isSavingRef.current = cellKey;
    setSavingCell(cellKey);

    try {
      const d = editData[bureauId];
      if (!d) return;

      // ── Validations de cohérence ───────────────────────────────────────
      const bureau = bureauxList.find(b => b.id === bureauId);
      const inscrits  = Number(bureau?.inscrits) || 0;
      const votants   = coerceInt(d.votants);

      if (field === 'votants' && inscrits > 0 && votants > inscrits) {
        setEditData(prev => ({ ...prev, [bureauId]: { ...prev[bureauId], votants: '' } }));
        isSavingRef.current = null; setSavingCell(null); return;
      }
      if (field === 'procurations' && coerceInt(d.procurations) > votants) {
        setEditData(prev => ({ ...prev, [bureauId]: { ...prev[bureauId], procurations: '' } }));
        isSavingRef.current = null; setSavingCell(null); return;
      }
      if (field === 'blancs' && coerceInt(d.blancs) > votants) {
        setEditData(prev => ({ ...prev, [bureauId]: { ...prev[bureauId], blancs: '' } }));
        isSavingRef.current = null; setSavingCell(null); return;
      }
      if (field === 'nuls' && coerceInt(d.nuls) > votants) {
        setEditData(prev => ({ ...prev, [bureauId]: { ...prev[bureauId], nuls: '' } }));
        isSavingRef.current = null; setSavingCell(null); return;
      }

      const voix = {};
      candidatsActifs.forEach(c => {
        voix[c.listeId] = coerceInt(d.voix?.[c.listeId]);
      });

      const rowData = {
        bureauId:    d._bureauId,
        inscrits:    coerceInt(d.inscrits),
        votants:     coerceInt(d.votants),
        procurations: coerceInt(d.procurations),
        blancs:      coerceInt(d.blancs),
        nuls:        coerceInt(d.nuls),
        exprimes:    coerceInt(d.exprimes),
        voix,
        saisiPar:    d._saisiPar,
        validePar:   d._validePar,
        timestamp:   d._timestamp,
      };

      const rIdx = d._rowIndex;
      if (rIdx !== undefined && rIdx !== null) {
        await googleSheetsService.updateRow(resultatsSheet, rIdx, rowData);
      } else {
        const appended = await googleSheetsService.appendRow(resultatsSheet, rowData);
        if (appended?.rowIndex !== undefined) {
          setEditData(prev => ({
            ...prev,
            [bureauId]: { ...prev[bureauId], _rowIndex: appended.rowIndex }
          }));
        }
      }

      await loadResultats();
    } catch (e) {
      console.error('[VisionGenerale] Erreur sauvegarde:', e);
    } finally {
      isSavingRef.current = null;
      setSavingCell(null);
    }
  }, [editMode, editData, candidatsActifs, resultatsSheet, loadResultats]);

  // ── Définition des lignes du tableau ───────────────────────────────────
  const rowDefs = useMemo(() => {
    const rows = [
      { key: 'inscrits',     label: 'Inscrits',     field: 'inscrits',     readOnly: true },
      { key: 'votants',      label: 'Votants',      field: 'votants'  },
      { key: 'procurations', label: 'Procurations', field: 'procurations' },
      { key: 'blancs',       label: 'Blancs',       field: 'blancs'   },
      { key: 'nuls',         label: 'Nuls',         field: 'nuls'     },
      { key: 'exprimes',     label: 'Exprimés',     field: 'exprimes' },
      { key: '__ctrl1__',    label: '✓ Ctrl 1',     isCtrl: 'ctrl1'   },
    ];
    candidatsActifs.forEach(c => {
      const label = (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              display: 'inline-block', width: 10, height: 10, borderRadius: 2,
              background: c.couleur || '#999', flexShrink: 0
            }} />
            <strong>{c.listeId}</strong>
          </span>
          <span style={{ fontSize: 10, color: '#475569', lineHeight: 1.2 }}>
            {c.nomListe ? c.nomListe.replace(/^Liste /i, '') : ''}
          </span>
          <span style={{ fontSize: 10, color: '#64748b', fontStyle: 'italic', lineHeight: 1.2 }}>
            {(`${c.teteListePrenom || ''} ${c.teteListeNom || ''}`).trim()}
          </span>
        </span>
      );
      rows.push({ key: `voix_${c.listeId}`, label, listeId: c.listeId });
    });
    rows.push({ key: '__ctrl2__', label: '✓ Ctrl 2', isCtrl: 'ctrl2' });
    return rows;
  }, [candidatsActifs]);

  // ── Rendu cellule valeur ───────────────────────────────────────────────
  const renderCell = useCallback((bureauId, rowDef) => {
    if (rowDef.isCtrl) {
      const { ctrl1Ok, ctrl1Warning, ctrl2Ok, ctrl2Warning } = getControles(bureauId);
      const ok      = rowDef.isCtrl === 'ctrl1' ? ctrl1Ok      : ctrl2Ok;
      const warning = rowDef.isCtrl === 'ctrl1' ? ctrl1Warning : ctrl2Warning;
      const label   = rowDef.isCtrl === 'ctrl1' ? 'Champs principaux non saisis' : 'Voix des listes non saisies';
      // Si bureau absent de la feuille : gris
      const hasBureauData = !!resultatsMap[bureauId];
      if (!hasBureauData) return (
        <td key={bureauId} style={cellStyle('#f9fafb', false)}>
          <span style={{ color: '#d1d5db', fontSize: 16 }}>—</span>
        </td>
      );
      // Warning (orange) si pas encore saisi
      if (!ok && warning) return (
        <td key={bureauId} style={cellStyle('#fef3c7', false)} title={label}>
          <span style={{ fontSize: 16 }}>🟠</span>
        </td>
      );
      return (
        <td key={bureauId} style={cellStyle(ok ? '#dcfce7' : '#fee2e2', false)}>
          <span style={{ fontSize: 16 }}>{ok ? '🟢' : '🔴'}</span>
        </td>
      );
    }

    const val = getVal(bureauId, rowDef.field, rowDef.listeId || null);
    const cellKey = `${bureauId}_${rowDef.listeId || rowDef.field}`;
    const isSaving = savingCell === cellKey;
    const isReadOnly = !editMode || rowDef.readOnly;

    if (isReadOnly) {
      return (
        <td key={bureauId} style={cellStyle('#fff', false, rowDef.readOnly)}>
          <span style={{ fontWeight: rowDef.readOnly ? 700 : 400, color: rowDef.readOnly ? '#374151' : '#1e293b' }}>
            {val === '' ? <span style={{ color: '#d1d5db' }}>—</span> : Number(val).toLocaleString('fr-FR')}
          </span>
        </td>
      );
    }

    return (
      <td key={bureauId} style={cellStyle(isSaving ? '#fef9c3' : '#fefce8', true)}>
        <input
          type="text"
          inputMode="numeric"
          value={val}
          onChange={e => handleCellChange(bureauId, rowDef.field, e.target.value, rowDef.listeId || null)}
          onBlur={() => handleCellBlur(bureauId, rowDef.field, rowDef.listeId || null)}
          style={{
            width: '100%', minWidth: 52, padding: '3px 5px',
            border: '1.5px solid #93c5fd', borderRadius: 4,
            fontSize: 13, textAlign: 'center', background: '#fff',
            outline: 'none', boxSizing: 'border-box',
          }}
          disabled={isSaving}
        />
      </td>
    );
  }, [editMode, getVal, getControles, handleCellChange, handleCellBlur, resultatsMap, savingCell]);

  const cellStyle = (bg, editing, isRo = false) => ({
    padding: '5px 8px',
    borderBottom: '1px solid #f1f5f9',
    borderRight: '1px solid #f1f5f9',
    textAlign: 'center',
    background: bg,
    fontSize: 13,
    transition: 'background 0.15s',
    cursor: isRo ? 'default' : (editing ? 'text' : 'default'),
  });

  // ── Rendu ──────────────────────────────────────────────────────────────
  return (
    <div style={{ marginTop: 24 }}>

      {/* ── Modal de confirmation basculement écriture ── */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: 20
        }}>
          <div style={{
            background: tc.bg, color: '#fff',
            borderRadius: 16, maxWidth: 480, width: '100%',
            padding: 32, boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            textAlign: 'center',
            animation: 'fadeInVG 0.25s ease-out'
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✏️</div>
            <h2 style={{ margin: '0 0 14px', color: '#fff', fontSize: 22, fontWeight: 800 }}>
              Activer la modification ?
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 12, opacity: 0.95 }}>
              Vous êtes sur le point de passer le tableau en <strong>mode écriture</strong>.
            </p>
            <div style={{
              fontSize: 13, marginBottom: 28, opacity: 0.9,
              background: 'rgba(255,255,255,0.12)', padding: 12, borderRadius: 8
            }}>
              ⚠️ Chaque cellule modifiée sera sauvegardée immédiatement.<br />
              À utiliser uniquement pour une correction exceptionnelle.
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  padding: '11px 24px', borderRadius: 8,
                  border: '2px solid rgba(255,255,255,0.35)',
                  background: 'rgba(255,255,255,0.12)', color: '#fff',
                  fontSize: 15, fontWeight: 700, cursor: 'pointer'
                }}>
                Annuler
              </button>
              <button
                onClick={enterEditMode}
                style={{
                  padding: '11px 28px', borderRadius: 8, border: 'none',
                  background: '#fff', color: tc.text,
                  fontSize: 15, fontWeight: 800, cursor: 'pointer'
                }}>
                ✅ Activer l'édition
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeInVG {
          from { opacity: 0; transform: scale(0.93); }
          to   { opacity: 1; transform: scale(1); }
        }
        .vg-table-wrap {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          border-radius: 10px;
          box-shadow: 0 2px 12px rgba(0,0,0,0.09);
          border: 1px solid #e2e8f0;
        }
        .vg-table { border-collapse: collapse; font-size: 13px; background: #fff; }
        .vg-table thead th {
          background: #1e3c72; color: #fff;
          padding: 8px 10px; font-size: 11px; font-weight: 700;
          text-transform: uppercase; letter-spacing: .4px;
          white-space: nowrap; border-right: 1px solid rgba(255,255,255,0.15);
        }
        .vg-table thead th.sticky-col {
          position: sticky; left: 0; z-index: 5;
          background: #1e3c72; min-width: 140px; max-width: 160px; text-align: left;
        }
        .vg-table tbody td.sticky-col {
          position: sticky; left: 0; z-index: 2;
          background: #f8fafc;
          border-right: 2px solid #cbd5e1;
          min-width: 140px; max-width: 160px;
          padding: 6px 10px; font-size: 12px; font-weight: 700; color: #1e293b;
          white-space: nowrap;
        }
        .vg-table tbody tr:hover td:not(.sticky-col) { background: #f0f9ff !important; }
        .vg-table tbody tr.ctrl-row td { padding: 4px 8px; }
        .vg-table tbody tr.list-row td.sticky-col { background: #f0fdf4; font-weight: 600; }
      `}</style>

      {/* ── En-tête + bouton basculement ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12, marginBottom: 14
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>📋</span>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1e293b' }}>
            Vision générale des saisies — Tour {tourActuel}
          </h3>
          <span style={{
            background: editMode ? '#fef9c3' : tc.light,
            color: editMode ? '#92400e' : tc.text,
            fontSize: 11, fontWeight: 700, padding: '3px 10px',
            borderRadius: 20, border: `1px solid ${editMode ? '#fde68a' : tc.solid}`
          }}>
            {editMode ? '✏️ MODE ÉDITION' : '👁 LECTURE SEULE'}
          </span>
        </div>

        <button
          onClick={() => editMode ? exitEditMode() : setShowModal(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '9px 20px', borderRadius: 8, border: 'none',
            background: editMode
              ? 'linear-gradient(135deg, #64748b, #475569)'
              : tc.bg,
            color: '#fff', fontSize: 14, fontWeight: 700,
            cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            transition: 'all 0.2s'
          }}
        >
          <span>{editMode ? '🔒' : '✏️'}</span>
          <span>{editMode ? 'Verrouiller (lecture seule)' : 'Activer la modification'}</span>
        </button>
      </div>

      {/* ── Tableau ── */}
      <div className="vg-table-wrap">
        <table className="vg-table">
          <thead>
            <tr>
              <th className="sticky-col">Données</th>
              {bureauxList.map(b => (
                <th key={b.id} style={{ minWidth: 72 }}>
                  <div>{b.id}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowDefs.map((rowDef, rowIdx) => {
              const isCtrlRow = !!rowDef.isCtrl;
              const isListRow = !!rowDef.listeId;
              // Séparateur visuel entre ctrl1 et listes
              const topBorder = (rowIdx > 0 && rowDefs[rowIdx - 1]?.isCtrl) ? '2px solid #cbd5e1' : undefined;

              return (
                <tr
                  key={rowDef.key}
                  className={isCtrlRow ? 'ctrl-row' : isListRow ? 'list-row' : ''}
                  style={topBorder ? { borderTop: topBorder } : undefined}
                >
                  {/* Colonne sticky — label */}
                  <td className="sticky-col" style={{
                    background: isCtrlRow
                      ? '#f1f5f9'
                      : isListRow
                      ? '#f0fdf4'
                      : (rowDef.readOnly ? '#f8fafc' : '#fff'),
                    fontSize: isCtrlRow ? 11 : isListRow ? 12 : 12,
                  }}>
                    {isCtrlRow ? (
                      <span style={{ color: '#64748b', fontStyle: 'italic' }}>{rowDef.label}</span>
                    ) : (
                      rowDef.label
                    )}
                  </td>
                  {/* Colonnes bureaux */}
                  {bureauxList.map(b => renderCell(b.id, rowDef))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Légende ── */}
      <div style={{
        marginTop: 12, display: 'flex', gap: 20, flexWrap: 'wrap',
        fontSize: 12, color: '#64748b', alignItems: 'center'
      }}>
        <span>🟢 Contrôle OK</span>
        <span>🔴 Contrôle KO</span>
        <span style={{ color: '#94a3b8' }}>— Donnée non saisie</span>
        {editMode && (
          <span style={{
            background: '#fef9c3', color: '#92400e',
            padding: '2px 8px', borderRadius: 4, fontWeight: 700
          }}>
            ✏️ Saisie auto-sauvegardée à chaque sortie de cellule
          </span>
        )}
      </div>
    </div>
  );
}
