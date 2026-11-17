const SIGNATURE_PREFIX = "sha256=";
const encoder = new TextEncoder();

const toHex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return toHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body))));
}

export async function verifySignature(secret: string, body: string, signature: string | null): Promise<boolean> {
  if (!signature?.startsWith(SIGNATURE_PREFIX)) return false;
  const expected = encoder.encode(await hmacSha256Hex(secret, body));
  const given = encoder.encode(signature.slice(SIGNATURE_PREFIX.length));
  return given.byteLength === expected.byteLength && crypto.subtle.timingSafeEqual(given, expected);
}
