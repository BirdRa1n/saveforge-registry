// Downloads the pinned Ludusavi manifest into .cache/ and verifies its SHA-256.
//
//   npm run fetch-upstream
//
// The file is only downloaded when it is missing or does not match the lock.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { readLock, upstreamCachePath } from "./lib/upstream.mjs";

const lock = readLock();
const target = upstreamCachePath(lock);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

if (existsSync(target) && sha256(readFileSync(target)) === lock.sha256) {
  console.log(`Up to date: ${target}`);
  process.exit(0);
}

const url = `https://raw.githubusercontent.com/${lock.repository}/${lock.commit}/${lock.path}`;
console.log(`Downloading ${url}`);
const response = await fetch(url);
if (!response.ok) {
  console.error(`Download failed: HTTP ${response.status}`);
  process.exit(1);
}
const bytes = Buffer.from(await response.arrayBuffer());
const actual = sha256(bytes);
if (actual !== lock.sha256) {
  console.error(`SHA-256 mismatch: expected ${lock.sha256}, got ${actual}. Refusing to use the file.`);
  process.exit(1);
}
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, bytes);
console.log(`Verified and saved ${bytes.length} bytes to ${target}`);
