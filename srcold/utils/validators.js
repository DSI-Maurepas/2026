// src/utils/validators.js
// Fonctions de validation des données électorales

/**
 * Valide les données de participation
 */
export function validateParticipation(data) {
  const errors = [];

  if (!data.bureauId) {
    errors.push('Bureau de vote obligatoire');
  }

  if (typeof data.inscrits !== 'number' || data.inscrits <= 0) {
    errors.push('Nombre d\'inscrits invalide');
  }

  if (typeof data.votants !== 'number' || data.votants < 0) {
    errors.push('Nombre de votants invalide');
  }

  if (data.votants > data.inscrits) {
    errors.push('Le nombre de votants ne peut pas dépasser le nombre d\'inscrits');
  }

  if (!data.heure || !/^\d{2}:\d{2}$/.test(data.heure)) {
    errors.push('Format d\'heure invalide (HH:MM attendu)');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Valide les résultats d'un bureau
 */
export function validateResultatsBureau(data) {
  const errors = {};

  // Contrôle de cohérence principale: Votants = Blancs + Nuls + Exprimés
  const somme = (data.blancs || 0) + (data.nuls || 0) + (data.exprimes || 0);
  if (data.votants !== somme) {
    errors.votants = `Votants (${data.votants}) doit être égal à Blancs + Nuls + Exprimés (${somme})`;
  }

  // Validation des voix par candidat
  if (data.voix) {
    let totalVoix = 0;
    for (const voix of Object.values(data.voix)) {
      totalVoix += parseInt(voix) || 0;
    }

    // Contrôle: Somme des voix = Exprimés
    if (totalVoix !== data.exprimes) {
      errors.exprimes = `Somme des voix (${totalVoix}) doit être égale aux Exprimés (${data.exprimes})`;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Alias pour la validation des résultats (utilisé par ResultatsSaisieBureau)
 */
export const validateResultats = validateResultatsBureau;

/**
 * Valide un candidat/liste
 */
export function validateCandidat(data) {
  const errors = [];

  if (!data.listeId || !/^L\d+$/.test(data.listeId)) {
    errors.push('Identifiant de liste invalide (format: L1, L2, etc.)');
  }

  if (!data.nomListe || data.nomListe.trim().length === 0) {
    errors.push('Nom de liste obligatoire');
  }

  if (!data.teteListeNom || data.teteListeNom.trim().length === 0) {
    errors.push('Nom de la tête de liste obligatoire');
  }

  if (!data.teteListePrenom || data.teteListePrenom.trim().length === 0) {
    errors.push('Prénom de la tête de liste obligatoire');
  }

  if (!data.couleur || !/^#[0-9A-Fa-f]{6}$/.test(data.couleur)) {
    errors.push('Couleur invalide (format hexadécimal attendu: #RRGGBB)');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Valide un bureau de vote
 */
export function validateBureau(data) {
  const errors = [];

  if (!data.id || !/^BV\d+$/.test(data.id)) {
    errors.push('Identifiant de bureau invalide (format: BV1, BV2, etc.)');
  }

  if (!data.nom || data.nom.trim().length === 0) {
    errors.push('Nom du bureau obligatoire');
  }

  if (!data.adresse || data.adresse.trim().length === 0) {
    errors.push('Adresse du bureau obligatoire');
  }

  if (typeof data.inscrits !== 'number' || data.inscrits <= 0) {
    errors.push('Nombre d\'inscrits invalide');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Valide une adresse email
 */
export function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * Valide une date ISO
 */
export function validateDateISO(dateString) {
  if (!dateString) return false;
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
}

/**
 * Valide qu'une valeur est dans une plage
 */
export function validateRange(value, min, max) {
  return typeof value === 'number' && value >= min && value <= max;
}

/**
 * Valide le format d'heure HH:MM
 */
export function validateTimeFormat(time) {
  if (!time) return false;
  const re = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
  return re.test(time);
}

/**
 * Vérifie si un bureau existe
 */
export function bureauExists(bureauId, bureaux) {
  return bureaux.some(b => b.id === bureauId);
}

/**
 * Vérifie si une liste/candidat existe
 */
export function candidatExists(listeId, candidats) {
  return candidats.some(c => c.listeId === listeId);
}

/**
 * Validation pour le passage au second tour
 */
export function validateSecondTour(resultatsT1, candidats) {
  const errors = [];

  if (!resultatsT1 || resultatsT1.length === 0) {
    errors.push('Aucun résultat du premier tour disponible');
    return { isValid: false, errors };
  }

  // Vérifier qu'on a au moins 2 candidats
  const candidatsActifs = candidats.filter(c => c.actifT1);
  if (candidatsActifs.length < 2) {
    errors.push('Au moins 2 candidats nécessaires pour un second tour');
  }

  // Vérifier que les résultats sont validés
  const totalExprimes = resultatsT1.reduce((sum, r) => sum + r.exprimes, 0);
  if (totalExprimes === 0) {
    errors.push('Aucun suffrage exprimé au premier tour');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validation pour le calcul des sièges
 */
export function validateCalculSieges(resultats, config) {
  const errors = [];

  if (!resultats || resultats.length === 0) {
    errors.push('Aucun résultat disponible pour le calcul des sièges');
    return { isValid: false, errors };
  }

  if (!config.SEATS_MUNICIPAL_TOTAL || config.SEATS_MUNICIPAL_TOTAL <= 0) {
    errors.push('Nombre total de sièges municipaux invalide');
  }

  if (!config.SEATS_THRESHOLD_PCT || config.SEATS_THRESHOLD_PCT < 0 || config.SEATS_THRESHOLD_PCT > 100) {
    errors.push('Seuil de pourcentage invalide');
  }

  const totalExprimes = resultats.reduce((sum, r) => sum + (r.exprimes || 0), 0);
  if (totalExprimes === 0) {
    errors.push('Aucun suffrage exprimé');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
