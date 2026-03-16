// src/components/exports/ExportResultatsMaurepas.jsx
import React, { useMemo } from 'react';
import { useElectionState } from '../../hooks/useElectionState';
import { useGoogleSheets } from '../../hooks/useGoogleSheets';
// Importation du blason et des utilitaires depuis votre service existant
import { BLASON_VILLE_BASE64 } from './exportService'; 

// ─── LOGIQUE DE CALCUL ────────────────────────────────────────────────────────
const formatPct = (v, b) => b ? ((v / b) * 100).toFixed(2).replace('.', ',') + '%' : '0,00%';

function construireData(bureaux, resultats, candidats, tourActuel) {
    const cands = (Array.isArray(candidats) ? candidats : [])
        .filter(c => tourActuel === 1 ? !!c.actifT1 : !!c.actifT2)
        .sort((a, b) => (Number(a.ordre) || 0) - (Number(b.ordre) || 0));

    const inscritsTotal = (Array.isArray(bureaux) ? bureaux : [])
        .reduce((s, b) => s + Number(b?.inscrits ?? 0), 0);

    let votants = 0, exprimes = 0;
    const voixParListe = {};
    cands.forEach(c => { voixParListe[String(c.listeId)] = 0; });

    (Array.isArray(resultats) ? resultats : []).forEach(r => {
        votants  += Number(r?.votants  ?? 0);
        exprimes += Number(r?.exprimes ?? 0);
        cands.forEach(c => {
            const lid = String(c.listeId);
            voixParListe[lid] += Number(r?.voix?.[lid] ?? 0);
        });
    });

    return { inscritsTotal, cands, voixParListe, votants, exprimes };
}

// ─── EXPORT XLSX (LOGIQUE ALIGNÉE SUR EXPORTEXCEL.JSX) ────────────────────────
async function generateXLSX(data, tourActuel) {
    const mod = await import('exceljs');
    const ExcelJS = mod.default ?? mod;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Résultats Maurepas T${tourActuel}`);

    // Configuration des colonnes
    worksheet.columns = [
        { width: 10 }, { width: 45 }, { width: 20 }, { width: 15 }
    ];

    // Intégration du blason (Logique ExportExcel.jsx)
    if (BLASON_VILLE_BASE64) {
        const imageId = workbook.addImage({
            base64: BLASON_VILLE_BASE64,
            extension: 'png',
        });
        worksheet.addImage(imageId, {
            tl: { col: 0, row: 0 },
            ext: { width: 65, height: 85 }
        });
    }

    worksheet.getRow(1).height = 70;
    worksheet.mergeCells('B1:D1');
    const cellTitre = worksheet.getCell('B1');
    cellTitre.value = `VILLE DE MAUREPAS - RÉSULTATS TOUR ${tourActuel}`;
    cellTitre.font = { bold: true, size: 14 };
    cellTitre.alignment = { vertical: 'middle', horizontal: 'center' };

    // Entêtes
    const headerRow = worksheet.addRow(['N°', 'Liste / Candidat', 'Voix', '% Exprimés']);
    headerRow.font = { bold: true };
    headerRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9ECEF' } };
        cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    });

    // Données
        data.cands.forEach((c, i) => {
        const v = data.voixParListe[c.listeId] || 0;
        const row = worksheet.addRow([
            i + 1,
            c.nomListe || c.teteListeNom,
            v,
            formatPct(v, data.exprimes)
        ]);
        row.eachCell(cell => {
            cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        });
    });

    // Génération du buffer XLSX Strict (Force l'extension .xlsx)
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Resultats_Maurepas_T${tourActuel}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

// ─── EXPORT PDF (LOGIQUE ALIGNÉE SUR EXPORTPDF.JSX) ───────────────────────────
function generatePDF(data, tourLabel) {
    const win = window.open('', '_blank');
    const html = `
        <html>
        <head>
            <title>MAUREPAS - ${tourLabel}</title>
            <style>
                body { font-family: sans-serif; padding: 40px; color: #333; }
                .header { display: flex; align-items: center; gap: 25px; border-bottom: 3px solid #b91c1c; padding-bottom: 20px; margin-bottom: 30px; }
                .header img { height: 90px; }
                .header h1 { margin: 0; font-size: 26px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #ccc; padding: 12px; text-align: center; }
                th { background-color: #f8f9fa; font-weight: bold; }
                .text-left { text-align: left; }
                @media print { .no-print { display: none; } }
            </style>
        </head>
        <body onload="window.print()">
            <div class="header">
                <img src="data:image/png;base64,${BLASON_VILLE_BASE64}" alt="Blason Maurepas" />
                <div>
                    <h1>MAUREPAS (Yvelines)</h1>
                    <p style="margin: 5px 0 0 0; font-weight: bold;">Élections Municipales 2026 - ${tourLabel}</p>
                </div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>N°</th>
                        <th class="text-left">Liste / Candidat</th>
                        <th>Voix</th>
                        <th>% Exprimés</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.cands.map((c, i) => {
                        const v = data.voixParListe[c.listeId] || 0;
                        return `
                            <tr>
                                <td>${i + 1}</td>
                                <td class="text-left">${c.nomListe || c.teteListeNom}</td>
                                <td>${v.toLocaleString('fr-FR')}</td>
                                <td>${formatPct(v, data.exprimes)}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </body>
        </html>
    `;
    win.document.write(html);
    win.document.close();
}

// ─── COMPOSANT ────────────────────────────────────────────────────────────────
export default function ExportResultatsMaurepas() {
    const { state } = useElectionState();
    const tourActuel = state?.tourActuel || 1;
    const tourLabel = tourActuel === 1 ? "1er tour" : "2ème tour";

    const { data: bureaux } = useGoogleSheets("Bureaux");
    const { data: candidats } = useGoogleSheets("Candidats");
    const { data: resultats } = useGoogleSheets(tourActuel === 2 ? "Resultats_T2" : "Resultats_T1");

    const data = useMemo(() => 
        construireData(bureaux, resultats, candidats, tourActuel), 
    [bureaux, resultats, candidats, tourActuel]);

    return (
        <div style={{ padding: '20px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '25px' }}>
                <img src={`data:image/png;base64,${BLASON_VILLE_BASE64}`} style={{ height: '55px' }} alt="Blason" />
                <h2 style={{ margin: 0, color: '#1e3a5f', fontSize: '20px' }}>Rapports de Maurepas</h2>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
                <button 
                    onClick={() => generatePDF(data, tourLabel)} 
                    style={{ padding: '12px 20px', cursor: 'pointer', background: '#b91c1c', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>
                    Exporter PDF
                </button>
                <button 
                    onClick={() => generateXLSX(data, tourActuel)} 
                    style={{ padding: '12px 20px', cursor: 'pointer', background: '#15803d', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>
                    Exporter XLSX
                </button>
            </div>
        </div>
    );
}