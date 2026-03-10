// src/components/participation/ParticipationSaisieGlobale.jsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { googleSheetsService, auditService } from '../../services';

const HOURS = [
  { key: 'votants09h', label: '09h' },
  { key: 'votants10h', label: '10h' },
  { key: 'votants11h', label: '11h' },
  { key: 'votants12h', label: '12h' },
  { key: 'votants13h', label: '13h' },
  { key: 'votants14h', label: '14h' },
  { key: 'votants15h', label: '15h' },
  { key: 'votants16h', label: '16h' },
  { key: 'votants17h', label: '17h' },
  { key: 'votants18h', label: '18h' },
  { key: 'votants19h', label: '19h' },
  { key: 'votants20h', label: '20h' },
];

const normalizeBureauId = (value) => {
  if (value === null || value === undefined) return '';
  const s = String(value).trim().toUpperCase();
  const m = s.match(/(\d+)/);
  return m ? m[1] : s;
};

const ParticipationSaisieGlobale = ({ electionState, reloadElectionState }) => {
  const tourActuel         = electionState?.tourActuel || 1;
  const participationSheet = tourActuel === 2 ? 'Participation_T2' : 'Participation_T1';
  const resultatsSheet     = tourActuel === 2 ? 'Resultats_T2'    : 'Resultats_T1';

  const [bureaux,    setBureaux]    = useState([]);
  const [partRows,   setPartRows]   = useState([]);
  const [inputs,     setInputs]     = useState({});
  const [errors,     setErrors]     = useState({});
  const [savingCell, setSavingCell] = useState(null);
  const [loading,    setLoading]    = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [bx, pr] = await Promise.all([
        googleSheetsService.getData('Bureaux'),
        googleSheetsService.getData(participationSheet),
      ]);
      const bxList = Array.isArray(bx) ? bx : [];
      const prList = Array.isArray(pr) ? pr : [];
      setBureaux(bxList);
      setPartRows(prList);

      const nextInputs = {};
      bxList.forEach((b) => {
        const bid = normalizeBureauId(b.id);
        const row = prList.find((r) => normalizeBureauId(r?.bureauId ?? '') === bid);
        nextInputs[bid] = {};
        HOURS.forEach((h) => {
          const v = row ? (row[h.key] ?? '') : '';
          nextInputs[bid][h.key] = (!v || v === 0) ? '' : String(v);
        });
      });
      setInputs(nextInputs);
      setErrors({});
    } finally {
      setLoading(false);
    }
  }, [participationSheet]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    const handler = (evt) => {
      if (evt?.detail?.sheetName === participationSheet) loadAll();
    };
    window.addEventListener('sheets:changed', handler);
    return () => window.removeEventListener('sheets:changed', handler);
  }, [participationSheet, loadAll]);

  const getPartRow = useCallback(
    (bid) => partRows.find((r) => normalizeBureauId(r?.bureauId ?? '') === bid) || null,
    [partRows]
  );

  const calcRate = (votants, inscrits) => {
    if (!inscrits || !votants) return null;
    return ((votants / inscrits) * 100).toFixed(2);
  };

  const handleChange = useCallback((bid, key, value) => {
    setInputs((prev) => ({ ...prev, [bid]: { ...prev[bid], [key]: value } }));
    setErrors((prev) => ({ ...prev, [bid]: { ...(prev[bid] || {}), [key]: null } }));
  }, []);

  const handleBlur = useCallback(async (bureau, key) => {
    const bid = normalizeBureauId(bureau.id);
    const raw = inputs[bid]?.[key] ?? '';
    if (raw === '') return;

    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) return;

    // ── Validation : votants ≤ inscrits ──────────────────────────
    const inscrits = Number(bureau.inscrits) || 0;
    if (inscrits > 0 && n > inscrits) {
      setErrors((prev) => ({
        ...prev,
        [bid]: { ...(prev[bid] || {}), [key]: `Votants (${n}) > inscrits (${inscrits})` },
      }));
      setInputs((prev) => ({ ...prev, [bid]: { ...prev[bid], [key]: '' } }));
      return;
    }

    const keyIndex = HOURS.findIndex((h) => h.key === key);
    if (keyIndex > 0) {
      const prevKey = HOURS[keyIndex - 1].key;
      const prevVal = parseInt(inputs[bid]?.[prevKey] || '0', 10) || 0;
      if (n < prevVal) {
        setErrors((prev) => ({
          ...prev,
          [bid]: { ...(prev[bid] || {}), [key]: `Valeur (${n}) < ${HOURS[keyIndex - 1].label} (${prevVal})` },
        }));
        const row = getPartRow(bid);
        const oldVal = row ? (row[key] ?? '') : '';
        setInputs((prev) => ({ ...prev, [bid]: { ...prev[bid], [key]: (!oldVal || oldVal === 0) ? '' : String(oldVal) } }));
        return;
      }
    }

    const cellKey = `${bid}__${key}`;
    setSavingCell(cellKey);
    try {
      const row     = getPartRow(bid);
      const updated = row
        ? { ...row, [key]: n }
        : { bureauId: `BV${bid}`, inscrits: bureau.inscrits || 0, [key]: n };
      if (Object.prototype.hasOwnProperty.call(updated, 'timestamp'))
        updated.timestamp = new Date().toISOString();

      if (row) await googleSheetsService.updateRow(participationSheet, row.rowIndex, updated);
      else     await googleSheetsService.appendRow(participationSheet, updated);

      if (key === 'votants20h') {
        try {
          const rRows = await googleSheetsService.getData(resultatsSheet);
          const rRow  = (Array.isArray(rRows) ? rRows : []).find(
            (r) => normalizeBureauId(r?.bureauId ?? '') === bid
          );
          if (rRow) await googleSheetsService.updateRow(resultatsSheet, rRow.rowIndex, { ...rRow, votants: n });
          else      await googleSheetsService.appendRow(resultatsSheet, { bureauId: `BV${bid}`, votants: n });
          window.dispatchEvent(new CustomEvent('sheets:changed', { detail: { sheetName: resultatsSheet } }));
        } catch (e) { console.warn('[SaisieGlobale] Sync votants20h->Resultats :', e); }
      }

      window.dispatchEvent(new CustomEvent('sheets:changed', { detail: { sheetName: participationSheet } }));
      try { await auditService?.log?.('PARTICIPATION_UPDATE', { sheet: participationSheet, bureauId: bid, field: key, value: n }); } catch (_) {}
      try { await reloadElectionState?.(); } catch (_) {}

      const fresh = await googleSheetsService.getData(participationSheet);
      setPartRows(Array.isArray(fresh) ? fresh : []);
    } finally {
      setSavingCell(null);
    }
  }, [inputs, getPartRow, participationSheet, resultatsSheet, reloadElectionState]);

  const totaux = useMemo(() => {
    const acc = { inscrits: 0 };
    HOURS.forEach((h) => { acc[h.key] = 0; });
    bureaux
      .filter((b) => b?.actif !== false && b?.actif !== 'FALSE')
      .forEach((b) => {
        const bid = normalizeBureauId(b.id);
        acc.inscrits += Number(b.inscrits) || 0;
        HOURS.forEach((h) => {
          acc[h.key] += parseInt(inputs[bid]?.[h.key] || '0', 10) || 0;
        });
      });
    return acc;
  }, [bureaux, inputs]);

  if (loading) {
    return (
      <div className="participation-tableau">
        <div className="loading"><div className="spinner" /></div>
      </div>
    );
  }

  const activeBureaux = bureaux.filter((b) => b?.actif !== false && b?.actif !== 'FALSE');

  return (
    <div className="participation-tableau">

      <h3>
        🗳️ Participation — Saisie par bureau
        <span style={{ fontSize: '0.80rem', fontWeight: 500, color: '#64748b', marginLeft: 8 }}>
          Tour {tourActuel}
        </span>
      </h3>

      <div className="tableau-scroll">
        <table className="participation-table participation-table--compact">
          <colgroup>
            <col className="bureau-col" />
            <col className="inscrits-col" />
            {HOURS.map((h) => <col key={h.key} className="hour-col" />)}
          </colgroup>

          <thead>
            <tr>
              <th className="bureau-col">Bureau</th>
              <th className="inscrits-col" style={{ textAlign: 'right' }}>Inscrits</th>
              {HOURS.map((h) => (
                <th key={h.key} className="hour-col" style={{ textAlign: 'center' }}>{h.label}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {activeBureaux.map((bureau) => {
              const bid      = normalizeBureauId(bureau.id);
              const inscrits = Number(bureau.inscrits) || 0;

              return (
                <tr key={bureau.id ?? bureau.nom} className="has-data">
                  <td className="bureau-name">{bureau.nom || bureau.id}</td>
                  <td className="number">{inscrits.toLocaleString('fr-FR')}</td>

                  {HOURS.map((h) => {
                    const cellKey  = `${bid}__${h.key}`;
                    const saving   = savingCell === cellKey;
                    const errMsg   = errors[bid]?.[h.key];
                    const rawVal   = inputs[bid]?.[h.key] ?? '';
                    const numVal   = parseInt(rawVal, 10);
                    const hasValue = rawVal !== '' && !isNaN(numVal) && numVal > 0;
                    const rate     = hasValue ? calcRate(numVal, inscrits) : null;

                    return (
                      <td
                        key={h.key}
                        className={`hour-cell ${hasValue && !errMsg ? 'is-filled' : 'is-empty'}`}
                        title={errMsg || undefined}
                        style={{ padding: '2px 3px', verticalAlign: 'middle' }}
                      >
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="\d*"
                          value={rawVal}
                          disabled={saving}
                          onChange={(e) => handleChange(bid, h.key, e.target.value)}
                          onBlur={() => handleBlur(bureau, h.key)}
                          style={{
                            width: '100%',
                            border: errMsg
                              ? '1.5px solid #ef4444'
                              : '1px solid rgba(0,0,0,0.14)',
                            borderRadius: 4,
                            padding: '2px 4px',
                            fontSize: '0.76rem',
                            textAlign: 'right',
                            fontWeight: hasValue ? 700 : 400,
                            color: errMsg ? '#b91c1c' : '#0f172a',
                            background: saving ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.85)',
                            outline: 'none',
                            boxSizing: 'border-box',
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                          aria-label={`${bureau.nom} — ${h.label}`}
                        />
                        {rate !== null && (
                          <div className="hour-percent" style={{ marginTop: 2 }}>{rate}%</div>
                        )}
                        {saving && (
                          <div style={{ fontSize: 9, color: '#94a3b8', textAlign: 'right', lineHeight: 1 }}>⏳</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>

          <tfoot>
            <tr className="total-row has-data">
              <td className="bureau-name"><strong>TOTAL COMMUNAL</strong></td>
              <td className="number"><strong>{totaux.inscrits.toLocaleString('fr-FR')}</strong></td>
              {HOURS.map((h) => {
                const total = totaux[h.key] || 0;
                const rate  = calcRate(total, totaux.inscrits);
                return (
                  <td key={h.key} className="hour-cell" style={{ textAlign: 'right', padding: '4px 6px' }}>
                    <div className="hour-votants">
                      <strong>{total > 0 ? total.toLocaleString('fr-FR') : '—'}</strong>
                    </div>
                    {rate && <div className="hour-percent"><strong>{rate}%</strong></div>}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Même structure et classes que ParticipationTableau */}
      <div className="legend">
        <p>
          <span className="legend-item cell-empty" aria-hidden="true" />
          Cellule heure non renseignée (fond rouge)
        </p>
      </div>

    </div>
  );
};

export default ParticipationSaisieGlobale;
