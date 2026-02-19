import React, { useState } from 'react';
import { auditService } from '../services/auditService';
import { googleSheetsService } from '../services/googleSheetsService';
import uiService from '../services/uiService';

const CandidateManager = ({ candidates, onRefresh }) => {
  const [newCandidate, setNewCandidate] = useState({
    nomListe: '',
    teteDeListe: '',
    couleur: '#00235a',
    averageAge: ''
  });

  const handleAdd = async (e) => {
    e.preventDefault();
    
    // Validation minimale
    if (!newCandidate.nomListe || !newCandidate.averageAge) return;

    try {
      // 1. Log de l'action
      await auditService.log('ADD_CANDIDATE', null, newCandidate);

      // 2. Préparation pour Google Sheets (Format ligne)
      const newRow = [
        `CAND_${Date.now()}`, 
        newCandidate.nomListe, 
        newCandidate.teteDeListe, 
        newCandidate.couleur, 
        newCandidate.averageAge,
        'FALSE' // Qualifié T2 par défaut
      ];

      await googleSheetsService.appendRow('Candidats!A2', newRow);
      
      // 3. Reset & Refresh
      setNewCandidate({ nomListe: '', teteDeListe: '', couleur: '#00235a', averageAge: '' });
      onRefresh();
      uiService.toast('success', '✅ Liste candidate ajoutée avec succès');
    } catch (error) {
      console.error("Erreur ajout candidat:", error);
    }
  };

  return (
    <section className="admin-section">
      <header>
        <h2>Gestion des Listes Candidates</h2>
        <p className="note">Note : La moyenne d'âge est utilisée pour le départage en cas d'égalité parfaite.</p>
      </header>

      <form onSubmit={handleAdd} className="candidate-form">
        <input 
          type="text" 
          placeholder="Nom de la liste" 
          value={newCandidate.nomListe}
          onChange={e => setNewCandidate({...newCandidate, nomListe: e.target.value})}
          required 
        />
        <input 
          type="text" 
          placeholder="Tête de liste" 
          value={newCandidate.teteDeListe}
          onChange={e => setNewCandidate({...newCandidate, teteDeListe: e.target.value})}
          required 
        />
        <input 
          type="number" 
          step="0.1"
          placeholder="Moyenne d'âge" 
          value={newCandidate.averageAge}
          onChange={e => setNewCandidate({...newCandidate, averageAge: e.target.value})}
          required 
        />
        <input 
          type="color" 
          value={newCandidate.couleur}
          onChange={e => setNewCandidate({...newCandidate, couleur: e.target.value})}
        />
        <button type="submit" className="btn-add">Ajouter la liste</button>
      </form>

      <table>
        <thead>
          <tr>
            <th>Nom de la liste</th>
            <th>Tête de liste</th>
            <th>Moyenne d'âge</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map(c => (
            <tr key={c.id}>
              <td style={{ borderLeft: `5px solid ${c.couleur}` }}>{c.nomListe}</td>
              <td>{c.teteDeListe}</td>
              <td>{c.averageAge} ans</td>
              <td>
                <button className="btn-small" onClick={() => {/* Logique suppression */}}>Supprimer</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};

export default CandidateManager;