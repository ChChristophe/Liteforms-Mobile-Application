/**
 * Contrat Desktop <- Mobile : reponses attendues du poste Electron
 * (PLAN.md sections 5.2 et Phase 6).
 *
 * ATTENTION D4 : ce contrat est la forme minimale issue du plan ; il doit
 * etre confirme (ou ajuste) avec l'implementation reelle d'`liteforms-electron`
 * avant la Phase 7 (sync live). Politiques retenues :
 * - les reponses ne contiennent JAMAIS de credential (D1) ;
 * - le champ inconnu est ignore par ce module ;
 * - une reponse au format inattendu est une erreur `payload`, jamais un
 *   statut de fuite silencieuse.
 */

/** Version du protocole LAN supportee par ce client. */
export const DESKTOP_PROTOCOL_VERSION = "1.0" as const;

/**
 * Reponse `GET /api/health` du Desktop.
 *
 * Le Mobile l'utilise pour :
 * - confirmer que l'IP/port pointe bien sur un Desktop Liteforms ;
 * - verifier que `protocolVersion` et `configVersions` sont compatibles
 *   avant tout envoi de configuration.
 */
export type DesktopHealthResponse = {
  /** `true` : la route est repondue par un Desktop Liteforms. */
  ok: true;
  /** Nom affichable de l'appareil Desktop (libre). */
  name: string;
  /** Version du protocole LAN revendiquee par le Desktop. */
  protocolVersion: string;
  /**
   * Versions de configuration acceptees (au moins la notre pour etre
   * compatible). Si absent, seule `protocolVersion` est verifiee.
   */
  configVersions?: string[];
};

/**
 * Resultat de verification du Desktop avant envoi.
 *
 * - `ok: true` : Desktop joignable et compatible ;
 * - `ok: false` : raison exploitable pour l'UI, sans detail reseau secret.
 */
export type DesktopHealthCheck =
  | {
      ok: true;
      desktopName: string;
      protocolVersionMatches: boolean;
      configVersionSupported: boolean;
    }
  | { ok: false; error: string };
