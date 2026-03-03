// src/config/authConfig.js
// Source unique des codes d'accès applicatifs (BV / Global / Admin)
//
// Variables requises dans .env.local :
//   VITE_BV_PASSWORDS=      JSON {"1":"pwd1","2":"pwd2",...} mots de passe individuels par bureau
//   VITE_GLOBAL_PASSWORD=
//   VITE_ADMIN_PASSWORD=
//   VITE_INFO_PASSWORD=

// Chargement sécurisé de VITE_BV_PASSWORDS
function _loadBvPasswords() {
  const raw = import.meta.env.VITE_BV_PASSWORDS;
  if (!raw) return null;
  let cleaned = '';
  try {
    cleaned = String(raw).trim();
    cleaned = cleaned.replace(/\\"/g, '"');
    cleaned = cleaned.replace(/^['"]|['"]$/g, '').trim();
    cleaned = cleaned.replace(/\s+/g, '');
    if (!cleaned.startsWith('{')) cleaned = '{"' + cleaned;
    if (!cleaned.endsWith('}')) cleaned = cleaned + '}';
    const parsed = JSON.parse(cleaned);
    if (typeof parsed === "object" && parsed !== null) return parsed;
    return null;
  } catch (e) {
    console.error("[authConfig] VITE_BV_PASSWORDS invalide.", e.message, '| Valeur:', cleaned);
    return null;
  }
}

export const ACCESS_CONFIG = Object.freeze({
  BV_MIN: 1,
  BV_MAX: 13,

  // Mots de passe individuels par bureau
  // Format JSON : {"1":"pwd1","2":"pwd2",...}
  BV_PASSWORDS: _loadBvPasswords(),

  GLOBAL_PASSWORD: import.meta.env.VITE_GLOBAL_PASSWORD,
  ADMIN_PASSWORD:  import.meta.env.VITE_ADMIN_PASSWORD,
  INFO_PASSWORD:   import.meta.env.VITE_INFO_PASSWORD,
});

/**
 * Vérifie que toutes les variables d'environnement requises sont présentes.
 */
export function validateEnvConfig() {
  const required = [
    "VITE_BV_PASSWORDS",
    "VITE_GLOBAL_PASSWORD",
    "VITE_ADMIN_PASSWORD",
    "VITE_INFO_PASSWORD",
  ];

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
 * Seul le Mode A est supporté pour les BV :
 *   VITE_BV_PASSWORDS = {"1":"pwd1","2":"pwd2",...}
 *   → saisir "pwd1" → BV1
 *
 * @param {string} code
 * @returns {{role:'BV'|'GLOBAL'|'ADMIN'|'INFO', bureauId?:number}|null}
 */
export function parseAccessCode(code) {
  if (typeof code !== "string") return null;
  const trimmed = code.trim();
  if (!trimmed) return null;

  // Global
  if (trimmed === ACCESS_CONFIG.GLOBAL_PASSWORD) return { role: "GLOBAL" };

  // Admin
  if (trimmed === ACCESS_CONFIG.ADMIN_PASSWORD) return { role: "ADMIN" };

  // Informations (lecture seule)
  if (trimmed === ACCESS_CONFIG.INFO_PASSWORD) return { role: "INFO" };

  // BV — mots de passe individuels uniquement
  if (ACCESS_CONFIG.BV_PASSWORDS) {
    for (const [bureauIdStr, pwd] of Object.entries(ACCESS_CONFIG.BV_PASSWORDS)) {
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
  const TOUR_PAGES  = new Set(["passage_second_tour", "configuration_t2", "passage_t"]);

  if (role === "ADMIN") return true;

  if (role === "GLOBAL") {
    if (ADMIN_PAGES.has(pageKey)) return false;
    if (TOUR_PAGES.has(pageKey))  return false;
    return true;
  }

  if (role === "INFO") {
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

export function isBV(auth)     { return auth?.role === "BV";     }
export function isGlobal(auth) { return auth?.role === "GLOBAL"; }
export function isAdmin(auth)  { return auth?.role === "ADMIN";  }
export function isInfo(auth)   { return auth?.role === "INFO";   }
