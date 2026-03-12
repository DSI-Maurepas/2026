// src/components/resultats/FeuilleResultatsBV.jsx
// Feuille officielle de résultats par bureau de vote
// Se remplit automatiquement à partir des données de saisie du bureau
// Insérée entre ResultatsSaisieBureau et ResultatsConsolidation (profil BV uniquement)

import React, { useMemo } from 'react';
import { getAuthState, isBV } from '../../services/authService';
import { useElectionState } from '../../hooks/useElectionState';
import { useGoogleSheets } from '../../hooks/useGoogleSheets';
import { ELECTION_CONFIG } from '../../utils/constants';

// ─────────────────────────────────────────────────────────────────
// Utilitaire : conversion nombre → lettres (français, jusqu'à 9 999)
// ─────────────────────────────────────────────────────────────────
const unites = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
  'dix-sept', 'dix-huit', 'dix-neuf'];
const dizaines = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante',
  'soixante', 'quatre-vingt', 'quatre-vingt'];

function centainesStr(n) {
  // n entre 1 et 999
  const c = Math.floor(n / 100);
  const reste = n % 100;
  let s = '';
  if (c === 1) s = 'cent';
  else if (c > 1) s = unites[c] + ' cent';
  if (reste > 0) {
    if (c > 1) s += 's'; // cents prend un s seulement si pas suivi
    // en réalité "cents" sans s si suivi d'un nombre → on corrige
    if (s.endsWith('s')) s = s.slice(0, -1);
    s += (s ? ' ' : '') + dizStr(reste);
  } else if (c > 1) {
    s += 's'; // "deux cents" avec s si rien derrière
  }
  return s;
}

function dizStr(n) {
  // n entre 0 et 99
  if (n < 20) return unites[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (d === 7) {
    // soixante-dix → soixante + dix + unité
    return u === 1
      ? 'soixante et onze'
      : 'soixante-' + unites[10 + u];
  }
  if (d === 9) {
    // quatre-vingt-dix + unité
    return 'quatre-vingt-' + unites[10 + u];
  }
  if (d === 8) {
    // quatre-vingts, quatre-vingt-un…
    return u === 0 ? 'quatre-vingts' : 'quatre-vingt-' + unites[u];
  }
  // cas général
  const liaison = (u === 1 && d !== 8 && d !== 9) ? ' et ' : '-';
  return u === 0 ? dizaines[d] : dizaines[d] + liaison + unites[u];
}

export function nombreEnLettres(n) {
  if (n === null || n === undefined || n === '') return '—';
  const num = Math.round(Number(n));
  if (!Number.isFinite(num) || num < 0) return '—';
  if (num === 0) return 'zéro';

  let reste = num;
  let s = '';

  // Milliers
  const mille = Math.floor(reste / 1000);
  reste = reste % 1000;
  if (mille > 0) {
    s += (mille === 1 ? 'mille' : centainesStr(mille) + ' mille');
    if (reste > 0) s += ' ';
  }

  // Centaines + dizaines + unités
  if (reste > 0) {
    s += centainesStr(reste);
  }

  // Capitalise première lettre
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─────────────────────────────────────────────────────────────────
// Formatage des %
// ─────────────────────────────────────────────────────────────────
function formatPct(val, base) {
  if (!base || base === 0 || val === '' || val === null || val === undefined) return '—';
  const v = Number(val);
  const b = Number(base);
  if (!Number.isFinite(v) || !Number.isFinite(b) || b === 0) return '—';
  return ((v / b) * 100).toFixed(2).replace('.', ',') + ' %';
}

// ─────────────────────────────────────────────────────────────────
// Normalisation bureauId (identique à ResultatsSaisieBureau)
// ─────────────────────────────────────────────────────────────────
const normalizeBureauId = (value) => {
  if (value === null || value === undefined) return '';
  const s = String(value).trim().toUpperCase();
  const m = s.match(/(\d+)/);
  return m ? m[1] : s;
};

// ─────────────────────────────────────────────────────────────────
// Couleur de cellule d'en-tête (bleu-gris officiel)
// ─────────────────────────────────────────────────────────────────
const HEADER_BG = '#DBE5F1';
const HEADER_BORDER = '#a0b4cc';

// ─────────────────────────────────────────────────────────────────
// Styles partagés du tableau (cohérence avec le document Word)
// ─────────────────────────────────────────────────────────────────
const cellBase = {
  border: `1px solid ${HEADER_BORDER}`,
  padding: '5px 8px',
  fontSize: 13,
  verticalAlign: 'middle',
};

const cellHeader = {
  ...cellBase,
  background: HEADER_BG,
  fontWeight: 700,
  textAlign: 'center',
};

const cellLabel = {
  ...cellBase,
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

const cellChiffre = {
  ...cellBase,
  textAlign: 'right',
  fontWeight: 700,
  minWidth: 80,
};

const cellPct = {
  ...cellBase,
  textAlign: 'right',
  minWidth: 80,
};

const cellLettres = {
  ...cellBase,
  background: HEADER_BG,
  fontStyle: 'italic',
  minWidth: 200,
};

// ─────────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────────
export default function FeuilleResultatsBV({ electionState: electionStateProp } = {}) {
  const auth = useMemo(() => getAuthState(), []);
  const forcedBureauId = isBV(auth) ? String(auth.bureauId) : null;

  const { state: electionStateHook } = useElectionState();
  const electionState = electionStateProp || electionStateHook;
  const tourActuel = electionState?.tourActuel === 2 ? 2 : 1;

  const resultatsSheet = tourActuel === 2 ? 'Resultats_T2' : 'Resultats_T1';

  const { data: bureaux } = useGoogleSheets('Bureaux');
  const { data: candidats } = useGoogleSheets('Candidats');
  const { data: resultats } = useGoogleSheets(resultatsSheet);

  // ── Données du bureau courant ──────────────────────────────────
  const bureauData = useMemo(() => {
    if (!forcedBureauId) return null;
    const list = Array.isArray(bureaux) ? bureaux : [];
    const norm = normalizeBureauId(forcedBureauId);
    return list.find((b) => normalizeBureauId(b?.id ?? '') === norm) || null;
  }, [bureaux, forcedBureauId]);

  const resultatRow = useMemo(() => {
    if (!forcedBureauId) return null;
    const list = Array.isArray(resultats) ? resultats : [];
    const norm = normalizeBureauId(forcedBureauId);
    return list.find((r) => normalizeBureauId(r?.bureauId ?? '') === norm) || null;
  }, [resultats, forcedBureauId]);

  const candidatsActifs = useMemo(() => {
    const list = Array.isArray(candidats) ? candidats : [];
    const filtered = list.filter((c) => (tourActuel === 1 ? !!c.actifT1 : !!c.actifT2));
    filtered.sort((a, b) => (Number(a.ordre) || 0) - (Number(b.ordre) || 0));
    return filtered;
  }, [candidats, tourActuel]);

  // ── Valeurs calculées ──────────────────────────────────────────
  const inscrits  = Number(bureauData?.inscrits || 0);
  const votants   = Number(resultatRow?.votants   ?? 0);
  const blancs    = Number(resultatRow?.blancs    ?? 0);
  const nuls      = Number(resultatRow?.nuls      ?? 0);
  const exprimes  = Number(resultatRow?.exprimes  ?? 0);

  // Nom du bureau
  const nomBureau = String(
    bureauData?.nom ?? bureauData?.libelle ?? bureauData?.bureau ?? forcedBureauId ?? '—'
  );

  // Date élection formatée
  const dateStr = tourActuel === 1
    ? new Date(ELECTION_CONFIG.ELECTION_DATE_T1 + 'T12:00:00')
        .toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date(ELECTION_CONFIG.ELECTION_DATE_T2 + 'T12:00:00')
        .toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  const tourLabel = tourActuel === 1 ? '1er tour' : '2ème tour';
  const commune = ELECTION_CONFIG.COMMUNE_NAME || 'Maurepas';

  // ── Ne rien afficher si pas de bureau / pas de données ─────────
  if (!forcedBureauId) return null;

  return (
    <div style={{
      background: '#fff',
      borderRadius: 12,
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
      border: '2px solid #e5e7eb',
      padding: 20,
      margin: '0 0 20px 0',
      overflowX: 'auto',
    }}>
      {/* ── Titre de section ─────────────────────────────────── */}
      <h3 style={{ margin: '0 0 16px 0' }}>
        📋 Feuille de résultats — Bureau {forcedBureauId} (Tour {tourActuel})
      </h3>

      <div style={{ minWidth: 560 }}>

        {/* ── En-tête officielle ──────────────────────────────── */}
        <div style={{
          textAlign: 'center',
          marginBottom: 12,
          fontWeight: 700,
          fontSize: 14,
          borderBottom: `2px solid ${HEADER_BORDER}`,
          paddingBottom: 10,
          lineHeight: 1.6,
        }}>
          <div style={{ fontSize: 15 }}>
            {commune} (Yvelines) — Élections Municipales — {dateStr} — {tourLabel}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>
            Bureau de vote n° {forcedBureauId} — {nomBureau}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════
            TABLEAU 1 : Statistiques de participation
        ══════════════════════════════════════════════════════════ */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
          <thead>
            <tr>
              <th style={{ ...cellHeader, textAlign: 'left', width: '34%' }}></th>
              <th style={{ ...cellHeader, width: '13%' }}>En chiffres</th>
              <th style={{ ...cellHeader, width: '10%' }}>En %</th>
              <th style={{ ...cellHeader, textAlign: 'left', width: '43%' }}>En lettres</th>
            </tr>
          </thead>
          <tbody>
            {/* Inscrits */}
            <tr>
              <td style={cellLabel}>Nombre d'inscrits</td>
              <td style={cellChiffre}>
                {inscrits > 0 ? inscrits.toLocaleString('fr-FR') : '—'}
              </td>
              <td style={cellPct}>—</td>
              <td style={cellLettres}>{inscrits > 0 ? nombreEnLettres(inscrits) : '—'}</td>
            </tr>

            {/* Votants */}
            <tr>
              <td style={cellLabel}>Nombre de votants</td>
              <td style={cellChiffre}>
                {votants > 0 ? votants.toLocaleString('fr-FR') : '—'}
              </td>
              <td style={cellPct}>{formatPct(votants, inscrits)}</td>
              <td style={cellLettres}>{votants > 0 ? nombreEnLettres(votants) : '—'}</td>
            </tr>

            {/* Bulletins blancs */}
            <tr>
              <td style={cellLabel}>Nombre de bulletins blancs &nbsp;<strong>−</strong></td>
              <td style={cellChiffre}>
                {blancs > 0 ? blancs.toLocaleString('fr-FR') : (resultatRow ? '0' : '—')}
              </td>
              <td style={cellPct}>{resultatRow ? formatPct(blancs, votants) : '—'}</td>
              <td style={cellLettres}>{resultatRow ? (blancs > 0 ? nombreEnLettres(blancs) : 'Zéro') : '—'}</td>
            </tr>

            {/* Bulletins nuls */}
            <tr>
              <td style={cellLabel}>Nombre de bulletins nuls &nbsp;<strong>−</strong></td>
              <td style={cellChiffre}>
                {nuls > 0 ? nuls.toLocaleString('fr-FR') : (resultatRow ? '0' : '—')}
              </td>
              <td style={cellPct}>{resultatRow ? formatPct(nuls, votants) : '—'}</td>
              <td style={cellLettres}>{resultatRow ? (nuls > 0 ? nombreEnLettres(nuls) : 'Zéro') : '—'}</td>
            </tr>

            {/* Suffrages exprimés */}
            <tr style={{ fontWeight: 800 }}>
              <td style={{ ...cellLabel, fontWeight: 800 }}>Suffrages exprimés &nbsp;<strong>=</strong></td>
              <td style={{ ...cellChiffre, fontWeight: 800 }}>
                {exprimes > 0 ? exprimes.toLocaleString('fr-FR') : (resultatRow ? '0' : '—')}
              </td>
              <td style={{ ...cellPct, fontWeight: 700 }}>{resultatRow ? formatPct(exprimes, votants) : '—'}</td>
              <td style={{ ...cellLettres, fontWeight: 700 }}>{resultatRow ? (exprimes > 0 ? nombreEnLettres(exprimes) : 'Zéro') : '—'}</td>
            </tr>
          </tbody>
        </table>

        {/* ═══════════════════════════════════════════════════════
            TABLEAU 2 : Résultats par liste
        ══════════════════════════════════════════════════════════ */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...cellHeader, textAlign: 'left', width: '26%' }}>Listes des candidats</th>
              <th style={{ ...cellHeader, width: '16%' }}>Nombre de voix<br />en chiffres</th>
              <th style={{ ...cellHeader, width: '10%' }}>En %</th>
              <th style={{ ...cellHeader, textAlign: 'left' }}>Nombre de voix en lettres</th>
            </tr>
          </thead>
          <tbody>
            {candidatsActifs.length === 0 && (
              <tr>
                <td colSpan={4} style={{ ...cellBase, textAlign: 'center', fontStyle: 'italic', color: '#6b7280' }}>
                  Aucun candidat actif pour le tour {tourActuel}.
                </td>
              </tr>
            )}
            {candidatsActifs.map((c) => {
              const listeId = String(c?.listeId ?? '').trim();
              const nomListe = String(c?.nomListe ?? '').trim();
              const tete = `${String(c?.teteListePrenom ?? '').trim()} ${String(c?.teteListeNom ?? '').trim()}`.trim();

              const voix = resultatRow?.voix?.[listeId];
              const voixNum = (voix !== null && voix !== undefined && voix !== '') ? Number(voix) : null;

              const pct = voixNum !== null && exprimes > 0
                ? ((voixNum / exprimes) * 100).toFixed(2).replace('.', ',') + ' %'
                : '—';

              const label = [nomListe, tete ? `(${tete})` : ''].filter(Boolean).join(' — ');

              return (
                <tr key={listeId || nomListe}>
                  <td style={cellLabel}>{label || '—'}</td>
                  <td style={cellChiffre}>
                    {voixNum !== null ? voixNum.toLocaleString('fr-FR') : '—'}
                  </td>
                  <td style={cellPct}>{pct}</td>
                  <td style={cellLettres}>
                    {voixNum !== null ? (voixNum > 0 ? nombreEnLettres(voixNum) : 'Zéro') : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* ── Note de bas de tableau ──────────────────────────── */}
        {!resultatRow && (
          <div style={{
            marginTop: 12,
            padding: '8px 12px',
            background: '#fef9c3',
            border: '1px solid #fde047',
            borderRadius: 6,
            fontSize: 12,
            color: '#713f12',
          }}>
            ⚠️ Aucune donnée de saisie disponible pour ce bureau. Le tableau sera alimenté automatiquement lors de la saisie.
          </div>
        )}

      </div>
    </div>
  );
}
