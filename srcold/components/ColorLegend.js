// src/components/ColorLegend.js
// Composant de légende des couleurs d'objets avec effet de survol
import React, { useState } from 'react';
import { COULEURS_OBJETS } from '../config/googleSheets';
import './ColorLegend.css';

function ColorLegend({ onHoverColor }) {
  const [hoveredColor, setHoveredColor] = useState(null);

  const handleMouseEnter = (objet) => {
    setHoveredColor(objet);
    if (onHoverColor) {
      onHoverColor(objet);
    }
  };

  const handleMouseLeave = () => {
    setHoveredColor(null);
    if (onHoverColor) {
      onHoverColor(null);
    }
  };

  return (
    <div className="color-legend-container">
      {/* Message survol salles - EN HAUT */}
      <div className="legend-hover-tip">
        <span className="hover-arrow">←</span>
        <span className="hover-text">Cliquer sur le nom d'une salle pour en connaître ses propriétés</span>
      </div>

      {/* MODIFICATION : Bloc identique au précédent avec Ampoule animée */}
      <div className="legend-header">
        <div className="legend-header-row">
          <div className="legend-icon"></div>
          <h3>Fiche d'information d'une réservation</h3>
        </div>
        <p className="legend-subtitle">👉 Cliquer sur 1 créneau, ouvre sa fiche</p>
        <p className="legend-subtitle">👉 Cliquer sur la fiche, entraîne sa fermeture</p>
      </div>

      <div className="legend-items">
        {Object.entries(COULEURS_OBJETS)
          // ✅ MODIFICATION : Filtrage des motifs "Déplacement" (véhicule uniquement)
          .filter(([objet]) => !['Déplacement dans Maurepas', 'Déplacement hors de Maurepas'].includes(objet))
          .sort(([objetA], [objetB]) => objetA.localeCompare(objetB)) // Tri alphabétique
          .map(([objet, couleur]) => (
          <div
            key={objet}
            className={`legend-item ${hoveredColor === objet ? 'hovered' : ''}`}
            onMouseEnter={() => handleMouseEnter(objet)}
            onMouseLeave={handleMouseLeave}
          >
            <div 
              className="legend-color-box"
              style={{ backgroundColor: couleur }}
            />
            <span className="legend-text">{objet}</span>
            <div className="legend-glow" style={{ backgroundColor: couleur }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default ColorLegend;