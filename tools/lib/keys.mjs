// Signing keys for registry metadata (savevault-specs/registry/SPEC.md section 2).

import { createHash, createPrivateKey, createPublicKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./upstream.mjs";

// PKCS#8 DER prefix for an Ed25519 private key; the 32-byte seed follows.
const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

function keyFromSeed(seedHex) {
  const privateKey = createPrivateKey({
    key: Buffer.concat([PKCS8_PREFIX, Buffer.from(seedHex, "hex")]),
    format: "der",
    type: "pkcs8",
  });
  const rawPublic = createPublicKey(privateKey).export({ format: "der", type: "spki" }).subarray(-32);
  return {
    privateKey,
    publicKey: rawPublic.toString("base64"),
    keyId: createHash("sha256").update(rawPublic).digest("hex").slice(0, 16),
  };
}

/**
 * The PUBLIC test keys from savevault-specs/registry/test-vectors/signing.json.
 * Anyone can sign with them: bundles signed this way must never be trusted by
 * a release build.
 */
export function testKeys() {
  const vectors = JSON.parse(
    readFileSync(join(repoRoot, "external", "specs", "registry", "test-vectors", "signing.json"), "utf8"),
  );
  const seed = (label) => vectors.keys.find((k) => k.label === label).seed;
  return { root: keyFromSeed(seed("root-1")), online: keyFromSeed(seed("online-1")), insecure: true };
}

/** Detached signature file content (registry/schema/signature.v1). */
export function signatureFile(key, bytes) {
  const signature = sign(null, bytes, key.privateKey).toString("base64");
  return Buffer.from(JSON.stringify({ signatures: [{ keyId: key.keyId, signature }] }, null, 2) + "\n");
}

export const publicKeyEntry = (key) => ({ keyId: key.keyId, algorithm: "ed25519", publicKey: key.publicKey });
