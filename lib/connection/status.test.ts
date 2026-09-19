import { describe, expect, it } from "vitest";
import {
  CONNECTION_STATUS_META,
  connectionPanelDetail,
  deriveConnectionStatus,
} from "./status";

/**
 * Protege le contrat de l'indicateur de liaison :
 * - priorite des etats (un check en cours est plus recent qu'un ancien
 *   succes et doit passer la pastille en ambre) ;
 * - couleurs/libelles par etat (decision produit : vert/ambre/rouge, aucun
 *   texte parasite dans l'en-tete) ;
 * - choix du detail affiche au tap : une erreur reelle prime, mais une
 *   erreur perimee ne s'affiche pas pendant la verification.
 */
describe("deriveConnectionStatus", () => {
  it("retourne disconnected quand aucun Desktop n'est connecte", () => {
    expect(
      deriveConnectionStatus({ connectedDesktop: null, checking: false })
    ).toBe("disconnected");
  });

  it("retourne connected quand un Desktop est connu et hors check", () => {
    expect(
      deriveConnectionStatus({
        connectedDesktop: "Liteforms Desktop",
        checking: false,
      })
    ).toBe("connected");
  });

  it("donne la priorite a checking sur un ancien succes", () => {
    expect(
      deriveConnectionStatus({
        connectedDesktop: "Liteforms Desktop",
        checking: true,
      })
    ).toBe("checking");
    expect(
      deriveConnectionStatus({ connectedDesktop: null, checking: true })
    ).toBe("checking");
  });
});

describe("CONNECTION_STATUS_META", () => {
  it("utilise les couleurs produit vert/ambre/rouge", () => {
    expect(CONNECTION_STATUS_META.connected.color).toBe("#22c55e");
    expect(CONNECTION_STATUS_META.checking.color).toBe("#f59e0b");
    expect(CONNECTION_STATUS_META.disconnected.color).toBe("#ef4444");
  });

  it("fournit un libelle d'accessibilite non vide pour chaque etat", () => {
    for (const meta of Object.values(CONNECTION_STATUS_META)) {
      expect(meta.accessibilityLabel.length).toBeGreaterThan(0);
    }
  });

  it("donne un message par defaut quand lastError est nul", () => {
    expect(CONNECTION_STATUS_META.connected.defaultDetail).toBe(
      "La configuration peut être envoyée au Desktop."
    );
    expect(CONNECTION_STATUS_META.checking.defaultDetail).toBe(
      "Vérification de la liaison au Desktop en cours."
    );
    expect(CONNECTION_STATUS_META.disconnected.defaultDetail).toBe(
      "Aucun Desktop joignable pour le moment."
    );
  });
});

describe("connectionPanelDetail", () => {
  it("affiche « Vérification… » pendant un check, meme avec une erreur perimee", () => {
    expect(connectionPanelDetail("checking", "Aucune réponse en 4 s.")).toBe(
      "Vérification de la liaison au Desktop en cours."
    );
  });

  it("affiche l'erreur reelle quand elle existe (deconnecte)", () => {
    expect(
      connectionPanelDetail("disconnected", "Desktop injoignable.")
    ).toBe("Desktop injoignable.");
  });

  it("retombe sur le message par defaut sans erreur", () => {
    expect(connectionPanelDetail("connected", null)).toBe(
      "La configuration peut être envoyée au Desktop."
    );
    expect(connectionPanelDetail("disconnected", null)).toBe(
      "Aucun Desktop joignable pour le moment."
    );
  });
});
