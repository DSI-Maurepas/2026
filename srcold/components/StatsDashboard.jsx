import React from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell 
} from 'recharts';

const COLORS = ['#00235a', '#e1000f', '#009544', '#ffcc00', '#800080', '#ff6600'];

const StatsDashboard = ({ participationData, resultData, history2020 }) => {
  
  // 1. Préparation des données de participation (Formatage pour LineChart)
  const participationStats = [
    { hour: '08h', current: participationData.h8, prev: history2020.h8 },
    { hour: '10h', current: participationData.h10, prev: history2020.h10 },
    { hour: '12h', current: participationData.h12, prev: history2020.h12 },
    { hour: '14h', current: participationData.h14, prev: history2020.h14 },
    { hour: '16h', current: participationData.h16, prev: history2020.h16 },
    { hour: '18h', current: participationData.h18, prev: history2020.h18 },
    { hour: '20h', current: participationData.h20, prev: history2020.h20 },
  ];

  return (
    <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
      
      {/* Graphique de participation cumulative */}
      <div className="chart-card" style={{ background: 'white', padding: '20px', borderRadius: '8px' }}>
        <h3>Évolution de la participation (%)</h3>
        
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={participationStats}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="hour" />
            <YAxis unit="%" domain={[0, 100]} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="current" name="2026 (En cours)" stroke="#00235a" strokeWidth={3} />
            <Line type="monotone" dataKey="prev" name="2020 (Référence)" stroke="#999" strokeDasharray="5 5" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Graphique de répartition des voix (Pie Chart) */}
      <div className="chart-card" style={{ background: 'white', padding: '20px', borderRadius: '8px' }}>
        <h3>Répartition des Suffrages Exprimés</h3>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={resultData}
              dataKey="votes"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={80}
              label={({name, percent}) => `${name} ${(percent * 100).toFixed(1)}%`}
            >
              {resultData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
};

export default StatsDashboard;