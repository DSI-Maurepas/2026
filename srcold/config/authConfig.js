// src/config/authConfig.js
// Source unique des codes d'accès applicatifs (BV / Global / Admin)
//
// ⚠️ IMPORTANT : les codes sont volontairement simples (usage interne "jour J").
// Ne jamais afficher les codes/mots de passe dans l'UI.

export const ACCESS_CONFIG = Object.freeze({
  // Codes bureaux (BV1..BV13)
  BV_PREFIX: "BV",
  BV_MIN: 1,
  BV_MAX: 13,
  BV_SUFFIX: "@2026",

  // Accès "global" (tout voir / tout faire sauf Administration + Passage Tour)
  GLOBAL_PASSWORD: "V!ct0ire@2026",

  // Mot de passe Administration (compat V3)
  ADMIN_PASSWORD: "ADMIN@2026",

  // Accès Informations (lecture seule)
  INFO_PASSWORD: "Info@2026",
});

/**
 * Parse un code saisi et retourne le profil applicatif correspondant.
 * Formats attendus :
 * - BVX@2026 (X = 1..13)
 * - V!ct0ire@2026 (GLOBAL)
 * - mot de passe admin (ADMIN)
 *
 * @param {string} code
 * @returns {{role:'BV'|'GLOBAL'|'ADMIN'|'INFO', bureauId?:number}|null}
 */
export function parseAccessCode(code) {
  if (typeof code !== "string") return null;
  const trimmed = code.trim();
  if (!trimmed) return null;

  // Global
  if (trimmed === ACCESS_CONFIG.GLOBAL_PASSWORD) {
    return { role: "GLOBAL" };
  }

  // Admin
  if (trimmed === ACCESS_CONFIG.ADMIN_PASSWORD) {
    return { role: "ADMIN" };
  }



// Informations (lecture seule)
if (trimmed === ACCESS_CONFIG.INFO_PASSWORD) {
  return { role: "INFO" };
}

  // BVx@Elections2026 : parsing SANS regex (plus robuste, zéro ambiguïté)
  const upper = trimmed.toUpperCase();
  const prefix = ACCESS_CONFIG.BV_PREFIX.toUpperCase();
  const suffix = ACCESS_CONFIG.BV_SUFFIX; // suffix est case-sensitive côté '@Elections2026' => on compare sans changer
  if (upper.startsWith(prefix) && trimmed.endsWith(suffix)) {
    const numberPart = trimmed.slice(prefix.length, trimmed.length - suffix.length);
    const bureauId = parseInt(numberPart, 10);
    if (Number.isFinite(bureauId) && bureauId >= ACCESS_CONFIG.BV_MIN && bureauId <= ACCESS_CONFIG.BV_MAX) {
      // On accepte BV en maj/min sur le préfixe, mais suffix exact.
      // (ex: bv1@Elections2026 OK, BV1@Elections2026 OK)
      return { role: "BV", bureauId };
    }
  }

  return null;
}

/**
 * Droits applicatifs (navigation / pages).
 * @param {{role:string, bureauId?:number}|null} auth
 * @param {string} pageKey
 */
export function canAccessPage(auth, pageKey) {
  const role = auth?.role;

  const ADMIN_PAGES = new Set(["admin_bureaux", "admin_candidats", "admin_audit", "admin"]);
  const TOUR_PAGES = new Set(["passage_second_tour", "configuration_t2", "passage_t"]);

  if (role === "ADMIN") return true;

  if (role === "GLOBAL") {
    if (ADMIN_PAGES.has(pageKey)) return false;
    if (TOUR_PAGES.has(pageKey)) return false;
    return true;
  }

  if (role === "INFO") {
    // Lecture seule : uniquement la page Informations + Participation INFO + dashboard
    const allowed = new Set(["dashboard", "informations", "info_participation"]);
    return allowed.has(pageKey);
  }

  if (role === "BV") {
    const allowed = new Set(["participation_saisie", "resultats_saisie_bureau", "participation", "resultats"]);
    return allowed.has(pageKey);
  }

  return false;
}

export function isBV(auth) {
  return auth?.role === "BV";
}
export function isGlobal(auth) {
  return auth?.role === "GLOBAL";
}
export function isAdmin(auth) {
  return auth?.role === "ADMIN";
}

export function isInfo(auth) {
  return auth?.role === "INFO";
}
