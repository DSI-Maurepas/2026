// src/utils/electionRules.js
// Règles électorales françaises pour les élections municipales et communautaires

/**
 * Détermine les 2 listes qualifiées pour le second tour
 * Basé sur le classement des voix obtenues au 1er tour
 * 
 * @param {Array} resultatsT1 - Résultats du premier tour par liste
 * @returns {Object} {qualified: [listeId1, listeId2], egalite: boolean}
 */
export function determinerQualifiesSecondTour(resultatsT1) {
  if (!resultatsT1 || resultatsT1.length < 2) {
    throw new Error('Au moins 2 listes requises pour déterminer les qualifiés');
  }

  // Trier par nombre de voix décroissant
  const sorted = [...resultatsT1].sort((a, b) => b.voix - a.voix);

  // Vérifier égalité entre les 2 premiers
  const egalite = sorted[0].voix === sorted[1].voix;

  return {
    qualified: [sorted[0].listeId, sorted[1].listeId],
    egalite,
    classement: sorted
  };
}

/**
 * Calcule la répartition des sièges au Conseil Municipal
 * Règle: Communes >1000 habitants
 * - 50% des sièges à la liste majoritaire
 * - Reste à la proportionnelle (plus forte moyenne)
 * - Seuil: 5% des suffrages exprimés
 * 
 * @param {Array} resultats - Résultats finaux (T1 ou T2)
 * @param {Number} totalSieges - Nombre total de sièges (ex: 35 pour >20k hab)
 * @param {Number} seuilPct - Seuil en pourcentage (ex: 5.0)
 * @returns {Array} Répartition des sièges par liste
 */
export function calculerSiegesMunicipal(resultats, totalSieges = 35, seuilPct = 5.0) {
  // Calculer le total des suffrages exprimés
  const totalExprimes = resultats.reduce((sum, r) => sum + r.voix, 0);
  
  if (totalExprimes === 0) {
    throw new Error('Aucun suffrage exprimé');
  }

  // Calculer le seuil en voix
  const seuilVoix = (totalExprimes * seuilPct) / 100;

  // Filtrer les listes éligibles (>= seuil)
  const listesEligibles = resultats
    .map(r => ({
      ...r,
      pctVoix: (r.voix / totalExprimes) * 100,
      eligible: r.voix >= seuilVoix
    }))
    .filter(r => r.eligible)
    .sort((a, b) => b.voix - a.voix); // Trier par voix décroissant

  if (listesEligibles.length === 0) {
    throw new Error('Aucune liste éligible (seuil non atteint)');
  }

  // Calculer la prime majoritaire (50% des sièges, arrondi inférieur)
  const siegesMajoritaire = Math.floor(totalSieges / 2);
  const siegesProportionnels = totalSieges - siegesMajoritaire;

  // La liste majoritaire (1ère) reçoit la prime
  const listeMajoritaire = listesEligibles[0];

  // Calculer les sièges proportionnels pour toutes les listes éligibles
  const siegesParListe = listesEligibles.map(liste => {
    if (liste.listeId === listeMajoritaire.listeId) {
      // Liste majoritaire: prime + proportionnels
      const proportionnels = calculerSiegesProportionnels(
        [liste],
        listesEligibles,
        siegesProportionnels
      )[0];
      return {
        listeId: liste.listeId,
        nomListe: liste.nomListe,
        voix: liste.voix,
        pctVoix: liste.pctVoix,
        siegesMajoritaire,
        siegesProportionnels: proportionnels,
        siegesTotal: siegesMajoritaire + proportionnels,
        eligible: true
      };
    } else {
      // Autres listes: proportionnels uniquement
      const proportionnels = calculerSiegesProportionnels(
        [liste],
        listesEligibles,
        siegesProportionnels
      )[0];
      return {
        listeId: liste.listeId,
        nomListe: liste.nomListe,
        voix: liste.voix,
        pctVoix: liste.pctVoix,
        siegesMajoritaire: 0,
        siegesProportionnels: proportionnels,
        siegesTotal: proportionnels,
        eligible: true
      };
    }
  });

  // Vérifier que la somme = totalSieges
  const sommeSieges = siegesParListe.reduce((sum, l) => sum + l.siegesTotal, 0);
  if (sommeSieges !== totalSieges) {
    console.warn(`Ajustement nécessaire: ${sommeSieges} sièges attribués au lieu de ${totalSieges}`);
  }

  return siegesParListe;
}

/**
 * Calcule les sièges à la proportionnelle selon la méthode de la plus forte moyenne
 * 
 * @param {Array} listes - Listes à considérer
 * @param {Array} toutesListes - Toutes les listes éligibles (pour calculer les quotients)
 * @param {Number} siegesAAttribuer - Nombre de sièges à répartir
 * @returns {Array} Nombre de sièges par liste (même ordre que input)
 */
function calculerSiegesProportionnels(listes, toutesListes, siegesAAttribuer) {
  // Initialiser les sièges à 0 pour chaque liste
  const sieges = toutesListes.map(l => ({
    listeId: l.listeId,
    voix: l.voix,
    sieges: 0
  }));

  // Attribuer les sièges un par un selon la plus forte moyenne
  for (let i = 0; i < siegesAAttribuer; i++) {
    // Calculer le quotient pour chaque liste: voix / (sièges + 1)
    const quotients = sieges.map(s => ({
      listeId: s.listeId,
      quotient: s.voix / (s.sieges + 1)
    }));

    // Trouver la liste avec le plus fort quotient
    const maxQuotient = Math.max(...quotients.map(q => q.quotient));
    const listeGagnante = quotients.find(q => q.quotient === maxQuotient);

    // Attribuer le siège à cette liste
    const listeIndex = sieges.findIndex(s => s.listeId === listeGagnante.listeId);
    sieges[listeIndex].sieges++;
  }

  // Retourner les sièges dans l'ordre des listes en input
  return listes.map(l => {
    const found = sieges.find(s => s.listeId === l.listeId);
    return found ? found.sieges : 0;
  });
}

/**
 * Calcule les sièges au Conseil Communautaire
 * Basé sur les résultats des élections municipales
 * Répartition proportionnelle selon la règle préfectorale
 * 
 * @param {Array} resultats - Résultats municipaux (T1 ou T2)
 * @param {Number} totalSieges - Nombre de sièges communautaires (ex: 6 pour SQY)
 * @param {Number} seuilPct - Seuil en pourcentage (ex: 5.0)
 * @returns {Array} Répartition des sièges communautaires
 */
export function calculerSiegesCommunautaire(resultats, totalSieges = 7, seuilPct = 5.0) {
  // Calculer le total des suffrages exprimés
  const totalExprimes = resultats.reduce((sum, r) => sum + r.voix, 0);
  
  if (totalExprimes === 0) {
    throw new Error('Aucun suffrage exprimé');
  }

  // Calculer le seuil en voix
  const seuilVoix = (totalExprimes * seuilPct) / 100;

  // Filtrer les listes éligibles (>= seuil)
  const listesEligibles = resultats
    .map(r => ({
      ...r,
      pctMunicipal: (r.voix / totalExprimes) * 100,
      eligible: r.voix >= seuilVoix
    }))
    .filter(r => r.eligible)
    .sort((a, b) => b.voix - a.voix);

  if (listesEligibles.length === 0) {
    throw new Error('Aucune liste éligible (seuil non atteint)');
  }

  // Calculer les sièges communautaires à la proportionnelle (plus forte moyenne)
  const sieges = calculerSiegesProportionnelsSimple(listesEligibles, totalSieges);

  return listesEligibles.map((liste, index) => ({
    listeId: liste.listeId,
    nomListe: liste.nomListe,
    voixMunicipal: liste.voix,
    pctMunicipal: liste.pctMunicipal,
    siegesCommunautaires: sieges[index],
    eligible: true
  }));
}

/**
 * Calcule les sièges à la proportionnelle (plus forte moyenne) - version simplifiée
 */
function calculerSiegesProportionnelsSimple(listes, siegesAAttribuer) {
  const sieges = listes.map(l => ({
    listeId: l.listeId,
    voix: l.voix,
    sieges: 0
  }));

  for (let i = 0; i < siegesAAttribuer; i++) {
    const quotients = sieges.map(s => ({
      listeId: s.listeId,
      quotient: s.voix / (s.sieges + 1)
    }));

    const maxQuotient = Math.max(...quotients.map(q => q.quotient));
    const listeGagnante = quotients.find(q => q.quotient === maxQuotient);

    const listeIndex = sieges.findIndex(s => s.listeId === listeGagnante.listeId);
    sieges[listeIndex].sieges++;
  }

  return sieges.map(s => s.sieges);
}

/**
 * Vérifie si un second tour est nécessaire
 * Conditions pour éviter le second tour:
 * - Une liste obtient la majorité absolue (>50%)
 * - ET cette liste obtient au moins 25% des inscrits
 * 
 * @param {Array} resultatsT1 - Résultats du premier tour
 * @param {Number} totalInscrits - Nombre total d'inscrits
 * @returns {Boolean} true si second tour nécessaire
 */
export function secondTourNecessaire(resultatsT1, totalInscrits) {
  const totalExprimes = resultatsT1.reduce((sum, r) => sum + r.voix, 0);
  
  if (totalExprimes === 0) return true;

  // Trouver la liste arrivée en tête
  const listeTete = resultatsT1.reduce((max, r) => 
    r.voix > max.voix ? r : max
  , resultatsT1[0]);

  const pctExprimes = (listeTete.voix / totalExprimes) * 100;
  const pctInscrits = (listeTete.voix / totalInscrits) * 100;

  // Second tour évité si: >50% des exprimés ET >25% des inscrits
  const majoritéAbsolue = pctExprimes > 50;
  const seuilInscrits = pctInscrits > 25;

  return !(majoritéAbsolue && seuilInscrits);
}

/**
 * Génère un rapport détaillé du calcul des sièges
 */
export function genererRapportCalcul(resultats, siegesParListe, totalSieges, seuilPct) {
  const totalExprimes = resultats.reduce((sum, r) => sum + r.voix, 0);
  const seuilVoix = (totalExprimes * seuilPct) / 100;

  return {
    totalExprimes,
    seuilPct,
    seuilVoix,
    totalSieges,
    siegesMajoritaire: Math.floor(totalSieges / 2),
    siegesProportionnels: totalSieges - Math.floor(totalSieges / 2),
    details: siegesParListe,
    sommeSiegesAttribues: siegesParListe.reduce((sum, l) => sum + l.siegesTotal, 0)
  };
}
