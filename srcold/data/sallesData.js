// src/data/sallesData.js
// Données détaillées pour chaque salle

// Export OBJET pour les composants existants
// ✅ CLIO DOIT RESTER ICI pour que VehicleGrid fonctionne (infos + photo)
export const SALLES_DATA = {
  'Salle Conseil': {
    nom: 'Salle Conseil',
    capacite: 100,
    photo: process.env.PUBLIC_URL + '/images/Salle_Conseil.jpg',
    equipements: ['Vidéoprojecteur', 'Écran', 'Sonorisation', 'Tables', 'Chaises', 'Prises électriques', 'WiFi public', 'WiFi'],
  },
  'Salle Mariages': {
    nom: 'Salle Mariages',
    capacite: 30,
    photo: process.env.PUBLIC_URL + '/images/Salle_Mariages.jpg',
    equipements: ['2 Écrans', 'Tables', 'Chaises', 'WiFi public', 'WiFi'],
  },
  'Salle 16e A': {
    nom: 'Salle 16e A',
    capacite: 12,
    photo: process.env.PUBLIC_URL + '/images/16e_A.jpg',
    equipements: ['Écran', '3 Prises électriques', 'WiFi', 'Tableau blanc', 'Prises réseau'],
    dispositions: null
  },
  'Salle 16e B': {
    nom: 'Salle 16e B',
    capacite: 19,
    photo: process.env.PUBLIC_URL + '/images/16e_B.jpg',
    equipements: ['Vidéoprojecteur', 'WiFi', 'Tableau blanc', 'Paperboard', 'Prises réseau', '4 Prises électriques'],
    dispositions: null
  },
  'Salle N°1': {
    nom: 'Salle N°1',
    capacite: 2,
    photo: process.env.PUBLIC_URL + '/images/Salle_1.jpg',
    equipements: ['2 Tables', '4 Chaises', 'Téléphone', '3 Prises électriques', 'WiFi', 'WiFi public'],
    dispositions: null
  },
  'Salle N°2': {
    nom: 'Salle N°2',
    capacite: 12,
    photo: process.env.PUBLIC_URL + '/images/Salle_2.jpg',
    equipements: ['3 Tables', '12 Chaises', 'Écran', 'Téléphone', '13 Prises électriques', 'WiFi', '9 Prises réseau', 'WiFi public'],
    dispositions: null
  },
  'Salle N°3': {
    nom: 'Salle N°3',
    capacite: 8,
    photo: process.env.PUBLIC_URL + '/images/Salle_3.jpg',
    equipements: ['2 Tables', '8 Chaises', 'Écran', 'Téléphone', '8 Prises électriques', 'WiFi', '4 Prises réseau', 'WiFi public'],
    dispositions: null
  },
  'Salle N°4': {
    nom: 'Salle N°4',
    capacite: 4,
    photo: process.env.PUBLIC_URL + '/images/Salle_4.jpg',
    equipements: ['2 Tables', '4 Chaises', '4 Prises électriques', 'WiFi', '4 Prises réseau', 'WiFi public'],
    dispositions: null
  },
  'Salle CCAS': {
    nom: 'Salle CCAS',
    capacite: 12,
    photo: process.env.PUBLIC_URL + '/images/Salle_CCAS.jpg',
    equipements: ['Paperboard', 'Prise réseau', 'WiFi', 'Prises électriques', 'WiFi public', 'Prises réseau'],
    dispositions: null
  },
  'CLIO': {
    nom: 'CLIO',
    capacite: 5,
    photo: process.env.PUBLIC_URL + '/images/Clio_A.jpg', 
    equipements: ['5 Places', 'Climatisation', 'GPS', 'Bluetooth'],
    dispositions: null
  }
};

// Export TABLEAU pour RoomSelector
// ✅ CORRECTION : CLIO RETIRÉE ICI (Elle n'apparaîtra plus dans la liste "Par Salle")
export const sallesData = [
  {
    id: 1,
    nom: 'Salle Conseil',
    image: 'Salle_Conseil.jpg',
    capacite: 100,
    dispositions: ['Tables en U', 'Tables en carré', 'Format Conférence', 'Format Libre', 'Format Conseil', 'Format Mariage', 'Format Table Ronde']
  },
  {
    id: 2,
    nom: 'Salle Mariages',
    image: 'Salle_Mariages.jpg',
    capacite: 30,
    dispositions: ['Tables en U', 'Tables en carré', 'Format Conférence', 'Format Libre', 'Format Mariage', 'Format Table Ronde']
  },
  {
    id: 3,
    nom: 'Salle 16e A',
    image: '16e_A.jpg',
    capacite: 12,
    dispositions: null
  },
  {
    id: 4,
    nom: 'Salle 16e B',
    image: '16e_B.jpg',
    capacite: 19,
    dispositions: null
  },
  {
    id: 5,
    nom: 'Salle N°1',
    image: 'Salle_1.jpg',
    capacite: 2,
    dispositions: null
  },
  {
    id: 6,
    nom: 'Salle N°2',
    image: 'Salle_2.jpg',
    capacite: 12,
    dispositions: null
  },
  {
    id: 7,
    nom: 'Salle N°3',
    image: 'Salle_3.jpg',
    capacite: 8,
    dispositions: null
  },
  {
    id: 8,
    nom: 'Salle N°4',
    image: 'Salle_4.jpg',
    capacite: 4,
    dispositions: null
  },
  {
    id: 9,
    nom: 'Salle CCAS',
    image: 'Salle_CCAS.jpg',
    capacite: 12,
    dispositions: null
  }
];

// Fonction helper pour obtenir les données d'une salle
export const getSalleData = (salleNom) => {
  // Si on reçoit le nom complet (ex: "Salle Conseil - 100 Personnes")
  if (SALLES_DATA[salleNom]) {
    return SALLES_DATA[salleNom];
  }
  
  // Si on reçoit le nom court (ex: "Salle Conseil"), chercher par nom
  const found = Object.entries(SALLES_DATA).find(([key, value]) => 
    value.nom === salleNom
  );
  
  return found ? found[1] : null;
};