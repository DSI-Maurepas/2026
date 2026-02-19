/**
 * Calcule la répartition des sièges avec gestion complète des égalités.
 * 1. Plus forte moyenne
 * 2. Plus grand nombre de suffrages (si égalité de moyenne)
 * 3. Bénéfice de l'âge (si égalité de moyenne ET de voix)
 */
export const calculateMunicipalSeats = (lists, totalSeats) => {
  const totalExprimes = lists.reduce((sum, l) => sum + l.votes, 0);
  if (totalExprimes === 0) return lists.map(l => ({ ...l, seats: 0 }));

  let results = lists.map(l => ({
    ...l,
    seats: 0,
    isEligible: (l.votes / totalExprimes) >= 0.05,
    averageAge: l.averageAge || 0 // Doit être fourni par l'admin
  }));

  const sortedLists = [...results].sort((a, b) => b.votes - a.votes);
  const majorityBonus = Math.ceil(totalSeats / 2);
  
  const winnerIndex = results.findIndex(l => l.id === sortedLists[0].id);
  results[winnerIndex].seats = majorityBonus;

  let remainingSeats = totalSeats - majorityBonus;
  const eligibleLists = results.filter(l => l.isEligible);

  while (remainingSeats > 0) {
    let bestMoyenne = -1;
    let candidatesIndices = [];

    eligibleLists.forEach((l, index) => {
      const moyenne = l.votes / (l.seats + 1);
      
      if (moyenne > bestMoyenne + 0.000001) {
        bestMoyenne = moyenne;
        candidatesIndices = [index];
      } else if (Math.abs(moyenne - bestMoyenne) < 0.000001) {
        candidatesIndices.push(index);
      }
    });

    let winnerOfTie;
    if (candidatesIndices.length === 1) {
      winnerOfTie = candidatesIndices[0];
    } else {
      // Égalité de moyenne : On trie par voix, puis par âge
      winnerOfTie = candidatesIndices.sort((a, b) => {
        const listA = eligibleLists[a];
        const listB = eligibleLists[b];
        
        if (listA.votes !== listB.votes) {
          return listB.votes - listA.votes; // Priorité au plus grand nombre de voix
        }
        return listB.averageAge - listA.averageAge; // Ultime recours : bénéfice de l'âge
      })[0];
    }

    const globalIndex = results.findIndex(l => l.id === eligibleLists[winnerOfTie].id);
    results[globalIndex].seats++;
    remainingSeats--;
  }

  return results;
};