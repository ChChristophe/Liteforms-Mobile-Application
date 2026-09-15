/**
 * Decodeur base64 pur (RN n'a pas d'atob garanti) — exact uniquement,
 * echoue sur un caractere hors alphabet, une longueur % 4 == 1 ou un
 * padding mal place.
 *
 * Memoire : pour un VRM resident de dizaines de Mo, le cout transitoire est
 * la string base64 (~1,3x le binaire) + l'ArrayBuffer final, acceptable
 * pour une lecture unique au chargement du preview.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Table de correspondance code ASCII -> valeur 6 bits (-1 au-dela de 128). */
const LOOKUP = new Int8Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) {
  LOOKUP[ALPHABET.charCodeAt(i)] = i;
}

export function decodeBase64(base64: string): ArrayBuffer {
  // Passe 1 : compte les caracteres utiles (ignorer whitespace et padding).
  let usable = 0;
  for (let i = 0; i < base64.length; i++) {
    const code = base64.charCodeAt(i);
    if (code <= 32 || code === 61 /* '=' */) continue;
    if (code > 127 || LOOKUP[code] < 0) {
      throw new Error("base64 invalide");
    }
    usable++;
  }
  if (usable % 4 === 1) {
    throw new Error("base64 invalide : longueur residuelle 1");
  }

  const bytes = new Uint8Array(
    Math.floor(usable / 4) * 3 + (usable % 4 === 2 ? 1 : usable % 4 === 3 ? 2 : 0)
  );
  let out = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < base64.length; i++) {
    const code = base64.charCodeAt(i);
    if (code <= 32 || code === 61) continue;
    acc = (acc << 6) | LOOKUP[code];
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[out++] = (acc >>> bits) & 0xff;
    }
  }
  return bytes.buffer;
}
