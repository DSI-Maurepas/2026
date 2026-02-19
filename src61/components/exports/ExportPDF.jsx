import React from 'react';
import exportService from '../../services/exportService';
import uiService from '../../services/uiService';
import auditService from '../../services/auditService';

const ExportPDF = ({ electionState }) => {

  const tourActuel = electionState?.tourActuel || 1;

  const handleExport = async (type) => {
    try {
      await exportService.exportPDF(type, tourActuel);

      if (typeof auditService?.logExport === 'function') {
        try {
          await auditService.logExport(type, 'PDF');
        } catch (e) {
          console.warn('Audit export PDF non bloquant :', e);
        }
      }
    } catch (error) {
      uiService.toast('error', `Erreur : ${error.message}`);
    }
  };

  return (
    <div className="export-pdf">
      <h3>📄 Exports PDF</h3>

      <div className="export-buttons">
        <button
          className={`export-btn ${tourActuel === 1 ? 't1' : 't2'}`}
          onClick={() => handleExport('participation')}
        >
          📋 PV Participation
        </button>

        <button
          className={`export-btn ${tourActuel === 1 ? 't1' : 't2'}`}
          onClick={() => handleExport('resultats')}
        >
          🗳️ PV Résultats
        </button>

        <button
          className={`export-btn ${tourActuel === 1 ? 't1' : 't2'}`}
          onClick={() => handleExport('statistiques')}
        >
          📊 Statistiques
        </button>

        <button
          className={`export-btn ${tourActuel === 1 ? 't1' : 't2'}`}
          onClick={() => handleExport('sieges')}
        >
          🪑 Répartition sièges
        </button>
      </div>
    </div>
  );
};

export default ExportPDF;
