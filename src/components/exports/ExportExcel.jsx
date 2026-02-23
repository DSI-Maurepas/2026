import React from 'react';
import exportService from '../../services/exportService';
import uiService from '../../services/uiService';
import auditService from '../../services/auditService';

const ExportExcel = ({ electionState }) => {

  const tourActuel = electionState?.tourActuel || 1;

  const handleExport = async (type) => {
    try {
      await exportService.exportExcel(type, tourActuel);

      // Audit non bloquant
      try {
        await auditService?.logExport?.('EXPORT', 'EXCEL', {
          type,
          tour: tourActuel
        });
      } catch (_) {}

    } catch (error) {
      uiService.toast('error', {
        title: 'Export',
        message: `Erreur : ${error.message}`
      });
    }
  };

  return (
    <div className="export-excel">
      <h3>📊 Exports Excel</h3>
      
      <div className="export-buttons" style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}>
        <button
          className={`export-btn ${tourActuel === 1 ? 't1' : 't2'}`}
          onClick={() => handleExport('participation')}
        >
          📋 Participation
        </button>

        <button
          className={`export-btn ${tourActuel === 1 ? 't1' : 't2'}`}
          onClick={() => handleExport('resultats')}
        >
          🗳️ Résultats
        </button>

        <button
          className={`export-btn ${tourActuel === 1 ? 't1' : 't2'}`}
          onClick={() => handleExport('sieges')}
        >
          🪑 Sièges
        </button>

        <button
          className={`export-btn ${tourActuel === 1 ? 't1' : 't2'}`}
          onClick={() => handleExport('audit')}
        >
          📝 Audit
        </button>

        <button
          className={`export-btn ${tourActuel === 1 ? 't1' : 't2'}`}
          onClick={() => handleExport('affiche_resultats')}
        >
          🗺️ Affiche Résultats (XLSX)
        </button>

        <button
          className={`export-btn ${tourActuel === 1 ? 't1' : 't2'}`}
          onClick={() => handleExport('complet')}
        >
          📦 Export complet
        </button>
      </div>
    </div>
  );
};

export default ExportExcel;
