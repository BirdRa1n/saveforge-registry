// Access to the pinned upstream manifest.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function readLock() {
  return JSON.parse(readFileSync(join(repoRoot, "upstream", "ludusavi.lock.json"), "utf8"));
}

export function upstreamCachePath(lock) {
  return join(repoRoot, ".cache", `ludusavi-${lock.commit}.yaml`);
}

/** Reads the cached manifest, failing unless it matches the lock's SHA-256. */
export function readVerifiedManifest(lock) {
  const path = upstreamCachePath(lock);
  let bytes;
  try {
    bytes = readFileSync(path);
  } catch {
    throw new Error(`Missing ${path}; run "npm run fetch-upstream" first.`);
  }
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== lock.sha256) throw new Error(`Cached manifest does not match the lock (${actual}).`);
  return bytes.toString("utf8");
}
