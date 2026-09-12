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
  /** Reseau utilise par Electron apres le provisioning. */
  networkMode?: "ethernet" | "wifi" | "provisioning";
};

/** Reponse de `GET /api/provisioning/health` sur le hotspot Electron. */
export type ProvisioningHealthResponse = {
  /** `true` si l'endpoint appartient au Desktop Liteforms. */
  ok: true;
  /** Mode temporaire : le Desktop attend les informations WiFi cible. */
  mode: "provisioning";
  /** Identifiant stable du Desktop, utile pour l'affichage Mobile. */
  deviceId: string;
  /** Nom lisible de l'appareil. */
  name: string;
  /** Version du protocole LAN. */
  protocolVersion: string;
  /**
   * Port effectif du service de provisioning (defaut `8080` ; jamais le
   * port 80, qui exige des privileges administrateur sous Windows/Linux).
   */
  port: number;
};

/** Payload sensible de `POST /api/provisioning/wifi`. */
export type WifiProvisioningRequest = {
  /** SSID du reseau que le Desktop doit rejoindre apres le hotspot. */
  ssid: string;
  /** Mot de passe WiFi ; ne doit jamais etre logge ni persiste sur Mobile. */
  password: string;
  /** Securite annoncee par le reseau cible. */
  security: "OPEN" | "WPA2-PSK" | "WPA3-SAE" | "WPA2-WPA3";
};

/** Reponse de `POST /api/provisioning/wifi`. */
export type WifiProvisioningResponse = {
  /** `true` si Electron a accepte les informations avant redemarrage reseau. */
  ok: true;
  /** Le Desktop doit fermer le hotspot et rejoindre le reseau cible. */
  restartRequired: true;
  /** Message generique, sans SSID ni mot de passe. */
  message: string;
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

/**
 * Reponse de `POST /api/device-config` (contrat v1, docs/contract/README.md
 * section 4) : accuse de reception POC (`appliedAt` = « recu et parque »).
 */
export type DeviceConfigAck = {
  /** `true` : la configuration a ete acceptee par le Desktop. */
  ok: true;
  /** Version de configuration confirmee par le Desktop. */
  configVersion: string;
  /** Horodatage de reception cote Desktop. */
  appliedAt: string;
  /** Parties recues mais non encore appliquees (ex. mood, pose). */
  warnings: string[];
};

/**
 * Resultat d'envoi de la configuration au Desktop, exploitable par l'UI.
 * En echec : erreur contractuelle (`code`/`message`) ou reseau, redactee.
 */
export type DeviceConfigSendResult =
  | DeviceConfigAck
  | { ok: false; error: string };

/**
 * Metadonnees d'un VRM de `GET /api/poc/vrms` (routes POC, jamais le binaire
 * — decision D2 : le Mobile ne reference que id/fileName).
 */
export type VrmSummary = {
  /** Identifiant stable du modele dans la bibliotheque Desktop. */
  id: string;
  /** Nom de fichier `.vrm` utilise pour le chargement cote renderer. */
  fileName: string;
  /** Taille du binaire en octets. */
  sizeBytes: number;
  /** Vrai si le modele est celui embarque par le Desktop (lobsterEdit). */
  builtin?: boolean;
};

/** Resultat de `fetchVrmList`, exploitable par l'UI. */
export type VrmListResult =
  | { ok: true; vrms: VrmSummary[] }
  | { ok: false; error: string };
