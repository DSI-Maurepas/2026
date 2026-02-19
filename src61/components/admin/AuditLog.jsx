import React, { useEffect, useMemo, useState } from 'react';
import { useGoogleSheets } from '../../hooks/useGoogleSheets';
import googleSheetsService from '../../services/googleSheetsService';
import uiService from '../../services/uiService';
import auditService from '../../services/auditService';
import { SHEET_NAMES } from '../../utils/constants';

const AuditLog = () => {
  // IMPORTANT :
  // useGoogleSheets doit pointer sur l'onglet via le mapping centralisé SHEET_NAMES
  // pour garantir la cohérence stricte entre l'application et Google Sheets.
  const { data: rawLogs, load, loading } = useGoogleSheets(SHEET_NAMES.AUDIT_LOG);

  const [purging, setPurging] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    load();
  }, [load]);

  const handlePurge = async (tour) => {
    if (purging) return;
    setError(null);

    const label = tour === 2 ? '2nd tour' : 'tour 1';
    const ok = await uiService.confirm({
      title: "Purger le journal d'audit",
      message: `Purger le journal d'audit pour le ${label} ?\n\nCette action est irréversible.`,
      confirmText: "Purger",
      cancelText: "Annuler",
    });
    if (!ok) return;

    try {
      setPurging(true);
      await googleSheetsService.purgeAuditLogByTour(tour);
      await load();
      uiService.toast('success', `✅ Journal d\'audit purgé pour le ${label}`);
} catch (e) {
      console.error('Purge audit échouée:', e);
      setError(e?.message || 'Erreur lors de la purge du journal');
    } finally {
      setPurging(false);
    }
  };

  // Normalisation robuste :
  // - Supporte les logs déjà structurés ({timestamp,user,action,details})
  // - Supporte les lignes brutes Google Sheets (tableaux)
  const logs = useMemo(() => {
    const rows = Array.isArray(rawLogs) ? rawLogs : [];

    const parseDetails = (v) => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') return v;
      const s = String(v);
      if (!s) return '';
      try {
        return JSON.parse(s);
      } catch (_) {
        return s;
      }
    };

    const normalizeOne = (row) => {
      // Objet déjà normalisé
      if (row && typeof row === 'object' && !Array.isArray(row)) {
        return {
          timestamp: row.timestamp || row.ts || row.date || '',
          user: row.user || row.utilisateur || '',
          action: row.action || '',
          details: row.details ?? row.detail ?? '',
        };
      }

      // Ligne brute: [timestamp, user, action, details, ...]
      if (Array.isArray(row)) {
        const [timestamp = '', user = '', action = '', details = ''] = row;
        return { timestamp, user, action, details };
      }

      return { timestamp: '', user: '', action: '', details: '' };
    };

    // Filtrer les lignes vides et les entêtes éventuels
    const normalized = rows
      .map(normalizeOne)
      .filter((r) => (r.timestamp || r.user || r.action || r.details));

    return normalized.map((r) => ({ ...r, details: parseDetails(r.details) }));
  }, [rawLogs]);

  return (
    <div className="audit-log">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <h3 style={{ margin: 0 }}>📝 Journal d'audit</h3>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="action-btn"
            onClick={() => handlePurge(1)}
            disabled={loading || purging}
            title="Supprime les entrées liées au Tour 1 (T1 / tour1)"
            style={{ padding: '0.35rem 0.6rem', fontSize: '0.9rem' }}
          >
            {purging ? '...' : 'Purge log tour 1'}
          </button>

          <button
            type="button"
            className="action-btn"
            onClick={() => handlePurge(2)}
            disabled={loading || purging}
            title="Supprime les entrées liées au Tour 2 (T2 / tour2)"
            style={{ padding: '0.35rem 0.6rem', fontSize: '0.9rem' }}
          >
            {purging ? '...' : 'Purge log 2nd tour'}
          </button>
        </div>
      </div>

      {error && (
        <div className="message error" style={{ marginTop: '0.75rem' }}>
          {error}
        </div>
      )}

      {loading ? (
        <p>Chargement...</p>
      ) : logs.length === 0 ? (
        <p style={{ marginTop: '0.75rem' }}>Aucune entrée dans le journal d'audit.</p>
      ) : (
        <div className="audit-table-container">
          <table className="audit-table">
            <thead>
              <tr>
                <th>Date/Heure</th>
                <th>Utilisateur</th>
                <th>Action</th>
                <th>Détails</th>
              </tr>
            </thead>
            <tbody>
              {logs
                .slice()
                .reverse()
                .map((log, index) => {
                  const date = log.timestamp ? new Date(log.timestamp) : null;
                  const dateStr =
                    date && !Number.isNaN(date.getTime())
                      ? date.toLocaleString('fr-FR')
                      : (log.timestamp || '');

                  return (
                    <tr key={index}>
                      <td>{dateStr}</td>
                      <td>{log.user}</td>
                      <td>
                        <strong>{log.action}</strong>
                      </td>
                      <td className="details">{JSON.stringify(log.details)}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AuditLog;
