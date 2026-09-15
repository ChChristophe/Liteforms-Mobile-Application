import { describe, expect, it } from "vitest";

import { decodeBase64 } from "./base64";

/**
 * Decodeur base64 pur : chemin principal de lecture du VRM resident
 * depuis expo-file-system (readAsStringAsync Base64).
 */

const enc = (text: string): Uint8Array => new TextEncoder().encode(text);

/** Encodeur de reference independant (motif de comparaison aller-retour). */
export function toBase64(bytes: Uint8Array): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const remaining = bytes.length - i;
    const b0 = bytes[i];
    const b1 = remaining > 1 ? bytes[i + 1] : 0;
    const b2 = remaining > 2 ? bytes[i + 2] : 0;
    out += alphabet[b0 >> 2];
    out += alphabet[((b0 & 3) << 4) | (b1 >> 4)];
    out += remaining === 1 ? "=" : alphabet[((b1 & 15) << 2) | (b2 >> 6)];
    out += remaining === 1 ? "=" : remaining === 2 ? "=" : alphabet[b2 & 63];
  }
  return out;
}

function bytes(base64: string): Uint8Array {
  return new Uint8Array(decodeBase64(base64));
}

describe("decodeBase64", () => {
  it("decode les longueurs courantes (3, 2, 1 octet residuel)", () => {
    expect(Array.from(bytes("QUJD"))).toEqual(Array.from(enc("ABC")));
    expect(Array.from(bytes("QUI="))).toEqual(Array.from(enc("AB")));
    expect(Array.from(bytes("QQ=="))).toEqual(Array.from(enc("A")));
    // Longueur exacte du tampon, padding retire.
    expect(bytes("QUI=")).toHaveLength(2);
    expect(bytes("")).toHaveLength(0);
  });

  it("accepte le whitespace (retours ligne expo-file-system, bytes 10/13/32)", () => {
    expect(Array.from(bytes("Q\nUJD\r"))).toEqual(Array.from(enc("ABC")));
  });

  it("tourne sur un corpus de taille reeleve (randomise, aller-retour exact)", () => {
    const random = crypto.getRandomValues(new Uint8Array(10_000));
    expect(Array.from(bytes(toBase64(random)))).toEqual(Array.from(random));
  });

  it("refuse les tampons non valides (caractere hors alphabet, longueur residuelle 1)", () => {
    expect(() => decodeBase64("QUJ$D")).toThrow(/base64/);
    expect(() => decodeBase64("QQABQ")).toThrow(/base64/);
  });
});
