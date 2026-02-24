// src/utils/constants.js
// Constantes de l'application électorale

export const BUREAUX_VOTE = [
  {
    id: 'BV1',
    nom: 'Mairie',
    adresse: 'Place Charles de Gaulle',
    president: '',
    secretaire: '',
    secretaireSuppleant: '',
    inscrits: 1250,
    actif: true
  },
  {
    id: 'BV2',
    nom: 'Groupe scolaire de l\'Agiot',
    adresse: 'Square de Beaufortin',
    president: '',
    secretaire: '',
    secretaireSuppleant: '',
    inscrits: 1180,
    actif: true
  },
  {
    id: 'BV3',
    nom: 'École élémentaire Malmedonne',
    adresse: 'Avenue du Rouergue',
    president: '',
    secretaire: '',
    secretaireSuppleant: '',
    inscrits: 1320,
    actif: true
  },
  {
    id: 'BV4',
    nom: 'École Maternelle Haute-Futaie',
    adresse: 'Avenue de Touraine',
    president: '',
    secretaire: '',
    secretaireSuppleant: '',
    inscrits: 1095,
    actif: true
  },
  {
    id: 'BV5',
    nom: 'Espace Albert Camus',
    adresse: 'Rue de la Beauce',
    president: '',
    secretaire: '',
    secretaireSuppleant: '',
    inscrits: 1240,
    actif: true
  },
  {
    id: 'BV6',
    nom: 'Groupe scolaire Les Coudrays',
    adresse: 'Avenue de Picardie',
    president: '',
    secretaire: '',
    secretaireSuppleant: '',
    inscrits: 1165,
    actif: true
  },
  {
    id: 'BV7',
    nom: 'École élémentaire Les Bessières',
    adresse: 'Rue de Noirmoutier',
    president: '',
    secretaire: '',
    secretaireSuppleant: '',
    inscrits: 1210,
    actif: true
  },
  {
    id: 'BV8',
    nom: 'Centre de Loisirs du Bout des Clos',
    adresse: 'Chemin des petits fossés',
    president: '',
    secretaire: '',
    secretaireSuppleant: '',
    inscrits: 1075,
    actif: true
  },
  {
    id: 'BV9',
    nom: 'École élémentaire La Marnière',
    adresse: '29 Avenue du Trégor',
    president: '',
    secretaire: '',
    secretaireSuppleant: '',
    inscrits: 1290,
    actif: true
  },
  {
    id: 'BV10',
    nom: 'Centre Éducatif et Sportif de l\'Agiot (CESA)',
    adresse: 'Square du Dauphiné',
    president: '',
    secretaire: '',
    secretaireSuppleant: '',
    inscrits: 1155,
    actif: true
  },
  {
    id: 'BV11',
    nom: 'École maternelle La Marnière',
    adresse: '29 avenue du Trégor',
    president: '',
    secretaire: '',
    secretaireSuppleant: '',
    inscrits: 1100,
    actif: true
  },
  {
    id: 'BV12',
    nom: 'Groupe scolaire Les Friches',
    adresse: 'Place du Doubs',
    president: '',
    secretaire: '',
    secretaireSuppleant: '',
    inscrits: 1225,
    actif: true
  },
  {
    id: 'BV13',
    nom: 'École maternelle Chapiteau',
    adresse: 'Allée des Tilleuls',
    president: '',
    secretaire: '',
    secretaireSuppleant: '',
    inscrits: 1195,
    actif: true
  }
];

export const ELECTION_CONFIG = {
  COMMUNE_NAME: 'Maurepas',
  COMMUNE_CODE: '78403',
  COMMUNE_POP: 20000,
  ELECTION_DATE_T1: '2026-03-15',
  ELECTION_DATE_T2: '2026-03-22',
  VOTING_HOURS_START: '08:00',
  VOTING_HOURS_END: '20:00',
  SEATS_MUNICIPAL_TOTAL: 35, // >20k habitants
  SEATS_COMMUNITY_TOTAL: 7, // SQY - Conseil Communautaire
  SEATS_THRESHOLD_PCT: 5.0,
};

export const HORAIRES_PARTICIPATION = [
  '10:00',
  '12:00',
  '17:00',
  '20:00' // Fermeture
];

export const COULEURS_REPUBLIQUE = {
  BLEU: '#0055A4',
  BLANC: '#FFFFFF',
  ROUGE: '#EF4135'
};

export const COULEURS_LISTES_DEFAULT = [
  '#0055A4', // Bleu
  '#EF4135', // Rouge
  '#00A651', // Vert
  '#FFD700', // Or
  '#FF6B35', // Orange
  '#8B4513', // Marron
  '#800080', // Violet
  '#FF69B4', // Rose
  '#00CED1', // Turquoise
  '#FF4500', // Rouge orangé
];

export const STATUTS_ELECTION = {
  NON_OUVERT: 'NON_OUVERT',
  EN_COURS: 'EN_COURS',
  CLOTURE: 'CLOTURE'
};

export const ACTIONS_AUDIT = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  VALIDATE: 'VALIDATE',
  CALCULATE: 'CALCULATE',
  CONFIG: 'CONFIG',
  EXPORT: 'EXPORT'
};

export const SEVERITY_LEVELS = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL'
};

export const GOOGLE_SHEETS = {
  SCOPES: ['https://www.googleapis.com/auth/spreadsheets'],
  DISCOVERY_DOCS: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
  // CLIENT_ID et SPREADSHEET_ID à configurer dans .env
};

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  PARTICIPATION_T1: '/participation/tour1',
  PARTICIPATION_T2: '/participation/tour2',
  RESULTATS_T1: '/resultats/tour1',
  RESULTATS_T2: '/resultats/tour2',
  SECOND_TOUR: '/second-tour',
  SIEGES_MUNICIPAL: '/sieges/municipal',
  SIEGES_COMMUNAUTAIRE: '/sieges/communautaire',
  ADMIN_BUREAUX: '/admin/bureaux',
  ADMIN_CANDIDATS: '/admin/candidats',
  ADMIN_AUDIT: '/admin/audit',
  EXPORTS: '/exports'
};

export const LOCAL_STORAGE_KEYS = {
  AUTH_TOKEN: 'elections_auth_token',
  USER_EMAIL: 'elections_user_email',
  USER_PREFS: 'elections_user_prefs',
  LAST_SYNC: 'elections_last_sync'
};

export const SHEET_NAMES = {
  CONFIG: 'Config',
  BUREAUX: 'Bureaux',
  CANDIDATS: 'Candidats',
  PARTICIPATION_T1: 'Participation_T1',
  PARTICIPATION_T2: 'Participation_T2',
  RESULTATS_T1: 'Resultats_T1',
  RESULTATS_T2: 'Resultats_T2',
  SEATS_MUNICIPAL: 'Seats_Municipal',
  SEATS_COMMUNITY: 'Seats_Community',
  ELECTIONS_STATE: 'ElectionsState',
  AUDIT_LOG: 'AuditLog',
  ERROR_LOG: 'ErrorLog'
};

export const MESSAGES = {
  SUCCESS: {
    PARTICIPATION_SAVED: 'Participation enregistrée avec succès',
    RESULTATS_SAVED: 'Résultats enregistrés avec succès',
    RESULTATS_VALIDATED: 'Résultats validés avec succès',
    SIEGES_CALCULATED: 'Sièges calculés avec succès',
    EXPORT_SUCCESS: 'Export réalisé avec succès'
  },
  ERROR: {
    AUTH_FAILED: 'Échec de l\'authentification',
    NETWORK_ERROR: 'Erreur réseau - Vérifiez votre connexion',
    VALIDATION_ERROR: 'Erreur de validation des données',
    CALCULATION_ERROR: 'Erreur lors du calcul',
    EXPORT_ERROR: 'Erreur lors de l\'export',
    PERMISSION_DENIED: 'Permission refusée',
    QUOTA_EXCEEDED: 'Quota API dépassé - Réessayez dans quelques instants'
  },
  WARNING: {
    UNSAVED_CHANGES: 'Vous avez des modifications non sauvegardées',
    INCOHERENCE: 'Incohérence détectée dans les données',
    LOW_PARTICIPATION: 'Taux de participation faible'
  }
};
