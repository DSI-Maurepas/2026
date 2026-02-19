// src/utils/formatters.js
// Fonctions de formatage pour l'affichage

/**
 * Formate un nombre avec séparateurs de milliers
 */
export function formatNumber(num) {
  if (typeof num !== 'number') return '0';
  return num.toLocaleString('fr-FR');
}

/**
 * Formate un pourcentage avec 2 décimales
 */
export function formatPercent(value, decimals = 2) {
  if (typeof value !== 'number' || isNaN(value)) return '0,00 %';
  return value.toFixed(decimals).replace('.', ',') + ' %';
}

/**
 * Formate une date ISO en format français
 */
export function formatDate(isoDate) {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return '';
  
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
}

/**
 * Formate une date ISO en format français avec heure
 */
export function formatDateTime(isoDate) {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return '';
  
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date);
}

/**
 * Formate une heure HH:MM
 */
export function formatTime(time) {
  if (!time) return '';
  if (typeof time === 'string' && /^\d{2}:\d{2}$/.test(time)) {
    return time;
  }
  // Si c'est un objet Date
  if (time instanceof Date) {
    const hours = time.getHours().toString().padStart(2, '0');
    const minutes = time.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }
  return '';
}

/**
 * Formate un nom de liste avec tête de liste
 */
export function formatListeComplete(liste) {
  if (!liste) return '';
  return `${liste.nomListe} (${liste.teteListePrenom} ${liste.teteListeNom.toUpperCase()})`;
}

/**
 * Formate un nom de bureau avec adresse
 */
export function formatBureauComplet(bureau) {
  if (!bureau) return '';
  return `${bureau.id} - ${bureau.nom}, ${bureau.adresse}`;
}

/**
 * Formate un nom de bureau court
 */
export function formatBureauCourt(bureau) {
  if (!bureau) return '';
  return `${bureau.id} - ${bureau.nom}`;
}

/**
 * Calcule et formate un taux de participation
 */
export function calculateTauxParticipation(votants, inscrits) {
  if (!inscrits || inscrits === 0) return 0;
  return (votants / inscrits) * 100;
}

/**
 * Formate un taux de participation
 */
export function formatTauxParticipation(votants, inscrits) {
  const taux = calculateTauxParticipation(votants, inscrits);
  return formatPercent(taux);
}

/**
 * Calcule et formate un pourcentage de voix
 */
export function calculatePourcentageVoix(voix, exprimes) {
  if (!exprimes || exprimes === 0) return 0;
  return (voix / exprimes) * 100;
}

/**
 * Formate un pourcentage de voix
 */
export function formatPourcentageVoix(voix, exprimes) {
  const pct = calculatePourcentageVoix(voix, exprimes);
  return formatPercent(pct);
}

/**
 * Formate le statut d'une élection
 */
export function formatStatut(statut) {
  const statuts = {
    'NON_OUVERT': 'Non ouvert',
    'EN_COURS': 'En cours',
    'CLOTURE': 'Clôturé'
  };
  return statuts[statut] || statut;
}

/**
 * Formate une action d'audit
 */
export function formatAction(action) {
  const actions = {
    'CREATE': 'Création',
    'UPDATE': 'Modification',
    'DELETE': 'Suppression',
    'VALIDATE': 'Validation',
    'CALCULATE': 'Calcul',
    'CONFIG': 'Configuration',
    'EXPORT': 'Export'
  };
  return actions[action] || action;
}

/**
 * Formate un niveau de sévérité
 */
export function formatSeverity(severity) {
  const levels = {
    'INFO': 'Information',
    'WARNING': 'Avertissement',
    'ERROR': 'Erreur',
    'CRITICAL': 'Critique'
  };
  return levels[severity] || severity;
}

/**
 * Génère un nom de fichier avec timestamp
 */
export function generateFilename(prefix, extension) {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
  return `${prefix}_${timestamp}.${extension}`;
}

/**
 * Formate un nombre de sièges
 */
export function formatSieges(sieges) {
  if (sieges === 0) return 'Aucun siège';
  if (sieges === 1) return '1 siège';
  return `${sieges} sièges`;
}

/**
 * Classe CSS pour un niveau de participation
 */
export function getClasseParticipation(tauxPct) {
  if (tauxPct < 30) return 'participation-faible';
  if (tauxPct < 50) return 'participation-moyenne';
  if (tauxPct < 70) return 'participation-bonne';
  return 'participation-forte';
}

/**
 * Classe CSS pour un statut
 */
export function getClasseStatut(statut) {
  const classes = {
    'NON_OUVERT': 'statut-non-ouvert',
    'EN_COURS': 'statut-en-cours',
    'CLOTURE': 'statut-cloture'
  };
  return classes[statut] || '';
}

/**
 * Formate un objet JSON pour affichage
 */
export function formatJSON(obj, indent = 2) {
  try {
    return JSON.stringify(obj, null, indent);
  } catch (e) {
    return String(obj);
  }
}

/**
 * Tronque un texte avec ellipse
 */
export function truncate(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Formate une durée en secondes vers format lisible
 */
export function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}min ${secs}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}min`;
}

/**
 * Génère une couleur en fonction d'un index
 */
export function getColorFromIndex(index, colors) {
  return colors[index % colors.length];
}

/**
 * Formate un tour (1 ou 2)
 */
export function formatTour(tour) {
  if (tour === 1) return '1er tour';
  if (tour === 2) return '2nd tour';
  return `Tour ${tour}`;
}

/**
 * Formate le classement (1er, 2ème, 3ème, etc.)
 */
export function formatRang(rang) {
  if (rang === 1) return '1er';
  if (rang === 2) return '2nd';
  return `${rang}ème`;
}
