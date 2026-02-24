// src/components/MyReservations.js
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx'; // ⚠️ Nécessite: npm install xlsx
import googleSheetsService from '../services/googleSheetsService';
import emailService from '../services/emailService';
import icalService from '../services/icalService'; // Service iCal centralisé
import { MOTIFS_ANNULATION, COULEURS_OBJETS } from '../config/googleSheets';
import './MyReservations.css';

// Fonction utilitaire pour couleurs pastel
const toPastel = (hexColor) => {
  if (!hexColor || hexColor === '#f9f9f9') return '#f9f9f9';
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const pastelR = Math.round(r * 0.3 + 255 * 0.7);
  const pastelG = Math.round(g * 0.3 + 255 * 0.7);
  const pastelB = Math.round(b * 0.3 + 255 * 0.7);
  return `#${pastelR.toString(16).padStart(2, '0')}${pastelG.toString(16).padStart(2, '0')}${pastelB.toString(16).padStart(2, '0')}`;
};

function MyReservations({ userEmail, setUserEmail, onEditReservation }) {
  const [reservations, setReservations] = useState([]);
  const [filteredReservations, setFilteredReservations] = useState([]);
  const [filter, setFilter] = useState('all'); 
  const [loading, setLoading] = useState(false);
  const [searchEmail, setSearchEmail] = useState(userEmail);
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  
  // Modales
  const [confirmModal, setConfirmModal] = useState({ show: false, type: '', reservation: null, motif: '' });
  const [cancelModal, setCancelModal] = useState({ show: false, reservation: null });
  const [selectedMotif, setSelectedMotif] = useState('');
  const [detailsModal, setDetailsModal] = useState({ show: false, reservation: null }); // Popup détails pour responsive
  const [popupClosing, setPopupClosing] = useState(false); // Gestion fermeture popup

  // --- CHARGEMENT ---
  useEffect(() => {
    if (userEmail) {
      loadUserReservations();
    } else {
      // ✅ CORRECTION : Vider les listes si l'email est vide (déconnexion)
      setReservations([]);
      setFilteredReservations([]);
    }
  }, [userEmail]);

  // Timer automatique pour fermer la popup après 4 secondes
  useEffect(() => {
    if (detailsModal.show && detailsModal.reservation) {
      const displayTimer = setTimeout(() => {
        handleClosePopup();
      }, 4000);

      return () => clearTimeout(displayTimer);
    }
  }, [detailsModal.show]);

  // Fonction pour fermer la popup avec animation
  const handleClosePopup = () => {
    setPopupClosing(true);
    setTimeout(() => {
      setDetailsModal({ show: false, reservation: null });
      setPopupClosing(false);
    }, 400); 
  };
  
  const loadUserReservations = async () => {
    setLoading(true);
    try {
      // Note: Si vous souhaitez voir aussi les réservations IA ici, il faudra fusionner avec getAllIAReservations()
      const allReservations = await googleSheetsService.getAllReservations();
      const userReservations = allReservations.filter(res => 
        res.email && res.email.trim().toLowerCase() === userEmail.trim().toLowerCase()
      );
      
      userReservations.sort((a, b) => {
        const dateA = new Date(`${a.dateDebut}T${a.heureDebut}`);
        const dateB = new Date(`${b.dateDebut}T${b.heureDebut}`);
        return dateB - dateA;
      });
      
      setReservations(userReservations);
      setFilteredReservations(userReservations);
    } catch (error) { 
      console.error(error); 
    } finally { 
      setLoading(false); 
    }
  };

  const handleSearch = (e) => { 
    e.preventDefault(); 
    if (!searchEmail) return; 
    setUserEmail(searchEmail); 
  };

  const filterReservations = (filterType) => {
    const now = new Date();
    setFilter(filterType);
    
    if (filterType === 'all') {
        setFilteredReservations(reservations);
    } else if (filterType === 'upcoming') {
        setFilteredReservations(reservations.filter(res => new Date(`${res.dateDebut}T${res.heureDebut}`) > now));
    } else if (filterType === 'past') {
        setFilteredReservations(reservations.filter(res => new Date(`${res.dateDebut}T${res.heureFin || res.heureDebut}`) < now));
    } else if (filterType === 'today') {
        setFilteredReservations(reservations.filter(res => new Date(res.dateDebut).toDateString() === now.toDateString()));
    }
  };

  const getSortedReservations = () => {
    if (!sortColumn) return filteredReservations;
    return [...filteredReservations].sort((a, b) => {
      let aVal = a[sortColumn];
      let bVal = b[sortColumn];
      
      if (sortColumn === 'dateDebut') { 
          aVal = new Date(aVal); 
          bVal = new Date(bVal); 
      }
      
      if (sortDirection === 'asc') return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      else return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
    });
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
      if (sortColumn !== column) return null; 
      return sortDirection === 'asc' ? ' ▲' : ' ▼'; 
  };

  // ✅ CORRECTION MAJEURE : Appel de la prop onEditReservation
  const handleEdit = (reservation) => {
    if (onEditReservation) {
      onEditReservation(reservation);
    } else {
      console.error("Fonction d'édition non disponible");
    }
  };

  const handleDeleteClick = (reservation) => { 
      setCancelModal({ show: true, reservation: reservation }); 
      setSelectedMotif(''); 
  };

  const handleDeleteConfirm = async () => {
    const reservation = cancelModal.reservation;
    const motif = selectedMotif || 'Aucun motif fourni';
    setCancelModal({ show: false, reservation: null });
    
    try {
      await googleSheetsService.deleteReservation(reservation.id);
      setConfirmModal({ show: true, type: 'cancel', reservation: reservation, motif: motif });
      await loadUserReservations();
      try { await emailService.sendCancellationEmail({ ...reservation, motif: motif }); } catch (e) { console.error("Erreur envoi mail", e); }
    } catch (error) {
      alert('Erreur lors de la suppression : ' + error.message);
    }
  };

  // Fonction pour ouvrir la fiche détails en responsive uniquement
  const handleRowClick = (reservation) => {
    // Ouvrir la modal uniquement en mode responsive (< 768px)
    if (window.innerWidth < 768) {
      setDetailsModal({ show: true, reservation });
    }
  };

  const exportToXLSX = () => {
    const headers = ['Salle', 'Date', 'Horaire', 'Agent', 'Service', 'Objet', 'Email', 'Téléphone', 'Description', 'Récurrence'];
    const rows = filteredReservations.map(res => [res.salle, new Date(res.dateDebut).toLocaleDateString('fr-FR'), `${res.heureDebut} - ${res.heureFin}`, `${res.prenom || ''} ${res.nom || ''}`.trim(), res.service, res.objet, res.email || '', res.telephone || '', res.description || '', res.recurrence ? `OUI (jusqu'au ${res.recurrenceJusquau || 'N/A'})` : 'NON']);
    const xmlContent = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Réservations"><Table><Row>${headers.map(h => `<Cell><Data ss:Type="String">${h}</Data></Cell>`).join('')}</Row>${rows.map(row => `<Row>${row.map(cell => `<Cell><Data ss:Type="String">${String(cell).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Data></Cell>`).join('')}</Row>`).join('')}</Table></Worksheet></Workbook>`;
    const blob = new Blob([xmlContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `reservations_${userEmail}.xls`; link.click();
  };

  const exportToICalendar = () => {
    icalService.generateAndDownload(filteredReservations);
  };

  const formatMobileRoomName = (name) => { if (!name) return ''; return name.replace('Salle Conseil', 'Conseil').replace('Salle Mariages', 'Mariages').replace('Salle N°', 'Salle ').replace('Salle CCAS', 'CCAS'); };

  if (loading) return <div className="my-reservations-container"><div className="loading-container"><div className="spinner"></div><p>Chargement...</p></div></div>;

  return (
    <>
      <div className="my-reservations-container">
      
      {!userEmail && (
        <div className="search-section">
          <form onSubmit={handleSearch}><input type="email" placeholder="Entrez votre email" value={searchEmail} onChange={(e) => setSearchEmail(e.target.value)} required /><button type="submit">🔍 Rechercher</button></form>
        </div>
      )}

      <div className="filter-buttons">
        <button onClick={() => filterReservations('all')} className={`filter-btn ${filter === 'all' ? 'active' : ''}`}>📅 <span className="btn-label-text">Toutes</span> ({reservations.length})</button>
        <button onClick={() => filterReservations('past')} className={`filter-btn btn-past ${filter === 'past' ? 'active' : ''}`}>📜 <span className="btn-label-text">Passées</span> ({reservations.filter(r => new Date(`${r.dateDebut}T${r.heureFin || r.heureDebut}`) < new Date()).length})</button>
        <button onClick={() => filterReservations('today')} className={`filter-btn ${filter === 'today' ? 'active' : ''}`}>📆 <span className="btn-label-text">Aujourd'hui</span> ({reservations.filter(r => { const d = new Date(r.dateDebut); return d.toDateString() === new Date().toDateString(); }).length})</button>
        <button onClick={() => filterReservations('upcoming')} className={`filter-btn ${filter === 'upcoming' ? 'active' : ''}`}>🔜 <span className="btn-label-text">À venir</span> ({reservations.filter(r => new Date(`${r.dateDebut}T${r.heureDebut}`) > new Date()).length})</button>
        
        {/* BOUTON EXPORT XLSX (Desktop uniquement) */}
        <button onClick={exportToXLSX} className="filter-btn btn-export-excel">
          📥 <span className="btn-label-text">Exporter (XLSX)</span>
        </button>

        {/* BOUTON DÉCONNEXION */}
        <button onClick={() => { setUserEmail(''); setSearchEmail(''); }} className="filter-btn btn-logout">
          ❌ <span className="btn-label-text">Déconnexion</span>
        </button>
      </div>

      {filteredReservations.length === 0 ? <div className="no-reservations"><p>Aucune réservation trouvée pour cet email.</p></div> : (
        <div className="reservations-card">
          <div className="table-scroll-container">
            <table className="reservations-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('salle')} style={{cursor: 'pointer'}}>Salle{renderSortIcon('salle')}</th>
                  <th onClick={() => handleSort('dateDebut')} style={{cursor: 'pointer'}}>Date{renderSortIcon('dateDebut')}</th>
                  <th onClick={() => handleSort('heureDebut')} style={{cursor: 'pointer'}}><span className="desktop-view">Heure</span>{renderSortIcon('heureDebut')}</th>
                  <th className="col-service" onClick={() => handleSort('service')} style={{cursor: 'pointer'}}>Service{renderSortIcon('service')}</th>
                  <th className="col-objet" onClick={() => handleSort('objet')} style={{cursor: 'pointer'}}>Objet{renderSortIcon('objet')}</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {getSortedReservations().map((reservation, index) => (
                  <tr 
                    key={index} 
                    style={{ backgroundColor: toPastel(COULEURS_OBJETS[reservation.objet] || '#f9f9f9'), cursor: window.innerWidth < 768 ? 'pointer' : 'default' }}
                    onClick={() => handleRowClick(reservation)}
                  >
                    <td>{(() => { const parts = reservation.salle.split(' - '); return (<><div className="salle-nom desktop-view">{parts[0]}</div><div className="salle-nom mobile-view">{formatMobileRoomName(parts[0])}</div>{parts[1] && (<><div className="salle-capacite desktop-view">{parts[1]}</div><div className="salle-capacite mobile-view">{parts[1].replace('Personnes', 'Pers.')}</div></>)}</>); })()}</td>
                    <td><span className="desktop-view">{new Date(reservation.dateDebut).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span><span className="mobile-view">{new Date(reservation.dateDebut).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span></td>
                    <td><span className="desktop-view">{reservation.heureDebut} - {reservation.heureFin}</span><span className="mobile-view">{reservation.heureDebut} {reservation.heureFin}</span></td>
                    <td className="col-service">{reservation.service}</td>
                    <td className="col-objet">{reservation.objet}</td>
                    <td>
                      <div className="actions-wrapper">
                        <button onClick={(e) => { e.stopPropagation(); handleEdit(reservation); }} className="edit-button">
                          <span className="btn-text">Modifier</span>
                          <span className="btn-icon">✏️</span>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(reservation); }} className="delete-button">
                          <span className="btn-text">Annuler</span>
                          <span className="btn-icon">🗑️</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
    {cancelModal.show && (<div className="cancel-modal-overlay" onClick={() => setCancelModal({ show: false, reservation: null })}><div className="cancel-modal" onClick={(e) => e.stopPropagation()}><h3>⚠️ Confirmer l'annulation</h3><div className="reservation-details"><p><strong>📅 </strong> {new Date(cancelModal.reservation.dateDebut).toLocaleDateString('fr-FR')}</p><p><strong>🕐 </strong> {cancelModal.reservation.heureDebut} - {cancelModal.reservation.heureFin}</p><p><strong>🏢 </strong> {cancelModal.reservation.salle}</p><p><strong>📝 </strong> {cancelModal.reservation.objet}</p></div><div className="motif-selection"><label><strong>💬 </strong></label><select value={selectedMotif} onChange={(e) => setSelectedMotif(e.target.value)} className="motif-select"><option value="">-- Motif --</option>{MOTIFS_ANNULATION.map((m, i) => <option key={i} value={m}>{m}</option>)}</select></div><div className="modal-actions"><button onClick={() => setCancelModal({ show: false, reservation: null })} className="cancel-action-btn">Annuler</button><button onClick={handleDeleteConfirm} className="confirm-action-btn" disabled={!selectedMotif}>Confirmer</button></div></div></div>)}
    {confirmModal.show && (<div className="confirmation-modal-overlay" onClick={() => setConfirmModal({ ...confirmModal, show: false })}><div className="confirmation-modal" onClick={(e) => e.stopPropagation()}><h3>{confirmModal.type === 'cancel' ? '✅ Annulation confirmée' : '✅ Modification confirmée'}</h3><div className="reservation-details"><p><strong>📅 Date :</strong> {new Date(confirmModal.reservation.dateDebut).toLocaleDateString('fr-FR')}</p><p><strong>🕐 Horaire :</strong> {confirmModal.reservation.heureDebut} - {confirmModal.reservation.heureFin}</p><p><strong>🏢 Salle :</strong> {confirmModal.reservation.salle}</p>{confirmModal.motif && <p><strong>💬 Motif :</strong> {confirmModal.motif}</p>}</div><button onClick={() => setConfirmModal({ ...confirmModal, show: false })}>Fermer</button></div></div>)}
    
    {detailsModal.show && detailsModal.reservation && (
      <div 
        className={`reservation-details-popup ${popupClosing ? 'closing' : ''}`}
        onClick={handleClosePopup}
      >
        <div className="popup-card-header">
          📋 Détails de la réservation
        </div>
        <div className="popup-card-body">
          <div className="popup-info-line">
            <span className="popup-info-icon">🏢</span>
            <span><strong></strong> {detailsModal.reservation.salle}</span>
          </div>
          <div className="popup-info-line">
            <span className="popup-info-icon">📅</span>
            <span><strong></strong> {new Date(detailsModal.reservation.dateDebut).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
          <div className="popup-info-line">
            <span className="popup-info-icon">🕐</span>
            <span><strong></strong> {detailsModal.reservation.heureDebut} - {detailsModal.reservation.heureFin}</span>
          </div>
          <div className="popup-info-line">
            <span className="popup-info-icon">👤</span>
            <span><strong></strong> {detailsModal.reservation.prenom} {detailsModal.reservation.nom}</span>
          </div>
          <div className="popup-info-line">
            <span className="popup-info-icon">📧</span>
            <span><strong></strong> {detailsModal.reservation.email}</span>
          </div>
          {detailsModal.reservation.telephone && (
            <div className="popup-info-line">
              <span className="popup-info-icon">📞</span>
              <span><strong></strong> {detailsModal.reservation.telephone}</span>
            </div>
          )}
          <div className="popup-info-line">
            <span className="popup-info-icon">🏛️</span>
            <span><strong></strong> {detailsModal.reservation.service}</span>
          </div>
          <div className="popup-info-line">
            <span className="popup-info-icon">📝</span>
            <span><strong></strong> {detailsModal.reservation.objet}</span>
          </div>
          {detailsModal.reservation.description && (
            <div className="popup-info-line">
              <span className="popup-info-icon">💬</span>
              <span><strong></strong> {detailsModal.reservation.description}</span>
            </div>
          )}
          {(detailsModal.reservation.salle.toLowerCase().includes('conseil') || detailsModal.reservation.salle.toLowerCase().includes('mariages')) && (
            <>
              {detailsModal.reservation.agencement && (
                <div className="popup-info-line">
                  <span className="popup-info-icon">🪑</span>
                  <span><strong></strong> {detailsModal.reservation.agencement}</span>
                </div>
              )}
              {detailsModal.reservation.nbPersonnes && (
                <div className="popup-info-line">
                  <span className="popup-info-icon">👥</span>
                  <span><strong></strong> {detailsModal.reservation.nbPersonnes}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    )}
    </>
  );
}

export default MyReservations;