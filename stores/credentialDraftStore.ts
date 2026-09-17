import { create } from "zustand";

/**
 * Brouillon transitoire des clés API provider saisies sur Mobile (décision D1).
 *
 * Règles :
 * - la clé est par PROVIDER (pas par slot) : `openai` sert llm+tts+stt avec
 *   UNE seule clé — le store est keyé par identifiant, donc dédoublonné ;
 * - JAMAIS persisté (ni AsyncStorage ni SecureStore) : état mémoire volatil,
 *   perdu au redémarrage — c'est le contrat (transfert unique à l'envoi) ;
 * - jamais dans `DeviceConfig` ni dans `configStore` : les secrets n'ont pas
 *   leur place dans la configuration ordinaire.
 */
export type CredentialDraftStore = {
  /** Clés par identifiant de provider, en mémoire seulement. */
  keys: Record<string, string>;
  /** Pose (ou remplace) la clé d'un provider. */
  setKey: (provider: string, apiKey: string) => void;
  /** Retire la clé d'un provider. */
  clearKey: (provider: string) => void;
  /** Purge toutes les clés (après envoi, reset, démontage). */
  clearAll: () => void;
};

export const useCredentialDraftStore = create<CredentialDraftStore>((set) => ({
  keys: {},
  setKey: (provider, apiKey) =>
    set((state) => ({ keys: { ...state.keys, [provider]: apiKey } })),
  clearKey: (provider) =>
    set((state) => {
      const keys = { ...state.keys };
      delete keys[provider];
      return { keys };
    }),
  clearAll: () => set({ keys: {} }),
}));
