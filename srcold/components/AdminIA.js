// src/components/AdminIA.js
import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import googleSheetsService from '../services/googleSheetsService';
import emailService from '../services/emailService'; 
import { IA_TOOLS } from '../data/iaData'; 
import { APP_CONFIG, MOTIFS_ANNULATION } from '../config/googleSheets'; 
import './Statistics.css';
import './AdminPanel.css'; // Style standard Admin

// --- SOUS-COMPOSANT PIECHART ---
const PieChart = ({ data, title, colors, sortOrder = 'alpha', className = '', onHover, activeLabel }) => {
  let entries = Object.entries(data);
  const momentOrder = ['Matin', 'Après-midi'];

  if (sortOrder === 'alpha') entries.sort(([a], [b]) => a.localeCompare(b));
  else if (sortOrder === 'asc') entries.sort(([, a], [, b]) => a - b);
  else if (sortOrder === 'desc') entries.sort(([, a], [, b]) => b - a);
  else if (sortOrder === 'moments') entries.sort(([a], [b]) => momentOrder.indexOf(a) - momentOrder.indexOf(b));

  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (total === 0) return null;

  let currentAngle = 0;
  const segments = entries.map(([label, value], index) => {
    const percentage = (value / total) * 100;
    const angle = (value / total) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    const midAngle = startAngle + angle / 2;
    currentAngle = endAngle;

    const r = 40; const cx = 50; const cy = 50;
    const startRad = (startAngle - 90) * Math.PI / 180;
    const endRad = (endAngle - 90) * Math.PI / 180;
    const midRad = (midAngle - 90) * Math.PI / 180;
    const startX = cx + r * Math.cos(startRad);
    const startY = cy + r * Math.sin(startRad);
    const endX = cx + r * Math.cos(endRad);
    const endY = cy + r * Math.sin(endRad);
    const largeArc = angle > 180 ? 1 : 0;

    const isActive = activeLabel === label;
    const explodeDist = isActive ? 4 : 0;
    const transX = explodeDist * Math.cos(midRad);
    const transY = explodeDist * Math.sin(midRad);
    const color = colors[index % colors.length];

    const handleInteraction = (e) => {
      if (e.type === 'click') e.stopPropagation();
      const clientX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      const clientY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
      onHover({ label, value, percentage: percentage.toFixed(1), color, x: clientX, y: clientY });
    };

    return {
      label, value: Math.round(value), percentage: percentage.toFixed(1), color,
      path: `M ${cx} ${cy} L ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY} Z`,
      transform: `translate(${transX}, ${transY})`,
      handleInteraction, isActive
    };
  });

  return (
    <div className={`chart-card ${className}`}>
      <h3>{title}</h3>
      <div className="chart-content">
        <svg viewBox="0 0 100 100" className="pie-chart">
          {segments.map((segment, i) => (
            <path key={i} d={segment.path} fill={segment.color} stroke="white" strokeWidth="0.5" transform={segment.transform} onClick={segment.handleInteraction} onMouseEnter={segment.handleInteraction} style={{ cursor: 'pointer', transition: 'transform 0.3s ease-out' }} />
          ))}
        </svg>
        <div className="chart-legend">
          {segments.map((segment, i) => (
            <div key={i} className={`legend-item ${segment.isActive ? 'active' : ''}`} onClick={segment.handleInteraction} style={{ cursor: 'pointer' }}>
              <span className="legend-color" style={{ backgroundColor: segment.color }}></span>
              <span className="legend-label">{segment.label}</span>
              <span className="legend-value">{segment.percentage}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// --- COMPOSANT PRINCIPAL ---
function AdminIA({ onEditReservation }) {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // GESTION DU MOT DE PASSE ET SESSION
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');

  // Filtres
  const [filterIA, setFilterIA] = useState('Toutes');
  const [filterService, setFilterService] = useState('Tous');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Tri
  const [sortConfig, setSortConfig] = useState({ key: 'dateDebut', direction: 'desc' });

  // Graphiques
  const [hoveredSlice, setHoveredSlice] = useState(null);
  const [isFading, setIsFading] = useState(false);
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });

  // États pour l'annulation
  const [cancelModal, setCancelModal] = useState({ show: false, reservation: null });
  const [selectedMotif, setSelectedMotif] = useState('');

  // VÉRIFICATION DE LA SESSION AU CHARGEMENT
  useEffect(() => {
    const sessionAuth = sessionStorage.getItem('isAdminIAAuthenticated');
    if (sessionAuth === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadAllReservations();
  }, [isAuthenticated]);

  const loadAllReservations = async () => {
    setLoading(true);
    try {
      const data = await googleSheetsService.getAllIAReservations();
      setReservations(data);
    } catch (error) {
      console.error("Erreur chargement IA:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (passwordInput === APP_CONFIG.IA_ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      setAuthError('');
      // ENREGISTREMENT DE LA SESSION
      sessionStorage.setItem('isAdminIAAuthenticated', 'true');
    } else {
      setAuthError('Mot de passe incorrect');
    }
  };

  // GESTION DE LA DÉCONNEXION
  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('isAdminIAAuthenticated');
    setPasswordInput('');
  };

  // Helper pour récupérer le nom de l'IA
  const getIAName = (res) => {
    if (res.salle && res.salle.trim() !== '') return res.salle;
    const tool = IA_TOOLS.find(t => t.id === res.toolId);
    return tool ? tool.nom : 'Inconnue';
  };

  // ✅ Helper pour récupérer la couleur de l'IA
  const getIAColor = (res) => {
    let tool;
    if (res.salle && res.salle.trim() !== '') {
      tool = IA_TOOLS.find(t => t.nom === res.salle);
    } else {
      tool = IA_TOOLS.find(t => t.id === res.toolId);
    }
    return tool ? tool.imageColor : '#f8fafc';
  };

  // Gestion Actions
  const handleEdit = (res) => {
    if (onEditReservation) {
      onEditReservation(res);
    }
  };

  const handleDeleteClick = (res) => {
    setCancelModal({ show: true, reservation: res });
    setSelectedMotif('');
  };

  const handleDeleteConfirm = async () => {
    if (!selectedMotif) return alert('Veuillez sélectionner un motif');
    try {
      await googleSheetsService.deleteIAReservation(cancelModal.reservation.id);
      
      try {
        await emailService.sendCancellation(cancelModal.reservation, selectedMotif, "La DSI");
      } catch (e) { console.error("Erreur envoi mail annulation", e); }
      
      setCancelModal({ show: false, reservation: null });
      loadAllReservations();
      alert('Réservation supprimée.');
    } catch (error) { 
      alert('Erreur suppression: ' + error.message); 
    }
  };

  // --- STATISTIQUES ---
  const stats = useMemo(() => {
    if (!reservations || reservations.length === 0) return null;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const reservationsAVenir = reservations.filter(res => { const d = new Date(res.dateDebut); return !Number.isNaN(d.getTime()) && d >= todayStart; }).length;

    const parJour = { 'Lundi': 0, 'Mardi': 0, 'Mercredi': 0, 'Jeudi': 0, 'Vendredi': 0, 'Samedi': 0, 'Dimanche': 0 };
    const joursNoms = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    reservations.forEach(res => { const date = new Date(res.dateDebut); if (!isNaN(date)) parJour[joursNoms[date.getDay()]]++; });

    const parUtilisateur = {}; reservations.forEach(res => { const key = `${res.prenom} ${res.nom}`.trim(); parUtilisateur[key] = (parUtilisateur[key] || 0) + 1; });
    const topUtilisateurs = Object.entries(parUtilisateur).sort((a, b) => b[1] - a[1]).slice(0, 15);

    const parIA = {}; 
    reservations.forEach(res => { 
      const iaName = getIAName(res);
      parIA[iaName] = (parIA[iaName] || 0) + 1; 
    });

    const formatServiceNomCourt = (service) => { const s = (service || '').trim(); if (!s) return 'Non spécifié'; if (!s.includes('/')) return s; const parts = s.split('/'); const shortName = (parts[parts.length - 1] || '').trim(); return shortName || s; };
    const parService = {}; reservations.forEach(res => { const serviceKey = formatServiceNomCourt(res.service); parService[serviceKey] = (parService[serviceKey] || 0) + 1; });

    const parMomentJournee = { 'Matin': 0, 'Après-midi': 0 };
    reservations.forEach(res => {
        if (res.heureDebut && res.heureDebut.startsWith('08')) {
            parMomentJournee['Matin']++;
        } else {
            parMomentJournee['Après-midi']++;
        }
    });

    let totalMinutes = 0;
    reservations.forEach(res => { 
        if (res.heureDebut && res.heureDebut.startsWith('08')) totalMinutes += 270; 
        else totalMinutes += 300; 
    });
    const avg = reservations.length > 0 ? totalMinutes / reservations.length : 0;
    const dureeMoyenne = `${Math.floor(avg / 60)}h${Math.round(avg % 60).toString().padStart(2, '0')}m`;

    const uniqueDays = new Set(reservations.map(res => res.dateDebut)).size;

    return { total: reservations.length, futureTotal: reservationsAVenir, parJour, topUtilisateurs, parIA, parService, parMomentJournee, dureeMoyenne, uniqueDays };
  }, [reservations]);

  // --- FILTRAGE & TRI ---
  const filteredAndSortedReservations = useMemo(() => {
    let result = reservations.filter(res => {
      const iaName = getIAName(res);
      if (filterDateStart && new Date(res.dateDebut) < new Date(filterDateStart)) return false;
      if (filterDateEnd && new Date(res.dateDebut) > new Date(filterDateEnd)) return false;
      if (filterIA !== 'Toutes' && iaName !== filterIA) return false;
      if (filterService !== 'Tous' && !res.service?.includes(filterService)) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return (
          res.nom?.toLowerCase().includes(term) ||
          res.prenom?.toLowerCase().includes(term) ||
          res.email?.toLowerCase().includes(term)
        );
      }
      return true;
    });

    if (sortConfig.key) {
      result.sort((a, b) => {
        let aValue, bValue;
        if (sortConfig.key === 'dateDebut') {
          aValue = new Date(a.dateDebut).getTime();
          bValue = new Date(b.dateDebut).getTime();
        } else if (sortConfig.key === 'heureDebut') {
          aValue = a.heureDebut; 
          bValue = b.heureDebut;
        } else if (sortConfig.key === 'salle') {
          aValue = getIAName(a);
          bValue = getIAName(b);
        } else if (sortConfig.key === 'utilisateur') {
          aValue = `${a.prenom} ${a.nom}`.toLowerCase();
          bValue = `${b.prenom} ${b.nom}`.toLowerCase();
        } else {
          aValue = a[sortConfig.key]?.toString().toLowerCase() || '';
          bValue = b[sortConfig.key]?.toString().toLowerCase() || '';
        }
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [reservations, filterIA, filterService, filterDateStart, filterDateEnd, searchTerm, sortConfig]);

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const renderSortIcon = (column) => {
    if (sortConfig.key !== column) return <span className="sort-icon">↕</span>;
    return <span className="sort-icon">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
  };

  // FONCTION EXPORT EXCEL IA
  const handleDownloadExcel = () => {
    if (filteredAndSortedReservations.length === 0) return alert('Aucune donnée à exporter');
    const dataToExport = filteredAndSortedReservations.map(r => ({
      'Date': new Date(r.dateDebut).toLocaleDateString('fr-FR'),
      'Créneau': r.heureDebut === '08:00' ? 'Matin' : 'Après-midi',
      'Outil IA': getIAName(r),
      'Utilisateur': `${r.prenom} ${r.nom}`,
      'Email': r.email,
      'Service': r.service
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Réservations IA");
    XLSX.writeFile(wb, `Export_IA_${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`);
  };

  const handleSliceHover = (data) => {
    setHoveredSlice(data);
    setPopupPos({ x: data.x, y: data.y - 130 });
    setIsFading(false);
  };

  useEffect(() => {
    let fadeTimer, removeTimer;
    if (hoveredSlice) {
      fadeTimer = setTimeout(() => { setIsFading(true); removeTimer = setTimeout(() => { setHoveredSlice(null); setIsFading(false); }, 400); }, 3000);
    }
    return () => { clearTimeout(fadeTimer); clearTimeout(removeTimer); };
  }, [hoveredSlice]);

  if (!isAuthenticated) {
    return (
      <div className="statistics-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div style={{ background: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', textAlign: 'center', maxWidth: '400px', width: '100%' }}>
          <h3 style={{ color: '#0f6aba', marginTop: 0, marginBottom: '1.5rem' }}>🔒 Administration IA</h3>
          <form onSubmit={handlePasswordSubmit}>
            <input 
              type="password" 
              placeholder="Mot de passe" 
              value={passwordInput} 
              onChange={e => setPasswordInput(e.target.value)} 
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

  if (loading) return <div className="statistics-container"><p className="no-data">Chargement des statistiques IA...</p></div>;
  if (!stats) return <div className="statistics-container"><p className="no-data">Aucune donnée.</p></div>;

  const c1 = ['#2196f3', '#4caf50', '#ff9800', '#e91e63', '#9c27b0', '#00bcd4', '#cddc39', '#795548', '#607d8b'];
  const c2 = ['#3f51b5', '#009688', '#ffc107', '#f44336', '#673ab7', '#03a9f4', '#8bc34a', '#ff5722', '#9e9e9e'];
  const c3 = ['#1976d2', '#388e3c', '#f57c00', '#c2185b', '#7b1fa2', '#0097a7', '#afb42b', '#5d4037', '#455a64'];

  const popupContent = hoveredSlice ? (
    <div className={`stats-popup ${isFading ? 'fading-out' : ''}`} style={{ top: popupPos.y, left: popupPos.x }}>
      <div className="stats-popup-header" style={{ borderLeft: `5px solid ${hoveredSlice.color}` }}>{hoveredSlice.label}</div>
      <div className="stats-popup-body"><div><strong>Nombre :</strong> {hoveredSlice.value}</div><div><strong>Part :</strong> {hoveredSlice.percentage}%</div></div>
    </div>
  ) : null;

  const servicesUniques = [...new Set(reservations.map(r => {
      const s = r.service || ''; 
      return s.includes('/') ? s.split('/').pop().trim() : s;
  }).filter(s => s))].sort();

  return (
    <div className="statistics-container" onClick={() => setHoveredSlice(null)}>
      {hoveredSlice && createPortal(popupContent, document.body)}
      
      {/* HEADER : Titre + Groupe Boutons */}
      <div className="admin-ia-header-wrapper">
        <h2>📊 Statistiques & Administration IA</h2>
        <div className="admin-ia-buttons">
          <button onClick={handleDownloadExcel} className="btn-ia-export">📥 Export IA</button>
          <button onClick={handleLogout} className="btn-ia-logout">❌ Déconnexion</button>
        </div>
      </div>

      <div className="stats-summary">
        <div className="summary-card"><div className="summary-icon">🤖</div><div className="summary-content"><div className="summary-value">{stats.futureTotal}</div><div className="summary-label">Réservations IA dans les prochains jours</div></div></div>
        <div className="summary-card"><div className="summary-icon">⏱️</div><div className="summary-content"><div className="summary-label">Durée moyenne estimée d'une réservation</div><div className="summary-value">{stats.dureeMoyenne}</div></div></div>
        <div className="summary-card"><div className="summary-icon">🏆</div><div className="summary-content"><div className="summary-value">{stats.topUtilisateurs[0]?.[0] || 'N/A'}</div><div className="summary-label">est IA dépendant/e</div></div></div>
        <div className="summary-card"><div className="summary-icon">📅</div><div className="summary-content"><div className="summary-label">Jours d'utilisation</div><div className="summary-value">{stats.uniqueDays}</div></div></div>
      </div>

      <div className="charts-grid" style={{marginBottom:'3rem'}}>
        <PieChart data={stats.parIA} title="🤖 Répartition par Outil IA" colors={c1} sortOrder="desc" onHover={handleSliceHover} activeLabel={hoveredSlice?.label} />
        <PieChart data={stats.parJour} title="📆 Réservations par jour" colors={c2} sortOrder="jours" onHover={handleSliceHover} activeLabel={hoveredSlice?.label} />
        
        <div className="chart-card" style={{ gridRow: 'span 2', display:'flex', flexDirection:'column' }}>
          <h3>🏆 Top 15 Utilisateurs IA</h3>
          <div className="top-users-list" style={{flex:1, overflowY:'auto'}}>
            {stats.topUtilisateurs.map(([n, c], i) => (
              <div key={i} className="top-user-item">
                <span className="user-rank">{i + 1}</span>
                <span className="user-name">{n}</span>
                <span className="user-count">{c}</span>
              </div>
            ))}
          </div>
        </div>

        <PieChart data={stats.parMomentJournee} title="🌓 Matin vs Après-midi" colors={c2} sortOrder="moments" onHover={handleSliceHover} activeLabel={hoveredSlice?.label} />
        <PieChart data={stats.parService} title="🏛️ Réservations par service" colors={c3} sortOrder="alpha" onHover={handleSliceHover} activeLabel={hoveredSlice?.label} />
      </div>

      {/* ✅ BLOC 1 : FILTRES - FIXE SUR UNE SEULE LIGNE */}
      <div className="filters-section" style={{ 
          display: 'flex', 
          flexWrap: 'nowrap', /* 🔥 EMPÊCHE le retour à la ligne */
          overflowX: 'hidden', /* Cache ascenseur */
          alignItems: 'center', 
          gap: '0.5rem', /* Gap réduit pour gagner de la place */
          whiteSpace: 'nowrap'
        }}>
        
        <div className="filter-group">
          <label>Outil IA :</label>
          <select value={filterIA} onChange={e => setFilterIA(e.target.value)} className="admin-select" style={{minWidth: 'auto', width: 'auto'}}>
            <option value="Toutes">Toutes</option>
            {IA_TOOLS.map(t => <option key={t.id} value={t.nom}>{t.nom}</option>)}
          </select>
        </div>

        <div className="filter-group">
          <label>Service :</label>
          <select value={filterService} onChange={e => setFilterService(e.target.value)} className="admin-select" style={{minWidth: 'auto', width: 'auto'}}>
            <option value="Tous">Tous</option>
            {servicesUniques.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="filter-group" style={{flex: 1}}>
          <label>Recherche :</label>
          <input type="text" placeholder="Nom..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="admin-input" style={{width: '100%', minWidth: '80px'}} />
        </div>

        <div className="filter-group">
          <label>Du :</label>
          <input type="date" value={filterDateStart} onChange={e => setFilterDateStart(e.target.value)} className="admin-input" style={{width: '115px'}} />
        </div>

        <div className="filter-group">
          <label>Au :</label>
          <input type="date" value={filterDateEnd} onChange={e => setFilterDateEnd(e.target.value)} className="admin-input" style={{width: '115px'}} />
        </div>
      </div>

      {/* ✅ BLOC 2 : LISTE RÉSERVATIONS (Structure standardisée AdminPanel) */}
<div className="reservations-section">
  <h3>📋 Liste des Réservations IA ({filteredAndSortedReservations.length})</h3>
    <div className="admin-table-container">
    <table className="admin-table">
      <thead>
        <tr>
          <th style={{ textAlign: 'center' }} onClick={() => requestSort('dateDebut')}>
            Date {renderSortIcon('dateDebut')}
          </th>
          <th style={{ textAlign: 'center' }} onClick={() => requestSort('heureDebut')}>
            Créneau {renderSortIcon('heureDebut')}
          </th>
          <th style={{ textAlign: 'center' }} onClick={() => requestSort('salle')}>
            Outil IA {renderSortIcon('salle')}
          </th>
          <th style={{ textAlign: 'center' }} onClick={() => requestSort('utilisateur')}>
            Utilisateur {renderSortIcon('utilisateur')}
          </th>
          <th style={{ textAlign: 'center' }} onClick={() => requestSort('service')}>
            Service {renderSortIcon('service')}
          </th>
          <th style={{ textAlign: 'center' }}>
            Actions
          </th>
        </tr>
      </thead>
      <tbody>
        {filteredAndSortedReservations.map((res, i) => (
          <tr key={i} style={{borderBottom:'1px solid #e2e8f0', backgroundColor: `${getIAColor(res)}20`}}>
            <td>{new Date(res.dateDebut).toLocaleDateString()}</td>
            <td>{res.heureDebut === '08:00' ? 'Matin' : 'Après-midi'}</td>
            <td>{getIAName(res)}</td>
            <td>
              <div style={{fontWeight:'bold'}}>{res.prenom} {res.nom}</div>
              <div style={{fontSize:'0.8rem', color:'#64748b'}}>{res.email}</div>
            </td>
            <td>{res.service}</td>
            <td>
              <div className="actions-wrapper">
                <button onClick={() => handleEdit(res)} className="edit-button">Modifier</button>
                <button onClick={() => handleDeleteClick(res)} className="delete-button">Supprimer</button>
              </div>
            </td>
          </tr>
        ))}
        {filteredAndSortedReservations.length === 0 && (
          <tr>
            <td colSpan="6" style={{textAlign:'center', padding:'2rem', color:'#64748b'}}>Aucune réservation trouvée.</td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
</div>

      {cancelModal.show && (
        <div className="cancel-modal-overlay">
          <div className="cancel-modal">
            <h3>Suppression</h3>
            <p>Voulez-vous supprimer la réservation de <strong>{cancelModal.reservation.nom}</strong> ?</p>
            <div className="motif-selection">
              <select value={selectedMotif} onChange={(e) => setSelectedMotif(e.target.value)}>
                <option value="">-- Choisir un motif --</option>
                {MOTIFS_ANNULATION.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="modal-actions">
              <button onClick={() => setCancelModal({show:false, reservation:null})} className="btn-cancel">Annuler</button>
              <button onClick={handleDeleteConfirm} className="btn-submit" disabled={!selectedMotif}>Confirmer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminIA;