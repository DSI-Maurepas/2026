import React from 'react';

const CommunityResults = ({ consolidatedData, config }) => {
  // config.communitySeats est récupéré depuis l'onglet 'Config' du Google Sheet
  const results = calculateCommunitySeats(consolidatedData, config.communitySeats);

  return (
    <div className="results-section">
      <h3>Répartition au Conseil Communautaire (SQY)</h3>
      <p className="subtitle">Nombre de sièges à pourvoir : {config.communitySeats}</p>
      
      <table>
        <thead>
          <tr>
            <th>Liste</th>
            <th>Tête de liste</th>
            <th>Voix</th>
            <th>% Exprimés</th>
            <th>Sièges SQY</th>
          </tr>
        </thead>
        <tbody>
          {results.sort((a,b) => b.votes - a.votes).map(list => (
            <tr key={list.id} className={list.communitySeats > 0 ? 'elected' : ''}>
              <td>{list.name}</td>
              <td>{list.leader}</td>
              <td>{list.votes.toLocaleString()}</td>
              <td>{((list.votes / config.totalVotes) * 100).toFixed(2)} %</td>
              <td className="seat-count"><strong>{list.communitySeats}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default CommunityResults;