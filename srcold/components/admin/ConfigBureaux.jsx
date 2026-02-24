import React, { useEffect, useMemo, useRef } from "react";
import { useGoogleSheets } from "../../hooks/useGoogleSheets";

/**
 * Admin - Bureaux
 * Version "anti-sticky": 1ère colonne figée via 2 tableaux synchronisés (ne dépend pas de position:sticky).
 */
const ConfigBureaux = () => {
  const { data: bureaux, load, loading } = useGoogleSheets("Bureaux");

  const leftRef = useRef(null);
  const rightRef = useRef(null);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => (Array.isArray(bureaux) ? bureaux : []), [bureaux]);

  const syncScroll = (source) => {
    const l = leftRef.current;
    const r = rightRef.current;
    if (!l || !r) return;
    if (source === "right") l.scrollTop = r.scrollTop;
    if (source === "left") r.scrollTop = l.scrollTop;
  };

  return (
    <div className="config-bureaux">
      <h3>📍 Configuration des bureaux de vote</h3>

      {loading ? (
        <p>Chargement...</p>
      ) : (
        <div className="split-table split-table--no-vscroll">
          {/* Colonne figée */}
          <div className="split-table-left" ref={leftRef} onScroll={() => syncScroll("left")}>
            <table className="admin-table split">
              <thead>
                <tr>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td className="split-sticky-cell">
                      <strong>{b.id}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tableau scrollable horizontal */}
          <div className="split-table-right" ref={rightRef} onScroll={() => syncScroll("right")}>
            <table className="admin-table split">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Adresse</th>
                  <th>Président</th>
                  <th>Secrétaire</th>
                  <th>Inscrits</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <strong>{b.nom}</strong>
                    </td>
                    <td>{b.adresse}</td>
                    <td>{b.president}</td>
                    <td>{b.secretaire}</td>
                    <td>{b.inscrits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConfigBureaux;
