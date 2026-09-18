import { create } from "zustand";
import { DEFAULT_DEVICE_CONFIG } from "../lib/config/defaults";
import {
  loadStoredDeviceConfig,
  saveStoredDeviceConfig,
} from "../lib/storage/configStorage";
import type {
  AvatarConfig,
  CharacterConfig,
  DeviceConfig,
  EnvironmentConfig,
  ProviderSelection,
  WakeWordConfig,
  WakeWordCueConfig,
} from "../types/config";

/**
 * Etat de configuration ordinaire (non secrete) de l'application.
 *
 * Source de verite unique pour la config (PLAN.md 2 - "Un champ doit avoir
 * une seule source de verite"). La persistance AsyncStorage est ecrite a
 * chaque mutation ; elle n'est lue qu'a l'hydratation.
 *
 * Secrets : conformement a D1, ce store ne porte aucune cle API ni token de
 * pairing. Ne pas ajouter de champ secret ici ni dans la persistance.
 */
export type ConfigStore = {
  /** Configuration courante ; egale aux defauts jusqu'a l'hydratation. */
  config: DeviceConfig;
  /**
   * `true` une fois la persistance lue. Les ecrans doivent attendre cet
   * etat avant d'afficher les valeurs finales (evite un flash de defauts).
   */
  hydrated: boolean;
  /**
   * Charge la configuration persistee, validee par `parseDeviceConfig`.
   *
   * - config absente, corrompue ou version incompatible : les defauts sont
   *   conserves (la donnee source n'est pas effacee) ;
   * - config valide : elle remplace integralement l'etat courant.
   *
   * A appeler une seule fois au demarrage (layout racine). Idempotent.
   */
  hydrate: () => Promise<void>;
  /** Remplace la section character puis persiste. */
  updateCharacter: (patch: Partial<CharacterConfig>) => void;
  /** Remplace la section avatar puis persiste. */
  updateAvatar: (patch: Partial<AvatarConfig>) => void;
  /** Remplace la section environment puis persiste. */
  updateEnvironment: (patch: Partial<EnvironmentConfig>) => void;
  /** Remplace la selection d'un slot provider puis persiste. */
  updateProvider: (
    slot: "llm" | "tts" | "stt",
    patch: Partial<ProviderSelection>
  ) => void;
  /** Remplace la section wakeWord puis persiste. */
  updateWakeWord: (patch: Partial<WakeWordConfig>) => void;
  /**
   * Remplace la confirmation visuelle du wake word puis persiste. Action
   * dediee : `updateWakeWord` remplacerait tout le bloc `cue`, pas un champ.
   */
  updateWakeWordCue: (patch: Partial<WakeWordCueConfig>) => void;
  /** Restaure les defauts puis persiste. */
  resetConfig: () => void;
};

/**
 * Cree le store de configuration.
 *
 * Erreur de persistance : `saveStoredDeviceConfig` peut echouer (quota,
 * disque). Le refus d'une config invalide leve volontairement — c'est un bug
 * d'appelant qu'on veut voir, pas masquer. Un echec d'ecriture AsyncStorage
 * est laisse se propager a l'appelant (statut de sync futur, Phase 7).
 */
export const useConfigStore = create<ConfigStore>((set, get) => {
  /** Applique une mutation puis persiste l'etat resultant. */
  function apply(next: DeviceConfig): void {
    set({ config: next });
    void saveStoredDeviceConfig(next).catch((error) => {
      if (__DEV__) {
        console.warn("[configStore] persist failed", error);
      }
    });
  }

  return {
    config: DEFAULT_DEVICE_CONFIG,
    hydrated: false,

    hydrate: async () => {
      if (get().hydrated) return;
      const stored = await loadStoredDeviceConfig();
      set({ config: stored ?? DEFAULT_DEVICE_CONFIG, hydrated: true });
    },

    updateCharacter: (patch) => {
      const next: DeviceConfig = {
        ...get().config,
        character: { ...get().config.character, ...patch },
      };
      apply(next);
    },

    updateAvatar: (patch) => {
      const next: DeviceConfig = {
        ...get().config,
        avatar: { ...get().config.avatar, ...patch },
      };
      apply(next);
    },

    updateEnvironment: (patch) => {
      const next: DeviceConfig = {
        ...get().config,
        environment: { ...get().config.environment, ...patch },
      };
      apply(next);
    },

    updateProvider: (slot, patch) => {
      const current = get().config;
      const next: DeviceConfig = {
        ...current,
        providers: {
          ...current.providers,
          [slot]: { ...current.providers[slot], ...patch },
        },
      };
      apply(next);
    },

    updateWakeWord: (patch) => {
      const next: DeviceConfig = {
        ...get().config,
        wakeWord: { ...get().config.wakeWord, ...patch },
      };
      apply(next);
    },

    updateWakeWordCue: (patch) => {
      const current = get().config;
      const next: DeviceConfig = {
        ...current,
        wakeWord: {
          ...current.wakeWord,
          cue: { ...current.wakeWord.cue, ...patch },
        },
      };
      apply(next);
    },

    resetConfig: () => {
      apply(DEFAULT_DEVICE_CONFIG);
    },
  };
});
