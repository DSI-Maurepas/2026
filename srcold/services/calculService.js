// src/services/calculService.js
// Calculs métier – Élections municipales 2026
// Correctif clé :
// - Taux de participation communal = (Somme des votants à la DERNIÈRE HEURE disponible, tous bureaux) / (Somme des inscrits, tous bureaux)
// - Protection contre NaN / division par 0
// - Compatible Participation_T1 / Participation_T2

const toInt = (v, def = 0) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseInt(v.replace(/\s/g, ''), 10);
    return Number.isFinite(n) ? n : def;
  }
  return def;
};

// Détecte les clés de type votants09h ... votants20h
const isVotantsKey = (key) => /^votants\d{2}h$/i.test(key);

// Retourne la clé de la dernière heure présente dans une ligne
const getDerniereHeureKey = (row) => {
  if (!row || typeof row !== 'object') return null;

  const keys = Object.keys(row).filter(isVotantsKey);
  if (!keys.length) return null;

  // Trie par heure croissante (09h -> 20h)
  keys.sort((a, b) => {
    const ha = parseInt(a.match(/\d{2}/)?.[0] || '0', 10);
    const hb = parseInt(b.match(/\d{2}/)?.[0] || '0', 10);
    return ha - hb;
  });

  return keys[keys.length - 1];
};

export const calculService = {
  /**
   * Calcul des agrégats communaux de participation
   * @param {Array<Object>} participationRows
   * @returns {Object} { totalInscrits, totalVotants, tauxParticipation }
   */
  calcParticipationCommune(participationRows = []) {
    const rows = Array.isArray(participationRows) ? participationRows : [];

    // 1) Total des inscrits = somme des inscrits par bureau
    const totalInscrits = rows.reduce(
      (sum, r) => sum + toInt(r?.inscrits, 0),
      0
    );

    // 2) Total des votants = somme des votants à la dernière heure par bureau
    let totalVotants = 0;
    for (const r of rows) {
      const lastHourKey = getDerniereHeureKey(r);
      if (lastHourKey) {
        totalVotants += toInt(r?.[lastHourKey], 0);
      }
    }

    // 3) Taux de participation sécurisé
    const tauxParticipation =
      totalInscrits > 0 ? (totalVotants / totalInscrits) * 100 : 0;

    return {
      totalInscrits,
      totalVotants,
      tauxParticipation
    };
  },

  /**
   * Calcul de la répartition des sièges municipaux
   * Méthode française pour communes de plus de 1000 habitants
   * @param {Array} resultats - Résultats par bureau (Resultats_T1 ou Resultats_T2)
   * @param {Array} candidats - Liste des candidats
   * @param {number} totalSieges - Nombre total de sièges à attribuer
   * @returns {Array} Répartition des sièges par candidat
   */
  calculerSiegesMunicipaux(resultats = [], candidats = [], totalSieges = 29) {
    if (!Array.isArray(resultats) || !Array.isArray(candidats) || totalSieges <= 0) {
      return [];
    }

    // 1. Agréger les voix par candidat (somme de tous les bureaux)
    const voixParCandidat = {};
    
    resultats.forEach(bureau => {
      candidats.forEach(candidat => {
        const candidatId = candidat.id;
        const voixKey = `voix_${candidatId}`;
        const voix = toInt(bureau[voixKey], 0);
        
        if (!voixParCandidat[candidatId]) {
          voixParCandidat[candidatId] = {
            id: candidatId,
            nom: candidat.nom || `Candidat ${candidatId}`,
            voix: 0
          };
        }
        voixParCandidat[candidatId].voix += voix;
      });
    });

    // Convertir en tableau et trier par nombre de voix décroissant
    const resultatsGlobaux = Object.values(voixParCandidat)
      .filter(c => c.voix > 0)
      .sort((a, b) => b.voix - a.voix);

    if (resultatsGlobaux.length === 0) {
      return [];
    }

    // 2. Calculer le total des suffrages exprimés
    const totalVoix = resultatsGlobaux.reduce((sum, c) => sum + c.voix, 0);

    if (totalVoix === 0) {
      return resultatsGlobaux.map(c => ({
        ...c,
        pourcentage: 0,
        sieges: 0,
        methode: 'Aucun suffrage'
      }));
    }

    // 3. Calculer les pourcentages
    resultatsGlobaux.forEach(c => {
      c.pourcentage = (c.voix / totalVoix) * 100;
    });

    // 4. Vérifier si une liste a la majorité absolue (>50%)
    const listeEnTete = resultatsGlobaux[0];
    const aMajoriteAbsolue = listeEnTete.pourcentage > 50;

    if (!aMajoriteAbsolue) {
      // Pas de majorité absolue : aucun siège attribué (second tour nécessaire)
      return resultatsGlobaux.map(c => ({
        ...c,
        sieges: 0,
        methode: 'Second tour requis'
      }));
    }

    // 5. Attribution des sièges avec prime majoritaire

    // 5a. Prime majoritaire : 50% des sièges à la liste en tête (arrondi supérieur)
    const siegesPrime = Math.ceil(totalSieges / 2);
    listeEnTete.sieges = siegesPrime;
    listeEnTete.methode = 'Prime majoritaire';

    // 5b. Sièges restants à répartir à la proportionnelle
    const siegesRestants = totalSieges - siegesPrime;

    // Listes éligibles : au moins 5% des suffrages (y compris la liste en tête)
    const listesEligibles = resultatsGlobaux.filter(c => c.pourcentage >= 5);

    if (siegesRestants > 0 && listesEligibles.length > 0) {
      // Méthode de la plus forte moyenne
      const quotients = listesEligibles.map(liste => ({
        liste: liste,
        quotient: liste.voix,
        siegesAttribues: 0
      }));

      // Attribution des sièges un par un
      for (let i = 0; i < siegesRestants; i++) {
        // Trouver le quotient le plus élevé
        let maxQuotient = -1;
        let indexMax = -1;

        quotients.forEach((q, index) => {
          if (q.quotient > maxQuotient) {
            maxQuotient = q.quotient;
            indexMax = index;
          }
        });

        if (indexMax !== -1) {
          // Attribuer le siège
          quotients[indexMax].siegesAttribues++;
          
          // Recalculer le quotient (voix / (sièges + 1))
          quotients[indexMax].quotient = 
            quotients[indexMax].liste.voix / (quotients[indexMax].siegesAttribues + 1);
        }
      }

      // Ajouter les sièges proportionnels aux listes
      quotients.forEach(q => {
        if (q.liste.id === listeEnTete.id) {
          // Liste en tête : ajouter les sièges proportionnels à la prime
          q.liste.sieges += q.siegesAttribues;
          q.liste.methode = `Prime (${siegesPrime}) + Proportionnelle (${q.siegesAttribues})`;
        } else {
          q.liste.sieges = q.siegesAttribues;
          q.liste.methode = 'Proportionnelle';
        }
      });
    }

    // 6. Initialiser à 0 les listes non éligibles (<5%)
    resultatsGlobaux.forEach(c => {
      if (!c.sieges) {
        c.sieges = 0;
        c.methode = c.pourcentage < 5 ? 'Sous le seuil de 5%' : 'Non éligible';
      }
    });

    return resultatsGlobaux;
  },

  /**
   * Calcul de la répartition des sièges municipaux à partir d'un tableau "listes" déjà agrégé.
   * Utile lorsque Google Sheets fournit un onglet de consolidation (ex: Seats_Municipal).
   *
   * Attendus par élément de `listes`:
   *   - listeId (ou id)
   *   - nomListe (ou nom)
   *   - voix
   *   - pctVoix (optionnel, recalculé si absent)
   *   - eligible (optionnel)
   *
   * Règle (communes > 1000 hab.) :
   *   - Prime majoritaire : la moitié des sièges, arrondie à l'entier supérieur, à la liste arrivée en tête
   *   - Reste à la proportionnelle à la plus forte moyenne (D'Hondt), seuil 5%
   *
   * @param {Array<Object>} listes
   * @param {number} totalSieges
   * @returns {Array<Object>} lignes prêtes à afficher (prime/proportionnel/total)
   */
  calculerSiegesMunicipauxDepuisListes(listes = [], totalSieges = 29) {
    const rows = Array.isArray(listes) ? listes : [];
    const total = Number(totalSieges);
    if (!Number.isFinite(total) || total <= 0) return [];

    // Normalisation
    const norm = rows
      .map((r) => {
        const id = (r?.listeId ?? r?.id ?? r?.ListeID ?? '').toString().trim();
        const nom = (r?.nomListe ?? r?.nom ?? r?.NomListe ?? id).toString().trim();
        const voix = toInt(r?.voix ?? r?.Voix ?? r?.VoixMunicipal ?? 0, 0);
        const eligible = typeof r?.eligible === 'boolean' ? r.eligible : (String(r?.Eligible ?? '').toUpperCase() === 'TRUE');
        const pctVoix = Number(r?.pctVoix ?? r?.pourcentage ?? r?.PctVoix);
        return {
          listeId: id,
          nom,
          voix,
          eligible,
          pctVoix: Number.isFinite(pctVoix) ? pctVoix : null,
        };
      })
      .filter((r) => r.listeId && r.nom);

    // Si aucune voix, on ne peut pas répartir.
    const totalVoix = norm.reduce((s, r) => s + toInt(r.voix, 0), 0);
    if (totalVoix <= 0) return [];

    // Pourcentages (si non fournis)
    for (const r of norm) {
      if (r.pctVoix === null) {
        r.pctVoix = (r.voix / totalVoix) * 100;
      }
    }

    // Tri par voix décroissantes
    norm.sort((a, b) => b.voix - a.voix);
    const listeEnTete = norm[0];

    // Prime majoritaire : moitié arrondie au supérieur
    const prime = Math.ceil(total / 2);
    const restants = total - prime;

    // Seuil d'éligibilité : >= 5% (sauf si un flag eligible est fourni, il sert juste d'info)
    const listesEligibles = norm.filter((r) => (Number(r.pctVoix) || 0) >= 5);

    // Attribution proportionnelle (D'Hondt) sur les sièges restants
    const propSeats = {};
    for (const r of listesEligibles) propSeats[r.listeId] = 0;

    for (let i = 0; i < restants; i++) {
      let bestId = null;
      let bestQ = -1;
      for (const r of listesEligibles) {
        const s = propSeats[r.listeId] || 0;
        const q = r.voix / (s + 1);
        if (q > bestQ) {
          bestQ = q;
          bestId = r.listeId;
        }
      }
      if (!bestId) break;
      propSeats[bestId] = (propSeats[bestId] || 0) + 1;
    }

    // Construire le résultat
    return norm.map((r) => {
      const prop = propSeats[r.listeId] || 0;
      const primeSeats = r.listeId === listeEnTete.listeId ? prime : 0;
      const totalSeats = primeSeats + prop;
      return {
        candidatId: r.listeId,
        listeId: r.listeId,
        nom: r.nom,
        voix: r.voix,
        pourcentage: r.pctVoix,
        siegesPrime: primeSeats,
        siegesProportionnels: prop,
        sieges: totalSeats,
        methode: r.listeId === listeEnTete.listeId
          ? `Prime (${primeSeats}) + Proportionnelle (${prop})`
          : 'Proportionnelle',
        eligible: (Number(r.pctVoix) || 0) >= 5,
      };
    });
  },

  /**
   * Formatage sûr d'un pourcentage
   */
  /**
   * Répartition des sièges au conseil communautaire (commune > 1000 hab.) :
   * - Même logique que les sièges municipaux (listes) : prime majoritaire (50% arrondi au supérieur)
   * - Reste : proportionnelle à la plus forte moyenne (D'Hondt) sur les listes >= 5%
   *
   * Entrée attendue : listes issues de Seats_Community (ou équivalent), ex :
   * [{ listeId:'L1', nomListe:'Liste 1', voixMunicipal:6200, pctMunicipal:52.67, eligible:true }, ...]
   */
  calculerSiegesCommunautairesDepuisListes(listes = [], totalSieges = 0) {
    const total = Number(totalSieges);
    if (!Array.isArray(listes) || listes.length === 0 || !Number.isFinite(total) || total <= 0) return [];

    // Normaliser
    const norm = listes
      .map((l) => {
        const listeId = (l.listeId ?? l.ListeID ?? l.candidatId ?? '').toString().trim();
        const nom = (l.nomListe ?? l.NomListe ?? l.nom ?? l.liste ?? listeId ?? '').toString().trim();
        const voix = Number(l.voixMunicipal ?? l.VoixMunicipal ?? l.voix ?? l.Voix ?? 0) || 0;
        const pct = Number(l.pctMunicipal ?? l.PctMunicipal ?? l.pourcentage ?? l.PctVoix ?? 0) || 0;
        const eligible = typeof l.eligible === 'boolean' ? l.eligible : (pct >= 5);
        return { listeId, nom, voix, pctVoix: pct, eligible };
      })
      .filter((r) => r.listeId);

    if (norm.length === 0) return [];

    const totalVoix = norm.reduce((s, r) => s + (Number(r.voix) || 0), 0);
    const withPct = norm.map((r) => ({
      ...r,
      pctVoix: r.pctVoix || (totalVoix > 0 ? (r.voix * 100) / totalVoix : 0)
    }));

    // Sélection des listes éligibles (seuil 5%)
    const eligibles = withPct.filter((r) => (Number(r.pctVoix) || 0) >= 5);
    if (eligibles.length === 0) return [];

    // Liste en tête (voix max)
    const listeEnTete = eligibles.reduce((best, r) => (r.voix > best.voix ? r : best), eligibles[0]);

    // Prime majoritaire = 50% des sièges arrondis au supérieur
    const prime = Math.ceil(total / 2);
    const reste = total - prime;

    // Attribution proportionnelle (D'Hondt) sur le reste
    const propSeats = {};
    for (let i = 0; i < reste; i++) {
      let bestId = null;
      let bestQ = -1;
      for (const r of eligibles) {
        const s = propSeats[r.listeId] || 0;
        const q = r.voix / (s + 1);
        if (q > bestQ) {
          bestQ = q;
          bestId = r.listeId;
        }
      }
      if (!bestId) break;
      propSeats[bestId] = (propSeats[bestId] || 0) + 1;
    }

    return eligibles
      .map((r) => {
        const prop = propSeats[r.listeId] || 0;
        const primeSeats = r.listeId === listeEnTete.listeId ? prime : 0;
        const totalSeats = primeSeats + prop;
        return {
          candidatId: r.listeId,
          listeId: r.listeId,
          nom: r.nom,
          voix: r.voix,
          pourcentage: r.pctVoix,
          siegesPrime: primeSeats,
          siegesProportionnels: prop,
          sieges: totalSeats,
          methode: r.listeId === listeEnTete.listeId
            ? `Prime (${primeSeats}) + Proportionnelle (${prop})`
            : 'Proportionnelle',
          eligible: (Number(r.pctVoix) || 0) >= 5,
        };
      })
      // Tri : sièges desc, puis voix desc
      .sort((a, b) => (b.sieges - a.sieges) || (b.voix - a.voix));
  },
  
  // Alias rétrocompatible : certains composants/appels historiques utilisent ce nom.
  // Délègue à la version "DepuisListes" (prime majoritaire + plus forte moyenne).
  calculerSiegesCommunautaires(listes, totalSieges = 7) {
    return this.calculerSiegesCommunautairesDepuisListes(listes, totalSieges);
  },
formatPercent(value, decimals = 2) {
    const n = Number(value);
    if (!Number.isFinite(n)) return `0.${'0'.repeat(decimals)}%`;
    return `${n.toFixed(decimals)}%`;
  }
};

export default calculService;