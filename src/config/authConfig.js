// src/config/authConfig.js
// Source unique des codes d'accès applicatifs (BV / Global / Admin)
//
// ⚠️ IMPORTANT : les codes sont chargés depuis les variables d'environnement (.env.local).
// Ne jamais committer .env.local sur GitHub.
// Ne jamais afficher les codes/mots de passe dans l'UI.
//
// Variables requises dans .env.local :
//   VITE_BV_SUFFIX=         (suffixe commun, utilisé si VITE_BV_PASSWORDS absent)
//   VITE_BV_PASSWORDS=      (optionnel) JSON {"1":"pwd1","2":"pwd2",...} pour mots de passe individuels
//   VITE_GLOBAL_PASSWORD=
//   VITE_ADMIN_PASSWORD=
//   VITE_INFO_PASSWORD=

// Chargement sécurisé de VITE_BV_PASSWORDS (JSON optionnel)
function _loadBvPasswords() {
  const raw = import.meta.env.VITE_BV_PASSWORDS;
  if (!raw) return null;
  try {
    let cleaned = String(raw).trim();
    // Déséchappe les guillemets internes \" → "
    cleaned = cleaned.replace(/\\"/g, '"');
    // Retire les guillemets simples ou doubles encadrants
    cleaned = cleaned.replace(/^['"]|['"]$/g, '').trim();
    // Retire les espaces et sauts de ligne superflus
    cleaned = cleaned.replace(/\s+/g, '');
    // Reconstitue les accolades si elles ont été supprimées
    if (!cleaned.startsWith('{')) cleaned = '{' + cleaned;
    if (!cleaned.endsWith('}')) cleaned = cleaned + '}';
    const parsed = JSON.parse(cleaned);
    if (typeof parsed === "object" && parsed !== null) return parsed;
    return null;
  } catch {
    console.error("[authConfig] VITE_BV_PASSWORDS : JSON invalide. Vérifiez votre .env.local.");
    return null;
  }
}

export const ACCESS_CONFIG = Object.freeze({
  // Codes bureaux (BV1..BV13)
  BV_PREFIX: "BV",
  BV_MIN: 1,
  BV_MAX: 13,
  BV_SUFFIX: import.meta.env.VITE_BV_SUFFIX,

  // Mots de passe individuels par bureau (optionnel)
  // Format JSON : {"1":"pwd1","2":"pwd2",...}
  // Si présent, remplace le système BV_SUFFIX pour l'authentification.
  BV_PASSWORDS: _loadBvPasswords(),

  // Accès "global" (tout voir / tout faire sauf Administration + Passage Tour)
  GLOBAL_PASSWORD: import.meta.env.VITE_GLOBAL_PASSWORD,

  // Mot de passe Administration (compat V3)
  ADMIN_PASSWORD: import.meta.env.VITE_ADMIN_PASSWORD,

  // Accès Informations (lecture seule)
  INFO_PASSWORD: import.meta.env.VITE_INFO_PASSWORD,
});

/**
 * Vérifie que toutes les variables d'environnement requises sont présentes.
 * À appeler au démarrage de l'application pour détecter une config incomplète.
 */
export function validateEnvConfig() {
  const required = [
    "VITE_GLOBAL_PASSWORD",
    "VITE_ADMIN_PASSWORD",
    "VITE_INFO_PASSWORD",
  ];

  // VITE_BV_SUFFIX requis uniquement si VITE_BV_PASSWORDS absent
  if (!import.meta.env.VITE_BV_PASSWORDS) {
    required.push("VITE_BV_SUFFIX");
  }

  const missing = required.filter((key) => !import.meta.env[key]);
  if (missing.length > 0) {
    console.error(
      `[authConfig] Variables d'environnement manquantes : ${missing.join(", ")}. Vérifiez votre .env.local.`
    );
  }
  return missing.length === 0;
}

/**
 * Parse un code saisi et retourne le profil applicatif correspondant.
 *
 * Formats attendus :
 * Mode A - Mots de passe individuels (VITE_BV_PASSWORDS défini) :
 *   - le code saisi est directement comparé aux valeurs du JSON
 *   - ex : {"1":"xK9!mR2026"} → saisir "xK9!mR2026" → BV1
 *
 * Mode B - Suffixe commun (VITE_BV_SUFFIX défini, comportement historique) :
 *   - BVX{SUFFIX} (X = BV_MIN..BV_MAX, SUFFIX = VITE_BV_SUFFIX)
 *   - ex : BV1@Bv!x2026 → BV1
 *
 * - mot de passe global (GLOBAL) = VITE_GLOBAL_PASSWORD
 * - mot de passe admin (ADMIN)   = VITE_ADMIN_PASSWORD
 * - mot de passe info (INFO)     = VITE_INFO_PASSWORD
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

  // MODE A — Mots de passe individuels par bureau (VITE_BV_PASSWORDS)
  if (ACCESS_CONFIG.BV_PASSWORDS) {
    const entries = Object.entries(ACCESS_CONFIG.BV_PASSWORDS);
    for (const [bureauIdStr, pwd] of entries) {
      if (typeof pwd === "string" && trimmed === pwd) {
        const bureauId = parseInt(bureauIdStr, 10);
        if (
          Number.isFinite(bureauId) &&
          bureauId >= ACCESS_CONFIG.BV_MIN &&
          bureauId <= ACCESS_CONFIG.BV_MAX
        ) {
          return { role: "BV", bureauId };
        }
      }
    }
    // Si VITE_BV_PASSWORDS est défini mais le code ne correspond à aucun bureau → refus
    return null;
  }

  // MODE B — Suffixe commun (comportement historique, non régressable)
  const upper = trimmed.toUpperCase();
  const prefix = ACCESS_CONFIG.BV_PREFIX.toUpperCase();
  const suffix = ACCESS_CONFIG.BV_SUFFIX;
  if (suffix && upper.startsWith(prefix) && trimmed.endsWith(suffix)) {
    const numberPart = trimmed.slice(prefix.length, trimmed.length - suffix.length);
    const bureauId = parseInt(numberPart, 10);
    if (
      Number.isFinite(bureauId) &&
      bureauId >= ACCESS_CONFIG.BV_MIN &&
      bureauId <= ACCESS_CONFIG.BV_MAX
    ) {
      // On accepte BV en maj/min sur le préfixe, mais suffix exact.
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
    const allowed = new Set([
      "participation_saisie",
      "resultats_saisie_bureau",
      "participation",
      "resultats",
    ]);
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
