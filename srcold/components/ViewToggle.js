// src/components/ViewToggle.js
import React from 'react';
import './ViewToggle.css';

function ViewToggle({ viewMode, onViewChange }) {
  return (
    <div className="view-toggle-container">
      <button
        className={`view-toggle-btn ${viewMode === 'date' ? 'active' : ''}`}
        onClick={() => onViewChange('date')}
      >
        <span className="toggle-icon">📅</span>
        <span className="toggle-text">Par Date</span>
      </button>
      <button
        className={`view-toggle-btn ${viewMode === 'room' ? 'active' : ''}`}
        onClick={() => onViewChange('room')}
      >
        <span className="toggle-icon">🏛️</span>
        <span className="toggle-text">Par Salle</span>
      </button>
      <div className={`toggle-slider ${viewMode === 'room' ? 'right' : 'left'}`}></div>
    </div>
  );
}

export default ViewToggle;
