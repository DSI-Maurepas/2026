// src/components/participation/ParticipationSaisie.jsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import googleSheetsService from '../../services/googleSheetsService';
import auditService from '../../services/auditService';
import { getAuthState, isBV } from '../../services/authService';

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

// Normalise Bureau ID for robust matching between auth codes (e.g. "1") and Sheets values (e.g. "BV1", "BV 1")
const normalizeBureauId = (value) => {
  if (value === null || value === undefined) return '';
  const s = String(value).trim().toUpperCase();
  const m = s.match(/(\d+)/);
  return m ? m[1] : s;
};

const ParticipationSaisie = ({ electionState, reloadElectionState }) => {
  const auth = useMemo(() => getAuthState(), []);
  const forcedBureauId = isBV(auth) ? String(auth.bureauId) : null;

  const tourActuel = electionState?.tourActuel || 1;
  const participationSheet = tourActuel === 2 ? 'Participation_T2' : 'Participation_T1';

  const [bureaux, setBureaux] = useState([]);
  const [selectedBureauId, setSelectedBureauId] = useState(forcedBureauId || '');
  const [row, setRow] = useState(null); // ligne participation (objet) avec rowIndex
  const [inputs, setInputs] = useState({}); // buffer de saisie (string) pour éviter validations pendant frappe
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState(null);
  const [validationError, setValidationError] = useState(null); // {current, prevLabel, prevVal}

  const loadBureaux = useCallback(async () => {
    const list = await googleSheetsService.getData('Bureaux');
    setBureaux(Array.isArray(list) ? list : []);
  }, []);

  const loadParticipationRow = useCallback(
    async (bureauId) => {
      if (!bureauId) {
        setRow(null);
        setInputs({});
        return;
      }
      setLoading(true);
      try {
        const rows = await googleSheetsService.getData(participationSheet);

        // Robust match: "1" == "BV1" == "BV 1"
        const current = (Array.isArray(rows) ? rows : []).find(
          (r) => normalizeBureauId(r?.bureauId ?? '') === normalizeBureauId(bureauId)
        );

        setRow(current || null);

        // init buffer inputs
        const next = {};
        HOURS.forEach((h) => {
          const v = current ? current[h.key] ?? 0 : 0;
          next[h.key] = v === null || v === undefined ? '' : String(v);
        });
        setInputs(next);
      } finally {
        setLoading(false);
      }
    },
    [participationSheet]
  );

  useEffect(() => {
    loadBureaux();
  }, [loadBureaux]);

  // BV : bureau imposé
  useEffect(() => {
    if (forcedBureauId) setSelectedBureauId(forcedBureauId);
  }, [forcedBureauId]);

  // Recharger la ligne participation quand bureau/tour change
  useEffect(() => {
    loadParticipationRow(selectedBureauId);
  }, [selectedBureauId, loadParticipationRow]);

  const bureauOptions = useMemo(() => {
    // Le service filtre déjà côté BV (et on a corrigé getData pour retourner filtered)
    return bureaux
      .filter((b) => b?.actif !== false)
      .map((b) => ({
        id: String(b.id ?? '').trim(),
        label: `BV ${String(b.id ?? '').trim()} — ${b.nom}${b.inscrits ? ` (${b.inscrits} inscrits)` : ''}`,
      }));
  }, [bureaux]);

  const handleChange = (key, value) => {
    // Buffer : pas de validation bloquante pendant la frappe
    setInputs((prev) => ({ ...prev, [key]: value }));
  };

  const handleBlur = async (key) => {
    if (!row || !selectedBureauId) return;

    const raw = inputs[key];
    // autoriser vide (ne pas écraser par 0 si l'utilisateur efface puis sort)
    if (raw === '') return;

    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) return;

    // ── Validation cumulative : H doit être ≥ H-1 ──────────────────
    const keyIndex = HOURS.findIndex((h) => h.key === key);
    if (keyIndex > 0) {
      const prevKey = HOURS[keyIndex - 1].key;
      const prevVal = parseInt(inputs[prevKey] ?? row?.[prevKey] ?? 0, 10);
      if (Number.isFinite(prevVal) && n < prevVal) {
        // Annuler la saisie : remettre la valeur actuelle en sheets
        const current = Number.isFinite(parseInt(String(row?.[key] ?? ''), 10))
          ? String(row[key])
          : '';
        setInputs((prev) => ({ ...prev, [key]: current }));
        setValidationError({
          current: n,
          prevLabel: HOURS[keyIndex - 1].label,
          prevVal,
        });
        return;
      }
    }

    const updated = { ...row, [key]: n };

    // Timestamp si colonne présente
    if (Object.prototype.hasOwnProperty.call(row, 'timestamp')) {
      updated.timestamp = new Date().toISOString();
    }

    try {
      setSavingKey(key);
      await googleSheetsService.updateRow(participationSheet, row.rowIndex, updated);

      // Notify other components (Consolidation/Stats) to refresh without full page reload
      try {
        window.dispatchEvent(new CustomEvent('sheets:changed', { detail: { sheetName: participationSheet } }));
      } catch (_) {}

      auditService?.log?.('PARTICIPATION_UPDATE', {
        sheet: participationSheet,
        bureauId: selectedBureauId,
        field: key,
        value: n,
      });

      // reload state global éventuel (dashboard / badges)
      try {
        await reloadElectionState?.();
      } catch (_) {}
      // reload row (source de vérité sheets)
      await loadParticipationRow(selectedBureauId);
    } finally {
      setSavingKey(null);
    }
  };

  const accentColor = tourActuel === 2 ? '#1d4ed8' : '#166534';
  const accentLight = tourActuel === 2 ? '#dbeafe' : '#dcfce7';
  const accentBorder = tourActuel === 2 ? '#93c5fd' : '#86efac';

  return (
    <div className="participation-saisie">

      {/* ── Modal erreur validation cumulative ── */}
      {validationError && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: '28px 32px',
            maxWidth: 400, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,.25)',
            border: `2px solid ${accentBorder}`
          }}>
            <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 8 }}>⚠️</div>
            <div style={{ fontWeight: 800, fontSize: 16, color: accentColor, textAlign: 'center', marginBottom: 12 }}>
              Saisie invalide — Valeur trop faible
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.6, background: accentLight, borderRadius: 10, padding: '12px 16px', border: `1px solid ${accentBorder}` }}>
              La valeur saisie <strong>{validationError.current}</strong> est inférieure
              au cumul de l'heure précédente ({validationError.prevLabel} = <strong>{validationError.prevVal}</strong>).
              <br/>
              <span style={{ opacity: 0.8 }}>Les votants sont cumulés : la valeur doit être ≥ {validationError.prevVal}.</span>
            </div>
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <button
                onClick={() => setValidationError(null)}
                style={{
                  background: accentColor, color: '#fff', border: 'none',
                  borderRadius: 10, padding: '10px 28px', fontWeight: 800,
                  fontSize: 14, cursor: 'pointer'
                }}
              >
                Corriger la saisie
              </button>
            </div>
          </div>
        </div>
      )}

      <h3>🗳️ Participation — Saisie par bureau</h3>

      <div className="form-group">
        <label>Bureau de vote :</label>
        {forcedBureauId ? (
          <div className="bureau-select bureau-select--locked">BV {forcedBureauId}</div>
        ) : (
          <select className="bureau-select" value={selectedBureauId} onChange={(e) => setSelectedBureauId(e.target.value)}>
            <option value="">-- Sélectionner un bureau --</option>
            {bureauOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {!selectedBureauId ? (
        <div className="info-message">Sélectionnez un bureau de vote pour saisir la participation.</div>
      ) : loading ? (
        <div className="info-message">Chargement…</div>
      ) : !row ? (
        <div className="warning-message">
          Aucune ligne trouvée dans <b>{participationSheet}</b> pour le bureau <b>{selectedBureauId}</b>. (Vérifie que la
          feuille contient bien une ligne par bureau avec la colonne BureauID.)
        </div>
      ) : (
        <div className="participation-grid">

          <style>{`
            /* Presentation only - no impact on behaviour */
            .participation-grid table tbody tr { height: 44px; }
            .participation-grid .hour-cell { width: 70px; white-space: nowrap; font-variant-numeric: tabular-nums; }
            .participation-grid .participation-input {
              width: 100%;
              max-width: 260px;
              height: 32px;
              padding: 6px 10px;
              border-radius: 10px;
              border: 1px solid var(--color-gray-300);
              font-size: var(--font-size-base);
              line-height: 1;
              margin: 0;
            }
            .participation-grid .participation-input:focus {
              outline: none;
              border-color: var(--color-primary);
              box-shadow: 0 0 0 3px rgba(0,0,0,0.06);
            }
            .participation-grid .hint {
              margin-top: 10px;
              font-size: var(--font-size-sm);
              line-height: 1.4;
              color: var(--color-gray-700);
              max-width: 520px;
              white-space: normal;
            }
          `}</style>

          <table className="table">
            <thead>
              <tr>
                <th>Heure</th>
                <th>Votants cumulés</th>
              </tr>
            </thead>
            <tbody>
              {HOURS.map((h) => (
                <tr key={h.key}>
                  <td className="hour-cell">{h.label}</td>
                  <td>
                    <input className="participation-input"
                      type="text"
                      inputMode="numeric"
                      pattern="\d*"
                      value={inputs[h.key] ?? ''}
                      onChange={(e) => handleChange(h.key, e.target.value)}
                      onBlur={() => handleBlur(h.key)}
                      disabled={savingKey === h.key}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="hint">
            Saisie <b>cumulative</b> par heure (validation uniquement au <b>changement de champ</b>).
          </div>
        </div>
      )}
    </div>
  );
};

export default ParticipationSaisie;
