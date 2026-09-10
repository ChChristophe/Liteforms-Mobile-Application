/**
 * Erreurs du client LAN Electron et redaction (PLAN.md Phase 6, regles du
 * client : distinction timeout/refus/HTTP invalide/payload invalide ;
 * redaction des erreurs contenant une URL ou un token).
 */

/** Cause racine d'un echec reseau vers le Desktop. */
export type DeviceErrorKind =
  /** Delai depasse (AbortController du client). */
  | "timeout"
  /** Connexion refusee / introuvable (LAN, DNS, port ferme). */
  | "unreachable"
  /** HTTP ok mais statut hors 2xx. */
  | "http"
  /** 2xx mais corps non conforme au contrat Desktop. */
  | "payload"
  /** Tout le reste (bug d'appelant, exception JS). */
  | "unknown";

/**
 * Erreur reseau Mobile -> Desktop, exploitable dans l'UI sans exposer de
 * secret. Toujours cacher cette erreur via `redactText` avant toute
 * persistence ou log : son message peut contenir l'URL fournie par
 * l'appelant (qui contient la cle de pairing dans les routes authentifiees).
 */
export class DeviceNetworkError extends Error {
  /** Cause racine normalisee. */
  kind: DeviceErrorKind;
  /** Statut HTTP si `kind: "http"`. */
  httpStatus?: number;

  constructor(kind: DeviceErrorKind, message: string, httpStatus?: number) {
    super(message);
    this.name = "DeviceNetworkError";
    this.kind = kind;
    this.httpStatus = httpStatus;
  }
}

/**
 * Masque les motifs de secret dans une chaine de diagnostic avant log ou
 * persistence : tokens Bearer du header, cles `sk-...` et pairing codes.
 *
 * ponytail: couverture par motifs, pas par secrete session — suffisant
 * pour tous les appels sur ces routes (le token passe uniquement en
 * header, donc le motif Bearer couvre le cas reel).
 */
export function redactText(text: string): string {
  return text
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-[redacted]")
    .replace(/(token|pairing)[=:]\s*[A-Za-z0-9._-]{4,}/gi, "$1=[redacted]");
}
