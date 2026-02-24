import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useGoogleSheets } from "../../hooks/useGoogleSheets";
import "./../../styles/components/informations.css";
import InformationsEvolutionHoraire from "./InformationsEvolutionHoraire";

/**
 * Page Informations — layout Full HD 1900px
 *
 * GRILLE 3 colonnes :
 *   col A (1fr)  : Résultats suffrages + Classement listes
 *   col B (2fr)  : Participation KPIs → Évolution horaire → Verrouillage bureaux
 *   col C (1fr)  : Candidats qualifiés (T1→T2 : bloc carré)
 *
 * Lecture seule — zéro écriture Sheets — bouton Rafraîchir manuel
 */
export default function Informations({ electionState }) {
  const tourActuel = electionState?.tourActuel === 2 ? 2 : 1;
  const t2Enabled  = !!(electionState?.secondTourEnabled || electionState?.tour1Verrouille || tourActuel === 2);

  // tourVisu : tour affiché (peut différer du tour réel — navigation manuelle)
  // Initialisé sur tourActuel, mis à jour si tourActuel change
  const [tourVisu, setTourVisu] = useState(tourActuel);
  useEffect(() => { setTourVisu(tourActuel); }, [tourActuel]);

  const [lastRefresh, setLastRefresh] = useState(null);
  const [refreshing, setRefreshing]   = useState(false);

  // ── Compte à rebours — fermeture bureaux de vote ──────────────────
  const getClotureDate = () => {
    // T1 → 15 mars 2026 20h, T2 → 22 mars 2026 20h (ou dates depuis electionState)
    const dateStr = tourVisu === 2
      ? (electionState?.dateT2 || "2026-03-22")
      : (electionState?.dateT1 || "2026-03-15");
    // Construire la date de clôture : jour du scrutin à 20h00
    const d = new Date(dateStr + "T20:00:00");
    return isNaN(d.getTime()) ? new Date("2026-03-15T20:00:00") : d;
  };

  const [countdown, setCountdown] = useState({ jours:0, heures:0, minutes:0, secondes:0, ecoule:false });

  useEffect(() => {
    const cloture = getClotureDate();
    const tick = () => {
      const now  = Date.now();
      const diff = cloture.getTime() - now;
      if (diff <= 0) {
        setCountdown({ jours:0, heures:0, minutes:0, secondes:0, ecoule:true });
        return;
      }
      const total = Math.floor(diff / 1000);
      setCountdown({
        jours    : Math.floor(total / 86400),
        heures   : Math.floor((total % 86400) / 3600),
        minutes  : Math.floor((total % 3600) / 60),
        secondes : total % 60,
        ecoule   : false,
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourVisu, electionState?.dateT1, electionState?.dateT2]);


  // ── Données Sheets ──────────────────────────────────────────────
  const { data: bureaux,       load: loadBureaux }      = useGoogleSheets("Bureaux");
  const { data: candidats,     load: loadCandidats,
          error: errorCandidats }                         = useGoogleSheets("Candidats");
  const { data: participation, load: loadParticipation } = useGoogleSheets(
    tourVisu === 2 ? "Participation_T2" : "Participation_T1"
  );
  const { data: resultats,     load: loadResultats }    = useGoogleSheets(
    tourVisu === 2 ? "Resultats_T2" : "Resultats_T1"
  );
  // Resultats_T1 chargé en permanence — nécessaire pour calculer les listes qualifiées T2 (seuil 10%)
  const { data: resultatsT1, load: loadResultatsT1 } = useGoogleSheets("Resultats_T1");
  const { data: seatsMunicipal,  load: loadSeatsMunicipal }  = useGoogleSheets("Seats_Municipal");
  const { data: seatsCommunity,  load: loadSeatsCommunity }  = useGoogleSheets("Seats_Community");

  const loadAll = useCallback(async (silent = true) => {
    await Promise.allSettled([
      loadBureaux({}, { silent }),
      loadCandidats({}, { silent }),
      loadParticipation({}, { silent }),
      loadResultats({}, { silent }),
      loadSeatsMunicipal({}, { silent }),
      loadSeatsCommunity({}, { silent }),
      loadResultatsT1({}, { silent }),
    ]);
  }, [loadBureaux, loadCandidats, loadParticipation, loadResultats, loadResultatsT1, loadSeatsMunicipal, loadSeatsCommunity]);

  useEffect(() => {
    loadAll(true);
    setLastRefresh(new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourVisu]);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await loadAll(false); setLastRefresh(new Date()); }
    finally { setRefreshing(false); }
  }, [refreshing, loadAll]);

  // ── Helpers ─────────────────────────────────────────────────────
  const HOURS = useMemo(() => [
    "votants09h","votants10h","votants11h","votants12h","votants13h","votants14h",
    "votants15h","votants16h","votants17h","votants18h","votants19h","votants20h",
  ], []);

  const normalizeBureauId = (v) => {
    if (!v) return "";
    const m = String(v).trim().toUpperCase().match(/(\d+)/);
    return m ? m[1] : String(v).trim().toUpperCase();
  };

  const parseTimestamp = (v) => {
    if (!v) return null;
    if (typeof v === "number" && Number.isFinite(v))
      return new Date(v > 1e12 ? v : v * 1000);
    const s = String(v).trim();
    if (!s) return null;
    const iso = Date.parse(s);
    if (!Number.isNaN(iso)) return new Date(iso);
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) {
      const d = new Date(+m[3], +m[2]-1, +m[1], +(m[4]||0), +(m[5]||0), +(m[6]||0));
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  };

  const formatDateTime = (d) => {
    if (!d) return "";
    try {
      return new Intl.DateTimeFormat("fr-FR", {
        year:"numeric",month:"2-digit",day:"2-digit",
        hour:"2-digit",minute:"2-digit",second:"2-digit",
      }).format(d);
    } catch { return d.toLocaleString(); }
  };

  const formatTime = (d) => {
    if (!d) return "";
    try { return new Intl.DateTimeFormat("fr-FR",{hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(d); }
    catch { return d.toLocaleTimeString(); }
  };

  const coerceInt = (v) => {
    if (v == null) return 0;
    if (typeof v === "number") return Number.isFinite(v) ? Math.trunc(v) : 0;
    const s = String(v).trim().replace(/[\s\u00A0\u202F]/g,"").replace(",",".").replace(/[^0-9.\-]/g,"");
    const n = Number(s);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  };

  const pct    = (n, d) => { const N=Number(n)||0; const D=Number(d)||0; return D<=0?0:(N/D)*100; };
  const fmtInt = (n) => { try{return new Intl.NumberFormat("fr-FR").format(Number(n)||0);}catch{return String(Number(n)||0);} };
  const fmtPct = (p) => `${(Number(p)||0).toFixed(1).replace(".",",")} %`;

  const getLastCumul = (row) => {
    let last = 0;
    for (const k of HOURS) { const v=coerceInt(row?.[k]); if(v>0) last=v; }
    return last;
  };

  // ── Agrégats ────────────────────────────────────────────────────
  const activeBureaux = useMemo(() =>
    (Array.isArray(bureaux)?bureaux:[]).filter(b=>b&&b.actif===true),
    [bureaux]
  );

  const totalInscrits = useMemo(() =>
    activeBureaux.reduce((s,b)=>s+(coerceInt(b?.inscrits)||0),0),
    [activeBureaux]
  );

  const participationTotal = useMemo(() => {
    const list = Array.isArray(participation)?participation:[];
    return list.reduce((s,r)=>s+getLastCumul(r),0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participation, HOURS]);

  const lastParticipationHour = useMemo(() => {
    const list = Array.isArray(participation)?participation:[];
    let lastKey=null;
    for(const k of HOURS){ if(list.some(r=>coerceInt(r?.[k])>0)) lastKey=k; }
    if(!lastKey) return {key:null,label:"—"};
    const m=String(lastKey).match(/(\d{2})h/i);
    return {key:lastKey,label:m?`${m[1]}h`:lastKey};
  }, [participation, HOURS]);

  const lastParticipationUpdate = useMemo(() => {
    const list = Array.isArray(participation)?participation:[];
    let best=null;
    for(const r of list){const d=parseTimestamp(r?.timestamp);if(d&&(!best||d>best))best=d;}
    return best;
  }, [participation]);

  const totauxResultats = useMemo(() => {
    const list=Array.isArray(resultats)?resultats:[];
    let votants=0,blancs=0,nuls=0,exprimes=0;
    for(const r of list){votants+=coerceInt(r?.votants);blancs+=coerceInt(r?.blancs);nuls+=coerceInt(r?.nuls);exprimes+=coerceInt(r?.exprimes);}
    return {votants,blancs,nuls,exprimes};
  }, [resultats]);

  const votantsRef      = useMemo(()=>Math.max(Number(participationTotal)||0,Number(totauxResultats.votants)||0),[participationTotal,totauxResultats]);
  const tauxParticip    = useMemo(()=>pct(votantsRef,totalInscrits),[votantsRef,totalInscrits]);
  const abstention      = useMemo(()=>Math.max(0,(totalInscrits||0)-(votantsRef||0)),[totalInscrits,votantsRef]);
  const tauxAbstention  = useMemo(()=>pct(abstention,totalInscrits),[abstention,totalInscrits]);

  // Calcul des ids qualifiés pour le T2 (≥ 10% des suffrages exprimés du T1)
  // Utilise resultatsT1 (toujours chargé) pour garantir le calcul même quand tourVisu === 2.
  const idsQualifiesT2 = useMemo(() => {
    const resT1 = Array.isArray(resultatsT1) ? resultatsT1 : [];
    const cand  = Array.isArray(candidats)   ? candidats   : [];
    if (!resT1.length || !cand.length) return null; // null = "pas encore calculable"
    const nv=(v)=>{const num=Number(String(v??"").replace(",",".").replace(/\s/g,""));return Number.isFinite(num)?num:0;};
    const totalExpT1 = resT1.reduce((s,r)=>s+nv(r?.exprimes??r?.Exprimes),0);
    if (totalExpT1 <= 0) return null;
    const SEUIL = 10;
    const actifsT1 = cand.filter(c=>!!c.actifT1);
    const base = actifsT1.length > 0 ? actifsT1 : cand.filter(c=>c?.listeId);
    const qualifies = new Set();
    base.forEach((c,i)=>{
      const id = (c?.listeId??c?.id??c?.code??c?.key);
      const idStr = id&&String(id).trim() ? String(id).trim() : `L${i+1}`;
      const fallbackKey = `L${i+1}`;
      const voixByLiId = resT1.reduce((a,r)=>{const vo=r?.voix||r?.Voix||{};return a+nv(vo?.[idStr]??vo?.[`${idStr}_Voix`]??vo?.[`${idStr}Voix`]);},0);
      const voixByFallback = idStr!==fallbackKey ? resT1.reduce((a,r)=>{const vo=r?.voix||r?.Voix||{};return a+nv(vo?.[fallbackKey]??vo?.[`${fallbackKey}_Voix`]??vo?.[`${fallbackKey}Voix`]);},0) : 0;
      const voix = voixByLiId > 0 ? voixByLiId : voixByFallback;
      if ((voix / totalExpT1) * 100 >= SEUIL) qualifies.add(idStr);
    });
    return qualifies; // Set vide = aucune liste qualifiée (données insuffisantes)
  }, [resultatsT1, candidats]);

  // Classement des listes — source : resultats du tour affiché
  // En Tour 2 : filtré sur les listes qualifiées T2 (≥ 10% au T1)
  const topListes = useMemo(() => {
    const res=Array.isArray(resultats)?resultats:[];
    const cand=Array.isArray(candidats)?candidats:[];
    if(!res.length) return [];
    const n=(v)=>{const num=Number(String(v??"").replace(",",".").replace(/\s/g,""));return Number.isFinite(num)?num:0;};
    const getName=(c,i)=>{
      const nl=(c?.nomListe??"").toString().trim(); if(nl) return nl;
      const full=[c?.teteListePrenom,c?.teteListeNom].map(x=>(x??"").toString().trim()).filter(Boolean).join(" "); if(full) return full;
      const leg=c?.nom??c?.name??c?.Nom??c?.label; return leg&&String(leg).trim()?String(leg).trim():`Candidat ${i+1}`;
    };
    const getId=(c,i)=>{const id=c?.listeId??c?.id??c?.code??c?.key;return id&&String(id).trim()?String(id).trim():`L${i+1}`;};

    // Filtre des candidats selon le tour :
    // T1 : actifT1, fallback sur tous si non renseigné
    // T2 : strictement les listes qualifiées T2 (≥10% au T1), calculées via idsQualifiesT2
    //      Si idsQualifiesT2 est null (données T1 pas encore chargées), on attend → []
    let actifs;
    if (tourVisu === 2) {
      if (idsQualifiesT2 === null) return []; // T1 pas encore chargé
      const actifsFiltresT2 = cand.filter(c => {
        const id = getId(c, 0); // index 0 car on cherche juste l'id, pas le nom
        const idStr = (c?.listeId??c?.id??c?.code??c?.key);
        const idFinal = idStr&&String(idStr).trim() ? String(idStr).trim() : id;
        return idsQualifiesT2.has(idFinal);
      });
      actifs = actifsFiltresT2.length > 0 ? actifsFiltresT2 : [];
    } else {
      const actifsFiltresT1 = cand.filter(c=>!!c.actifT1);
      actifs = actifsFiltresT1.length > 0 ? actifsFiltresT1 : cand.filter(c=>c?.listeId);
    }
    if(!actifs.length) return [];

    const totalExp=(totauxResultats?.exprimes??0)||res.reduce((a,r)=>a+n(r?.exprimes??r?.Exprimes),0);
    return actifs
      .map((c,i)=>{
        const id=getId(c,i);
        // Lookup voix par listeId exact d'abord, puis par clé positionnelle L{i+1}
        const fallbackKey=`L${i+1}`;
        const voixByLiId=res.reduce((a,r)=>{const vo=r?.voix||r?.Voix||{};return a+n(vo?.[id]??vo?.[`${id}_Voix`]??vo?.[`${id}Voix`]);},0);
        const voixByFallback=id!==fallbackKey?res.reduce((a,r)=>{const vo=r?.voix||r?.Voix||{};return a+n(vo?.[fallbackKey]??vo?.[`${fallbackKey}_Voix`]??vo?.[`${fallbackKey}Voix`]);},0):0;
        const voix=voixByLiId>0?voixByLiId:voixByFallback;
        return {listeId:id,nomListe:getName(c,i),voix};
      })
      .sort((a,b)=>(b.voix||0)-(a.voix||0))
      .map(x=>({...x,pctVoix:totalExp>0?(x.voix/totalExp)*100:0}));
  }, [resultats,candidats,tourVisu,totauxResultats,idsQualifiesT2]);

  const seatsByListeId = useMemo(()=>{
    const map=new Map();
    for(const r of (Array.isArray(seatsCommunity)?seatsCommunity:[])){const id=String(r?.listeId??r?.liste??"").trim();if(id)map.set(id,{...r,siegesTotal:coerceInt(r?.siegesTotal??r?.siegesCommunautaires??r?.sieges??0)});}
    return map;
  },[seatsCommunity]);

  const muniByListeId = useMemo(()=>{
    const map=new Map();
    for(const r of (Array.isArray(seatsMunicipal)?seatsMunicipal:[])){const id=String(r?.listeId??r?.liste??"").trim();if(id)map.set(id,{...r,siegesTotal:coerceInt(r?.siegesTotal??r?.sieges??0)});}
    return map;
  },[seatsMunicipal]);

  // Bureaux déclarés
  const bureauxDeclares = useMemo(()=>{
    const list=Array.isArray(resultats)?resultats:[];
    const set=new Set();
    for(const r of list){
      const id=String(r?.bureauId??"").trim();
      const ok=coerceInt(r?.exprimes)>0||coerceInt(r?.votants)>0||coerceInt(r?.blancs)>0||coerceInt(r?.nuls)>0||String(r?.timestamp??"").trim()!=="";
      if(id&&ok) set.add(id);
    }
    return set.size;
  },[resultats]);

  const totalBureaux    = activeBureaux.length;
  const bureauxRestants = Math.max(0,totalBureaux-bureauxDeclares);

  // Statut de verrouillage par bureau (pour le bloc tuiles)
  const bureauStatuts = useMemo(()=>{
    const list=Array.isArray(resultats)?resultats:[];
    const bureauxList=Array.isArray(bureaux)?bureaux:[];
    return bureauxList
      .filter(b=>b&&b.actif===true)
      .map(b=>{
        const row=list.find(r=>normalizeBureauId(r?.bureauId)===normalizeBureauId(b?.id));
        const valide=!!(row?.validePar&&String(row.validePar).trim());
        return {id:b.id,nom:b.nom||b.id,valide};
      });
  },[bureaux,resultats]);

  // Ecart top 2
  const ecartTop2 = useMemo(()=>{
    if(topListes.length<2) return null;
    return {voix:(topListes[0]?.voix||0)-(topListes[1]?.voix||0),pct:(topListes[0]?.pctVoix||0)-(topListes[1]?.pctVoix||0)};
  },[topListes]);

  /**
   * Listes admises pour le T2 — calculées depuis les résultats du T1.
   * Critère légal : ≥ 10% des suffrages exprimés.
   * ⚠️ Ces listes sont ADMISES à se présenter, pas nécessairement qualifiées in fine
   *    (des fusions ou renoncements peuvent modifier la liste finale).
   */
  const listesAdmises = useMemo(() => {
    const res  = Array.isArray(resultats)  ? resultats  : [];
    const cand = Array.isArray(candidats)  ? candidats  : [];
    if (!res.length || !cand.length) return [];

    const nv = (v) => { const num = Number(String(v ?? "").replace(",", ".").replace(/\s/g, "")); return Number.isFinite(num) ? num : 0; };
    const totalExp = totauxResultats?.exprimes || 0;
    if (totalExp <= 0) return [];

    const SEUIL = 10; // % minimum légal

    const getName = (c, i) => {
      const nl = (c?.nomListe ?? "").toString().trim(); if (nl) return nl;
      const full = [c?.teteListePrenom, c?.teteListeNom].map(x => (x ?? "").toString().trim()).filter(Boolean).join(" "); if (full) return full;
      const leg = c?.nom ?? c?.name ?? c?.Nom ?? c?.label;
      return leg && String(leg).trim() ? String(leg).trim() : `Candidat ${i + 1}`;
    };
    const getId = (c, i) => { const id = c?.listeId ?? c?.id ?? c?.code ?? c?.key; return id && String(id).trim() ? String(id).trim() : `L${i + 1}`; };

    // Filtre actifT1 — fallback sur tous candidats si aucun n'est marqué actif
    const actifsFiltresAdmises = cand.filter(c => !!c.actifT1);
    const actifs = actifsFiltresAdmises.length > 0 ? actifsFiltresAdmises : cand.filter(c => c?.listeId);
    const avecVoix = actifs.map((c, i) => {
      const id   = getId(c, i);
      // Lookup voix par listeId exact, puis fallback L{i+1}
      const fallbackKey = `L${i+1}`;
      const voixByLiId = res.reduce((a, r) => { const vo = r?.voix || r?.Voix || {}; return a + nv(vo?.[id] ?? vo?.[`${id}_Voix`] ?? vo?.[`${id}Voix`]); }, 0);
      const voixByFallback = id !== fallbackKey ? res.reduce((a, r) => { const vo = r?.voix || r?.Voix || {}; return a + nv(vo?.[fallbackKey] ?? vo?.[`${fallbackKey}_Voix`] ?? vo?.[`${fallbackKey}Voix`]); }, 0) : 0;
      const voix = voixByLiId > 0 ? voixByLiId : voixByFallback;
      const pct  = (voix / totalExp) * 100;
      return { id, nom: getName(c, i), voix, pct };
    });

    const admises = avecVoix.filter(l => l.pct >= SEUIL).sort((a, b) => b.voix - a.voix);
    if (!admises.length) return [];

    const maxVoix = admises[0].voix || 1;
    const rangs   = ["1ER","2ÈME","3ÈME","4ÈME","5ÈME","6ÈME","7ÈME"];
    return admises.map((l, i) => ({ ...l, pctBar: (l.voix / maxVoix) * 100, rank: rangs[i] || `${i+1}ÈME` }));
  }, [resultats, candidats, totauxResultats]);

  const lastValidatedBureau = useMemo(()=>{
    const list=Array.isArray(resultats)?resultats:[];
    const bl=Array.isArray(bureaux)?bureaux:[];
    let best=null,bestRow=null;
    for(const r of list){const ts=parseTimestamp(r?.timestamp);if(!ts||!String(r?.validePar??"").trim())continue;if(!best||ts>best){best=ts;bestRow=r;}}
    if(!bestRow) return null;
    const rid=normalizeBureauId(bestRow?.bureauId??bestRow?.id??"");
    const match=bl.find(b=>normalizeBureauId(b?.id)===rid);
    return {bureauLabel:match?.nom?`${match.id} — ${match.nom}`:(rid?`BV${rid}`:"—"),at:best};
  },[resultats,bureaux]);

  // ── Sièges T2 : répartition municipaux et communautaires ────────
  // Filtre : listes qualifiées T2 (≥10% au T1) via idsQualifiesT2.
  // Même logique que topListes — pas de fallback "toutes les listes" si actifT2 vide.
  const _filtreEntriesSieges = (allEntries) => {
    if (!allEntries.length) return [];
    // Priorité 1 : idsQualifiesT2 calculé depuis Resultats_T1
    if (idsQualifiesT2 !== null && idsQualifiesT2.size > 0) {
      return allEntries.filter(e => idsQualifiesT2.has(String(e.listeId ?? e.liste ?? '').trim()));
    }
    // Priorité 2 : actifT2 renseigné dans Candidats
    const cand = Array.isArray(candidats) ? candidats : [];
    const activeT2Ids = new Set(
      cand.filter(c => !!c.actifT2).map(c => String(c.listeId ?? c.id ?? '').trim()).filter(Boolean)
    );
    if (activeT2Ids.size > 0) {
      return allEntries.filter(e => activeT2Ids.has(String(e.listeId ?? e.liste ?? '').trim()));
    }
    // Aucune information disponible : ne rien afficher (pas de fallback sur toutes les listes)
    return [];
  };

  const siegesMuniDisplay = useMemo(() => {
    const allEntries = Array.from(muniByListeId.values());
    if (!allEntries.length) return { items: [], total: 0 };
    const entries = _filtreEntriesSieges(allEntries);
    const total = entries.reduce((s, e) => s + coerceInt(e.siegesTotal), 0);
    const items = entries.map(e => {
      const id = String(e.listeId ?? e.liste ?? '').trim();
      const tl = topListes.find(l => l.listeId === id);
      const nom = (e.nomListe ?? e.nom ?? '').toString().trim() || tl?.nomListe || id;
      return { listeId: id, nomListe: nom, sieges: coerceInt(e.siegesTotal) };
    }).sort((a, b) => b.sieges - a.sieges || a.nomListe.localeCompare(b.nomListe, 'fr'));
    return { items, total };
  }, [muniByListeId, candidats, topListes, idsQualifiesT2]); // eslint-disable-line react-hooks/exhaustive-deps

  const siegesCommDisplay = useMemo(() => {
    const allEntries = Array.from(seatsByListeId.values());
    if (!allEntries.length) return { items: [], total: 0 };
    const entries = _filtreEntriesSieges(allEntries);
    const total = entries.reduce((s, e) => s + coerceInt(e.siegesTotal), 0);
    const items = entries.map(e => {
      const id = String(e.listeId ?? e.liste ?? '').trim();
      const tl = topListes.find(l => l.listeId === id);
      const nom = (e.nomListe ?? e.nom ?? '').toString().trim() || tl?.nomListe || id;
      return { listeId: id, nomListe: nom, sieges: coerceInt(e.siegesTotal) };
    }).sort((a, b) => b.sieges - a.sieges || a.nomListe.localeCompare(b.nomListe, 'fr'));
    return { items, total };
  }, [seatsByListeId, candidats, topListes, idsQualifiesT2]); // eslint-disable-line react-hooks/exhaustive-deps

  const tourLabel  = tourVisu===2?"Tour 2":"Tour 1";
  const themeClass = tourVisu===2?"t2":"t1";

  // Ordinal rang
  const ordinal = (i) => ["1ER","2ÈME","3ÈME","4ÈME","5ÈME"][i]||`${i+1}`;

  return (
    <div className={`info-page ${themeClass}`}>

      {/* ══ HEADER ══════════════════════════════════════════════════ */}
      <header className="info-header">
        <div className="info-header-left">
          <div className="info-kicker">Élections Municipales 2026 — Maurepas</div>
          <h1 className="info-title-h1">Informations — {tourLabel}</h1>
          <div className="info-refresh-zone">
            <button
              className={`info-refresh-btn${refreshing?" refreshing":""}`}
              onClick={handleRefresh}
              disabled={refreshing}
              type="button"
            >
              <span className="info-refresh-icon" aria-hidden="true">↺</span>
              {refreshing?"Chargement…":"Rafraîchir"}
            </button>
            {lastRefresh&&<span className="info-last-refresh">MàJ à {formatTime(lastRefresh)}</span>}
          </div>
        </div>

        {/* ── Boutons de navigation T1 / T2 ── */}
        <div className="info-tour-switch">
          <button
            type="button"
            className={`info-tour-btn info-tour-btn--t1${tourVisu===1?" active":""}`}
            onClick={()=>setTourVisu(1)}
            title="Consulter les données du Tour 1"
          >
            <span className="info-tour-btn-dot"/>
            Tour 1
          </button>
          <button
            type="button"
            className={`info-tour-btn info-tour-btn--t2${tourVisu===2?" active":""}${!t2Enabled?" disabled":""}`}
            onClick={()=>{ if(t2Enabled) setTourVisu(2); }}
            disabled={!t2Enabled}
            title={t2Enabled?"Consulter les données du Tour 2":"Le Tour 2 n'est pas encore activé"}
          >
            <span className="info-tour-btn-dot"/>
            Tour 2
          </button>
          {!t2Enabled&&<div className="info-tour-hint">En attente du passage au T2</div>}
        </div>

        <div className="info-meta">
          <div className="info-meta-item">
            <div className="label">Bureaux déclarés</div>
            <div className="value">{fmtInt(bureauxDeclares)} / {fmtInt(totalBureaux)}</div>
            <div className="sub">{bureauxRestants>0?`${fmtInt(bureauxRestants)} restant(s)`:"✓ Tous déclarés"}</div>
          </div>
          <div className="info-meta-item">
            <div className="label">Participation</div>
            <div className="value">{fmtPct(tauxParticip)}</div>
            <div className="sub">{fmtInt(votantsRef)} votants</div>
          </div>
          <div className="info-meta-item">
            <div className="label">Dernière heure</div>
            <div className="value">{lastParticipationHour?.label&&lastParticipationHour.label!=="—"?`Participation ${lastParticipationHour.label}`:"—"}</div>
            <div className="sub">{lastParticipationUpdate?`Maj : ${formatDateTime(lastParticipationUpdate)}`:"—"}</div>
          </div>

          {/* ── 4e carte : compte à rebours fermeture bureaux ── */}
          <div className={`info-meta-item info-meta-countdown${countdown.ecoule?" info-meta-countdown--ecoule":""}`}>
            <div className="label">⏱ Fermeture bureaux</div>
            {countdown.ecoule?(
              <div className="countdown-ecoule">Bureaux fermés</div>
            ):(
              <div className="countdown-wrap">
                {countdown.jours > 0 && (
                  <div className="countdown-unit">
                    <span className="countdown-val">{String(countdown.jours).padStart(2,"0")}</span>
                    <span className="countdown-lbl">j</span>
                  </div>
                )}
                <div className="countdown-unit">
                  <span className="countdown-val">{String(countdown.heures).padStart(2,"0")}</span>
                  <span className="countdown-lbl">h</span>
                </div>
                <div className="countdown-sep">:</div>
                <div className="countdown-unit">
                  <span className="countdown-val">{String(countdown.minutes).padStart(2,"0")}</span>
                  <span className="countdown-lbl">min</span>
                </div>
                <div className="countdown-sep">:</div>
                <div className="countdown-unit">
                  <span className="countdown-val">{String(countdown.secondes).padStart(2,"0")}</span>
                  <span className="countdown-lbl">sec</span>
                </div>
              </div>
            )}
            <div className="sub">
              {tourVisu===2?"Dimanche 22 mars 2026, 20h00":"Dimanche 15 mars 2026, 20h00"}
            </div>
          </div>
        </div>
      </header>

      {/* ══ GRILLE 3 COLONNES ═══════════════════════════════════════
          A (1fr) Résultats+Classement | B (2fr) Particip+Evo+BV | C (1fr) Candidats qualifiés
      ══════════════════════════════════════════════════════════════ */}
      <section className={`info-grid${tourVisu === 2 ? " info-grid--t2" : ""}`}>

        {/* ── COL A : Résultats suffrages + Classement listes ── */}
        <div className="info-col-a">

          <article className="info-card">
            <div className="card-title">Résultats — Suffrages</div>
            <div className="totals">
              <div className="row row-main">
                <span>Suffrages exprimés</span>
                <strong>{fmtInt(totauxResultats.exprimes)}</strong>
              </div>
              <div className="row"><span>Votants (PV)</span><strong>{fmtInt(totauxResultats.votants)}</strong></div>
              <div className="row"><span>Bulletins blancs</span><strong>{fmtInt(totauxResultats.blancs)}</strong></div>
              <div className="row"><span>Bulletins nuls</span><strong>{fmtInt(totauxResultats.nuls)}</strong></div>
            </div>
            {ecartTop2!==null&&totauxResultats.exprimes>0&&(
              <div className="info-ecart">
                <span className="info-ecart-label">Écart liste 1 / liste 2</span>
                <span className="info-ecart-val">
                  {ecartTop2.voix>0?"+":""}{fmtInt(ecartTop2.voix)} voix
                  &nbsp;({ecartTop2.pct>0?"+":""}{ecartTop2.pct.toFixed(1).replace(".",",")} pt)
                </span>
              </div>
            )}
          </article>

          <article className="info-card" style={{marginTop:14}}>
            <div className="card-title">Classement — Listes</div>
            <div className="rank">
              {topListes.length===0?(
                <div className="empty">
                  Données en attente.
                  {errorCandidats&&<span style={{marginLeft:6,opacity:.8}}>(Candidats indisponibles)</span>}
                </div>
              ):(
                topListes.map((l,i)=>{
                  const id=String(l?.listeId??"").trim();
                  const muni=muniByListeId.get(id);
                  const comm=seatsByListeId.get(id);
                  const hasMuni=muni&&coerceInt(muni?.siegesTotal)>0;
                  const hasComm=comm&&coerceInt(comm?.siegesTotal)>0;
                  return (
                    <div key={`${id}-${i}`} className={`rank-row${i===0?" rank-first":""}`}>
                      <div className="rank-pos">{i+1}</div>
                      <div className="rank-main">
                        <div className="rank-name">{l?.nomListe||id||"Liste"}</div>
                        <div className="rank-sub">{fmtInt(l?.voix)} voix — {fmtPct(l?.pctVoix)}</div>
                        <div className="rank-bar-wrap"><div className="rank-bar" style={{width:`${Math.min(100,l?.pctVoix||0)}%`}}/></div>
                      </div>
                      {/* sièges municipaux T1 : non applicable — retiré */}
                    </div>
                  );
                })
              )}
            </div>
          </article>

        </div>

        {/* ── COL B : Participation → Évolution horaire → Verrouillage BV ── */}
        <div className="info-col-b">

          {/* Participation KPIs */}
          <article className="info-card">
            <div className="card-title">Participation</div>
            <div className="kpis">
              <div className="kpi"><div className="kpi-label">Inscrits</div><div className="kpi-value">{fmtInt(totalInscrits)}</div></div>
              <div className="kpi"><div className="kpi-label">Votants</div><div className="kpi-value">{fmtInt(votantsRef)}</div></div>
              <div className="kpi kpi-accent">
                <div className="kpi-label">Participation</div>
                <div className="kpi-value">{fmtPct(tauxParticip)}</div>
              </div>
              <div className="kpi">
                <div className="kpi-label">Abstention</div>
                <div className="kpi-value">{fmtPct(tauxAbstention)}</div>
                <div className="kpi-sub">{fmtInt(abstention)} inscrits</div>
              </div>
            </div>
          </article>

          {/* Évolution horaire */}
          <article className="info-card info-card-evolution">
            <InformationsEvolutionHoraire
              participationData={participation}
              totalInscrits={totalInscrits}
              tour={tourVisu}
            />
          </article>

          {/* Verrouillage bureaux */}
          <article className="info-card">
            <div className="card-title">Verrouillage des bureaux</div>
            <div className="bv-tiles">
              {bureauStatuts.map(bv=>(
                <div key={bv.id} className={`bv-tile${bv.valide?" bv-tile--valide":""}`}>
                  <div className="bv-tile-icon">{bv.valide?"🔒":"⏳"}</div>
                  <div className="bv-tile-id">{bv.id}</div>
                  <div className="bv-tile-status">{bv.valide?"Validé":"Attente"}</div>
                </div>
              ))}
              {bureauStatuts.length===0&&(
                <div className="empty">Données en attente…</div>
              )}
            </div>
            <div className="bv-legende">
              <span className="bv-legende-item bv-legende-valide">🔒 Validé</span>
              <span className="bv-legende-item bv-legende-attente">⏳ En attente</span>
              <span className="bv-legende-count">{bureauxDeclares} / {totalBureaux} bureaux déclarés</span>
            </div>
            {lastValidatedBureau&&(
              <div className="info-last-bv" style={{marginTop:8}}>Dernier BV validé : <strong>{lastValidatedBureau.bureauLabel}</strong></div>
            )}
          </article>

        </div>

        {/* ── COL C : T1 = Listes admises / T2 = Liste Élue ── */}
        <div className="info-col-c">
          {tourVisu===1?(
            /* ─── T1 : Listes admises pour le 2nd tour ─── */
            <article className="info-card info-card-qualifies">
              <div className="card-title">Listes admises — 2nd Tour (+ 10%)</div>
              {listesAdmises.length===0?(
                <div className="qualif-empty">
                  {totauxResultats.exprimes > 0
                    ? "Aucune liste n'atteint le seuil de 10% des suffrages exprimés."
                    : "En attente des résultats du 1er tour."}
                </div>
              ):(
                <>
                  <div className="qualif-legende">
                    {listesAdmises.length} liste{listesAdmises.length>1?"s":""} admise{listesAdmises.length>1?"s":""}
                    {" "}(≥ 10% des suffrages exprimés).
                    {" "}<em>Ces listes sont admises à se présenter au 2nd tour. Les listes définitives peuvent différer en cas de fusion ou de désistement.</em>
                  </div>
                  <div className="qualif-summary-tile">
                    <div className="qualif-summary-nb">{listesAdmises.length}</div>
                    <div className="qualif-summary-label">liste{listesAdmises.length>1?"s":""} admise{listesAdmises.length>1?"s":""}</div>
                    <div className="qualif-summary-sub">≥ 10% des suffrages exprimés</div>
                  </div>
                  <div className="qualif-grid">
                    {listesAdmises.map((l,i)=>(
                      <div key={l.id||i} className={`qualif-card${i===0?" qualif-card--first":""}`}>
                        <div className="qualif-card-top">
                          <span className="qualif-rank">{l.rank}</span>
                          <span className="qualif-voix">{fmtInt(l.voix)} voix</span>
                        </div>
                        <div className="qualif-nom">{l.nom}</div>
                        <div className="qualif-pct">{fmtPct(l.pct)}</div>
                        <div className="qualif-bar-wrap"><div className="qualif-bar" style={{width:`${Math.min(100,l.pctBar||0)}%`}}/></div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </article>
          ):(
            /* ─── T2 : Liste Élue ─── */
            <article className="info-card info-card-qualifies">
              <div className="card-title">🏆 Liste Élue</div>
              {topListes.length===0?(
                <div className="qualif-empty">En attente des résultats du 2nd tour.</div>
              ):(
                <>
                  <div className="qualif-legende">
                    Résultats du scrutin du 2nd tour — Maurepas.
                  </div>
                  <div className="qualif-summary-tile" style={{background:"#0b3b86"}}>
                    <div className="qualif-summary-nb" style={{fontSize:34}}>🏆</div>
                    <div className="qualif-summary-label">{topListes[0]?.nomListe||"—"}</div>
                    <div className="qualif-summary-sub">{fmtInt(topListes[0]?.voix)} voix — {fmtPct(topListes[0]?.pctVoix)}</div>
                  </div>
                  <div className="qualif-grid">
                    {topListes.map((l,i)=>(
                      <div key={l.listeId||i} className={`qualif-card${i===0?" qualif-card--first":""}`}>
                        <div className="qualif-card-top">
                          <span className="qualif-rank">{i===0?"🏆 ÉLUE":ordinal(i)}</span>
                          <span className="qualif-voix">{fmtInt(l.voix)} voix</span>
                        </div>
                        <div className="qualif-nom">{l.nomListe||l.listeId}</div>
                        <div className="qualif-pct">{fmtPct(l.pctVoix)}</div>
                        <div className="qualif-bar-wrap"><div className="qualif-bar" style={{width:`${Math.min(100,l.pctVoix||0)}%`}}/></div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </article>
          )}
        </div>

        {/* ══ BAS-GAUCHE : Sièges Municipaux — visible T2 uniquement ══ */}
        {tourVisu === 2 && (
          <div className="info-col-sieg-muni">
            <article className="info-card info-card-sieges">
              <div className="card-title">Répartition — Sièges Municipaux</div>
              {siegesMuniDisplay.total > 0 && (
                <div className="sieges-badge">
                  <span className="sieges-badge-nb">{siegesMuniDisplay.total}</span>
                  <span className="sieges-badge-label">sièges au total</span>
                </div>
              )}
              <div className="sieges-list">
                {siegesMuniDisplay.items.length === 0 ? (
                  <div className="empty">Données en attente.</div>
                ) : (
                  siegesMuniDisplay.items.map((l, i) => (
                    <div key={l.listeId || i} className={`sieges-row${i === 0 ? " sieges-row--first" : ""}`}>
                      <div className="sieges-rank">{i + 1}</div>
                      <div className="sieges-main">
                        <div className="sieges-nom" title={l.nomListe}>{l.nomListe}</div>
                        <div className="sieges-bar-wrap">
                          <div className="sieges-bar" style={{ width: `${siegesMuniDisplay.total > 0 ? Math.min(100, (l.sieges / siegesMuniDisplay.total) * 100) : 0}%` }} />
                        </div>
                      </div>
                      <div className="sieges-count">{l.sieges}</div>
                    </div>
                  ))
                )}
              </div>
            </article>
          </div>
        )}

        {/* ══ BAS-DROITE : Sièges Communautaires — visible T2 uniquement ══ */}
        {tourVisu === 2 && (
          <div className="info-col-sieg-comm">
            <article className="info-card info-card-sieges">
              <div className="card-title">Répartition — Sièges Communautaires</div>
              {siegesCommDisplay.total > 0 && (
                <div className="sieges-badge">
                  <span className="sieges-badge-nb">{siegesCommDisplay.total}</span>
                  <span className="sieges-badge-label">sièges au total</span>
                </div>
              )}
              <div className="sieges-list">
                {siegesCommDisplay.items.length === 0 ? (
                  <div className="empty">Données en attente.</div>
                ) : (
                  siegesCommDisplay.items.map((l, i) => (
                    <div key={l.listeId || i} className={`sieges-row${i === 0 ? " sieges-row--first" : ""}`}>
                      <div className="sieges-rank">{i + 1}</div>
                      <div className="sieges-main">
                        <div className="sieges-nom" title={l.nomListe}>{l.nomListe}</div>
                        <div className="sieges-bar-wrap">
                          <div className="sieges-bar" style={{ width: `${siegesCommDisplay.total > 0 ? Math.min(100, (l.sieges / siegesCommDisplay.total) * 100) : 0}%` }} />
                        </div>
                      </div>
                      <div className="sieges-count">{l.sieges}</div>
                    </div>
                  ))
                )}
              </div>
            </article>
          </div>
        )}

      </section>

      <footer className="info-bottom">
        <div className="info-footnote">
          Synthèse en lecture seule — données Participation / Résultats / Sièges. Aucune action métier depuis cette page.
        </div>
      </footer>
    </div>
  );
}
