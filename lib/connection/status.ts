/**
 * Logique pure de l'indicateur de liaison Mobile <-> Electron.
 *
 * Extraite du composant (aucun import react-native) pour rester testable
 * sous vitest, comme les autres modules de logique du depot. Le composant
 * `components/connection/ConnectionStatusDot.tsx` ne fait que consommer ces
 * metadonnees.
 */

/** Etats visuels de la pastille de liaison. */
export type ConnectionStatus = "connected" | "checking" | "disconnected";

/** Metadonnees d'affichage associees a un etat. */
export type ConnectionStatusMeta = {
  /** Couleur de la pastille (vert / ambre / rouge). */
  color: string;
  /** Description complete pour l'accessibilite (lecteur d'ecran). */
  accessibilityLabel: string;
  /** Ligne de statut affichee dans le panneau au tap. */
  label: string;
  /**
   * Message par defaut affiche quand `lastError` est nul (aucune erreur
   * connue a montrer).
   */
  defaultDetail: string;
};

/** Metadonnees par etat : une seule source de verite des couleurs/libelles. */
export const CONNECTION_STATUS_META: Record<
  ConnectionStatus,
  ConnectionStatusMeta
> = {
  connected: {
    color: "#22c55e",
    accessibilityLabel: "Liaison au Desktop active",
    label: "Liaison active",
    defaultDetail: "La configuration peut être envoyée au Desktop.",
  },
  checking: {
    color: "#f59e0b",
    accessibilityLabel: "Vérification de la liaison en cours",
    label: "Vérification…",
    defaultDetail: "Vérification de la liaison au Desktop en cours.",
  },
  disconnected: {
    color: "#ef4444",
    accessibilityLabel: "Desktop déconnecté",
    label: "Desktop non connecté",
    defaultDetail: "Aucun Desktop joignable pour le moment.",
  },
};

/**
 * Derive l'etat de la pastille depuis le store de connexion.
 *
 * Priorite : `checking` l'emporte sur `connectedDesktop`, car un health
 * check en cours est une information plus recente qu'un ancien succes
 * (pendant un check, la pastille est ambre meme si le Desktop etait vert).
 *
 * @param input `connectedDesktop` (nom appris apres health check OK) et
 *   `checking` (health check en cours).
 * @returns l'etat visuel a afficher.
 */
export function deriveConnectionStatus(input: {
  connectedDesktop: string | null;
  checking: boolean;
}): ConnectionStatus {
  if (input.checking) return "checking";
  return input.connectedDesktop !== null ? "connected" : "disconnected";
}

/**
 * Detail affiche dans le panneau au tap.
 *
 * `lastError` prime sur le message par defaut (c'est lui qui explique le
 * probleme), sauf pendant un check : une erreur encore presente dans le
 * store ne doit pas s'afficher par-dessus « Vérification… ».
 *
 * @param status etat visuel courant.
 * @param lastError derniere erreur exploitable du store, ou `null`.
 */
export function connectionPanelDetail(
  status: ConnectionStatus,
  lastError: string | null
): string {
  if (lastError !== null && status !== "checking") return lastError;
  return CONNECTION_STATUS_META[status].defaultDetail;
}
