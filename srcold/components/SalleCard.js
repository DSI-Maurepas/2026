// src/components/SalleCard.js
import React from 'react';
import './SalleCard.css';
import { getSalleData } from '../data/sallesData';

// Icônes pour les équipements (Détection par mot-clé)
const getEquipementIcon = (equipement) => {
  if (!equipement) return '🔧';
  const text = equipement.toLowerCase();

  // Ordre important : "tableau" avant "table" pour éviter les confusions
  if (text.includes('wifi')) return '📡';
  if (text.includes('vidéoprojecteur')) return '📽️';
  if (text.includes('écran')) return '🖥️';
  if (text.includes('tableau')) return '⬜';
  if (text.includes('paperboard')) return '📋';
  
  // Nouveaux émojis demandés
  if (text.includes('sonorisation')) return '🔊';
  if (text.includes('téléphone')) return '☎️';
  if (text.includes('réseau')) return '🌐';     // Prise réseau
  if (text.includes('électrique')) return '🔌'; // Prises électriques
  if (text.includes('chaise')) return '🪑';
  if (text.includes('table')) return '🟫';      // Tables (après tableau)

  return '🔧';
};

// Icônes pour les dispositions
const getDispositionIcon = (disposition) => {
  if (!disposition) return '📐';
  const text = disposition.toLowerCase();

  if (text.includes('conseil')) return '🏛️';    // Format Conseil
  if (text.includes('u')) return '⛎';          // Tables en U (Symbole Ophiuchus)
  if (text.includes('carré')) return '⏹️';      // Tables en carré
  if (text.includes('conférence')) return '🎓'; // Style conférence (Chapeau)
  if (text.includes('libre')) return '🔄';      // Format Libre

  return '📐';
};

function SalleCard({ salle }) {
  const salleData = getSalleData(salle);
  
  if (!salleData) {
    return null;
  }

  const { nom, capacite, photo, equipements, dispositions } = salleData;

  return (
    <div className="salle-card">
      <div className="salle-card-image">
        <img 
          src={photo} 
          alt={nom}
          onError={(e) => {
            // Si l'image ne charge pas, afficher un placeholder
            e.target.src = 'https://via.placeholder.com/400x300/e3f2fd/1976d2?text=' + encodeURIComponent(nom);
          }}
        />
      </div>
      
      <div className="salle-card-content">
        <h3 className="salle-card-title">{nom}</h3>
        
        <div className="salle-card-info">
          
          {/* ✅ MODIFICATION : Capacité sous forme de bloc gris (comme un équipement) */}
          <div className="info-item">
            <span className="info-label">Capacité</span>
            <div className="capacity-container">
              <span className="capacity-tag">
                <span className="tag-icon">👥</span>
                {capacite} personnes
              </span>
            </div>
          </div>

          {equipements && equipements.length > 0 && (
            <div className="info-item equipements">
              <span className="info-label">Équipements</span>
              <div className="equipements-list">
                {equipements.map((equip, index) => (
                  <span key={index} className="equipement-tag">
                    <span className="tag-icon">{getEquipementIcon(equip)}</span>
                    {equip}
                  </span>
                ))}
              </div>
            </div>
          )}

          {dispositions && dispositions.length > 0 && (
            <div className="info-item dispositions">
              <span className="info-label">Dispositions possibles</span>
              <div className="dispositions-list">
                {dispositions.map((dispo, index) => (
                  <span key={index} className="disposition-tag">
                    <span className="tag-icon">{getDispositionIcon(dispo)}</span>
                    {dispo}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SalleCard;