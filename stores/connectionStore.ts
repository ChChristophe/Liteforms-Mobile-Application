import { create } from "zustand";
import { fetchDesktopHealth } from "../lib/network/deviceClient";
import {
  clearConnectionInfo,
  clearPairingToken,
  loadConnectionInfo,
  loadPairingToken,
  saveConnectionInfo,
  savePairingToken,
} from "../lib/storage/connectionStorage";
import type { DesktopHealthCheck } from "../types/device";

/**
 * Etat de connexion au Desktop (PLAN.md Phase 6, premier flux D3).
 *
 * Separation des donnees (PLAN.md 3.3) :
 * - host/port : coordonnees ordinaires (reseau local, non secret) => AsyncStorage ;
 * - token de pairing : SECRET => SecureStore via `lib/storage/connectionStorage`,
 *   la valeur n'existe JAMAIS dans ce store ni dans son state (D1) ;
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
  /** `true` un token de pairing est present en SecureStore. */
  paired: boolean;
  /**
   * Lit la persistance (AsyncStorage + SecureStore) une fois au demarrage.
   * Idempotent ; conforme D1, aucune valeur de token n'entre dans l'etat.
   */
  hydrate: () => Promise<void>;
  /**
   * Enregistre les coordonnees + token, puis ping la sante.
   *
   * @param host IPv4 validee en amont (revalidee par le client).
   * @param port port validee en amont.
   * @param token token de pairing affiche par l'utilisateur (secret) —
   *   stocke en SecureStore et jamais retourne.
   * @returns le resultat du health check, pour affichage direct.
   */
  registerDesktop: (
    host: string,
    port: number,
    token: string | null
  ) => Promise<{ ok: boolean; errors: string[] }>;
  /** Relance un health check sur les coordonnees connues. */
  checkHealth: () => Promise<{ ok: boolean; errors: string[] }>;
  /** Oublie coordonnees + token (depairing volontaire). */
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
  paired: false,

  hydrate: async () => {
    const info = await loadConnectionInfo();
    const paired = (await loadPairingToken()) !== null;
    set({ host: info?.host ?? null, port: info?.port ?? null, paired });
  },

  registerDesktop: async (host, port, pairingToken) => {
    if (get().checking) return { ok: false, errors: ["Connexion dejà en cours."] };
    set({ checking: true, lastError: null });

    try {
      await saveConnectionInfo(host, port);
      if (pairingToken !== null) {
        await savePairingToken(pairingToken);
      }
      const check = await fetchDesktopHealth(host, port);
      if (check.ok) {
        set({
          connectedDesktop: check.desktopName,
          paired: pairingToken !== null ? true : get().paired,
        });
        return { ok: true, errors: [] };
      }
      set({ connectedDesktop: null, lastError: check.error });
      return { ok: false, errors: [check.error] };
    } catch (error) {
      // saveConnectionInfo/savePairingToken: echec = donnée non persistee,
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
    return get().registerDesktop(host, port, null);
  },

  forgetDesktop: async () => {
    await Promise.all([clearConnectionInfo(), clearPairingToken()]);
    set({
      host: null,
      port: null,
      connectedDesktop: null,
      lastError: null,
      paired: false,
    });
  },
}));

export type { CheckResult };