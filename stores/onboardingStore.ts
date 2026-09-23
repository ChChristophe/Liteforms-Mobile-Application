import { create } from "zustand";
import {
  discoverDesktop,
  getLocalIpAddress,
} from "../lib/network/discovery";
import {
  fetchDesktopHealth,
  fetchProvisioningStatus,
  hasProvisioningStatus,
  sendWifiProvisioning,
  type ProvisioningStatusResult,
} from "../lib/network/deviceClient";
import {
  clearConnectionInfo,
  loadConnectionInfo,
} from "../lib/storage/connectionStorage";
import { useConnectionStore } from "./connectionStore";
import type { WifiProvisioningRequest } from "../types/device";

/**
 * Machine a etats de l'onboarding « zéro IP » (dec. 13/09/2026, plan
 * directeur Electron §5ter).
 *
 * L'utilisateur ne saisit jamais d'IP/port :
 *   discovering -> needHotspot    (echec de decouverte : rejoindre le hotspot)
 *               -> wifiForm       (hotspot appris : SSID + mot de passe)
 *               -> sending        (POST /api/provisioning/wifi)
 *               -> switching      (bascule WiFi + scan auto, statut 13/09)
 *               -> connected      (deviceId re-matche, coordonnees persistees)
 *   connected | failed(raison) — les erreurs sont volatiles ici.
 *
 * Persiste le minimum dans `connectionStorage` (etendu, pas duplique) :
 * coordonnees + `deviceId` appris. Le mot de passe WiFi n'entre JAMAIS
 * ici ni dans AsyncStorage (PLAN.md 3.3) : il reste local a l'ecran.
 */
export type OnboardingPhase =
  | "idle"
  | "discovering"
  | "needHotspot"
  | "wifiForm"
  | "sending"
  | "switching"
  | "connected"
  | "failed";

/** Coordonnees du hotspot appris pendant la premiere association. */
export type HotspotCoordinates = {
  host: string;
  port: number;
  deviceId: string | null;
  name: string;
};

export type OnboardingStore = {
  /** Etape courante du flow (cf. doc du type). */
  phase: OnboardingPhase;
  /** Hotspot de provisioning appris, ou `null`. Volatile. */
  hotspot: HotspotCoordinates | null;
  /** Dernier message d'erreur utilisateur, ou `null`. Volatile. */
  lastError: string | null;

  /**
   * Reconnexion automatique au lancement, ou premiere association par scan :
   * coordonnees connues -> health check direct ; sinon scan du /24 courant
   * (match strict sur le deviceId appris deja connu, le cas echeant) ; en
   * dernier recours, scan du mode provisioning (mobile deja sur le hotspot
   * Electron, ou la device API 43178 est en loopback et seul le port 8080
   * repond) -> phase `wifiForm`.
   */
  startDiscovery: () => Promise<void>;
  /**
   * Nouvelle tentative depuis l'etat `needHotspot` : scan du reseau courant ;
   * sur le hotspot Electron, l'appliance en mode provisioning est acceptee.
   */
  retryDiscovery: () => Promise<void>;
  /**
   * Envoie les credentials WiFi au hotspot appris puis passe en `switching`.
   * Le mot de passe n'est pas conserve au-dela de l'appel.
   */
  submitWifi: (ssid: string, password: string) => Promise<void>;
  /**
   * Interroge le serveur de provisioning sur la transition (route 13/09).
   * `reachable: false` est un cas NORMAL (hotspot mort = bascule reussie).
   */
  pollProvisioning: () => Promise<ProvisioningStatusResult | null>;
  /**
   * Scan LAN post-bascule pour re-matcher l'appliance par `deviceId`.
   * `{found: true}` -> phase `connected` ; `{found: false}` -> l'ecran
   * continue de boucler sur `switching`.
   */
  searchAfterSwitch: () => Promise<{ found: boolean } | null>;
  /** Re-appairage manuel (reglages avances) : oubli complet, retour a « besoin hotspot ». */
  reset: () => Promise<void>;
};

export const useOnboardingStore = create<OnboardingStore>((set, get) => ({
  phase: "idle",
  hotspot: null,
  lastError: null,

  startDiscovery: async () => {
    if (get().phase === "discovering" || get().phase === "switching") return;
    set({ phase: "discovering", lastError: null });
    await useConnectionStore.getState().hydrate();
    const stored = await loadConnectionInfo();

    // 1. Coordonnees connues : health check direct (chemin rapide).
    // Le client reseau ne lève pas en principe ; un catch garde l'ecran 1
    // joignable si l'ecosysteme fuit une exception brut.
    try {
      if (stored !== null) {
        const check = await fetchDesktopHealth(stored.host, stored.port);
        if (
          check.ok &&
          !(
            stored.deviceId != null &&
            check.deviceId != null &&
            check.deviceId !== stored.deviceId
          )
        ) {
          // re-enregistre avec le deviceId si le serveur vient de l'exposer.
          await useConnectionStore.getState().registerDesktop(
            stored.host,
            stored.port,
            check.deviceId ?? stored.deviceId ?? null
          );
          set({ phase: "connected" });
          return;
        }
      }
    } catch {
      // on retombe sur le scan ci-dessous.
    }

    // 2. Scan du sous-reseau courant (match strict sur le deviceId connu).
    const found = await discoverScan(stored?.deviceId ?? null);
    if (found !== null) {
      const registered = await useConnectionStore
        .getState()
        .registerDesktop(found.host, found.port, found.deviceId);
      if (registered.ok) {
        set({ phase: "connected" });
        return;
      }
    }

    // 3. Mode provisioning : mobile deja sur le hotspot Electron. La device
    //    API 43178 est en loopback cote Electron (non joignable depuis le
    //    telephone) ; seul le serveur de provisioning 8080 repond. Sans ce
    //    scan, un lancement sur le hotspot resterait bloque sur needHotspot.
    const onHotspot = await discoverScan(null, true);
    if (onHotspot !== null) {
      set({
        hotspot: onHotspot,
        phase: "wifiForm",
        lastError: null,
      });
      return;
    }
    set({
      phase: "needHotspot",
      lastError: null,
      hotspot: null,
    });
  },

  retryDiscovery: async () => {
    set({ phase: "discovering", lastError: null });
    await useConnectionStore.getState().hydrate();
    const stored = await loadConnectionInfo();

    // D'abord le reseau courant (l'utilisateur a peut-etre rejoint le WiFi
    // maison apres une transition reussie depuis un autre appareil).
    const found = await discoverScan(stored?.deviceId ?? null);
    if (found !== null) {
      const registered = await useConnectionStore
        .getState()
        .registerDesktop(found.host, found.port, found.deviceId);
      if (registered.ok) {
        set({ phase: "connected" });
        return;
      }
    }

    // Sinon : sur le hotspot Electron (mode provisioning accepte).
    const onHotspot = await discoverScan(null, true);
    if (onHotspot !== null) {
      set({
        hotspot: onHotspot,
        phase: "wifiForm",
        lastError: null,
      });
      return;
    }
    set({
      phase: "needHotspot",
      lastError: "Aucune appliance trouvée. Rejoignez d'abord un réseau.",
    });
  },

  submitWifi: async (ssid, password) => {
    const hotspot = get().hotspot;
    if (hotspot === null) {
      set({ phase: "needHotspot", lastError: "Hotspot non identifié." });
      return;
    }
    const wifiSsid = ssid.trim();
    if (wifiSsid.length === 0) {
      set({ lastError: "Le SSID du WiFi maison est requis." });
      return;
    }
    set({ phase: "sending", lastError: null });
    const payload: WifiProvisioningRequest = {
      ssid: wifiSsid,
      password,
      security: password.length > 0 ? "WPA2-PSK" : "OPEN",
    };
    // Fix 13/09 (b) : après un 202 accepté, le hotspot meurt pendant la
    // réponse — un échec d'envoi fetch ici est une transition NORMALE, pas
    // une erreur affichable ; l'issue véritable sort du polling de
    // `/api/provisioning/status` (phase=failed => raison affichée).
    // Le mot de passe n'est pas conserve ici : il vit dans l'appel seul.
    await sendWifiProvisioning(hotspot.host, hotspot.port, payload);
    set({ phase: "switching" });
  },

  pollProvisioning: async () => {
    const hotspot = get().hotspot;
    if (hotspot === null) return null;
    const status = await fetchProvisioningStatus(hotspot.host, hotspot.port);
    if (status.reachable && !hasProvisioningStatus(status) && "invalid" in status && status.invalid) {
      set({ phase: "failed", lastError: status.error });
      return status;
    }
    if (hasProvisioningStatus(status) && status.status.phase === "failed") {
      set({
          phase: "failed",
          lastError:
            "L'appliance n'a pas rejoint le WiFi cible. Sur un poste Windows, vérifiez que la localisation est activée dans les réglages Windows (requis par le WiFi), puis relancez l'appairage.",
      });
    }
    return status;
  },

  searchAfterSwitch: async () => {
    // Le deviceId attendu : celui du hotspot (appris), sinon la session.
    const expected =
      get().hotspot?.deviceId ?? (await loadConnectionInfo())?.deviceId ?? null;
    const localIp = await getLocalIpAddress();
    const found = await discoverScan(expected, false, localIp);
    if (found === null) {
      set({
        lastError: null,
      });
      return { found: false };
    }
    const registered = await useConnectionStore
      .getState()
      .registerDesktop(found.host, found.port, found.deviceId ?? expected);
    if (!registered.ok) {
      set({ lastError: registered.errors.join(" ") });
      return { found: false };
    }
    set({
      phase: "connected",
      hotspot: null,
      lastError: null,
    });
    return { found: true };
  },

  reset: async () => {
    await clearConnectionInfo();
    await useConnectionStore.getState().forgetDesktop();
    set({
      phase: "needHotspot",
      hotspot: null,
      lastError: null,
    });
  },
}));

/**
 * Scan LAN ou hotspot, DRY pour les trois actions : `null` = rien trouve.
 * Trace en dev (gated `__DEV__`, terminal Metro) l'IP locale, le mode de
 * scan et le resultat — IP/deviceId sont non secrets.
 * @param expectedDeviceId deviceId a matcher strictement, ou `null`.
 * @param provisioning accepter le mode provisioning (mobile sur hotspot).
 * @param localIp IP locale, sinon devinee via `getLocalIpAddress`.
 */
async function discoverScan(
  expectedDeviceId: string | null,
  provisioning: boolean = false,
  localIp: string | null = null
) {
  const ip = localIp ?? (await getLocalIpAddress());
  const result = await discoverDesktop(ip, {
    deviceId: expectedDeviceId,
    acceptProvisioning: provisioning,
  });
  // Trace dev grep-able ; `typeof` protege le runtime vitest/node ou
  // `__DEV__` n'est pas defini. Jamais de secret ici (IP/deviceId publics).
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    const mode = provisioning ? "provisioning:8080" : "lan:43178";
    const outcome = result.ok
      ? `${result.host}:${result.port} deviceId=${result.deviceId ?? "none"}`
      : "none";
    console.log(
      `[discovery] localIp=${ip ?? "none"} scan=${mode} result=${outcome}`
    );
  }
  if (!result.ok) return null;
  return {
    host: result.host,
    port: result.port,
    deviceId: result.deviceId,
    name: result.name,
  };
}
