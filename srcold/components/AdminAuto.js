// src/components/AdminAuto.js
import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import googleSheetsService from '../services/googleSheetsService';
import emailService from '../services/emailService';
import { MOTIFS_ANNULATION, COULEURS_OBJETS, APP_CONFIG } from '../config/googleSheets';
// IMPORT DU NOUVEAU COMPOSANT STATISTIQUES SPÉCIFIQUE
import StatisticsAuto from './StatisticsAuto';
import './AdminAuto.css';

// ✅ AJOUT PROP onEditReservation
function AdminAuto({ onEditReservation }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [authError, setAuthError] = useState('');
  
  const [reservations, setReservations] = useState([]);
  const [filteredReservations, setFilteredReservations] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Filtres (Salle retiré)
  const [filterDate, setFilterDate] = useState('');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState('dateDebut');
  const [sortDirection, setSortDirection] = useState('desc');
  
  const [cancelModal, setCancelModal] = useState({ show: false, reservation: null });
  const [selectedMotif, setSelectedMotif] = useState('');

  useEffect(() => {
    const sessionAuth = sessionStorage.getItem('isAdminAutoAuthenticated');
    if (sessionAuth === 'true') setIsAuthenticated(true);
  }, []);

  useEffect(() => { if (isAuthenticated) loadAllReservations(); }, [isAuthenticated]);
  
  useEffect(() => { applyFilters(); }, [reservations, filterDate, filterDateStart, filterDateEnd, searchTerm, sortColumn, sortDirection]);

  const handleAuthenticate = (e) => {
    e.preventDefault();
    if (adminPassword === APP_CONFIG.ADMIN_AUTO_PASSWORD) { 
      setIsAuthenticated(true);
      setAuthError(''); // Reset erreur
      sessionStorage.setItem('isAdminAutoAuthenticated', 'true');
    } else {
      setAuthError('Mot de passe incorrect');
      setAdminPassword('');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setAdminPassword('');
    sessionStorage.removeItem('isAdminAutoAuthenticated');
  };

  const loadAllReservations = async () => {
    setLoading(true);
    try {
      const allReservations = await googleSheetsService.getAllReservations();
      // FILTRE CLIO
      const clioOnly = allReservations.filter(r => r.salle === 'CLIO');
      
      clioOnly.sort((a, b) => new Date(b.dateDebut) - new Date(a.dateDebut));
      setReservations(clioOnly);
      setFilteredReservations(clioOnly);
    } catch (error) { console.error('Erreur:', error); alert('Erreur chargement'); }
    setLoading(false);
  };

  const applyFilters = () => {
    let result = [...reservations];

    if (filterDate) {
      result = result.filter(r => r.dateDebut === filterDate);
    }
    if (filterDateStart) {
      result = result.filter(r => r.dateDebut >= filterDateStart);
    }
    if (filterDateEnd) {
      result = result.filter(r => r.dateDebut <= filterDateEnd);
    }

    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      result = result.filter(r => 
        (r.nom && r.nom.toLowerCase().includes(lowerTerm)) ||
        (r.prenom && r.prenom.toLowerCase().includes(lowerTerm)) ||
        (r.email && r.email.toLowerCase().includes(lowerTerm)) ||
        (r.objet && r.objet.toLowerCase().includes(lowerTerm)) ||
        (r.service && r.service.toLowerCase().includes(lowerTerm))
      );
    }

    if (sortColumn) {
      result.sort((a, b) => {
        let valA = a[sortColumn] || '';
        let valB = b[sortColumn] || '';
        
        if (sortColumn === 'dateDebut') {
          valA = new Date(a.dateDebut + 'T' + (a.heureDebut || '00:00'));
          valB = new Date(b.dateDebut + 'T' + (b.heureDebut || '00:00'));
        }

        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    setFilteredReservations(result);
  };

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const renderSortIcon = (column) => {
    if (sortColumn !== column) return <span className="sort-icon">↕</span>;
    return <span className="sort-icon">{sortDirection === 'asc' ? '↑' : '↓'}</span>;
  };

  const getObjetColor = (objet) => COULEURS_OBJETS[objet] || '#e0e0e0';

  const handleDownloadExcel = async () => {
    if (filteredReservations.length === 0) return alert('Aucune donnée à exporter');
    const dataToExport = filteredReservations.map(r => ({
      'ID': r.id,
      'Salle': r.salle,
      'Date Début': r.dateDebut,
      'Heure Début': r.heureDebut,
      'Date Fin': r.dateFin,
      'Heure Fin': r.heureFin,
      'Nom': r.nom,
      'Prénom': r.prenom,
      'Email': r.email,
      'Téléphone': r.telephone,
      'Service': r.service,
      'Objet': r.objet,
      'Description': r.description,
      'Créé le': new Date(r.dateCreation).toLocaleString()
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Réservations Clio");
    XLSX.writeFile(wb, `Export_Clio_${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`);
  };

  const handleDeleteClick = (reservation) => { setCancelModal({ show: true, reservation: reservation }); setSelectedMotif(''); };
  
  const handleDeleteConfirm = async () => {
    if (!selectedMotif) return alert('Veuillez sélectionner un motif');
    try {
      await googleSheetsService.deleteReservation(cancelModal.reservation.id);
      try {
        await emailService.sendCancellation(cancelModal.reservation, selectedMotif, "Administrateur Auto");
      } catch (e) { console.error("Erreur envoi mail annulation", e); }
      
      setCancelModal({ show: false, reservation: null });
      loadAllReservations();
      alert('Réservation supprimée.');
    } catch (error) { alert('Erreur suppression: ' + error.message); }
  };

  // ✅ MISE A JOUR : Appel de la prop onEditReservation
  const handleEdit = (reservation) => { 
    if (onEditReservation) {
      onEditReservation(reservation);
    }
  };

  // Modal de connexion
  if (!isAuthenticated) {
    return (
      <div className="admin-auto-panel" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div style={{ background: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', textAlign: 'center', maxWidth: '400px', width: '100%' }}>
          <h3 style={{ color: '#0f6aba', marginTop: 0, marginBottom: '1.5rem' }}>🔒 Administration de la Clio</h3>
          <form onSubmit={handleAuthenticate}>
            <input 
              type="password" 
              placeholder="Mot de passe" 
              value={adminPassword} 
              onChange={(e) => setAdminPassword(e.target.value)} 
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', marginBottom: '1rem', boxSizing: 'border-box' }}
              autoFocus
            />
            {authError && <p style={{ color: '#ef5350', fontSize: '0.9rem', marginBottom: '1rem' }}>{authError}</p>}
            <button type="submit" style={{ width: '100%', background: '#0f6aba', color: 'white', padding: '10px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}>
              Valider
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="admin-auto-panel"> 
        <div className="admin-header">
          <div className="admin-header-actions">
            <button onClick={handleDownloadExcel} className="download-excel-btn">📥 Export Clio</button>
            <button onClick={handleLogout} className="logout-btn">❌ Déconnexion</button>
          </div>
        </div>
        
        <StatisticsAuto reservations={reservations} />
        
        <div className="filters-section">
          <div className="filter-group"><label>Recherche :</label><input type="text" placeholder="Nom, email, objet..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="admin-input" /></div>
          <div className="filter-group"><label>Date précise :</label><input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="admin-input" /></div>
          <div className="filter-group"><label>Période du :</label><input type="date" value={filterDateStart} onChange={(e) => setFilterDateStart(e.target.value)} className="admin-input" /></div>
          <div className="filter-group"><label>Au :</label><input type="date" value={filterDateEnd} onChange={(e) => setFilterDateEnd(e.target.value)} className="admin-input" /></div>
        </div>

        <div className="reservations-section">
            <h3>📋 Réservations de la CLIO ({filteredReservations.length})</h3>
            {loading ? <div className="loading-container"><div className="spinner"></div><p>Chargement...</p></div> : filteredReservations.length === 0 ? <div className="no-data"><p>Aucune réservation trouvée</p></div> : (
              <div className="admin-table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th onClick={() => handleSort('dateDebut')}>Date {renderSortIcon('dateDebut')}</th>
                      <th>Horaire</th>
                      <th onClick={() => handleSort('nom')}>Agent {renderSortIcon('nom')}</th>
                      <th onClick={() => handleSort('service')}>Service {renderSortIcon('service')}</th>
                      <th onClick={() => handleSort('objet')}>Objet {renderSortIcon('objet')}</th>
                      <th>Email</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>{filteredReservations.map(res => (
                    <tr key={res.id} style={{backgroundColor: `${getObjetColor(res.objet)}20`}}>
                        <td>{new Date(res.dateDebut).toLocaleDateString('fr-FR')}</td>
                        <td>{res.heureDebut} - {res.heureFin}</td>
                        <td>{res.prenom} {res.nom}</td>
                        <td>{res.service}</td>
                        <td>{res.objet}</td>
                        <td>{res.email}</td>
                        <td><div className="actions-wrapper"><button onClick={() => handleEdit(res)} className="edit-button">Modifier</button><button onClick={() => handleDeleteClick(res)} className="delete-button">Supprimer</button></div></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
        </div>
      </div>
      {/* ✅ MODAL SUPPRESSION IDENTIQUE A ADMINPANEL */}
      {cancelModal.show && <div className="cancel-modal-overlay"><div className="cancel-modal"><h3>Suppression</h3><p>Voulez-vous supprimer la réservation de <strong>{cancelModal.reservation.nom}</strong> ?</p><div className="motif-selection"><select value={selectedMotif} onChange={(e) => setSelectedMotif(e.target.value)}><option value="">-- Choisir un motif --</option>{MOTIFS_ANNULATION.map(m => <option key={m} value={m}>{m}</option>)}</select></div><div className="modal-actions"><button onClick={() => setCancelModal({show:false, reservation:null})} className="btn-cancel">Annuler</button><button onClick={handleDeleteConfirm} className="btn-submit" disabled={!selectedMotif}>Confirmer</button></div></div></div>}
    </>
  );
}

export default AdminAuto;