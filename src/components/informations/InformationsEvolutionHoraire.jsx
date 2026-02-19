import React, { useMemo } from "react";

/**
 * Évolution horaire — barres proportionnelles aux DELTA (votants/heure) + courbe cumul blanche
 *
 * ✅ Palette T1 : vert clair → vert foncé UNIQUEMENT (pas de jaune/orange)
 * ✅ Palette T2 : bleu clair → bleu foncé UNIQUEMENT
 * ✅ Barres proportionnelles aux votants de l'heure (delta), pas au cumul
 * ✅ Courbe blanche lissée (Catmull-Rom) = cumul total
 * ✅ % dans la barre = taux participation cumulé à cette heure
 */
export default function InformationsEvolutionHoraire({
  participationData,
  totalInscrits = 0,
  tour = 1,
}) {
  const HOURS = [
    { key: "votants09h", label: "09h" },
    { key: "votants10h", label: "10h" },
    { key: "votants11h", label: "11h" },
    { key: "votants12h", label: "12h" },
    { key: "votants13h", label: "13h" },
    { key: "votants14h", label: "14h" },
    { key: "votants15h", label: "15h" },
    { key: "votants16h", label: "16h" },
    { key: "votants17h", label: "17h" },
    { key: "votants18h", label: "18h" },
    { key: "votants19h", label: "19h" },
    { key: "votants20h", label: "20h" },
  ];

  const coerceInt = (v) => {
    if (v == null) return 0;
    if (typeof v === "number") return Number.isFinite(v) ? Math.trunc(v) : 0;
    const s = String(v).trim().replace(/[\s\u00A0\u202F]/g, "").replace(",", ".").replace(/[^0-9.\-]/g, "");
    const n = Number(s);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  };

  const fmt    = (n) => new Intl.NumberFormat("fr-FR").format(Number(n) || 0);
  const fmtPct = (p) => `${(Number(p) || 0).toFixed(1).replace(".", ",")} %`;

  const series = useMemo(() => {
    const rows     = Array.isArray(participationData) ? participationData : [];
    const inscrits = Number(totalInscrits) || 0;

    const cumuls = HOURS.map(({ key, label }) => {
      const cumul = rows.reduce((sum, r) => sum + coerceInt(r?.[key]), 0);
      return { label, cumul, hasData: cumul > 0 };
    });

    return cumuls.map((h, i) => {
      // Delta = différence avec l'heure précédente (votants de CETTE heure uniquement)
      const prev  = i === 0 ? 0 : cumuls[i - 1].cumul;
      const delta = Math.max(0, h.cumul - prev);
      const pctParticipation = inscrits > 0 ? (h.cumul / inscrits) * 100 : 0;
      return { ...h, delta, pctParticipation };
    });
  }, [participationData, totalInscrits]);

  const lastDataIndex = useMemo(() => {
    let last = -1;
    series.forEach((s, i) => { if (s.hasData) last = i; });
    return last;
  }, [series]);

  // Hauteur des barres proportionnelle au DELTA (votants de l'heure)
  const maxDelta = useMemo(
    () => Math.max(1, ...series.map((s) => s.delta)),
    [series]
  );

  // Courbe blanche basée sur le CUMUL
  const maxCumul = useMemo(
    () => Math.max(1, ...series.map((s) => s.cumul)),
    [series]
  );

  /**
   * Palette strictement verte (T1) ou bleue (T2) — ZÉRO jaune/orange.
   * t = 0..1 selon la position dans les heures ayant des données.
   */
  const getBarColor = (t, hasData) => {
    if (!hasData) return { bar: "#e2e8f0", text: "#94a3b8" };

    if (tour === 2) {
      // T2 : bleu très clair → bleu foncé
      // [0] #bfdbfe (200,219,254) → [0.5] #60a5fa (96,165,250) → [1] #1e40af (30,64,175)
      let r, g, b;
      if (t < 0.5) {
        const u = t / 0.5;
        r = Math.round(200 + (96  - 200) * u);
        g = Math.round(219 + (165 - 219) * u);
        b = Math.round(254 + (250 - 254) * u);
      } else {
        const u = (t - 0.5) / 0.5;
        r = Math.round(96  + (30  - 96 ) * u);
        g = Math.round(165 + (64  - 165) * u);
        b = Math.round(250 + (175 - 250) * u);
      }
      const textColor = t > 0.3 ? "#fff" : "#1e3a8a";
      return { bar: `rgb(${r},${g},${b})`, text: textColor };
    }

    // T1 : vert très clair → vert foncé — ZÉRO jaune/orange
    // [0] #bbf7d0 (187,247,208) → [0.5] #22c55e (34,197,94) → [1] #14532d (20,83,45)
    let r, g, b;
    if (t < 0.5) {
      const u = t / 0.5;
      r = Math.round(187 + (34  - 187) * u);
      g = Math.round(247 + (197 - 247) * u);
      b = Math.round(208 + (94  - 208) * u);
    } else {
      const u = (t - 0.5) / 0.5;
      r = Math.round(34  + (20  - 34 ) * u);
      g = Math.round(197 + (83  - 197) * u);
      b = Math.round(94  + (45  - 94 ) * u);
    }
    const textColor = t > 0.3 ? "#fff" : "#14532d";
    return { bar: `rgb(${r},${g},${b})`, text: textColor };
  };

  // Courbe SVG blanche sur le cumul (lissée Catmull-Rom)
  const svgPaths = useMemo(() => {
    const pts = series
      .map((s, i) => ({ ...s, i }))
      .filter((s) => s.hasData)
      .map((s) => ({
        x: (s.i / (series.length - 1)) * 100,
        y: 100 - (s.cumul / maxCumul) * 88,
      }));

    if (pts.length < 2) return { line: "", area: "", pts: [] };

    const catmull = (p0, p1, p2, p3) => {
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      return `C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
    };

    let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      d += " " + catmull(pts[i - 1] || pts[i], pts[i], pts[i + 1], pts[i + 2] || pts[i + 1]);
    }

    const last = pts[pts.length - 1];
    const area = `${d} L ${last.x.toFixed(2)} 100 L ${pts[0].x.toFixed(2)} 100 Z`;
    return { line: d, area, pts };
  }, [series, maxCumul]);

  const hasAnyData = lastDataIndex >= 0;
  const dataPoints = series.filter((s) => s.hasData);
  const dataCount  = dataPoints.length;
  let   dataRank   = 0;

  return (
    <div className="info-evolution">
      <div className="info-evolution-head">
        <div className="info-evolution-title">⏱ Évolution horaire</div>
        <div className="info-evolution-sub">
          {hasAnyData
            ? `Votants/heure (barres) + cumul (courbe) — jusqu'à ${series[lastDataIndex]?.label}`
            : "En attente de données"}
        </div>
      </div>

      <div className="info-evo-chart-area">
        <div className="info-evo-bars">
          {series.map((s, i) => {
            // Hauteur proportionnelle au DELTA (votants de l'heure)
            const heightPct = s.hasData ? Math.max(6, (s.delta / maxDelta) * 100) : 0;

            let t = 0;
            if (s.hasData) {
              t = dataCount > 1 ? dataRank / (dataCount - 1) : 1;
              dataRank++;
            }
            const colors = getBarColor(t, s.hasData);

            return (
              <div key={s.label} className="info-evo-col">
                <div className="info-evo-bar-wrap">
                  <div
                    className="info-evo-bar"
                    style={{ height: `${heightPct}%`, background: colors.bar }}
                  >
                    {s.hasData && (
                      <span className="info-evo-bar-pct" style={{ color: colors.text }}>
                        {fmtPct(s.pctParticipation)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="info-evo-label">{s.label}</div>
                <div className="info-evo-votants">{s.hasData ? fmt(s.cumul) : "—"}</div>
              </div>
            );
          })}
        </div>

        {hasAnyData && svgPaths.line && (
          <svg className="info-evo-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path className="info-evo-area" d={svgPaths.area} />
            <path className="info-evo-line" d={svgPaths.line} />
            {svgPaths.pts.map((p, idx) => (
              <circle key={idx} className="info-evo-point" cx={p.x} cy={p.y} r="1.8" />
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}
