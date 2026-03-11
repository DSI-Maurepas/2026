import React, { useEffect, useMemo, useState } from "react";
import { useGoogleSheets } from "../../hooks/useGoogleSheets";
import googleSheetsService from "../../services/googleSheetsService";

/**
 * Admin - Bureaux
 * Version éditable : lecture seule par défaut, basculement en écriture via bouton.
 * Sauvegarde cellule par cellule sur blur.
 */
const ConfigBureaux = () => {
  const { data: bureaux, load, loading } = useGoogleSheets("Bureaux");



  const [editMode,  setEditMode]  = useState(false);
  const [editData,  setEditData]  = useState({});
  const [savingKey, setSavingKey] = useState(null);
  const [feedback,  setFeedback]  = useState(null); // { type: 'success'|'error', msg }

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => (Array.isArray(bureaux) ? bureaux : []), [bureaux]);

  // ── Synchronisation scroll vertical ──────────────────────────────────────
  const syncScroll = (source) => {
    const l = leftRef.current;
    const r = rightRef.current;
    if (!l || !r) return;
    if (source === "right") l.scrollTop = r.scrollTop;
    if (source === "left")  r.scrollTop = l.scrollTop;
  };

  // ── Entrer en mode édition ────────────────────────────────────────────────
  const enterEditMode = () => {
    const init = {};
    rows.forEach(b => {
      init[b.id] = {
        nom:                 b.nom                 ?? '',
        adresse:             b.adresse             ?? '',
        president:           b.president           ?? '',
        vicePresident:       b.vicePresident       ?? '',
        secretaire:          b.secretaire          ?? '',
        secretaireSuppleant: b.secretaireSuppleant ?? b.SecretaireSuppleant ?? '',
        inscrits:            b.inscrits            ?? '',
        _rowIndex:           b.rowIndex,
      };
    });
    setEditData(init);
    setEditMode(true);
    setFeedback(null);
  };

  const exitEditMode = () => {
    setEditMode(false);
    setEditData({});
    setFeedback(null);
  };

  // ── Mise à jour locale ────────────────────────────────────────────────────
  const handleChange = (bureauId, field, value) => {
    setEditData(prev => ({
      ...prev,
      [bureauId]: { ...prev[bureauId], [field]: value }
    }));
  };

  // ── Sauvegarde sur blur ───────────────────────────────────────────────────
  const handleBlur = async (bureauId, field) => {
    if (!editMode) return;
    const key = `${bureauId}_${field}`;
    setSavingKey(key);
    try {
      const d = editData[bureauId];
      const rowData = {
        id:                  bureauId,
        nom:                 d.nom,
        adresse:             d.adresse,
        president:           d.president,
        vicePresident:       d.vicePresident       ?? '',
        secretaire:          d.secretaire,
        secretaireSuppleant: d.secretaireSuppleant ?? '',
        inscrits:            Number(d.inscrits) || 0,
      };
      await googleSheetsService.updateRow('Bureaux', d._rowIndex, rowData);
      setFeedback({ type: 'success', msg: `${bureauId} — ${field} sauvegardé` });
      await load();
    } catch (e) {
      console.error('[ConfigBureaux] Erreur sauvegarde:', e);
      setFeedback({ type: 'error', msg: `Erreur : ${e?.message || e}` });
    } finally {
      setSavingKey(null);
    }
  };

  // ── Style cellule éditable ────────────────────────────────────────────────
  const tdStyle = {
    padding: '8px 8px',
    verticalAlign: 'middle',
    borderBottom: '1px solid #e2e8f0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 0,
    borderBottom: '1px solid #e2e8f0',
  };

  const inputStyle = (bureauId, field) => ({
    width: '100%',
    padding: '4px 6px',
    border: `1.5px solid ${savingKey === `${bureauId}_${field}` ? '#f59e0b' : '#93c5fd'}`,
    borderRadius: 4,
    fontSize: 12,
    background: savingKey === `${bureauId}_${field}` ? '#fef9c3' : '#fff',
    outline: 'none',
    boxSizing: 'border-box',
  });

  return (
    <div className="config-bureaux">
      {/* ── En-tête ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0 }}>📍 Configuration des bureaux de vote</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {feedback && (
            <span style={{
              fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
              background: feedback.type === 'success' ? '#d1fae5' : '#fee2e2',
              color:      feedback.type === 'success' ? '#065f46' : '#991b1b',
            }}>
              {feedback.type === 'success' ? '✅' : '❌'} {feedback.msg}
            </span>
          )}
          <button
            onClick={() => editMode ? exitEditMode() : enterEditMode()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 18px', borderRadius: 8, border: 'none',
              background: editMode
                ? 'linear-gradient(135deg, #64748b, #475569)'
                : 'linear-gradient(135deg, #1e3c72, #2a5298)',
              color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            }}
          >
            <span>{editMode ? '🔒' : '✏️'}</span>
            <span>{editMode ? 'Verrouiller (lecture seule)' : 'Modifier les bureaux'}</span>
          </button>
        </div>
      </div>

      {/* ── Badge mode ── */}
      <div style={{ marginBottom: 10 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
          background: editMode ? '#fef9c3' : '#d1fae5',
          color:      editMode ? '#92400e' : '#065f46',
          border: `1px solid ${editMode ? '#fde68a' : '#6ee7b7'}`,
        }}>
          {editMode ? '✏️ MODE ÉDITION — sauvegarde automatique à chaque sortie de cellule' : '👁 LECTURE SEULE'}
        </span>
      </div>

      {loading ? (
        <p>Chargement...</p>
      ) : (
        <div style={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', border: '1px solid #e2e8f0' }}>
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', tableLayout: 'fixed', minWidth: 900, fontSize: 13, marginBottom: 0, borderCollapse: 'collapse' }}>
            <colgroup>
              <col style={{ width: 52 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 170 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 72 }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ background: '#1e3a5f', color: '#fff', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '12px 8px', borderBottom: 'none' }}>ID</th>
                <th style={{ background: '#1e3a5f', color: '#fff', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '12px 8px', borderBottom: 'none' }}>Nom</th>
                <th style={{ background: '#1e3a5f', color: '#fff', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '12px 8px', borderBottom: 'none' }}>Adresse</th>
                <th style={{ background: '#1e3a5f', color: '#fff', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '12px 8px', borderBottom: 'none' }}>Président(e)</th>
                <th style={{ background: '#1e3a5f', color: '#fff', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '12px 8px', borderBottom: 'none' }}>Vice-Président(e)</th>
                <th style={{ background: '#1e3a5f', color: '#fff', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '12px 8px', borderBottom: 'none' }}>Secrétaire</th>
                <th style={{ background: '#1e3a5f', color: '#fff', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '12px 8px', borderBottom: 'none' }}>Suppléant(e)</th>
                <th style={{ background: '#1e3a5f', color: '#fff', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '12px 8px', textAlign: 'right', borderBottom: 'none' }}>Inscrits</th>
              </tr>
            </thead>
              <tbody>
                {rows.map((b) => {
                  const d = editData[b.id] || {};
                  return (
                    <tr key={b.id} style={{ background: editMode ? '#fffbeb' : undefined }}
                      onMouseEnter={e => { if (!editMode) e.currentTarget.style.background = '#f0f6ff'; }}
                      onMouseLeave={e => { if (!editMode) e.currentTarget.style.background = ''; }}
                    >
                      {/* ID */}
                      <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, whiteSpace: 'nowrap' }}>{b.id}</td>
                      {/* Nom */}
                      <td>
                        {editMode ? (
                          <input
                            style={inputStyle(b.id, 'nom')}
                            value={d.nom ?? ''}
                            onChange={e => handleChange(b.id, 'nom', e.target.value)}
                            onBlur={() => handleBlur(b.id, 'nom')}
                          />
                        ) : <strong>{b.nom}</strong>}
                      </td>
                      {/* Adresse */}
                      <td>
                        {editMode ? (
                          <input
                            style={inputStyle(b.id, 'adresse')}
                            value={d.adresse ?? ''}
                            onChange={e => handleChange(b.id, 'adresse', e.target.value)}
                            onBlur={() => handleBlur(b.id, 'adresse')}
                          />
                        ) : b.adresse}
                      </td>
                      {/* Président */}
                      <td>
                        {editMode ? (
                          <input
                            style={inputStyle(b.id, 'president')}
                            value={d.president ?? ''}
                            onChange={e => handleChange(b.id, 'president', e.target.value)}
                            onBlur={() => handleBlur(b.id, 'president')}
                          />
                        ) : b.president}
                      </td>
                      {/* Vice-Président(e) */}
                      <td>
                        {editMode ? (
                          <input
                            style={inputStyle(b.id, 'vicePresident')}
                            value={d.vicePresident ?? ''}
                            onChange={e => handleChange(b.id, 'vicePresident', e.target.value)}
                            onBlur={() => handleBlur(b.id, 'vicePresident')}
                          />
                        ) : (b.vicePresident || '—')}
                      </td>
                      {/* Secrétaire */}
                      <td>
                        {editMode ? (
                          <input
                            style={inputStyle(b.id, 'secretaire')}
                            value={d.secretaire ?? ''}
                            onChange={e => handleChange(b.id, 'secretaire', e.target.value)}
                            onBlur={() => handleBlur(b.id, 'secretaire')}
                          />
                        ) : b.secretaire}
                      </td>
                      {/* Suppléant(e) */}
                      <td>
                        {editMode ? (
                          <input
                            style={inputStyle(b.id, 'secretaireSuppleant')}
                            value={d.secretaireSuppleant ?? ''}
                            onChange={e => handleChange(b.id, 'secretaireSuppleant', e.target.value)}
                            onBlur={() => handleBlur(b.id, 'secretaireSuppleant')}
                          />
                        ) : (b.secretaireSuppleant || b.SecretaireSuppleant || '—')}
                      </td>
                      {/* Inscrits */}
                      <td>
                        {editMode ? (
                          <input
                            style={{ ...inputStyle(b.id, 'inscrits'), width: 80, textAlign: 'right' }}
                            type="text"
                            inputMode="numeric"
                            value={d.inscrits ?? ''}
                            onChange={e => handleChange(b.id, 'inscrits', e.target.value)}
                            onBlur={() => handleBlur(b.id, 'inscrits')}
                          />
                        ) : b.inscrits}
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConfigBureaux;
