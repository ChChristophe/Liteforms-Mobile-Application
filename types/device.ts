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
  /**
   * Identifiant persistant de l'appliance (protocole 13/09/2026, champ
   * additif). `undefined` pour un serveur v1 anterieur : le Mobile traite
   * son absence comme « appliance non identifiable » (pas de match strict).
   */
  deviceId?: string;
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

/**
 * Reponse de `GET /api/provisioning/status` (protocole 13/09/2026) :
 * issue de la transition reseau apres un `POST /api/provisioning/wifi`
 * accepte. Servie par le hotspot (port de provisioning) ; la route devient
 * injoignable apres la bascule — « injoignable » est un cas NORMAL
 * (probable `joined`), pas une erreur payload.
 */
export type ProvisioningStatusResponse = {
  /** `true` : reponse conforme du serveur de provisioning. */
  ok: true;
  /** Transition reseau de l'appliance. */
  phase: "joining" | "joined" | "failed";
  /** Identifiant persistant de l'appliance (re-match apres bascule). */
  deviceId?: string;
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
      /** Identifiant appliance, si le serveur l'expose (13/09/2026). */
      deviceId?: string;
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

/**
 * Reponse de `POST /api/credentials` (protocole 17/09/2026). N'echoe JAMAIS
 * la cle : seule la forme masquee `maskedKey` (type `sk-****`) est exposee.
 */
export type CredentialAck = {
  /** `true` : la cle a ete acceptee et stockee cote appliance. */
  ok: true;
  /** Identifiant du provider concerne. */
  provider: string;
  /** `true` si l'appliance possede desormais une cle pour ce provider. */
  configured: boolean;
  /** Forme masquee de la cle, ou `null` si aucune. */
  maskedKey: string | null;
};

/** Resultat d'envoi d'une cle provider au Desktop, exploitable par l'UI. */
export type CredentialSendResult = CredentialAck | { ok: false; error: string };

/** Statut d'un slot (llm/tts/stt) dans `GET /api/provider-status`. */
export type ProviderSlotStatus = {
  /** Identifiant du provider configure pour ce slot. */
  provider: string;
  /** `true` si une cle est disponible cote appliance. */
  configured: boolean;
  /** Forme masquee de la cle, ou `null`. */
  maskedKey: string | null;
};

/** Reponse de `GET /api/provider-status` (protocole v1). */
export type ProviderStatusResponse = {
  /** `true` : statut conforme du Desktop. */
  ok: true;
  /** Statut par slot, jamais de cle reelle (masquee uniquement). */
  providers: {
    llm: ProviderSlotStatus;
    tts: ProviderSlotStatus;
    stt: ProviderSlotStatus;
  };
};

/** Resultat de `getProviderStatus`, exploitable par l'UI. */
export type ProviderStatusResult = ProviderStatusResponse | { ok: false; error: string };

/**
 * Reponse de `GET /api/hue/status` (protocole 23/09/2026, appairage Philips
 * Hue pilote par le Mobile). Ne contient jamais la cle d'application Hue :
 * seuls l'etat d'appairage, l'IP du bridge et le nombre de lumieres.
 */
export type HueStatusResponse = {
  /** `true` : reponse conforme de l'appliance. */
  ok: true;
  /** Une cle est stockee ET le bridge repond. */
  paired: boolean;
  /** IP du bridge appaire, ou `null`. */
  bridgeIp: string | null;
  /** Nombre de lumieres, ou `null` (non appaire / injoignable). */
  lightCount: number | null;
};

/** Resultat de `fetchHueStatus`, exploitable par l'UI. */
export type HueStatusResult = HueStatusResponse | { ok: false; error: string };

/**
 * Reponse de `POST /api/hue/pair` (route bloquante, jusqu'a ~35 s) : appairage
 * reussi, bridge identifie. La cle n'est jamais renvoyee.
 */
export type HuePairResponse = {
  /** `true` : appairage reussi. */
  ok: true;
  /** Toujours `true` en succes. */
  paired: true;
  /** IP du bridge appaire. */
  bridgeIp: string;
};

/** Resultat de `pairHue`, exploitable par l'UI. */
export type HuePairResult = HuePairResponse | { ok: false; error: string };

/** Reponse de `POST /api/hue/unpair` : configuration Hue purgee. */
export type HueUnpairResponse = {
  /** `true` : purge acceptee. */
  ok: true;
  /** Toujours `false` apres purge. */
  paired: false;
};

/** Resultat de `unpairHue`, exploitable par l'UI. */
export type HueUnpairResult = HueUnpairResponse | { ok: false; error: string };

/**
 * Un flux suivi par la revue de presse (skill OpenClaw `blogwatcher`).
 * Forme des entrees de `GET /api/news/status` et de `POST /api/news/feeds`
 * (protocole 24/09/2026). Aucun secret : la source de verite est le SQLite
 * `blogwatcher` de l'appliance.
 */
export type NewsFeed = {
  /** Nom du flux (unique cote appliance). */
  name: string;
  /** URL du site ou du flux declaree par l'utilisateur. */
  url: string;
  /** URL du flux RSS decouverte, ou `null` si absente. */
  feedUrl: string | null;
  /** Derniere analyse ISO 8601, ou `null` si jamais analyse. */
  lastScanned: string | null;
  /**
   * Rubrique du flux (une seule par flux), ou `null` si aucune. Vit cote
   * appliance (`news-rubrics.json`) ; le Mobile ne fait que la piloter.
   */
  category: string | null;
};

/**
 * Reponse de `GET /api/news/status` (protocole 24/09/2026). La route reste
 * 200 meme si `blogwatcher` est absent (`available: false`, `feeds: []`,
 * `unreadCount: null`).
 */
export type NewsStatusResponse = {
  /** `true` : reponse conforme de l'appliance. */
  ok: true;
  /** La CLI `blogwatcher` repond cote appliance. */
  available: boolean;
  /** Flux suivis, tries par nom. */
  feeds: NewsFeed[];
  /**
   * Rubriques distinctes non vides, triees (protocole 24/09/2026) ; `[]` si
   * aucune. Sert de suggestions a la saisie cote Mobile.
   */
  categories: string[];
  /** Nombre d'articles non lus, ou `null` si indisponible. */
  unreadCount: number | null;
};

/** Resultat de `fetchNewsStatus`, exploitable par l'UI. */
export type NewsStatusResult = NewsStatusResponse | { ok: false; error: string };

/** Reponse de `POST /api/news/feeds` : le flux ajoute (jamais de secret). */
export type NewsAddResponse = {
  /** `true` : flux accepte par l'appliance. */
  ok: true;
  /** Flux cree tel que renvoye par l'appliance. */
  feed: NewsFeed;
};

/** Resultat de `addNewsFeed`, exploitable par l'UI. */
export type NewsAddResult = NewsAddResponse | { ok: false; error: string };

/**
 * Reponse de `POST /api/news/feeds/category` (protocole 24/09/2026) : rubrique
 * du flux mise a jour. `category` vaut `null` quand la rubrique est retiree.
 */
export type NewsCategoryResponse = {
  /** `true` : mise a jour acceptee par l'appliance. */
  ok: true;
  /** Nom du flux concerne. */
  name: string;
  /** Nouvelle rubrique du flux, ou `null` si retiree. */
  category: string | null;
};

/** Resultat de `setNewsCategory`, exploitable par l'UI. */
export type NewsCategoryResult = NewsCategoryResponse | { ok: false; error: string };

/** Reponse de `POST /api/news/feeds/remove` : flux (et articles) supprime. */
export type NewsRemoveResponse = {
  /** `true` : suppression acceptee. */
  ok: true;
};

/** Resultat de `removeNewsFeed`, exploitable par l'UI. */
export type NewsRemoveResult = NewsRemoveResponse | { ok: false; error: string };

/** Detail par flux d'une analyse `POST /api/news/scan`. */
export type NewsScanFeed = {
  /** Nom du flux analyse. */
  name: string;
  /** Nouveaux articles trouves pour ce flux. */
  newArticles: number;
  /** Articles au total trouves pour ce flux. */
  totalFound: number;
  /** Source utilisee pour decouvrir les articles. */
  source: "rss" | "html" | "none";
  /** Message d'echec du flux, absent en succes (compte alors 0). */
  error?: string;
};

/**
 * Reponse de `POST /api/news/scan` (route bloquante, jusqu'a ~60 s) :
 * total des nouveaux articles et detail par flux.
 */
export type NewsScanResponse = {
  /** `true` : analyse terminee. */
  ok: true;
  /** Total des nouveaux articles, tous flux confondus. */
  newArticles: number;
  /** Detail par flux analyse. */
  feeds: NewsScanFeed[];
};

/** Resultat de `scanNews`, exploitable par l'UI. */
export type NewsScanResult = NewsScanResponse | { ok: false; error: string };

/**
 * Reponse de `POST /api/news/setup` (protocole 24/09/2026, route bloquante
 * jusqu'a ~60 s) : installation de la CLI `blogwatcher` sur l'appliance.
 * `installed` vaut `false` quand le binaire etait deja present (idempotent).
 */
export type NewsSetupResponse = {
  /** `true` : operation d'installation terminee. */
  ok: true;
  /** `true` si le binaire vient d'etre installe, `false` s'il etait deja la. */
  installed: boolean;
  /** `true` si la CLI repond apres l'operation. */
  available: boolean;
  /** Version installee/epinglee. */
  version: string;
};

/** Resultat de `setupNews`, exploitable par l'UI. */
export type NewsSetupResult = NewsSetupResponse | { ok: false; error: string };

/**
 * Reponse de `GET /api/spotify/status` (protocole 24/09/2026, Spotify pilote
 * par le Mobile). Ne contient jamais de token : seuls la presence d'un token
 * stocke (`configured`) et la disponibilite de la CLI `spogo` (`available`).
 */
export type SpotifyStatusResponse = {
  /** `true` : reponse conforme de l'appliance. */
  ok: true;
  /** Un token Spotify est stocke cote appliance. */
  configured: boolean;
  /** La CLI `spogo` repond cote appliance. */
  available: boolean;
};

/** Resultat de `fetchSpotifyStatus`, exploitable par l'UI. */
export type SpotifyStatusResult = SpotifyStatusResponse | { ok: false; error: string };

/**
 * Un appareil Spotify vu par l'appliance (`GET /api/spotify/devices`).
 * `alias` est le nom donne par l'utilisateur (source unique cote appliance),
 * `isDefault` l'appareil cible par defaut.
 */
export type SpotifyDevice = {
  /** Identifiant Spotify de l'appareil. */
  id: string;
  /** Nom d'origine de l'appareil (ex. `55OLED935/12`). */
  name: string;
  /** Type d'appareil (ex. `TV`, `Computer`, `Smartphone`). */
  type: string;
  /** `true` si l'appareil lit actuellement. */
  isActive: boolean;
  /** Alias utilisateur, ou `null` si aucun. */
  alias: string | null;
  /** `true` si l'appareil est la cible par defaut. */
  isDefault: boolean;
};

/** Reponse de `GET /api/spotify/devices`. */
export type SpotifyDevicesResponse = {
  /** `true` : liste conforme de l'appliance. */
  ok: true;
  /** Appareils Spotify connus. */
  devices: SpotifyDevice[];
};

/** Resultat de `fetchSpotifyDevices`, exploitable par l'UI. */
export type SpotifyDevicesResult = SpotifyDevicesResponse | { ok: false; error: string };

/**
 * Corps de `POST /api/spotify/auth` : le refresh token est la source de verite
 * (l'access token peut etre absent, spogo le rafraichit). Aucun secret n'est
 * conserve cote Mobile : le token part vers l'appliance.
 */
export type SpotifyAuthRequest = {
  /** Client ID public de Liteforms (embarque, non secret). */
  clientId: string;
  /** Refresh token OAuth (source de verite cote appliance). */
  refreshToken: string;
  /** Access token initial, optionnel. */
  accessToken?: string;
  /** Scopes accordes, optionnel. */
  scope?: string;
  /** Duree de vie de l'access token en secondes, optionnel. */
  expiresIn?: number;
};

/** Reponse de `POST /api/spotify/auth` en succes : token stocke. */
export type SpotifyAuthAck = {
  /** `true` : token accepte et stocke. */
  ok: true;
  /** Toujours `true` en succes. */
  configured: true;
};

/** Resultat de `sendSpotifyToken`, exploitable par l'UI. */
export type SpotifyAuthResult = SpotifyAuthAck | { ok: false; error: string };

/** Reponse de `POST /api/spotify/devices/aliases` (alias ou defaut). */
export type SpotifyAliasResponse = {
  /** `true` : mise a jour acceptee. */
  ok: true;
};

/** Resultat de `setSpotifyAlias` / `setSpotifyDefault`, exploitable par l'UI. */
export type SpotifyAliasResult = SpotifyAliasResponse | { ok: false; error: string };

/** Actions acceptees par `POST /api/spotify/control`. */
export type SpotifyControlAction =
  | "play"
  | "pause"
  | "resume"
  | "next"
  | "previous"
  | "volume_up"
  | "volume_down"
  | "mute"
  | "status";

/** Corps de `POST /api/spotify/control`. */
export type SpotifyControlRequest = {
  /** Action de lecture a executer. */
  action: SpotifyControlAction;
  /** Titre/artiste/album/playlist pour `play`. */
  query?: string;
  /** Alias ou nom de l'appareil cible (sinon defaut, sinon actif). */
  device?: string;
};

/**
 * Reponse de `POST /api/spotify/control` en succes : `ok` plus des champs
 * specifiques a l'action (ex. `status` renvoie l'etat courant). Index signature
 * volontaire : le contrat ne fige pas les champs additionnels.
 */
export type SpotifyControlResponse = { ok: true } & Record<string, unknown>;

/** Resultat de `spotifyControl`, exploitable par l'UI. */
export type SpotifyControlResult = SpotifyControlResponse | { ok: false; error: string };
