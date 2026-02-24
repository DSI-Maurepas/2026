// src/components/CalendarView.js
import React, { useState, useEffect } from 'react';
import googleSheetsService from '../services/googleSheetsService';
import { JOURS_FERIES } from '../config/googleSheets';
import RoomSelector from './RoomSelector';
import './CalendarView.css';

function CalendarView({ onDateSelect, onRoomSelect, isDateInPast, defaultView = 'date' }) {
  const [viewMode, setViewMode] = useState(defaultView);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [dateAvailability, setDateAvailability] = useState({});
  const [loading, setLoading] = useState(false);
  
  const [activeLegend, setActiveLegend] = useState(null);
  const [editingReservation, setEditingReservation] = useState(null);


  const LEGEND_DATA = [
    { status: 'available', label: 'Disponible', description: '🟢 Disponible (0-4 réservation)' },
    { status: 'partial', label: 'Partiellement occupé', description: '🟡 Partiellement occupé (5-9 réservations)' },
    { status: 'busy', label: 'Très occupé', description: '🟠 Très occupé (10-15 réservations)' },
    { status: 'full', label: 'Complet', description: '🔴 Complet (16+ réservations)' },
    { status: 'closed', label: 'Fermé', description: '⚫ Fermé (hors plages horaires)' }
  ];

  const createLocalDate = (year, month, day) => {
    const date = new Date(year, month, day, 12, 0, 0, 0);
    return date;
  };

  const getTodayLocal = () => {
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth(),
      day: now.getDate()
    };
  };

  
  // Détecter paramètre edit dans URL pour modification
  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.split('?')[1] || '');
    const editId = params.get('edit');
    const salleParam = params.get('salle');
    const dateParam = params.get('date');
    
    if (editId && salleParam && dateParam) {
      // Charger réservation à modifier
      googleSheetsService.getAllReservations().then(allRes => {
        const resEdit = allRes.find(r => r.id === editId);
        if (resEdit) {
          setEditingReservation(resEdit);
          // Ouvrir directement Par Salle avec cette salle
          const decodedSalle = decodeURIComponent(salleParam);
          if (onRoomSelect) {
            onRoomSelect(decodedSalle, resEdit);
          }
        }
      }).catch(err => console.error('Erreur chargement réservation:', err));
    }
  }, []);

  useEffect(() => {
    setViewMode(defaultView);
  }, [defaultView]);

  useEffect(() => {
    loadMonthAvailability();
  }, [currentMonth]);

  const loadMonthAvailability = async () => {
    setLoading(true);
    try {
      const availability = {};
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const allReservations = await googleSheetsService.getAllReservations();

      for (let day = 1; day <= daysInMonth; day++) {
        const date = createLocalDate(year, month, day);
        const dateStr = googleSheetsService.formatDate(date);
        
        if (date.getDay() === 0 || JOURS_FERIES.includes(dateStr)) {
          availability[dateStr] = 'closed';
          continue;
        }

        const reservationsDuJour = allReservations.filter(res => 
          res.dateDebut === dateStr || 
          (res.dateDebut <= dateStr && res.dateFin >= dateStr)
        );

        if (reservationsDuJour.length === 0) {
          availability[dateStr] = 'available';
          continue;
        }

        const nbSalles = 9;
        const nbCreneaux = 14;
        const totalCreneauxPossibles = nbSalles * nbCreneaux;
        let creneauxReserves = 0;
        reservationsDuJour.forEach(res => {
          const debut = parseInt(res.heureDebut.split(':')[0]);
          const fin = parseInt(res.heureFin.split(':')[0]);
          creneauxReserves += (fin - debut);
        });

        const tauxOccupation = creneauxReserves / totalCreneauxPossibles;
        if (tauxOccupation >= 1) availability[dateStr] = 'full';
        else if (tauxOccupation > 0.5) availability[dateStr] = 'busy';
        else if (tauxOccupation > 0.2) availability[dateStr] = 'partial';
        else availability[dateStr] = 'available';
      }
      setDateAvailability(availability);
    } catch (error) {
      console.error('Erreur lors du chargement de la disponibilité:', error);
    }
    setLoading(false);
  };

  const handlePreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const handleDateClick = (date) => {
    if (typeof isDateInPast === 'function' && isDateInPast(date)) {
      alert('⚠️ Impossible de réserver une date passée !\n\nVeuillez sélectionner une date à partir d\'aujourd\'hui.');
      return;
    }
    const dateStr = googleSheetsService.formatDate(date);
    const availability = dateAvailability[dateStr];
    if (availability === 'closed' || availability === 'full') {
      alert('Cette date n\'est pas disponible pour la réservation.');
      return;
    }
    onDateSelect(date);
  };

  const handleLegendClick = (description) => {
    if (activeLegend === description) {
      setActiveLegend(null);
    } else {
      setActiveLegend(description);
    }
  };

  // MODIF : Wrapper pour forcer le scroll en haut lors de la sélection d'une salle
  const handleRoomSelectWrapper = (room) => {
    // PROBLÈME 1 : Forcer scroll en haut pour TOUTES les salles
    window.scrollTo(0, 0);
    if (onRoomSelect) {
      onRoomSelect(room, editingReservation);
    }
  };

  const renderCalendar = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    const weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

    weekDays.forEach(day => {
      days.push(<div key={`header-${day}`} className="calendar-day-header">{day}</div>);
    });

    const startDay = firstDay === 0 ? 6 : firstDay - 1;
    for (let i = 0; i < startDay; i++) {
      days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
    }

    const todayInfo = getTodayLocal();
    const todayYear = todayInfo.year;
    const todayMonth = todayInfo.month;
    const todayDay = todayInfo.day;
    
    for (let day = 1; day <= daysInMonth; day++) {
      const date = createLocalDate(year, month, day);
      const availability = dateAvailability[googleSheetsService.formatDate(date)] || 'loading';
      const isToday = (year === todayYear && month === todayMonth && day === todayDay);
      const isPast = (typeof isDateInPast === 'function') ? isDateInPast(date) : false;

      days.push(
        <div
          key={`day-${day}`}
          className={`calendar-day ${availability} ${isToday ? 'today' : ''} ${isPast ? 'past-date' : ''}`}
          onClick={() => handleDateClick(date)}
          style={{ cursor: isPast ? 'not-allowed' : 'pointer' }}
        >
          <span className="day-number">{day}</span>
          {availability !== 'loading' && (<span className="availability-indicator"></span>)}
        </div>
      );
    }
    return days;
  };

  const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

  return (
    <div className={`calendar-view ${viewMode === 'room' ? 'room-view' : ''}`}>
      <div className="view-tabs">
        <button 
          className={`tab-btn ${viewMode === 'date' ? 'active' : ''}`}
          onClick={() => setViewMode('date')}
        >
          📅 Par Date
        </button>
        <button 
          className={`tab-btn ${viewMode === 'room' ? 'active' : ''}`}
          onClick={() => setViewMode('room')}
        >
          🏢 Par Salle
        </button>
      </div>

      {viewMode === 'date' ? (
        <>
          <div className="calendar-header">
            <button onClick={handlePreviousMonth} className="nav-button" title="Mois précédent">◀</button>
            <div className="date-selectors">
              <select value={currentMonth.getMonth()} onChange={(e) => setCurrentMonth(new Date(currentMonth.getFullYear(), parseInt(e.target.value), 1))} className="month-selector">
                {monthNames.map((name, index) => (<option key={index} value={index}>{name}</option>))}
              </select>
              <select value={currentMonth.getFullYear()} onChange={(e) => setCurrentMonth(new Date(parseInt(e.target.value), currentMonth.getMonth(), 1))} className="year-selector">
                {Array.from({ length: 5 }, (_, i) => { const year = new Date().getFullYear() + i; return <option key={year} value={year}>{year}</option>; })}
              </select>
            </div>
            <button onClick={handleNextMonth} className="nav-button" title="Mois suivant">▶</button>
          </div>

          {/* ✅ CORRECTION : Fusion de l'instruction et de la légende en une seule ligne */}
          <div className="capacity-instructions">
            <strong>💡 Cliquez sur les statuts pour voir les détails :</strong>
            <div className="legend-buttons-wrapper">
              {LEGEND_DATA.map((item, index) => (
                <div 
                  key={index} 
                  className={`legend-item ${activeLegend === item.description ? 'active-legend' : ''}`}
                  onClick={() => handleLegendClick(item.description)}
                  title={item.description}
                >
                  <span className={`legend-color ${item.status}`}></span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {activeLegend && (
            <div className="legend-info-box">
              {activeLegend}
            </div>
          )}

          {loading ? <div className="calendar-loading"><div className="spinner"></div><p>Chargement du calendrier...</p></div> : <div className="calendar-grid">{renderCalendar()}</div>}

          <div className="calendar-instructions">
            <h3>📋 Instructions</h3>
            <ul>
              <li>Les couleurs indiquent la disponibilité des salles</li>
              <li>Les dimanches et jours fériés sont fermés</li>
              <li>8h - 22h du lundi au samedi - Créneau = 30 min</li>
            </ul>
          </div>
        </>
      ) : (
        <>
          <h2 className="room-select-title">
            Sélectionnez une salle
          </h2>
          {/* MODIF : Utilisation du wrapper qui gère le scroll */}
          <RoomSelector onSelectRoom={handleRoomSelectWrapper} />
        </>
      )}
    </div>
  );
}

export default CalendarView;