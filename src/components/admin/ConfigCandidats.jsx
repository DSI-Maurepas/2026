// src/components/config/ConfigCandidats.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useGoogleSheets } from "../../hooks/useGoogleSheets";
import googleSheetsService from "../../services/googleSheetsService";
import { SHEET_NAMES } from "../../utils/constants";

/**
 * Admin - Gestion des Candidats
 * Deux tableaux séparés Tour 1 / Tour 2 + édition inline + ajout + suppression
 */

const EMPTY_NEW = {
  listeId: "",
  nomListe: "",
  teteListePrenom: "",
  teteListeNom: "",
  ordre: "",
  actifT1: true,
  actifT2: false,
  couleur: "#0055A4",
};

const ConfigCandidats = () => {
  const { data: candidats, load, loading } = useGoogleSheets(SHEET_NAMES.CANDIDATS);
  const [saving,     setSaving]     = useState(null);  // listeId en cours de sauvegarde
  const [deleting,   setDeleting]   = useState(null);  // listeId en cours de suppression
  const [draft,      setDraft]      = useState({});    // valeurs en cours d'édition par listeId
  const [feedback,   setFeedback]   = useState(null);  // { id, ok, msg }
  const [newRow,     setNewRow]     = useState(null);  // null | { ...EMPTY_NEW, _tour: 1|2 }
  const [confirmDel, setConfirmDel] = useState(null);  // listeId à confirmer suppression

  useEffect(() => { load(); }, [load]);

  const all   = useMemo(() => (Array.isArray(candidats) ? candidats : []), [candidats]);
  const tour1 = useMemo(() => all.filter((c) => c.actifT1 || c.actifT1 === false), [all]);
  const tour2 = useMemo(() => all.filter((c) => c.actifT2 || c.actifT2 === false), [all]);

  // ── Helpers ────────────────────────────────────────────────────────────
  const showFeedback = useCallback((id, ok, msg) => {
    setFeedback({ id, ok, msg });
    setTimeout(() => setFeedback(null), ok ? 2200 : 3500);
  }, []);

  // ── Édition inline ──────────────────────────────────────────────────────
  const startEdit = useCallback((c) => {
    setDraft(prev => ({
      ...prev,
      [c.listeId]: {
        nomListe:        c.nomListe        || "",
        teteListeNom:    c.teteListeNom    || "",
        teteListePrenom: c.teteListePrenom || "",
        couleur:         c.couleur         || "#0055A4",
        ordre:           c.ordre           ?? "",
        actifT1:         !!c.actifT1,
        actifT2:         !!c.actifT2,
      },
    }));
  }, []);

  const cancelEdit = useCallback((listeId) => {
    setDraft(prev => { const n = { ...prev }; delete n[listeId]; return n; });
  }, []);

  const handleChange = useCallback((listeId, field, value) => {
    setDraft(prev => ({ ...prev, [listeId]: { ...prev[listeId], [field]: value } }));
  }, []);

  const handleSave = useCallback(async (c) => {
    const id = c.listeId;
    const d  = draft[id];
    if (!d) return;
    setSaving(id);
    try {
      const updated = {
        ...c,
        nomListe:        d.nomListe,
        teteListeNom:    d.teteListeNom,
        teteListePrenom: d.teteListePrenom,
        couleur:         d.couleur,
        ordre:           Number(d.ordre) || c.ordre,
        actifT1:         d.actifT1,
        actifT2:         d.actifT2,
      };
      await googleSheetsService.updateRow(SHEET_NAMES.CANDIDATS, c.rowIndex, updated);
      cancelEdit(id);
      showFeedback(id, true, "Sauvegardé ✅");
      await load();
    } catch (e) {
      console.error("[ConfigCandidats] Erreur sauvegarde:", e);
      showFeedback(id, false, "Erreur ❌");
    } finally {
      setSaving(null);
    }
  }, [draft, cancelEdit, load, showFeedback]);

  // ── Suppression ─────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (c) => {
    setConfirmDel(null);
    setDeleting(c.listeId);
    try {
      await googleSheetsService.deleteRow(SHEET_NAMES.CANDIDATS, c.rowIndex);
      showFeedback(c.listeId, true, "Supprimé ✅");
      await load();
    } catch (e) {
      console.error("[ConfigCandidats] Erreur suppression:", e);
      showFeedback(c.listeId, false, "Erreur suppression ❌");
    } finally {
      setDeleting(null);
    }
  }, [load, showFeedback]);

  // ── Ajout ────────────────────────────────────────────────────────────────
  const handleNewChange = useCallback((field, value) => {
    setNewRow(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleNewSave = useCallback(async () => {
    if (!newRow) return;
    if (!newRow.listeId.trim()) { alert("L'ID de liste est obligatoire."); return; }
    setSaving("__new__");
    try {
      const toAdd = {
        listeId:         newRow.listeId.trim(),
        nomListe:        newRow.nomListe,
        teteListePrenom: newRow.teteListePrenom,
        teteListeNom:    newRow.teteListeNom,
        couleur:         newRow.couleur,
        ordre:           Number(newRow.ordre) || 0,
        actifT1:         newRow.actifT1,
        actifT2:         newRow.actifT2,
      };
      await googleSheetsService.appendRow(SHEET_NAMES.CANDIDATS, toAdd);
      setNewRow(null);
      showFeedback("__new__", true, "Candidat ajouté ✅");
      await load();
    } catch (e) {
      console.error("[ConfigCandidats] Erreur ajout:", e);
      showFeedback("__new__", false, "Erreur ajout ❌");
    } finally {
      setSaving(null);
    }
  }, [newRow, load, showFeedback]);

  const isEditing = (listeId) => !!draft[listeId];

  // ── Formulaire ajout (affiché sous le header du bon tour) ───────────────
  const renderAddForm = (tour) => {
    if (!newRow || newRow._tour !== tour) return null;
    const isSav = saving === "__new__";
    return (
      <div className="cc-add-form">
        <div className="cc-add-form-title">➕ Nouveau candidat — Tour {tour}</div>
        <div className="cc-add-grid">
          <div className="cc-add-field">
            <label>ID *</label>
            <input className="cc-input" placeholder="ex: L7" value={newRow.listeId}
              onChange={e => handleNewChange("listeId", e.target.value)} />
          </div>
          <div className="cc-add-field cc-add-field--wide">
            <label>Nom de la liste</label>
            <input className="cc-input" placeholder="ex: Liste XYZ" value={newRow.nomListe}
              onChange={e => handleNewChange("nomListe", e.target.value)} />
          </div>
          <div className="cc-add-field">
            <label>Prénom</label>
            <input className="cc-input" placeholder="Prénom" value={newRow.teteListePrenom}
              onChange={e => handleNewChange("teteListePrenom", e.target.value)} />
          </div>
          <div className="cc-add-field">
            <label>Nom</label>
            <input className="cc-input" placeholder="NOM" value={newRow.teteListeNom}
              onChange={e => handleNewChange("teteListeNom", e.target.value)} />
          </div>
          <div className="cc-add-field cc-add-field--xs">
            <label>Ordre</label>
            <input className="cc-input cc-input--xs" type="number" value={newRow.ordre}
              onChange={e => handleNewChange("ordre", e.target.value)} />
          </div>
          <div className="cc-add-field cc-add-field--check">
            <label>T1 actif</label>
            <input type="checkbox" checked={!!newRow.actifT1}
              onChange={e => handleNewChange("actifT1", e.target.checked)} />
          </div>
          <div className="cc-add-field cc-add-field--check">
            <label>T2 actif</label>
            <input type="checkbox" checked={!!newRow.actifT2}
              onChange={e => handleNewChange("actifT2", e.target.checked)} />
          </div>
          <div className="cc-add-field cc-add-field--check">
            <label>Couleur</label>
            <input type="color" value={newRow.couleur || "#0055A4"}
              onChange={e => handleNewChange("couleur", e.target.value)}
              style={{ width: 40, height: 30, cursor: "pointer", border: "none", background: "none" }} />
          </div>
        </div>
        <div className="cc-add-actions">
          {feedback?.id === "__new__" && (
            <span style={{ fontSize: 13, marginRight: 10, color: feedback.ok ? "#16a34a" : "#dc2626" }}>
              {feedback.msg}
            </span>
          )}
          <button className="cc-btn cc-btn--save" onClick={handleNewSave} disabled={isSav}>
            {isSav ? "Ajout en cours…" : "💾 Ajouter le candidat"}
          </button>
          <button className="cc-btn cc-btn--cancel" onClick={() => setNewRow(null)} disabled={isSav}>
            ✖ Annuler
          </button>
        </div>
      </div>
    );
  };

  // ── Tableau par tour ─────────────────────────────────────────────────────
  const renderTable = (rows, title, tour) => (
    <div className="cc-section">
      <div className="cc-section-header">
        <span className="cc-section-icon">👤</span>
        <h3 className="cc-section-title">{title}</h3>
        <span className="cc-badge">{rows.length} liste{rows.length > 1 ? "s" : ""}</span>
        {!newRow && (
          <button className="cc-add-btn-inline"
            onClick={() => setNewRow({ ...EMPTY_NEW, actifT1: tour === 1, actifT2: tour === 2, _tour: tour })}>
            ➕ Ajouter
          </button>
        )}
      </div>

      {renderAddForm(tour)}

      <div className="cc-table-wrap">
        <table className="cc-table">
          <thead>
            <tr>
              <th style={{ width: 60 }}>ID</th>
              <th>Nom de la liste</th>
              <th>Prénom</th>
              <th>Nom</th>
              <th style={{ width: 60 }}>Ordre</th>
              <th style={{ width: 55 }}>T1</th>
              <th style={{ width: 55 }}>T2</th>
              <th style={{ width: 52 }}>Couleur</th>
              <th style={{ width: 170 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", padding: "20px", color: "#94a3b8", fontStyle: "italic" }}>
                  Aucun candidat pour ce tour.
                </td>
              </tr>
            )}
            {rows.map((c) => {
              const id            = c.listeId || c.id || "";
              const d             = draft[id] || {};
              const inE           = isEditing(id);
              const isSav         = saving === id;
              const isDel         = deleting === id;
              const fb            = feedback?.id === id;
              const confirmingDel = confirmDel === id;

              return (
                <tr key={id} className={inE ? "cc-row cc-row--editing" : "cc-row"}>
                  <td className="cc-id-cell"><strong>{id}</strong></td>

                  <td>
                    {inE
                      ? <input className="cc-input" value={d.nomListe ?? ""}
                          onChange={e => handleChange(id, "nomListe", e.target.value)} />
                      : <span className="cc-text">{c.nomListe}</span>}
                  </td>

                  <td>
                    {inE
                      ? <input className="cc-input cc-input--sm" value={d.teteListePrenom ?? ""}
                          onChange={e => handleChange(id, "teteListePrenom", e.target.value)} />
                      : <span className="cc-text">{c.teteListePrenom}</span>}
                  </td>

                  <td>
                    {inE
                      ? <input className="cc-input cc-input--sm" value={d.teteListeNom ?? ""}
                          onChange={e => handleChange(id, "teteListeNom", e.target.value)} />
                      : <span className="cc-text"><strong>{c.teteListeNom}</strong></span>}
                  </td>

                  <td style={{ textAlign: "center" }}>
                    {inE
                      ? <input className="cc-input cc-input--xs" type="number" value={d.ordre ?? ""}
                          onChange={e => handleChange(id, "ordre", e.target.value)} />
                      : <span className="cc-text">{c.ordre}</span>}
                  </td>

                  <td style={{ textAlign: "center" }}>
                    {inE
                      ? <input type="checkbox" checked={!!d.actifT1}
                          onChange={e => handleChange(id, "actifT1", e.target.checked)} />
                      : <span>{c.actifT1 ? "✅" : "❌"}</span>}
                  </td>

                  <td style={{ textAlign: "center" }}>
                    {inE
                      ? <input type="checkbox" checked={!!d.actifT2}
                          onChange={e => handleChange(id, "actifT2", e.target.checked)} />
                      : <span>{c.actifT2 ? "✅" : "❌"}</span>}
                  </td>

                  <td style={{ textAlign: "center" }}>
                    {inE ? (
                      <input type="color" value={d.couleur || "#0055A4"}
                        onChange={e => handleChange(id, "couleur", e.target.value)}
                        style={{ width: 36, height: 28, cursor: "pointer", border: "none", background: "none" }} />
                    ) : (
                      <span style={{
                        display: "inline-block", width: 22, height: 22, borderRadius: 6,
                        background: c.couleur || "#0055A4",
                        border: "1px solid rgba(0,0,0,.2)",
                        boxShadow: "0 1px 4px rgba(0,0,0,.15)",
                        verticalAlign: "middle",
                      }} title={c.couleur} />
                    )}
                  </td>

                  <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                    {fb && (
                      <span style={{ marginRight: 6, fontSize: 12, color: feedback.ok ? "#16a34a" : "#dc2626" }}>
                        {feedback.msg}
                      </span>
                    )}
                    {confirmingDel ? (
                      <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: "#b91c1c", marginRight: 2 }}>Confirmer ?</span>
                        <button className="cc-btn cc-btn--danger" onClick={() => handleDelete(c)} disabled={isDel}>
                          🗑️ Oui
                        </button>
                        <button className="cc-btn cc-btn--cancel" onClick={() => setConfirmDel(null)}>
                          ✖ Non
                        </button>
                      </span>
                    ) : !inE ? (
                      <span style={{ display: "inline-flex", gap: 4 }}>
                        <button className="cc-btn cc-btn--edit" onClick={() => startEdit(c)} title="Modifier">
                          ✏️ Modifier
                        </button>
                        <button className="cc-btn cc-btn--danger" onClick={() => setConfirmDel(id)}
                          disabled={isDel} title="Supprimer">
                          🗑️
                        </button>
                      </span>
                    ) : (
                      <span style={{ display: "inline-flex", gap: 4 }}>
                        <button className="cc-btn cc-btn--save" onClick={() => handleSave(c)} disabled={isSav}>
                          {isSav ? "…" : "💾 Sauver"}
                        </button>
                        <button className="cc-btn cc-btn--cancel" onClick={() => cancelEdit(id)} disabled={isSav}>
                          ✖
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ── Rendu principal ──────────────────────────────────────────────────────
  return (
    <div className="config-candidats">
      <style>{`
/* ── Sections ── */
.cc-section { margin-bottom: 36px; }
.cc-section-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
.cc-section-icon { font-size: 20px; }
.cc-section-title { margin: 0; font-size: 16px; font-weight: 700; color: #1e293b; }
.cc-badge { background: #e0f2fe; color: #0369a1; font-size: 12px; font-weight: 700; padding: 2px 10px; border-radius: 20px; }

/* ── Add button inline in header ── */
.cc-add-btn-inline {
  margin-left: auto;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 14px; background: #1e3c72; color: #fff;
  border: none; border-radius: 7px; font-size: 13px; font-weight: 700;
  cursor: pointer; transition: background .15s;
}
.cc-add-btn-inline:hover { background: #2d56a8; }

/* ── Table ── */
.cc-table-wrap { overflow-x: auto; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,.08); border: 1px solid #e2e8f0; }
.cc-table { width: 100%; border-collapse: collapse; font-size: 14px; background: #fff; }
.cc-table thead th { background: #1e3c72; color: #fff; padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; white-space: nowrap; }
.cc-table tbody td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
.cc-row:hover td { background: #f8fafc; }
.cc-row--editing td { background: #fefce8 !important; }
.cc-id-cell { font-family: monospace; font-size: 13px; color: #475569; }
.cc-text { color: #1e293b; }

/* ── Inputs ── */
.cc-input { width: 100%; min-width: 120px; padding: 5px 8px; border: 1.5px solid #93c5fd; border-radius: 6px; font-size: 13px; background: #fff; outline: none; box-sizing: border-box; }
.cc-input:focus { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,.15); }
.cc-input--sm { min-width: 90px; }
.cc-input--xs { min-width: 50px; width: 60px; text-align: center; }

/* ── Buttons ── */
.cc-btn { border: none; border-radius: 6px; padding: 5px 10px; font-size: 12px; font-weight: 700; cursor: pointer; transition: opacity .15s; }
.cc-btn:disabled { opacity: .5; cursor: not-allowed; }
.cc-btn--edit { background: #dbeafe; color: #1d4ed8; }
.cc-btn--edit:hover { background: #bfdbfe; }
.cc-btn--save { background: #dcfce7; color: #15803d; }
.cc-btn--save:hover:not(:disabled) { background: #bbf7d0; }
.cc-btn--cancel { background: #f1f5f9; color: #475569; }
.cc-btn--cancel:hover { background: #e2e8f0; }
.cc-btn--danger { background: #fee2e2; color: #b91c1c; }
.cc-btn--danger:hover:not(:disabled) { background: #fecaca; }

/* ── Add form ── */
.cc-add-form { background: #f0f9ff; border: 1.5px solid #7dd3fc; border-radius: 12px; padding: 20px 24px; margin-bottom: 16px; }
.cc-add-form-title { font-size: 15px; font-weight: 700; color: #0369a1; margin-bottom: 16px; }
.cc-add-grid { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
.cc-add-field { display: flex; flex-direction: column; gap: 4px; }
.cc-add-field label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: .4px; }
.cc-add-field--wide { flex: 2; min-width: 180px; }
.cc-add-field--xs { width: 70px; }
.cc-add-field--check { align-items: center; }
.cc-add-actions { display: flex; align-items: center; gap: 10px; margin-top: 16px; padding-top: 14px; border-top: 1px solid #bae6fd; }
      `}</style>

      {loading ? (
        <p>Chargement...</p>
      ) : (
        <>
          {renderTable(tour1, "Configuration des candidats — Tour 1", 1)}
          {renderTable(tour2, "Configuration des candidats — Tour 2", 2)}

          {all.length === 0 && (
            <div style={{ background: "#fef9c3", border: "1px solid #fde047", borderRadius: 10, padding: "16px 20px", color: "#713f12" }}>
              ⚠️ Aucun candidat trouvé. Vérifiez que les données ont bien été initialisées.
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ConfigCandidats;
