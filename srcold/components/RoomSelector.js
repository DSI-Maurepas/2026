import React from 'react';
import { sallesData } from '../data/sallesData';
import './RoomSelector.css';

const RoomSelector = ({ onSelectRoom }) => {
  return (
    <div className="room-selector">
      <div className="rooms-grid">
        {sallesData.map((salle) => (
          <div 
            key={salle.id}
            className="room-card"
            onClick={() => onSelectRoom(salle.nom)}
          >
            <div className="room-image-container">
              <img 
                src={`${process.env.PUBLIC_URL}/images/${salle.image}`}
                alt={salle.nom}
                className="room-image"
              />
            </div>
            <div className="room-info">
              <h3>{salle.nom}</h3>
              <p className="room-capacity">Capacité : {salle.capacite} personnes</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RoomSelector;
