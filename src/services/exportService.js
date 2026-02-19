// src/services/exportService.js
// Service d'export PDF et Excel
// Note: Nécessite jsPDF et xlsx (à ajouter au package.json si export côté client souhaité)

import { generateFilename, formatDateTime, formatNumber, formatPercent } from '../utils/formatters';
import { ELECTION_CONFIG, SHEET_NAMES } from '../utils/constants';

// Helper : formater date en français (ex: "15 mars 2026")
const formatDateFR = (isoDate) => {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return isoDate;
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
};
import auditService from './auditService';
// ⚡ Import dynamique : xlsx (~2 Mo) n'est chargé qu'au premier export
let _XLSX = null;
async function getXLSX() {
  if (!_XLSX) {
    _XLSX = await import('xlsx');
  }
  return _XLSX;
}
import googleSheetsService from './googleSheetsService';
import calculService from './calculService';

class ExportService {
  /**
   * NOUVELLE MÉTHODE - Export Excel selon le type
   */
  async exportExcel(type, tour = 1) {
    try {
      switch (type) {
        case 'participation': {
          const sheetNameParticipation = tour === 1 ? SHEET_NAMES.PARTICIPATION_T1 : SHEET_NAMES.PARTICIPATION_T2;
          const sheetNameResultats     = tour === 1 ? SHEET_NAMES.RESULTATS_T1      : SHEET_NAMES.RESULTATS_T2;
          const participation = await googleSheetsService.getData(sheetNameParticipation);
          const resultats     = await googleSheetsService.getData(sheetNameResultats).catch(() => []);
          // Enrichir chaque ligne participation avec nuls/blancs/exprimes depuis resultats
          const enrichedParticipation = (Array.isArray(participation) ? participation : []).map((p) => {
            const bid = String(p?.bureauId ?? p?.BureauID ?? '').trim();
            const r = (Array.isArray(resultats) ? resultats : []).find(
              (row) => String(row?.bureauId ?? row?.BureauID ?? '').trim() === bid
            );
            return r ? { ...p, nuls: r.nuls ?? r.Nuls ?? 0, blancs: r.blancs ?? r.Blancs ?? 0, exprimes: r.exprimes ?? r.Exprimes ?? 0 } : p;
          });
          await this.exportParticipationCSV(enrichedParticipation, tour);
          break;
        }
        
        case 'resultats':
          const sheetNameResultats = tour === 1 ? SHEET_NAMES.RESULTATS_T1 : SHEET_NAMES.RESULTATS_T2;
          const resultats = await googleSheetsService.getData(sheetNameResultats);
          const candidats = await googleSheetsService.getData(SHEET_NAMES.CANDIDATS);
          await this.exportResultatsCSV(resultats, candidats, tour);
          break;
        
        case 'sieges': {
          const { municipal, communautaire } = await this.getSiegesCalcules(tour);
          await this.exportSiegesXLSX(municipal, communautaire, tour);
          break;
        }

        case 'sieges_municipal': {
          const { municipal } = await this.getSiegesCalcules(tour);
          await this.exportSiegesXLSX(municipal, [], tour, { only: 'municipal' });
          break;
        }

        case 'sieges_communautaire': {
          const { communautaire } = await this.getSiegesCalcules(tour);
          await this.exportSiegesXLSX([], communautaire, tour, { only: 'communautaire' });
          break;
        }
case 'audit':
          const auditData = await googleSheetsService.getData(SHEET_NAMES.AUDIT_LOG);
          await this.exportAuditCSV(auditData);
          break;
        
        case 'complet':
          await this.exportCompletCSV(tour);
          break;
        
        default:
          throw new Error(`Type d'export inconnu: ${type}`);
      }
    } catch (error) {
      console.error('Erreur export Excel:', error);
      throw error;
    }
  }

  /**
   * NOUVELLE MÉTHODE - Export PDF selon le type
   */
  async exportPDF(type, tour = 1) {
    try {
      // Accepter 'resultats' OU 'pv_resultats'
      if (type === 'resultats' || type === 'pv_resultats') {
        const sheetNameResultats = tour === 1 ? SHEET_NAMES.RESULTATS_T1 : SHEET_NAMES.RESULTATS_T2;
        const resultats = await googleSheetsService.getData(sheetNameResultats);
        const candidats = await googleSheetsService.getData(SHEET_NAMES.CANDIDATS);
        await this.openPVForPrint(resultats, candidats, tour);
      } else if (type === 'participation') {
        const sheetNameParticipation = tour === 1 ? SHEET_NAMES.PARTICIPATION_T1 : SHEET_NAMES.PARTICIPATION_T2;
        const sheetNameResultats     = tour === 1 ? SHEET_NAMES.RESULTATS_T1      : SHEET_NAMES.RESULTATS_T2;
        const participation = await googleSheetsService.getData(sheetNameParticipation);
        const bureaux       = await googleSheetsService.getData(SHEET_NAMES.BUREAUX);
        const resultats     = await googleSheetsService.getData(sheetNameResultats).catch(() => []);
        // Enrichir participation avec nuls/blancs/exprimes
        const enrichedParticipation = (Array.isArray(participation) ? participation : []).map((p) => {
          const bid = String(p?.bureauId ?? p?.BureauID ?? '').trim();
          const r = (Array.isArray(resultats) ? resultats : []).find(
            (row) => String(row?.bureauId ?? row?.BureauID ?? '').trim() === bid
          );
          return r ? { ...p, nuls: r.nuls ?? r.Nuls ?? 0, blancs: r.blancs ?? r.Blancs ?? 0, exprimes: r.exprimes ?? r.Exprimes ?? 0 } : p;
        });
        await this.openParticipationForPrint(enrichedParticipation, bureaux, tour);
      } else if (type === 'sieges') {
        const { municipal, communautaire } = await this.getSiegesCalcules(tour);
        await this.openSiegesForPrint(municipal, communautaire, tour);
      } else if (type === 'statistiques') {
        const sheetNameResultats = tour === 1 ? SHEET_NAMES.RESULTATS_T1 : SHEET_NAMES.RESULTATS_T2;
        const resultats = await googleSheetsService.getData(sheetNameResultats);
        const candidats = await googleSheetsService.getData(SHEET_NAMES.CANDIDATS);
        const bureaux = await googleSheetsService.getData(SHEET_NAMES.BUREAUX);
        await this.openStatistiquesForPrint(resultats, candidats, bureaux, tour);
      } else {
        throw new Error(`Type d'export PDF inconnu: ${type}`);
      }
    } catch (error) {
      console.error('Erreur export PDF:', error);
      throw error;
    }
  }

  /**
   * Exporte les données en XLSX (Excel)
   * NOTE: on conserve le nom historique exportToCSV pour éviter de casser l'UI,
   * mais la sortie est bien un .xlsx.
   */
  async exportToCSV(data, filename) {
    try {
      const XLSX = await getXLSX();
      const safeFilename = (filename || 'export.xlsx').replace(/\.csv$/i, '.xlsx');

      const rows = Array.isArray(data) ? data : [];
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Export');

      const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true });
      const blob = new Blob([arrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      this.downloadBlob(blob, safeFilename);

      auditService.logExport('XLSX', safeFilename, { rows: rows.length });
    } catch (error) {
      console.error('Erreur export XLSX:', error);
      throw error;
    }
  }

  /**
   * Convertit un tableau en CSV
   */
  arrayToCSV(data) {
    if (!data || data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const rows = data.map(row => 
      headers.map(header => {
        const value = row[header];
        // Échapper les guillemets et entourer de guillemets si nécessaire
        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    );
    
    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Exporte la participation en CSV
   */
  async exportParticipationCSV(participation, tour = 1) {
    // PV Participation : structure figée 09h -> 20h (Jour J)
    const HOURS = ['09h','10h','11h','12h','13h','14h','15h','16h','17h','18h','19h','20h'];

    const getNumeric = (v) => {
      const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
      return Number.isFinite(n) ? n : 0;
    };

    const getVotantsForHour = (obj, hourLabel) => {
      // Supporte plusieurs schémas:
      // 1) normalisé: votants09h / votants20h
      // 2) headers Sheets: Votants09h / Votants20h
      // 3) schéma "déjà consolidé": votants (si heure déjà définie)
      const hh = String(hourLabel || '').replace(/h/i, '').padStart(2, '0');
      const keyNorm = `votants${hh}h`;     // ex: votants09h
      const keySheet = `Votants${hh}h`;    // ex: Votants09h
      if (obj && Object.prototype.hasOwnProperty.call(obj, keyNorm)) return getNumeric(obj[keyNorm]);
      if (obj && Object.prototype.hasOwnProperty.call(obj, keySheet)) return getNumeric(obj[keySheet]);
      return 0;
    };

    const getLastHour = (obj) => {
      // Si une heure explicite existe déjà (consolidation UI), on la respecte
      const explicit = obj?.heure || obj?.Heure;
      if (explicit && HOURS.includes(String(explicit))) return String(explicit);

      // Sinon, on prend la dernière heure avec une valeur > 0
      let last = '';
      for (const h of HOURS) {
        const v = getVotantsForHour(obj, h);
        if (v > 0) last = h;
      }
      return last;
    };

    const getVotants = (obj) => {
      // Si déjà calculé
      if (obj?.votants !== undefined) return getNumeric(obj.votants);
      if (obj?.Votants !== undefined) return getNumeric(obj.Votants);

      const h = getLastHour(obj);
      return h ? getVotantsForHour(obj, h) : 0;
    };

    const data = (Array.isArray(participation) ? participation : [])
      // ⚡ Exclure les lignes fantômes (bureau vide ou 0 inscrit)
      .filter((p) => {
        const bureau = p?.bureauId || p?.BureauID || p?.Bureau || p?.bureau || '';
        const inscrits = getNumeric(p?.inscrits ?? p?.Inscrits);
        return bureau !== '' && inscrits > 0;
      })
      .map((p) => {
      const bureau = p?.bureauId || p?.BureauID || p?.Bureau || p?.bureau || '';
      const inscrits = getNumeric(p?.inscrits ?? p?.Inscrits);
      const heure = getLastHour(p);
      const votants = getVotants(p);

      // Taux en pourcentage, gardes-fous anti-NaN
      const tauxPct = inscrits > 0 ? (votants / inscrits) * 100 : 0;

      const nuls     = getNumeric(p?.nuls   ?? p?.Nuls);
      const blancs   = getNumeric(p?.blancs ?? p?.Blancs);
      const exprimes = getNumeric(p?.exprimes ?? p?.Exprimes);
      const tauxNuls     = inscrits > 0 ? (nuls     / inscrits) * 100 : 0;
      const tauxBlancs   = inscrits > 0 ? (blancs   / inscrits) * 100 : 0;
      const tauxExprimes = inscrits > 0 ? (exprimes / inscrits) * 100 : 0;

      return {
        'Bureau': bureau,
        'Inscrits': inscrits,
        'Votants': votants,
        'Taux participation (%)': Number(tauxPct.toFixed(2)),
        'Nuls': nuls,
        'Taux nuls (%)': Number(tauxNuls.toFixed(2)),
        'Blancs': blancs,
        'Taux blancs (%)': Number(tauxBlancs.toFixed(2)),
        'Exprimés': exprimes,
        'Taux exprimés (%)': Number(tauxExprimes.toFixed(2)),
        'Saisi par': p?.saisiPar || p?.SaisiPar || p?.user || '',
        'Timestamp': formatDateTime(p?.timestamp || p?.Timestamp || new Date().toISOString()),
      };
    });

    const filename = generateFilename(`participation_tour${tour}`, 'xlsx');
    this.exportToCSV(data, filename);
  }

  /**
   * Exporte les résultats en CSV
   */
  async exportResultatsCSV(resultats, candidats, tour = 1) {
    const data = resultats.map(r => {
      const inscrits  = Number(r.inscrits  ?? 0);
      const votants   = Number(r.votants   ?? 0);
      const blancs    = Number(r.blancs    ?? 0);
      const nuls      = Number(r.nuls      ?? 0);
      const exprimes  = Number(r.exprimes  ?? 0);
      const procurations = Number(r.procurations ?? 0);

      const row = {
        'Bureau': r.bureauId,
        'Inscrits': inscrits,
        'Votants': votants,
        'Taux participation (%)': inscrits > 0 ? Number(((votants / inscrits) * 100).toFixed(2)) : 0,
        'Blancs': blancs,
        'Taux blancs (%)': inscrits > 0 ? Number(((blancs / inscrits) * 100).toFixed(2)) : 0,
        'Nuls': nuls,
        'Taux nuls (%)': inscrits > 0 ? Number(((nuls / inscrits) * 100).toFixed(2)) : 0,
        'Exprimés': exprimes,
        'Taux exprimés (%)': inscrits > 0 ? Number(((exprimes / inscrits) * 100).toFixed(2)) : 0,
        'Procurations': procurations,
        'Taux procurations (%)': votants > 0 ? Number(((procurations / votants) * 100).toFixed(2)) : 0,
      };

      // Ajouter les voix par candidat
      candidats.forEach(c => {
        row[c.nomListe] = r.voix[c.listeId] || 0;
      });

      row['Saisi par'] = r.saisiPar;
      row['Validé par'] = r.validePar;
      row['Timestamp'] = formatDateTime(r.timestamp);

      return row;
    });

    const filename = generateFilename(`resultats_tour${tour}`, 'csv');
    this.exportToCSV(data, filename);
  }

  /**
   * Exporte les sièges municipaux en CSV
   */
  async exportSiegesMunicipalCSV(sieges) {
    const data = sieges.map(s => ({
      'Liste': s.nomListe,
      'Voix': s.voix,
      '% Voix': formatPercent(s.pctVoix),
      'Sièges Majorité': s.siegesMajoritaire || 0,
      'Sièges Proportionnels': s.siegesProportionnels || 0,
      'Total Sièges': s.siegesTotal,
      'Éligible': s.eligible ? 'Oui' : 'Non'
    }));

    const filename = generateFilename('sieges_municipal', 'csv');
    this.exportToCSV(data, filename);
  }

  /**
   * Exporte les sièges communautaires en CSV
   */
  async exportSiegesCommunautaireCSV(sieges) {
    const data = sieges.map(s => ({
      'Liste': s.nomListe,
      'Voix Municipal': s.voixMunicipal,
      '% Municipal': formatPercent(s.pctMunicipal),
      'Sièges Communautaires': s.siegesCommunautaires,
      'Éligible': s.eligible ? 'Oui' : 'Non'
    }));

    const filename = generateFilename('sieges_communautaire', 'csv');
    this.exportToCSV(data, filename);
  }

  /**
   * Exporte le journal d'audit en CSV
   */
  async exportAuditCSV(auditData) {
    const asText = (v) => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'string') return v;
      try { return JSON.stringify(v); } catch { return String(v); }
    };

    const isIsoLike = (s) => typeof s === 'string' && /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s);

    const pickFromIndexedRow = (a) => {
      // Cas 1 (ancien) : [id, timestamp, userEmail, action, entity, entityId, before, after, ip, userAgent, ...]
      const ts1 = a?.[1] ?? a?.['1'];
      const ts2 = a?.[17] ?? a?.['17']; // Cas 2 (nouveau) : timestamp à partir de la colonne 18 (index 17)
      const useNew = isIsoLike(ts2);
      const useOld = isIsoLike(ts1);

      if (!useNew && !useOld) return null;

      if (useNew) {
        const timestamp = ts2;
        const action = a?.[18] ?? a?.['18'] ?? '';
        const entity = a?.[19] ?? a?.['19'] ?? '';
        const entityId = a?.[20] ?? a?.['20'] ?? '';
        const before = a?.[21] ?? a?.['21'] ?? '';
        const after = a?.[22] ?? a?.['22'] ?? '';
        const userEmail = a?.[23] ?? a?.['23'] ?? '';

        return {
          timestamp,
          user: userEmail,
          action,
          target: [entity, entityId].filter(Boolean).join(' / '),
          severity: 'INFO',
          details: { entity, entityId, before, after }
        };
      }

      // useOld
      const timestamp = ts1;
      const userEmail = a?.[2] ?? a?.['2'] ?? '';
      const action = a?.[3] ?? a?.['3'] ?? '';
      const entity = a?.[4] ?? a?.['4'] ?? '';
      const entityId = a?.[5] ?? a?.['5'] ?? '';
      const before = a?.[6] ?? a?.['6'] ?? '';
      const after = a?.[7] ?? a?.['7'] ?? '';
      const ip = a?.[8] ?? a?.['8'] ?? '';
      const userAgent = a?.[9] ?? a?.['9'] ?? '';

      // Lignes de documentation (ex: "- Action: ...") : timestamp vide ou non ISO -> déjà filtrées.
      return {
        timestamp,
        user: userEmail,
        action,
        target: [entity, entityId].filter(Boolean).join(' / '),
        severity: 'INFO',
        details: { entity, entityId, before, after, ip, userAgent }
      };
    };

    
    const prettyAuditDetails = (details) => {
      // Normaliser details: objet {before, after, ip, userAgent, ...} ou string JSON
      const safeParse = (v) => {
        if (v === null || v === undefined) return null;
        if (typeof v === 'object') return v;
        if (typeof v !== 'string') return null;
        const s = v.trim();
        if (!s) return null;
        if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
          try { return JSON.parse(s); } catch { return null; }
        }
        return null;
      };

      const d = (details && typeof details === 'object') ? details : safeParse(details);
      if (!d) return asText(details);

      const beforeObj = safeParse(d.before) ?? safeParse(d.beforeJson) ?? (typeof d.before === 'object' ? d.before : null) ?? {};
      const afterObj  = safeParse(d.after)  ?? safeParse(d.afterJson)  ?? (typeof d.after === 'object'  ? d.after  : null) ?? {};

      const changes = [];
      const keys = new Set([
        ...Object.keys(beforeObj || {}),
        ...Object.keys(afterObj || {})
      ]);

      // Exclure méta-clés bruyantes si jamais
      ['entity','entityId','timestamp','user','userEmail'].forEach(k => keys.delete(k));

      for (const k of keys) {
        const b = beforeObj?.[k];
        const a = afterObj?.[k];
        // Comparaison simple JSON
        const bs = (b === undefined) ? '' : asText(b);
        const as_ = (a === undefined) ? '' : asText(a);
        if (bs !== as_) {
          if (bs === '' && as_ !== '') changes.push(`${k}: ${as_}`);
          else if (bs !== '' && as_ === '') changes.push(`${k}: ${bs} → ∅`);
          else changes.push(`${k}: ${bs} → ${as_}`);
        }
      }

      // Si pas de diff exploitable, mais after contient des infos, on affiche after compact
      if (changes.length === 0) {
        const afterKeys = Object.keys(afterObj || {});
        if (afterKeys.length > 0) {
          // Cas fréquent: {"rows": 15} ou {"bureaux": 2}
          const parts = afterKeys.slice(0, 6).map(k => `${k}: ${asText(afterObj[k])}`);
          changes.push(parts.join(', '));
        }
      }

      // Ajout IP / UA si présents
      const tail = [];
      if (d.ip) tail.push(`IP: ${asText(d.ip)}`);
      if (d.userAgent) tail.push(`UA: ${asText(d.userAgent)}`);

      return [...changes, ...tail].filter(Boolean).join(' | ');
    };

const data = (auditData || [])
      .map((a) => {
        // Schéma objet attendu
        const hasNamedFields = a && typeof a === 'object' && !Array.isArray(a) && (
          a.timestamp !== undefined || a.action !== undefined || a.user !== undefined
        );

        if (hasNamedFields) {
          const timestamp = a.timestamp ?? a.date ?? a.createdAt ?? a.time;
          const user = a.user ?? a.userEmail ?? a.email ?? a.saisiPar ?? a.username ?? a.actor ?? '';
          const action = a.action ?? a.event ?? a.type ?? a.operation ?? '';
          const entity = a.entity ?? a.sheet ?? a.table ?? a.targetSheet ?? '';
          const entityId = a.entityId ?? a.target ?? a.bureauId ?? a.bureau ?? a.id ?? '';
          const severity = a.severity ?? a.level ?? a.status ?? 'INFO';
          const details = a.details ?? a.detail ?? a.payload ?? a.data ?? a.after ?? a.before;

          if (!isIsoLike(timestamp)) return null;

          return {
            'Date': formatDateTime(timestamp),
            'Action': asText(action),
            'Utilisateur': asText(user),
            'Cible': asText([entity, entityId].filter(Boolean).join(' / ')),
            'Détails': prettyAuditDetails(details),
            'Sévérité': asText(severity)
          };
        }

        // Schéma indexé (GoogleSheetsService renvoie parfois des lignes arrays -> objets à clés numériques)
        const picked = pickFromIndexedRow(a);
        if (!picked) return null;

        return {
          'Date': formatDateTime(picked.timestamp),
          'Action': asText(picked.action),
          'Utilisateur': asText(picked.user),
          'Cible': asText(picked.target),
          'Détails': prettyAuditDetails(picked.details),
          'Sévérité': asText(picked.severity)
        };
      })
      .filter(Boolean);

    const filename = generateFilename('audit_log', 'xlsx');
    this.exportToCSV(data, filename);
  }

  /**
   * Exporte toutes les données en un seul fichier
   */
  async exportCompletCSV(tour = 1) {
    try {
      const XLSX = await getXLSX();
      // ✅ Export complet : un seul fichier XLSX (plusieurs onglets)
      const bureaux = await googleSheetsService.getData(SHEET_NAMES.BUREAUX);
      const candidats = await googleSheetsService.getData(SHEET_NAMES.CANDIDATS);
      
      const sheetNameParticipation = tour === 1 ? SHEET_NAMES.PARTICIPATION_T1 : SHEET_NAMES.PARTICIPATION_T2;
      const participation = await googleSheetsService.getData(sheetNameParticipation);
      
      const sheetNameResultats = tour === 1 ? SHEET_NAMES.RESULTATS_T1 : SHEET_NAMES.RESULTATS_T2;
      const resultats = await googleSheetsService.getData(sheetNameResultats);
      
      // Préparer les données (onglets)
      const wb = XLSX.utils.book_new();

      // 1) Participation (Tour)
      const partSheetRows = this._buildParticipationRows(participation, bureaux, tour);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(partSheetRows), `Participation T${tour}`);

      // 2) Résultats (Tour)
      const resSheetRows = this._buildResultatsRows(resultats, candidats, tour);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resSheetRows), `Résultats T${tour}`);
      
      // Exporter les bureaux
      const bureauxData = bureaux.map(b => ({
        'ID': b.id,
        'Nom': b.nom,
        'Adresse': b.adresse,
        'Inscrits': b.inscrits,
        'Actif': b.actif ? 'Oui' : 'Non'
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bureauxData), 'Bureaux');
      // Exporter les candidats
      // Colonne "Couleur" : rendu visuel (fond coloré) plutôt que valeur hexadécimale
      const candidatsData = candidats.map(c => ({
        'ID': c.listeId,
        'Liste': c.nomListe,
        'Tête de liste': `${c.teteListePrenom} ${c.teteListeNom}`.trim(),
        'Couleur': c.couleur,
        'Actif T1': c.actifT1 ? 'Oui' : 'Non',
        'Actif T2': c.actifT2 ? 'Oui' : 'Non'
      }));

      const wsCandidats = XLSX.utils.json_to_sheet(candidatsData);

      // Stylage de la colonne Couleur (D): on vide la valeur et on applique un fond coloré
      const toRGB = (hex) => {
        if (!hex) return null;
        let h = String(hex).trim();
        if (h.startsWith('#')) h = h.slice(1);
        if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
        if (h.length !== 6) return null;
        return ('FF' + h.toUpperCase()); // ARGB
      };

      for (let i = 0; i < candidatsData.length; i++) {
        const row = i + 2; // header = row 1
        const cellAddr = `D${row}`;
        const c = candidatsData[i];
        const rgb = toRGB(c?.Couleur);
        if (!wsCandidats[cellAddr]) wsCandidats[cellAddr] = { t: 's', v: '' };
        wsCandidats[cellAddr].t = 's';
        wsCandidats[cellAddr].v = ''; // pas d'hex affiché
        if (rgb) {
          wsCandidats[cellAddr].s = {
            fill: { patternType: 'solid', fgColor: { rgb } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: {
              top: { style: 'thin', color: { rgb: 'FFB0B0B0' } },
              bottom: { style: 'thin', color: { rgb: 'FFB0B0B0' } },
              left: { style: 'thin', color: { rgb: 'FFB0B0B0' } },
              right: { style: 'thin', color: { rgb: 'FFB0B0B0' } }
            }
          };
        }
      }

      // Largeur mini pour la colonne "Couleur"
      wsCandidats['!cols'] = wsCandidats['!cols'] || [];
      wsCandidats['!cols'][3] = wsCandidats['!cols'][3] || { wch: 10 };

      XLSX.utils.book_append_sheet(wb, wsCandidats, 'Candidats');
      // 5) Audit (si dispo)
      try {
        const auditData = auditService?.getAllLogs ? auditService.getAllLogs() : [];
        if (Array.isArray(auditData) && auditData.length) {
          const auditRows = auditData.map(a => {
            // Normalisation : éviter les doublons entre "Cible" et "Détails"
            const entity = a.entity || a.details?.entity || a.details?.Entity || '';
            const entityId = a.entityId || a.details?.entityId || a.details?.EntityId || '';
            const target = a.target || [entity, entityId].filter(Boolean).join(' / ') || '';

            const safeParse = (v) => {
              if (!v) return null;
              if (typeof v === 'object') return v;
              if (typeof v !== 'string') return null;
              const s = v.trim();
              if (!s) return null;
              if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
                try { return JSON.parse(s); } catch { return null; }
              }
              return null;
            };

            const beforeRaw = a.before ?? a.details?.before ?? a.details?.Before ?? '';
            const afterRaw = a.after ?? a.details?.after ?? a.details?.After ?? '';
            const ip = a.ip ?? a.details?.ip ?? '';
            const userAgent = a.userAgent ?? a.details?.userAgent ?? '';

            const beforeObj = safeParse(beforeRaw) || safeParse(asText(beforeRaw)) || null;
            const afterObj = safeParse(afterRaw) || safeParse(asText(afterRaw)) || null;

            const parts = [];
            if (beforeObj && afterObj && typeof beforeObj === 'object' && typeof afterObj === 'object') {
              const keys = Array.from(new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]));
              for (const k of keys) {
                const b = beforeObj[k];
                const a2 = afterObj[k];
                if (JSON.stringify(b) !== JSON.stringify(a2)) {
                  parts.push(`${k}: ${b ?? ''} → ${a2 ?? ''}`);
                }
              }
            } else {
              const btxt = typeof beforeRaw === 'string' ? beforeRaw : asText(beforeRaw);
              const atxt = typeof afterRaw === 'string' ? afterRaw : asText(afterRaw);
              if (btxt || atxt) parts.push(`changement`);
            }
            if (ip) parts.push(`IP: ${ip}`);
            if (userAgent) parts.push(`UA: ${userAgent}`);

            return {
              'Date': formatDateTime(a.timestamp || a.date),
              'Action': a.action || '',
              'Utilisateur': a.user || a.saisiPar || '',
              'Cible': target,
              'Détails': parts.join(' | '),
              'Sévérité': a.severity || 'INFO'
            };
          });
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(auditRows), 'Audit');
        }
      } catch (_) {
        // pas bloquant
      }

      // Télécharger
      const filename = generateFilename(`export_complet_tour${tour}`, 'xlsx');
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true });
      const blob = new Blob([wbout], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      // Pas de message de succès (uniquement en cas d'échec)
    } catch (error) {
      console.error('Erreur export complet:', error);
      throw error;
    }
  }

  /**
   * Construit les lignes "Participation" pour XLSX (09h -> 20h)
   * @priva  _buildParticipationRows(participation, bureaux = [], tour = 1) {
    // Gel Jour J : heures fixes 09h -> 20h (08h supprimé)
    const HOURS = ['09h','10h','11h','12h','13h','14h','15h','16h','17h','18h','19h','20h'];

    const toNum = (v) => {
      const s = String(v ?? '').replace(/\u202F/g, '').replace(/\u00A0/g, '').replace(/\s/g, '').replace(',', '.');
      const n = Number(s);
      return Number.isFinite(n) ? n : 0;
    };

    const getVotants = (p, hourLabel) => {
      // Supporte les 2 schémas : normalisé (votants09h) et headers Sheets (Votants09h)
      const hh = String(hourLabel).replace(/h/i, '').padStart(2, '0');
      const k1 = `votants${hh}h`;
      const k2 = `Votants${hh}h`;
      if (p && Object.prototype.hasOwnProperty.call(p, k1)) return toNum(p[k1]);
      if (p && Object.prototype.hasOwnProperty.call(p, k2)) return toNum(p[k2]);
      // Cas legacy (déjà "09h": valeur)
      if (p && Object.prototype.hasOwnProperty.call(p, hourLabel)) return toNum(p[hourLabel]);
      return 0;
    };

    const bureauxById = new Map((Array.isArray(bureaux) ? bureaux : []).map((b) => [b?.id ?? b?.ID ?? b?.bureauId ?? b?.BureauID, b]));

    return (Array.isArray(participation) ? participation : [])
      // ⚡ Exclure les lignes fantômes (bureau vide ou 0 inscrit)
      .filter((p) => {
        const bid = p?.bureauId ?? p?.BureauID ?? p?.Bureau ?? p?.bureau ?? '';
        const ins = toNum(p?.inscrits ?? p?.Inscrits);
        return bid !== '' && ins > 0;
      })
      .map((p) => {
      const bureauId = p?.bureauId ?? p?.BureauID ?? p?.Bureau ?? p?.bureau ?? '';
      const b = bureauxById.get(bureauId) || null;

      const inscrits = toNum(p?.inscrits ?? p?.Inscrits ?? b?.inscrits);

      const row = {
        'Bureau': bureauId,
        'Nom bureau': p?.bureauNom ?? p?.nom ?? b?.nom ?? '',
        'Inscrits': inscrits,
      };

      // Colonnes horaires (votants cumulés)
      for (const h of HOURS) {
        row[h] = getVotants(p, h);
      }

      // Dernier état = dernière heure renseignée (pas forcément 20h)
      let lastHour = '';
      let lastVotants = 0;
      for (const h of HOURS) {
        const v = getVotants(p, h);
        if (v > 0) {
          lastHour = h;
          lastVotants = v;
        }
      }
      // fallback: 20h (structure figée)
      if (!lastHour) {
        lastHour = '20h';
        lastVotants = getVotants(p, '20h');
      }

      row['Dernier état (votants)'] = lastVotants;
      row['Taux participation (%)'] = inscrits > 0 ? formatPercent(lastVotants / inscrits, 2) : formatPercent(0, 2);

      const toN = (v) => { const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
      const nuls     = toN(p?.nuls     ?? p?.Nuls);
      const blancs   = toN(p?.blancs   ?? p?.Blancs);
      const exprimes = toN(p?.exprimes ?? p?.Exprimes);
      row['Nuls']               = nuls;
      row['Taux nuls (%)']      = inscrits > 0 ? formatPercent(nuls     / inscrits, 2) : formatPercent(0, 2);
      row['Blancs']             = blancs;
      row['Taux blancs (%)']    = inscrits > 0 ? formatPercent(blancs   / inscrits, 2) : formatPercent(0, 2);
      row['Exprimés']           = exprimes;
      row['Taux exprimés (%)']  = inscrits > 0 ? formatPercent(exprimes / inscrits, 2) : formatPercent(0, 2);

      return row;
    });
  }


  _buildResultatsRows(resultats, candidats, tour = 1) {
    const toNum = (v) => {
      const s = String(v ?? '').replace(/\u202F/g, '').replace(/\u00A0/g, '').replace(/\s/g, '').replace(',', '.');
      const n = Number(s);
      return Number.isFinite(n) ? n : 0;
    };

    const cands = Array.isArray(candidats) ? candidats : [];

    // Détecter le format "par bureau" (avec voix objet) vs "flat"
    const isPerBureau = Array.isArray(resultats) && resultats.some(r => r && (typeof r.voix === 'object' || r.voixParCandidat || r.VoixParCandidat));

    if (isPerBureau) {
      return (Array.isArray(resultats) ? resultats : []).map((r) => {
        const row = {
          'Bureau': r?.bureauId ?? r?.BureauID ?? r?.Bureau ?? r?.bureau ?? '',
          'Inscrits': toNum(r?.inscrits ?? r?.Inscrits),
          'Votants': toNum(r?.votants ?? r?.Votants),
          'Blancs': toNum(r?.blancs ?? r?.Blancs),
          'Nuls': toNum(r?.nuls ?? r?.Nuls),
          'Exprimés': toNum(r?.exprimes ?? r?.Exprimes),
          'Saisi par': r?.saisiPar ?? r?.SaisiPar ?? '',
          'Validé par': r?.validePar ?? r?.ValidePar ?? '',
          'Horodatage': formatDateTime(r?.timestamp ?? r?.Timestamp ?? r?.date ?? new Date().toISOString()),
        };

        const voixMap = r?.voix || r?.voixParCandidat || r?.VoixParCandidat || {};
        // Colonnes par candidat : on utilise le nom de liste (plus lisible) et on garde l'ID en préfixe
        for (const c of cands) {
          const id = c?.listeId ?? c?.ListeID ?? c?.id;
          const label = c?.nomListe ?? c?.NomListe ?? id;
          const col = `${id} — ${label}`;
          row[col] = toNum(voixMap?.[id] ?? voixMap?.[label] ?? r?.[id] ?? r?.[label] ?? 0);
        }

        return row;
      });
    }

    // Format "flat" (une ligne = une liste/candidat)
    return (Array.isArray(resultats) ? resultats : []).map((r) => {
      const id = r?.listeId ?? r?.ListeID ?? '';
      const cand = cands.find(c => (c?.listeId ?? c?.ListeID) === id);
      const label = cand ? cand.nomListe : (r?.liste ?? r?.Liste ?? id);

      return {
        'ListeID': id,
        'Liste': label,
        'Voix': toNum(r?.voix ?? r?.Voix),
        'Pourcentage': (r?.pourcentage !== undefined || r?.Pourcentage !== undefined)
          ? formatPercent(toNum(r?.pourcentage ?? r?.Pourcentage), 2)
          : '',
        'Bureau': r?.bureauId ?? r?.BureauID ?? r?.Bureau ?? r?.bureau ?? '',
        'Horodatage': formatDateTime(r?.timestamp ?? r?.Timestamp ?? r?.date ?? new Date().toISOString()),
      };
    });
  }
});
  }

  /**
   * Génère un PV de résultats en HTML (pour impression/PDF)
   */
  generatePVHTML(resultats, candidats, tour = 1) {
    const date = new Date();
    const consolidation = this.consolidateResults(resultats, candidats);

    return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Procès-Verbal - Élections Municipales ${ELECTION_CONFIG.COMMUNE_NAME} - Tour ${tour}</title>
  <style>
    body {
      font-family: 'Times New Roman', serif;
      margin: 40px;
      color: #000;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
      border-bottom: 2px solid #0055A4;
      padding-bottom: 20px;
    }
    h1 {
      color: #0055A4;
      margin: 0;
    }
    .info {
      margin: 20px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th, td {
      border: 1px solid #333;
      padding: 8px;
      text-align: left;
    }
    th {
      background-color: #0055A4;
      color: white;
    }
    .total {
      font-weight: bold;
      background-color: #f0f0f0;
    }
    .signature {
      margin-top: 60px;
      display: flex;
      justify-content: space-between;
    }
    .signature-block {
      width: 40%;
    }
    @media print {
      body { margin: 20px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>RÉPUBLIQUE FRANÇAISE</h1>
    <h2>Procès-Verbal - Élections Municipales</h2>
    <h3>${ELECTION_CONFIG.COMMUNE_NAME} (${ELECTION_CONFIG.COMMUNE_CODE})</h3>
    <h3>${tour === 1 ? '1er Tour' : '2nd Tour'} - ${formatDateFR(ELECTION_CONFIG[tour === 1 ? 'ELECTION_DATE_T1' : 'ELECTION_DATE_T2'])}</h3>
  </div>

  <div class="info">
    <p><strong>Date d'édition:</strong> ${formatDateTime(date.toISOString())}</p>
    <p><strong>Nombre de bureaux:</strong> ${resultats.length}</p>
  </div>

  <h3>Résultats de la Participation</h3>
  <table>
    <tr>
      <th>Inscrits</th>
      <th>Votants</th>
      <th>Taux participation</th>
      <th>Blancs</th>
      <th>Taux blancs</th>
      <th>Nuls</th>
      <th>Taux nuls</th>
      <th>Exprimés</th>
      <th>Taux exprimés</th>
      <th>Procurations</th>
      <th>Taux procurations</th>
    </tr>
    <tr class="total">
      <td>${formatNumber(consolidation.totalInscrits)}</td>
      <td>${formatNumber(consolidation.totalVotants)}</td>
      <td>${formatPercent(consolidation.tauxParticipation)}</td>
      <td>${formatNumber(consolidation.totalBlancs)}</td>
      <td>${formatPercent(consolidation.totalInscrits > 0 ? (consolidation.totalBlancs / consolidation.totalInscrits) * 100 : 0)}</td>
      <td>${formatNumber(consolidation.totalNuls)}</td>
      <td>${formatPercent(consolidation.totalInscrits > 0 ? (consolidation.totalNuls / consolidation.totalInscrits) * 100 : 0)}</td>
      <td>${formatNumber(consolidation.totalExprimes)}</td>
      <td>${formatPercent(consolidation.totalInscrits > 0 ? (consolidation.totalExprimes / consolidation.totalInscrits) * 100 : 0)}</td>
      <td>${formatNumber(consolidation.totalProcurations ?? 0)}</td>
      <td>${formatPercent(consolidation.totalVotants > 0 ? ((consolidation.totalProcurations ?? 0) / consolidation.totalVotants) * 100 : 0)}</td>
    </tr>
  </table>

  <h3>Résultats par Liste</h3>
  <table>
    <tr>
      <th>Rang</th>
      <th>Liste</th>
      <th>Voix</th>
      <th>% Exprimés</th>
      <th>% Inscrits</th>
    </tr>
    ${consolidation.resultatsParListe.map((r, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${r.nomListe}</td>
      <td>${formatNumber(r.voix)}</td>
      <td>${formatPercent(r.pctExprimes)}</td>
      <td>${formatPercent(r.pctInscrits)}</td>
    </tr>
    `).join('')}
  </table>

  <div class="signature">
    <div class="signature-block">
      <p>Le Président,</p>
      <br><br><br>
      <p>Signature:</p>
    </div>
    <div class="signature-block">
      <p>Le Secrétaire,</p>
      <br><br><br>
      <p>Signature:</p>
    </div>
  </div>

  <button class="no-print" onclick="window.print()">Imprimer</button>
</body>
</html>
    `;
  }

  /**
   * Consolide les résultats pour génération de PV
   */
  consolidateResults(resultats, candidats) {
    let totalInscrits = 0;
    let totalVotants = 0;
    let totalBlancs = 0;
    let totalNuls = 0;
    let totalExprimes = 0;
    let totalProcurations = 0;

    const voixParListe = {};
    candidats.forEach(c => {
      voixParListe[c.listeId] = { ...c, voix: 0 };
    });

    resultats.forEach(r => {
      if (r.bureauId === 'TOTAL') return;
      
      totalInscrits += r.inscrits;
      totalVotants += r.votants;
      totalBlancs += r.blancs;
      totalNuls += r.nuls;
      totalExprimes += r.exprimes;
      totalProcurations += Number(r.procurations ?? 0);

      for (const listeId in voixParListe) {
        voixParListe[listeId].voix += r.voix[listeId] || 0;
      }
    });

    const resultatsParListe = Object.values(voixParListe).map(l => ({
      listeId: l.listeId,
      nomListe: l.nomListe,
      voix: l.voix,
      pctExprimes: totalExprimes > 0 ? (l.voix / totalExprimes) * 100 : 0,
      pctInscrits: totalInscrits > 0 ? (l.voix / totalInscrits) * 100 : 0
    })).sort((a, b) => b.voix - a.voix);

    return {
      totalInscrits,
      totalVotants,
      totalBlancs,
      totalNuls,
      totalExprimes,
      totalProcurations,
      tauxParticipation: totalInscrits > 0 ? (totalVotants / totalInscrits) * 100 : 0,
      resultatsParListe
    };
  }

  /**
   * Ouvre le PV dans une nouvelle fenêtre pour impression
   */
  async openPVForPrint(resultats, candidats, tour = 1) {
    const html = this.generatePVHTML(resultats, candidats, tour);
    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
    
    auditService.logExport('PV_HTML', `tour${tour}`, { bureaux: resultats.length });
  }

  /**
   * Ouvre la participation dans une nouvelle fenêtre pour impression
   */
  async openParticipationForPrint(participation, bureaux, tour = 1) {
    const html = this.generateParticipationHTML(participation, bureaux, tour);
    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
    
    auditService.logExport('PARTICIPATION_PDF', `tour${tour}`, { lignes: (Array.isArray(participation) ? participation : []).length });
  }

  /**
   * Ouvre les statistiques dans une nouvelle fenêtre pour impression
   */
  async openStatistiquesForPrint(resultats, candidats, bureaux, tour = 1) {
    const html = this.generateStatistiquesHTML(resultats, candidats, bureaux, tour);
    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
    
    auditService.logExport('STATS_PDF', `tour${tour}`, { bureaux: bureaux.length });
  }

  /**
   * Génère le HTML de participation pour impression
   */
  generateParticipationHTML(participation, bureaux, tour = 1) {
    const date = new Date();

    // PV Participation : structure figée 09h -> 20h (Jour J)
    const HOURS = ['09h','10h','11h','12h','13h','14h','15h','16h','17h','18h','19h','20h'];

    const getNumeric = (v) => {
      const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
      return Number.isFinite(n) ? n : 0;
    };

    const getVotantsForHour = (obj, hourLabel) => {
      const hh = String(hourLabel || '').replace(/h/i, '').padStart(2, '0');
      const keyNorm = `votants${hh}h`;     // ex: votants09h
      const keySheet = `Votants${hh}h`;    // ex: Votants09h
      if (obj && Object.prototype.hasOwnProperty.call(obj, keyNorm)) return getNumeric(obj[keyNorm]);
      if (obj && Object.prototype.hasOwnProperty.call(obj, keySheet)) return getNumeric(obj[keySheet]);
      return 0;
    };

    const getLastHour = (obj) => {
      // Si une heure explicite existe déjà (compat ancien schéma), on la respecte
      const explicit = obj?.heure || obj?.Heure;
      if (explicit && HOURS.includes(String(explicit))) return String(explicit);

      // Sinon, on prend la dernière heure avec une valeur > 0
      let last = '';
      for (const h of HOURS) {
        const v = getVotantsForHour(obj, h);
        if (v > 0) last = h;
      }
      // Si tout est à 0, on retombe sur la dernière heure officielle (20h)
      return last || '20h';
    };

    // ⚡ Exclure les lignes fantômes (bureau vide ou 0 inscrit)
    const validParticipation = (Array.isArray(participation) ? participation : []).filter((p) => {
      const bureau = p?.bureauId || p?.BureauID || p?.Bureau || p?.bureau || '';
      const inscrits = getNumeric(p?.inscrits ?? p?.Inscrits);
      return bureau !== '' && inscrits > 0;
    });

    // Calculer les totaux (sur la dernière heure disponible par bureau)
    let totalInscrits = 0;
    let totalVotants = 0;
    let totalNuls = 0;
    let totalBlancs = 0;
    let totalExprimes = 0;

    validParticipation.forEach((p) => {
      const inscrits = getNumeric(p?.inscrits);
      const lastHour = getLastHour(p);
      const votants = getVotantsForHour(p, lastHour);

      totalInscrits  += inscrits;
      totalVotants   += votants;
      totalNuls      += getNumeric(p?.nuls    ?? p?.Nuls);
      totalBlancs    += getNumeric(p?.blancs  ?? p?.Blancs);
      totalExprimes  += getNumeric(p?.exprimes ?? p?.Exprimes);
    });

    const tauxGlobal = totalInscrits > 0 ? (totalVotants / totalInscrits) * 100 : 0;

    return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Participation - Élections Municipales ${ELECTION_CONFIG.COMMUNE_NAME} - Tour ${tour}</title>
  <style>
    body {
      font-family: 'Times New Roman', serif;
      margin: 40px;
      color: #000;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
      border-bottom: 2px solid #0055A4;
      padding-bottom: 20px;
    }
    h1 { color: #0055A4; margin: 0; }
    .info { margin: 20px 0; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th, td {
      border: 1px solid #333;
      padding: 8px;
      text-align: left;
    }
    th {
      background-color: #0055A4;
      color: white;
    }
    .total {
      font-weight: bold;
      background-color: #f0f0f0;
    }
    @media print {
      body { margin: 20px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>RÉPUBLIQUE FRANÇAISE</h1>
    <h2>Participation - Élections Municipales</h2>
    <h3>${ELECTION_CONFIG.COMMUNE_NAME} (${ELECTION_CONFIG.COMMUNE_CODE})</h3>
    <h3>${tour === 1 ? '1er Tour' : '2nd Tour'} - ${formatDateFR(ELECTION_CONFIG[tour === 1 ? 'ELECTION_DATE_T1' : 'ELECTION_DATE_T2'])}</h3>
  </div>

  <div class="info">
    <p><strong>Date d'édition:</strong> ${formatDateTime(date.toISOString())}</p>
    <p><strong>Inscrits totaux:</strong> ${formatNumber(totalInscrits)}</p>
    <p><strong>Votants totaux:</strong> ${formatNumber(totalVotants)}</p>
    <p><strong>Taux de participation:</strong> ${tauxGlobal.toFixed(2)}%</p>
  </div>

  <h3>Détail par Bureau</h3>
  <table>
    <tr>
      <th>Bureau</th>
      <th>Inscrits</th>
      <th>Votants</th>
      <th>Taux participation (%)</th>
      <th>Nuls</th>
      <th>Taux nuls (%)</th>
      <th>Blancs</th>
      <th>Taux blancs (%)</th>
      <th>Exprimés</th>
      <th>Taux exprimés (%)</th>
    </tr>
    ${validParticipation.map(p => {
      const inscrits = getNumeric(p?.inscrits);
      const heure = getLastHour(p);
      const votants = getVotantsForHour(p, heure);
      const taux       = inscrits > 0 ? (votants   / inscrits) * 100 : 0;
      const nuls       = getNumeric(p?.nuls    ?? p?.Nuls);
      const blancs     = getNumeric(p?.blancs  ?? p?.Blancs);
      const exprimes   = getNumeric(p?.exprimes ?? p?.Exprimes);
      const tauxNuls   = inscrits > 0 ? (nuls     / inscrits) * 100 : 0;
      const tauxBlancs = inscrits > 0 ? (blancs   / inscrits) * 100 : 0;
      const tauxExp    = inscrits > 0 ? (exprimes / inscrits) * 100 : 0;
      return `
    <tr>
      <td>${p?.bureauId || ''}</td>
      <td>${formatNumber(inscrits)}</td>
      <td>${formatNumber(votants)}</td>
      <td>${taux.toFixed(2)}%</td>
      <td>${formatNumber(nuls)}</td>
      <td>${tauxNuls.toFixed(2)}%</td>
      <td>${formatNumber(blancs)}</td>
      <td>${tauxBlancs.toFixed(2)}%</td>
      <td>${formatNumber(exprimes)}</td>
      <td>${tauxExp.toFixed(2)}%</td>
    </tr>
      `;
    }).join('')}
    <tr class="total">
      <td>TOTAL</td>
      <td>${formatNumber(totalInscrits)}</td>
      <td>${formatNumber(totalVotants)}</td>
      <td>${tauxGlobal.toFixed(2)}%</td>
      <td>${formatNumber(totalNuls)}</td>
      <td>${totalInscrits > 0 ? ((totalNuls/totalInscrits)*100).toFixed(2) : '0.00'}%</td>
      <td>${formatNumber(totalBlancs)}</td>
      <td>${totalInscrits > 0 ? ((totalBlancs/totalInscrits)*100).toFixed(2) : '0.00'}%</td>
      <td>${formatNumber(totalExprimes)}</td>
      <td>${totalInscrits > 0 ? ((totalExprimes/totalInscrits)*100).toFixed(2) : '0.00'}%</td>
    </tr>
  </table>

  <button class="no-print" onclick="window.print()">Imprimer</button>
</body>
</html>
    `;
  }

  /**
   * Génère le HTML de statistiques pour impression
   */
  generateStatistiquesHTML(resultats, candidats, bureaux, tour = 1) {
    const date = new Date();
    const consolidation = this.consolidateResults(resultats, candidats);
    
    return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Statistiques - Élections Municipales ${ELECTION_CONFIG.COMMUNE_NAME} - Tour ${tour}</title>
  <style>
    body {
      font-family: 'Times New Roman', serif;
      margin: 40px;
      color: #000;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
      border-bottom: 2px solid #0055A4;
      padding-bottom: 20px;
    }
    h1 { color: #0055A4; margin: 0; }
    .info { margin: 20px 0; }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
      margin: 20px 0;
    }
    .stat-box {
      border: 1px solid #333;
      padding: 15px;
      background: #f9f9f9;
    }
    .stat-value {
      font-size: 24px;
      font-weight: bold;
      color: #0055A4;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th, td {
      border: 1px solid #333;
      padding: 8px;
      text-align: left;
    }
    th {
      background-color: #0055A4;
      color: white;
    }
    @media print {
      body { margin: 20px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>RÉPUBLIQUE FRANÇAISE</h1>
    <h2>Statistiques - Élections Municipales</h2>
    <h3>${ELECTION_CONFIG.COMMUNE_NAME} (${ELECTION_CONFIG.COMMUNE_CODE})</h3>
    <h3>${tour === 1 ? '1er Tour' : '2nd Tour'} - ${formatDateFR(ELECTION_CONFIG[tour === 1 ? 'ELECTION_DATE_T1' : 'ELECTION_DATE_T2'])}</h3>
  </div>

  <div class="info">
    <p><strong>Date d'édition:</strong> ${formatDateTime(date.toISOString())}</p>
    <p><strong>Nombre de bureaux:</strong> ${bureaux.length}</p>
  </div>

  <h3>Chiffres Clés</h3>
  <div class="stats-grid">
    <div class="stat-box">
      <div>Inscrits</div>
      <div class="stat-value">${formatNumber(consolidation.totalInscrits)}</div>
    </div>
    <div class="stat-box">
      <div>Votants</div>
      <div class="stat-value">${formatNumber(consolidation.totalVotants)}</div>
    </div>
    <div class="stat-box">
      <div>Taux de Participation</div>
      <div class="stat-value">${formatPercent(consolidation.tauxParticipation)}</div>
    </div>
    <div class="stat-box">
      <div>Suffrages Exprimés</div>
      <div class="stat-value">${formatNumber(consolidation.totalExprimes)}</div>
    </div>
    <div class="stat-box">
      <div>Bulletins Blancs</div>
      <div class="stat-value">${formatNumber(consolidation.totalBlancs)}</div>
    </div>
    <div class="stat-box">
      <div>Bulletins Nuls</div>
      <div class="stat-value">${formatNumber(consolidation.totalNuls)}</div>
    </div>
  </div>

  <h3>Résultats par Liste</h3>
  <table>
    <tr>
      <th>Rang</th>
      <th>Liste</th>
      <th>Voix</th>
      <th>% Exprimés</th>
      <th>% Inscrits</th>
    </tr>
    ${consolidation.resultatsParListe.map((r, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${r.nomListe}</td>
      <td>${formatNumber(r.voix)}</td>
      <td>${formatPercent(r.pctExprimes)}</td>
      <td>${formatPercent(r.pctInscrits)}</td>
    </tr>
    `).join('')}
  </table>

  <button class="no-print" onclick="window.print()">Imprimer</button>
</body>
</html>
    `;
  }


  // ---------------------------------------------------------------------------
  // Helpers export XLSX (structure figée Jour J) — Participation & Résultats
  // ---------------------------------------------------------------------------

  /**
   * Heures figées pour le scrutin (Jour J) : 09h → 20h
   * (08h volontairement exclu)
   */
  _getFixedHours() {
    return ['09h','10h','11h','12h','13h','14h','15h','16h','17h','18h','19h','20h'];
  }

  /**
   * Lecture robuste d'une valeur de votants pour une heure donnée.
   * Supporte plusieurs schémas :
   * - normalisé : votants09h
   * - en-tête brut : Votants09h
   * - map : votants['09h'] / votantsParHeure['09h']
   * - clé directe : '09h'
   */
  _getVotantsAtHour(obj, hourLabel) {
    if (!obj) return 0;
    const hh = String(hourLabel || '').replace('h', '');
    const keyNorm = `votants${hh}h`;      // votants09h
    const keyNorm2 = `votants${hh}`;      // votants09 (au cas où)
    const keyHeader = `Votants${hh}h`;    // Votants09h
    const keyHeader2 = `Votants${hh}`;    // Votants09

    const candidates = [
      obj[keyNorm],
      obj[keyNorm2],
      obj[keyHeader],
      obj[keyHeader2],
      obj[hourLabel],                      // '09h'
      obj[String(hourLabel).replace('h','')], // '09'
      obj?.votants?.[hourLabel],
      obj?.votantsParHeure?.[hourLabel],
      obj?.participation?.[hourLabel],
    ];

    for (const v of candidates) {
      const n = typeof v === 'string' ? parseInt(v.replace(/\s|\u202f/g, ''), 10) : Number(v);
      if (!Number.isNaN(n) && Number.isFinite(n)) return n;
    }
    return 0;
  }

  /**
   * Construit les lignes de l'onglet "Participation T{tour}" pour l'export complet.
   * Colonnes :
   * Bureau | Nom bureau | Inscrits | 09h..20h | Dernier état (votants) | Taux dernier état
   */
  _buildParticipationRows(participationRows, bureauxRows, tour) {
    const hours = this._getFixedHours();

    // map bureaux: id -> nom
    const bureauNameById = new Map();
    (bureauxRows || []).forEach(b => {
      const id = b?.id || b?.ID || b?.bureauId || b?.BureauID || '';
      const nom = b?.nom || b?.Nom || b?.nomBureau || b?.['Nom bureau'] || '';
      if (id) bureauNameById.set(String(id), String(nom || ''));
    });

    return (participationRows || []).map(p => {
      const bureauId = p?.bureauId || p?.BureauID || p?.bureau || p?.id || p?.ID || '';
      const inscritsRaw = p?.inscrits ?? p?.Inscrits ?? 0;
      const inscrits = typeof inscritsRaw === 'string' ? parseInt(inscritsRaw.replace(/\s|\u202f/g, ''), 10) : Number(inscritsRaw) || 0;

      // heures
      const hourVals = {};
      let lastHour = null;
      let lastVotants = 0;

      for (const h of hours) {
        const v = this._getVotantsAtHour(p, h);
        hourVals[h] = v;
        if (v > 0) {
          lastHour = h;
          lastVotants = v;
        }
      }

      const taux = inscrits > 0 ? (lastVotants / inscrits) * 100 : 0;

      // Nuls, blancs, exprimés depuis la ligne participation (si présents)
      const toN2 = (v) => { const n = Number(String(v ?? '').replace(/[   ]/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
      const nuls2     = toN2(p?.nuls     ?? p?.Nuls);
      const blancs2   = toN2(p?.blancs   ?? p?.Blancs);
      const exprimes2 = toN2(p?.exprimes ?? p?.Exprimes);

      return {
        'Bureau': bureauId,
        'Nom bureau': bureauNameById.get(String(bureauId)) || '',
        'Inscrits': inscrits,
        ...hourVals,
        'Dernier état (votants)': lastVotants,
        'Taux participation (%)': Math.round(taux * 100) / 100,
        'Nuls': nuls2,
        'Taux nuls (%)': inscrits > 0 ? Math.round((nuls2 / inscrits) * 10000) / 100 : 0,
        'Blancs': blancs2,
        'Taux blancs (%)': inscrits > 0 ? Math.round((blancs2 / inscrits) * 10000) / 100 : 0,
        'Exprimés': exprimes2,
        'Taux exprimés (%)': inscrits > 0 ? Math.round((exprimes2 / inscrits) * 10000) / 100 : 0,
      };
    });
  }

  /**
   * Construit les lignes de l'onglet "Résultats T{tour}" pour l'export complet.
   * On exporte 1 ligne par bureau, avec :
   * Bureau | Nom bureau | Inscrits | Votants | Blancs | Nuls | Exprimés | L1 — NomListe | L2 — ...
   */
  _buildResultatsRows(resultatsRows, candidatsRows, tour) {
    const candidats = (candidatsRows || [])
      .filter(c => (tour === 1 ? (c?.actifT1 ?? c?.ActifT1) : (c?.actifT2 ?? c?.ActifT2)) !== false)
      .sort((a, b) => (Number(a?.ordre ?? a?.Ordre ?? 0) - Number(b?.ordre ?? b?.Ordre ?? 0)));

    const colDefs = candidats.map(c => {
      const listeId = c?.listeId || c?.ListeID || c?.id || '';
      const nomListe = c?.nomListe || c?.NomListe || '';
      return { listeId: String(listeId), col: `${String(listeId)} — ${String(nomListe || '').trim()}`.trim() };
    });

    return (resultatsRows || []).map(r => {
      const bureauId = r?.bureauId || r?.BureauID || r?.bureau || r?.id || r?.ID || '';
      const inscrits = Number(r?.inscrits ?? r?.Inscrits ?? 0) || 0;
      const votants = Number(r?.votants ?? r?.Votants ?? 0) || 0;
      const blancs = Number(r?.blancs ?? r?.Blancs ?? 0) || 0;
      const nuls = Number(r?.nuls ?? r?.Nuls ?? 0) || 0;
      const exprimes = Number(r?.exprimes ?? r?.Exprimes ?? 0) || 0;

      const voixObj = r?.voix || r?.Voix || {};
      const out = {
        'Bureau': bureauId,
        'Inscrits': inscrits,
        'Votants': votants,
        'Blancs': blancs,
        'Nuls': nuls,
        'Exprimés': exprimes,
      };

      for (const { listeId, col } of colDefs) {
        const v = voixObj?.[listeId] ?? voixObj?.[String(listeId).toUpperCase()] ?? r?.[`${listeId}_Voix`] ?? r?.[`${listeId}Voix`] ?? 0;
        out[col] = Number(v) || 0;
      }

      // Métadonnées (si présentes)
      if (r?.timestamp || r?.Timestamp) out['Horodatage'] = r?.timestamp || r?.Timestamp;
      if (r?.saisiPar || r?.SaisiPar) out['Saisi par'] = r?.saisiPar || r?.SaisiPar;
      if (r?.validePar || r?.ValidePar) out['Validé par'] = r?.validePar || r?.ValidePar;

      return out;
    });
  }


  
  /**
   * Calcule (ou recalcule) la répartition des sièges à partir des tableaux Google Sheets
   * - Municipal : Seats_Municipal (filtré par tour)
   * - Communautaire : Seats_Community
   * Important : on ne dépend PAS d'un état "bouton calculer" côté UI.
   * Si les voix consolidées sont présentes dans Sheets, l'export doit fonctionner.
   */
  async getSiegesCalcules(tour = 1) {
    const t = Number(tour) || 1;

    // 1) Source principale : tables dédiées dans Sheets
    const [seatsMunicipalRaw, seatsCommunityRaw] = await Promise.all([
      googleSheetsService.getData(SHEET_NAMES.SEATS_MUNICIPAL),
      googleSheetsService.getData(SHEET_NAMES.SEATS_COMMUNITY)
    ]);

    // Normalisation Seats_Municipal (par tour)
    let seatsMunicipalRows = (Array.isArray(seatsMunicipalRaw) ? seatsMunicipalRaw : [])
      .filter(r => Number(r?.tour ?? r?.Tour ?? 0) === t)
      .filter(r => (r?.nomListe || r?.NomListe || r?.listeId || r?.ListeID))
      .map(r => ({
        listeId: (r.listeId || r.ListeID || '').toString().trim(),
        nomListe: (r.nomListe || r.NomListe || r.listeId || r.ListeID || '—').toString().trim(),
        voix: Number(r.voix ?? r.Voix ?? r.voixMunicipal ?? r.VoixMunicipal ?? 0) || 0,
        pctVoix: Number(r.pctVoix ?? r.PctVoix ?? r.pourcentage ?? 0),
        eligible: typeof r.eligible === 'boolean' ? r.eligible : String(r.Eligible ?? '').toUpperCase() === 'TRUE',
      }))
      .filter(r => r.listeId && r.nomListe);

    // Normalisation Seats_Community (pas forcément par tour)
    let seatsCommunityRows = (Array.isArray(seatsCommunityRaw) ? seatsCommunityRaw : [])
      .filter(r => (r?.nomListe || r?.NomListe || r?.listeId || r?.ListeID))
      .map(r => ({
        listeId: (r.listeId || r.ListeID || '').toString().trim(),
        nomListe: (r.nomListe || r.NomListe || r.listeId || r.ListeID || '—').toString().trim(),
        voix: Number(r.voixMunicipal ?? r.VoixMunicipal ?? r.voix ?? r.Voix ?? 0) || 0,
        pctVoix: Number(r.pctMunicipal ?? r.PctMunicipal ?? r.pctVoix ?? r.PctVoix ?? r.pourcentage ?? 0),
        eligible: typeof r.eligible === 'boolean' ? r.eligible : String(r.Eligible ?? '').toUpperCase() === 'TRUE',
      }))
      .filter(r => r.listeId && r.nomListe);

    // 2) CALCUL DE REPLI : Si Seats_* vides, consolider depuis Resultats + Candidats
    if (seatsMunicipalRows.length === 0 || seatsCommunityRows.length === 0) {
      const sheetNameResultats = t === 1 ? SHEET_NAMES.RESULTATS_T1 : SHEET_NAMES.RESULTATS_T2;
      
      const [resultats, candidats] = await Promise.all([
        googleSheetsService.getData(sheetNameResultats),
        googleSheetsService.getData(SHEET_NAMES.CANDIDATS)
      ]);

      if (resultats && candidats && resultats.length > 0 && candidats.length > 0) {
        // Filtrer les candidats actifs au tour
        const candidatsActifs = candidats.filter(c => t === 1 ? c.actifT1 : c.actifT2);

        if (candidatsActifs.length > 0) {
          // Consolider les voix par candidat
          const listesConsolidees = candidatsActifs.map(candidat => {
            const listeId = candidat.listeId || candidat.ListeID || '';
            const nomListe = candidat.nomListe || candidat.NomListe || listeId;

            // Somme des voix pour cette liste sur tous les bureaux
            const totalVoix = resultats.reduce((sum, bureau) => {
              const voixObj = bureau.voix || {};
              const voix = Number(voixObj[listeId]) || 0;
              return sum + voix;
            }, 0);

            return {
              listeId,
              nomListe,
              voix: totalVoix,
              eligible: true
            };
          });

          // Si Seats_Municipal vide, utiliser les listes consolidées
          if (seatsMunicipalRows.length === 0) {
            seatsMunicipalRows = listesConsolidees;
          }

          // Si Seats_Community vide, utiliser les listes consolidées (avec voixMunicipal)
          if (seatsCommunityRows.length === 0) {
            seatsCommunityRows = listesConsolidees.map(l => ({
              ...l,
              voixMunicipal: l.voix,
              pctMunicipal: l.pctVoix
            }));
          }
        }
      }
    }

    // 3) Calcul métier (on ne fait confiance qu'aux voix + %)
    const totalMunicipal = Number(ELECTION_CONFIG.SEATS_MUNICIPAL_TOTAL) || 35;
    const totalCommunity = Number(ELECTION_CONFIG.SEATS_COMMUNITY_TOTAL) || 6;

    const municipal = calculService
      .calculerSiegesMunicipauxDepuisListes(
        seatsMunicipalRows.map(r => ({
          listeId: r.listeId,
          nomListe: r.nomListe,
          voix: r.voix,
          pctVoix: Number.isFinite(r.pctVoix) ? r.pctVoix : null,
          eligible: r.eligible
        })),
        totalMunicipal
      )
      .map(r => ({
        ...r,
        nomListe: r.nom || r.nomListe || '—',
        pctVoix: Number(r.pourcentage ?? r.pctVoix ?? 0) || 0
      }));

    const communautaire = calculService
      .calculerSiegesCommunautairesDepuisListes(
        seatsCommunityRows.map(r => ({
          listeId: r.listeId,
          nomListe: r.nomListe,
          voixMunicipal: r.voix || r.voixMunicipal,
          pctMunicipal: Number.isFinite(r.pctVoix || r.pctMunicipal) ? (r.pctVoix || r.pctMunicipal) : null,
          eligible: r.eligible
        })),
        totalCommunity
      )
      .map(r => ({
        ...r,
        nomListe: r.nom || r.nomListe || '—',
        pctMunicipal: Number(r.pourcentage ?? r.pctMunicipal ?? r.pctVoix ?? 0) || 0
      }));

    if ((!municipal || municipal.length === 0) && (!communautaire || communautaire.length === 0)) {
      throw new Error("Sièges : données insuffisantes pour exporter (tables Seats_* vides ou non renseignées).");
    }

    return { municipal, communautaire };
  }

  /**
   * Export Excel (XLSX) des sièges
   * - 1 fichier, 1 ou 2 feuilles selon disponibilité
   */
  async exportSiegesXLSX(municipal = [], communautaire = [], tour = 1, options = {}) {
    const XLSX = await getXLSX();
    const only = options?.only || 'all';

    const wb = XLSX.utils.book_new();

    if (only === 'all' || only === 'municipal') {
      const rowsMunicipal = (Array.isArray(municipal) ? municipal : []).map(r => ({
        'Liste': r.nomListe || r.nom || '—',
        'Voix': Number(r.voix ?? 0) || 0,
        '%': Number(r.pourcentage ?? r.pctVoix ?? 0) || 0,
        'Prime': Number(r.siegesPrime ?? 0) || 0,
        'Prop.': Number(r.siegesProportionnels ?? 0) || 0,
        'Total sièges': Number(r.sieges ?? 0) || 0,
        'Méthode': r.methode || (Number(r.siegesPrime ?? 0) > 0 ? `Prime (${r.siegesPrime}) + Proportionnelle (${r.siegesProportionnels ?? 0})` : `Proportionnelle (${r.siegesProportionnels ?? 0})`),
        'Éligible (>=5%)': r.eligible ? 'Oui' : 'Non'
      }));

      if (rowsMunicipal.length > 0) {
        const wsM = XLSX.utils.json_to_sheet(rowsMunicipal);
        XLSX.utils.book_append_sheet(wb, wsM, `Municipal_T${Number(tour) || 1}`);
      }
    }

    if (only === 'all' || only === 'communautaire') {
      const rowsComm = (Array.isArray(communautaire) ? communautaire : []).map(r => ({
        'Liste': r.nomListe || r.nom || '—',
        'Voix': Number(r.voixMunicipal ?? r.voix ?? 0) || 0,
        '%': Number(r.pourcentage ?? r.pctMunicipal ?? r.pctVoix ?? 0) || 0,
        'Prime': Number(r.siegesPrime ?? 0) || 0,
        'Prop.': Number(r.siegesProportionnels ?? 0) || 0,
        'Total sièges': Number(r.sieges ?? 0) || 0,
        'Méthode': r.methode || (Number(r.siegesPrime ?? 0) > 0 ? `Prime (${r.siegesPrime}) + Proportionnelle (${r.siegesProportionnels ?? 0})` : `Proportionnelle (${r.siegesProportionnels ?? 0})`),
        'Éligible (>=5%)': r.eligible ? 'Oui' : 'Non'
      }));

      if (rowsComm.length > 0) {
        const wsC = XLSX.utils.json_to_sheet(rowsComm);
        XLSX.utils.book_append_sheet(wb, wsC, `Communautaire_T${Number(tour) || 1}`);
      }
    }

    if (!wb.SheetNames || wb.SheetNames.length === 0) {
      throw new Error("Sièges : rien à exporter (aucune feuille générée).");
    }

    const filename = generateFilename(`sieges_tour${Number(tour) || 1}`, 'xlsx');
    this.exportToXLSX(wb, filename);

    // Audit non bloquant
    if (typeof auditService?.logExport === 'function') {
      try {
        await auditService.logExport('sieges', 'XLSX', { tour: Number(tour) || 1 });
      } catch (e) {
        console.warn('Audit export sièges XLSX non bloquant :', e);
      }
    }
  }

  /**
   * Ouvre les sièges dans une nouvelle fenêtre pour impression (PDF via l'imprimante du navigateur)
   */
  async openSiegesForPrint(municipal = [], communautaire = [], tour = 1) {
    const html = this.generateSiegesHTML(municipal, communautaire, tour);
    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();

    // Audit non bloquant
    if (typeof auditService?.logExport === 'function') {
      try {
        await auditService.logExport('sieges', 'PDF_HTML', { tour: Number(tour) || 1 });
      } catch (e) {
        console.warn('Audit export sièges PDF non bloquant :', e);
      }
    }
  }

  /**
   * Génère le HTML d'export des sièges (municipal + communautaire)
   */
  generateSiegesHTML(municipal = [], communautaire = [], tour = 1) {
    const t = Number(tour) || 1;
    const totalMunicipal = Number(ELECTION_CONFIG.SEATS_MUNICIPAL_TOTAL) || 35;
    const totalCommunity = Number(ELECTION_CONFIG.SEATS_COMMUNITY_TOTAL) || 6;

    const renderTable = (rows, title, total) => {
      const safe = Array.isArray(rows) ? rows : [];
      const body = safe.map(r => {
        const nom = (r.nomListe || r.nom || '—');
        const voix = Number(r.voix ?? r.voixMunicipal ?? 0) || 0;
        const pct = Number(r.pourcentage ?? r.pctVoix ?? r.pctMunicipal ?? 0) || 0;
        const prime = Number(r.siegesPrime ?? 0) || 0;
        const prop = Number(r.siegesProportionnels ?? 0) || 0;
        const tot = Number(r.sieges ?? 0) || 0;
        const methode = r.methode || (prime > 0 ? `Prime (${prime}) + Proportionnelle (${prop})` : `Proportionnelle (${prop})`);
        return `
          <tr>
            <td><strong>${this.escapeHtml(nom)}</strong></td>
            <td style="text-align:right;">${formatNumber(voix)}</td>
            <td style="text-align:right;">${formatPercent(pct)}</td>
            <td style="text-align:center;">${prime}</td>
            <td style="text-align:center;">${prop}</td>
            <td style="text-align:center;"><strong>${tot}</strong></td>
            <td>${this.escapeHtml(methode)}</td>
          </tr>
        `;
      }).join('');

      return `
        <h2>${this.escapeHtml(title)}</h2>
        <div class="meta">Total sièges à attribuer : <strong>${total}</strong> — Tour ${t}</div>
        <table>
          <thead>
            <tr>
              <th>Liste</th>
              <th>Voix</th>
              <th>%</th>
              <th>Prime</th>
              <th>Prop.</th>
              <th>Total sièges</th>
              <th>Méthode</th>
            </tr>
          </thead>
          <tbody>
            ${body || '<tr><td colspan="7" style="text-align:center;">Aucune donnée</td></tr>'}
          </tbody>
        </table>
      `;
    };

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Répartition des sièges - Tour ${t}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 28px; color: #000; }
    h1 { margin: 0 0 12px 0; color: #0055A4; }
    h2 { margin: 26px 0 8px 0; color: #0055A4; }
    .meta { margin: 0 0 10px 0; padding: 10px 12px; background: #eef6ff; border-left: 4px solid #0055A4; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0 18px 0; }
    th, td { border: 1px solid #333; padding: 8px; font-size: 12px; vertical-align: top; }
    th { background: #f2f2f2; }
    .footer { margin-top: 18px; font-size: 11px; color: #555; }
    
    .print-btn {
      position: fixed;
      left: 20px;
      bottom: 20px;
      padding: 10px 14px;
      border: 1px solid #0b3b7a;
      background: #0b3b7a;
      color: #fff;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
    }
    .print-btn:hover { opacity: 0.92; }
@media print { body { margin: 18mm; } }
  </style>
</head>
<body>
  <h1>Répartition des sièges</h1>
  ${renderTable(municipal, 'Conseil Municipal', totalMunicipal)}
  ${renderTable(communautaire, 'Conseil Communautaire (SQY)', totalCommunity)}
  <div class="footer">Généré le ${this.escapeHtml(formatDateTime(new Date()))}</div>

  <button class="no-print print-btn" onclick="window.print()">Imprimer</button>
</body>
</html>`;
  }

  /**
   * Export XLSX côté client (Blob)
   */
  async exportToXLSX(workbook, filename) {
    const XLSX = await getXLSX();
    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    this.downloadBlob(blob, filename);
  }

  /**
   * Échappement HTML minimal
   */
  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }


/**
   * Télécharge un blob
   */
  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export default new ExportService();
