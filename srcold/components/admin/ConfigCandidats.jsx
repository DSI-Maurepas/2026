import React, { useEffect, useMemo, useRef } from "react";
import { useGoogleSheets } from "../../hooks/useGoogleSheets";
import { SHEET_NAMES } from "../../utils/constants";

/**
 * Admin - Candidats
 * Version "anti-sticky": 1ère colonne figée via 2 tableaux synchronisés.
 */
const ConfigCandidats = () => {
  const { data: candidats, load, loading } = useGoogleSheets(SHEET_NAMES.CANDIDATS);

  useEffect(() => {
    load();
  }, [load]);

  const all = useMemo(() => (Array.isArray(candidats) ? candidats : []), [candidats]);
  const tour1 = useMemo(() => all.filter((c) => c.actifT1), [all]);
  const tour2 = useMemo(() => all.filter((c) => c.actifT2), [all]);

  const renderSplit = (rows, title) => {
    const leftRef = { current: null };
    const rightRef = { current: null };

    // local refs via callback to avoid re-render loops
    const setLeft = (el) => (leftRef.current = el);
    const setRight = (el) => (rightRef.current = el);

    const sync = (src) => {
      const l = leftRef.current;
      const r = rightRef.current;
      if (!l || !r) return;
      if (src === "right") l.scrollTop = r.scrollTop;
      if (src === "left") r.scrollTop = l.scrollTop;
    };

    return (
      <div className="config-candidats-section">
        <h3>👤 {title}</h3>

        <div className="split-table">
          <div className="split-table-left" ref={setLeft} onScroll={() => sync("left")}>
            <table className="admin-table split">
              <thead>
                <tr>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const id = c.listeId || c.id || "";
                  return (
                    <tr key={id}>
                      <td className="split-sticky-cell">
                        <strong>{id}</strong>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="split-table-right" ref={setRight} onScroll={() => sync("right")}>
            <table className="admin-table split">
              <thead>
                <tr>
                  <th>Liste / Parti</th>
                  <th>Tête de liste</th>
                  <th>Ordre</th>
                  <th>Actif</th>
                  <th>Couleur</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const id = c.listeId || c.id || "";
                  const tete = `${c.teteListePrenom || ""} ${c.teteListeNom || ""}`.trim();
                  const actif = title.includes("Tour 2") ? c.actifT2 : c.actifT1;
                  return (
                    <tr key={id}>
                      <td>{c.nomListe || ""}</td>
                      <td>
                        <strong>{tete}</strong>
                      </td>
                      <td>{c.ordre ?? ""}</td>
                      <td>{actif ? "✅" : "❌"}</td>
                      <td style={{ textAlign: "center" }}>
                        <span
                          style={{
                            display: "inline-block",
                            width: 18,
                            height: 18,
                            borderRadius: 6,
                            background: c.couleur || "#0055A4",
                            border: "1px solid rgba(0,0,0,0.25)",
                            boxShadow: "0 2px 6px rgba(0,0,0,0.12)"
                          }}
                          aria-label={`Couleur ${c.couleur || "#0055A4"}`}
                          title={c.couleur || "#0055A4"}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="config-candidats">
      {loading ? (
        <p>Chargement...</p>
      ) : (
        <>
          {renderSplit(tour1, "Configuration des candidats - Tour 1")}
          {renderSplit(tour2, "Configuration des candidats - Tour 2")}
        </>
      )}
    </div>
  );
};

export default ConfigCandidats;
