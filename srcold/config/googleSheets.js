// src/config/googleSheets.js
// Configuration pour l'API Google Sheets
// VERSION OPTIMISÉE - Centralisation Sécurité

export const GOOGLE_CONFIG = {
  API_KEY: 'AIzaSyAfpo4O0YkzjG8AaRl9tz9JMcAdQW3b8nY',
  CLIENT_ID: '175113424020-t2ootm4m0v08kkn1vbadmd2qeqt5cv27.apps.googleusercontent.com',
  SPREADSHEET_ID: '1SNkHpAXIzu3GNQxFX3csCRv_4rz9M52xO6ov0LCed7Q',
  
  SHEETS: {
    RESERVATIONS: 'Réservations',
    SALLES: 'Salles',
    CONFIG: 'Configuration',
    RESERVATIONS_IA: 'Reservations_IA' // ✅ NOUVEL ONGLET POUR L'IA
  },
  
  DISCOVERY_DOCS: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
  SCOPES: 'https://www.googleapis.com/auth/spreadsheets'
};

export const EMAIL_CONFIG = {
  SERVICE_ID: 'service_xoen8ug',
  TEMPLATE_ID_CONFIRMATION: 'XXXXXXXXXX',
  TEMPLATE_ID_ANNULATION: 'template_i9aqlt9', // Annulation Salles (Générique)
  // ✅ AJOUT DES TEMPLATES SPÉCIFIQUES
  TEMPLATE_ID_ANNULATION_CLIO: 'template_80xv1t9', 
  TEMPLATE_ID_ANNULATION_IA: 'template_TO_BE_DEFINED', // Placeholder en attendant l'ID
  USER_ID: 'QFnQAOzHCSEtZoeVe'
};

export const APP_CONFIG = {
  ADMIN_PASSWORD: 'R3sa@M0rep@s78',
  ADMIN_AUTO_PASSWORD: 'Cl!0@M0rep@s78', // ✅ NOUVEAU : Mot de passe Admin Auto
  IA_ADMIN_PASSWORD: '!@@M0rep@s78', // ✅ MOT DE PASSE ADMIN IA
  SUPER_ADMIN_PASSWORD: 'Dsi@M0rep@$', // ✅ SUPER ADMIN DSI
  CACHE_DURATION: 60000,
};

export const SALLES = [
  'Salle Conseil', 'Salle Mariages', 'Salle 16e A', 'Salle 16e B',
  'Salle N°1', 'Salle N°2', 'Salle N°3', 'Salle N°4', 'Salle CCAS'
];

export const SERVICES = [
  'Achats Publics', 'Administration Générale', 'Archives', 'Cabinet du Maire', 'CCAS',
  'Centres de Loisirs', 'Commande Publique', 'Direction des Systèmes d\'Information',
  'Direction Générale', 'Direction Ressources Humaines', 'Élus', 'Finances', 'Juridique',
  'Pôle communication Animation Ville', 'Pôle communication Animation Ville / Animation de la ville',
  'Pôle communication Animation Ville / Communication', 'Pôle communication Animation Ville / Reprographie',
  'Pôle Culture', 'Pôle Culture / Café', 'Pôle Culture / Camus', 'Pôle Culture / Cobalt',
  'Pôle Culture / Conservatoire', 'Pôle Culture / Diffusion', 'Pôle Famille',
  'Pôle Famille / Education', 'Pôle Famille / Enfance', 'Pôle Famille / Hygiène et Restauration',
  'Pôle Famille / Petite Enfance', 'Pôle Loisirs', 'Pôle Loisirs / Animation Sénior',
  'Pôle Loisirs / BIJ', 'Pôle Loisirs / Ecole des sports', 'Pôle Loisirs / Mille Club',
  'Pôle Loisirs / Sports', 'Pôle Loisirs / Tridim', 'Pôle Loisirs / Vie Associative',
  'Pôle Solidarité', 'Pôle Solidarité / Relais Marianne', 'Police Municipale',
  'Régies', 'Syndicats', 'Technique', 'Technique / Pôle Aménagement Et Environnement',
  'Technique / Pôle Patrimoine', 'Technique / Serres'
];

export const OBJETS_RESERVATION = [
  'Entretien RH',
  'Événement municipal / public',
  'Formation interne', 
  'Formation externe (prestataires)',
  'Mariage',
  'Parrainage',
  'Permanence (élus ou services)', 
  'Réunion de service', 
  'Réunion Élus / Commissions', 
  'Réunion avec prestataire',
  'Usage logistique / technique', 
  'Autre'
];

export const OBJETS_VEHICULE = [
  'Déplacement dans Maurepas',
  'Déplacement hors de Maurepas',
];

export const COULEURS_OBJETS = {
  'Réunion de service': '#64B5F6',
  'Réunion Élus / Commissions': '#F06292',
  'Réunion avec prestataire': '#0D47A1',
  'Formation interne': '#81C784',
  'Formation externe (prestataires)': '#1B5E20',
  'Événement municipal / public': '#FFA726',
  'Entretien RH': '#FF7043',
  'Permanence (élus ou services)': '#880E4F',
  'Usage logistique / technique': '#AB47BC',
  'Autre': '#BDBDBD',
  'Déplacement dans Maurepas': '#F06292',
  'Déplacement hors de Maurepas': '#7986CB'
};

export const HORAIRES = {
  HEURE_DEBUT: 8,
  HEURE_FIN: 22,
  JOURS_OUVRES: [1, 2, 3, 4, 5, 6],
  DUREE_CRENEAU: 0.5
};

export const JOURS_FERIES = [
  '2024-01-01', '2024-04-01', '2024-05-01', '2024-05-08', '2024-05-09',
  '2024-05-20', '2024-07-14', '2024-08-15', '2024-11-01', '2024-11-11', '2024-12-25',
  '2025-01-01', '2025-04-21', '2025-05-01', '2025-05-08', '2025-05-29',
  '2025-06-09', '2025-07-14', '2025-08-15', '2025-11-01', '2025-11-11', '2025-12-25',
  '2026-01-01', '2026-04-06', '2026-05-01', '2026-05-08', '2026-05-14',
  '2026-05-25', '2026-07-14', '2026-08-15', '2026-11-01', '2026-11-11', '2026-12-25'
];

export const ADMINISTRATEURS = [
  'j.matrat@maurepas.fr', 'admin@maurepas.fr', 'sevindi.munure@gmail.com',
  'cabinet@maurepas.fr', 'mchaumeron@gmail.com', 'test.maurepas@maurepas.fr',
];

export const SALLES_ADMIN_ONLY = ['Salle Conseil', 'Salle Mariages'];

export const MOTIFS_ANNULATION = [
  'Changement de date', 'Changement de salle', 'Réunion annulée',
  'Conflit d\'agenda', 'Absence de participants', 'Report à une date ultérieure',
  'Problème technique', 'Événement annulé', 'Erreur de réservation', 'Autre raison'
];