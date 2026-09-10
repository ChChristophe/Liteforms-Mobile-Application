import { create } from "zustand";
import {
  fetchDesktopHealth,
  fetchProvisioningHealth,
  sendWifiProvisioning,
} from "../lib/network/deviceClient";
import {
  clearConnectionInfo,
  loadConnectionInfo,
  saveConnectionInfo,
} from "../lib/storage/connectionStorage";
import type { WifiProvisioningRequest } from "../types/device";

/**
 * Etat de connexion au Desktop (PLAN.md Phase 6, premier flux D3).
 *
 * Separation des donnees (PLAN.md 3.3) :
 * - host/port : coordonnees ordinaires (reseau local, non secret) => AsyncStorage ;
 * - mot de passe WiFi de provisioning : transitoire, jamais dans ce store ni
 *   dans AsyncStorage ;
 * - statut de connexion : volatile, alimente par le client reseau.
 */
export type ConnectionStore = {
  /** IPv4 du Desktop, ou `null` tant que non configuree. */
  host: string | null;
  /** Port HTTP du Desktop, ou `null`. */
  port: number | null;
  /** `true` seulement apres un health check reussi (Desktop joignable). */
  connectedDesktop: string | null;
  /** `true` a l'init et pendant un health check en cours. */
  checking: boolean;
  /** Derniere erreur exploitable (nee de `redactText`), ou `null`. */
  lastError: string | null;
  /**
   * Lit les coordonnees persistees (AsyncStorage) une fois au demarrage.
   * Idempotent.
   */
  hydrate: () => Promise<void>;
  /**
    * Enregistre les coordonnees, puis ping la sante.
   *
   * @param host IPv4 validee en amont (revalidee par le client).
   * @param port port validee en amont.
   * @returns le resultat du health check, pour affichage direct.
   */
  registerDesktop: (host: string, port: number) => Promise<CheckResult>;
  /**
   * Envoie les credentials WiFi au hotspot actuellement configure.
   * Le mot de passe reste dans l'appel et n'entre jamais dans le store.
   */
  provisionWifi: (payload: WifiProvisioningRequest) => Promise<CheckResult>;
  /** Relance un health check sur les coordonnees connues. */
  checkHealth: () => Promise<{ ok: boolean; errors: string[] }>;
  /** Oublie les coordonnees du Desktop. */
  forgetDesktop: () => Promise<void>;
};

/** Resultat de health check reduit pour l'UI. */
type CheckResult = { ok: boolean; errors: string[] };

export const useConnectionStore = create<ConnectionStore>((set, get) => ({
  host: null,
  port: null,
  connectedDesktop: null,
  checking: false,
  lastError: null,
  hydrate: async () => {
    const info = await loadConnectionInfo();
    set({ host: info?.host ?? null, port: info?.port ?? null });
  },

  registerDesktop: async (host, port) => {
    if (get().checking) return { ok: false, errors: ["Connexion dejà en cours."] };
    set({ checking: true, lastError: null });

    try {
      await saveConnectionInfo(host, port);
      const check = await fetchDesktopHealth(host, port);
      if (check.ok) {
        set({ connectedDesktop: check.desktopName });
        return { ok: true, errors: [] };
      }
      set({ connectedDesktop: null, lastError: check.error });
      return { ok: false, errors: [check.error] };
    } catch (error) {
      // saveConnectionInfo: echec = donnee non persistee,
      // on l'expose pour l'UI (pas de demi-etat affiche comme "connecté").
      const message = error instanceof Error ? error.message : "Erreur.";
      set({ connectedDesktop: null, lastError: message });
      return { ok: false, errors: [message] };
    } finally {
      set({ checking: false });
    }
  },

  checkHealth: async () => {
    const { host, port } = get();
    if (host === null || port === null) {
      return { ok: false, errors: ["Aucun Desktop configuré."] };
    }
    return get().registerDesktop(host, port);
  },

  provisionWifi: async (payload) => {
    const { host, port } = get();
    if (host === null || port === null) {
      return { ok: false, errors: ["Aucun hotspot Electron configure."] };
    }
    set({ checking: true, lastError: null });
    try {
      const health = await fetchProvisioningHealth(host, port);
      if (!health.ok) {
        set({ lastError: health.error });
        return { ok: false, errors: [health.error] };
      }
      const result = await sendWifiProvisioning(host, port, payload);
      if (!result.ok) {
        set({ lastError: result.error });
        return { ok: false, errors: [result.error] };
      }
      set({ connectedDesktop: null });
      return { ok: true, errors: [] };
    } finally {
      set({ checking: false });
    }
  },

  forgetDesktop: async () => {
    await clearConnectionInfo();
    set({
      host: null,
      port: null,
      connectedDesktop: null,
      lastError: null,
    });
  },
}));

export type { CheckResult };
