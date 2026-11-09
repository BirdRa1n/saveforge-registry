// Builds the signed registry distribution into dist/v1/.
//
//   npm run build -- --keys test [--out <dir>]
//
// Output layout (saveforge-specs/registry/SPEC.md section 1):
//   root.json(.sig), roots/1.json(.sig)
//   channels/upstream-ludusavi/index.json(.sig)
//   channels/upstream-ludusavi/bundles/upstream-ludusavi-<sequence>.json.zst
//   report.json  (conversion report; not part of the protocol)
//
// The build is deterministic: timestamps and the sequence number derive from
// the pinned upstream commit, never from the clock.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { constants, zstdCompressSync } from "node:zlib";
import { parse as parseYaml } from "yaml";
import { convertManifest } from "./lib/convert-ludusavi.mjs";
import { publicKeyEntry, signatureFile, testKeys } from "./lib/keys.mjs";
import { readLock, readVerifiedManifest, repoRoot } from "./lib/upstream.mjs";
import { validatorFor } from "./lib/validator.mjs";

const MIN_APP_VERSION = "0.1.0";
const MAX_UNCOMPRESSED = 64 * 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

const { values: args } = parseArgs({
  options: { keys: { type: "string" }, out: { type: "string", default: join(repoRoot, "dist", "v1") } },
});
if (args.keys !== "test") {
  console.error('Only "--keys test" is supported until production keys exist.');
  process.exit(2);
}
const keys = testKeys();

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => Buffer.from(JSON.stringify(value, null, 2) + "\n");
const out = args.out;
const write = (relative, bytes) => {
  const file = join(out, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
};
const check = (schema, document) => {
  const result = validatorFor(schema)(document);
  if (!result.ok) throw new Error(`${schema}: ${result.error}`);
};

// --- Convert ---------------------------------------------------------------

const lock = readLock();
const committedAt = Date.parse(lock.committedAt);
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
console.log(`Converting Ludusavi manifest ${lock.commit.slice(0, 12)} …`);
const manifest = parseYaml(readVerifiedManifest(lock), { maxAliasCount: -1 });
const { profiles, report } = convertManifest(manifest, { license: lock.license.spdx });

const validateProfile = validatorFor("profile/profile.v1");
const validProfiles = profiles.filter((profile) => {
  const result = validateProfile(profile);
  if (!result.ok) report.skipGame(`schema: ${result.error}`);
  return result.ok;
});

// --- Bundle ------------------------------------------------------------------

const channel = "upstream-ludusavi";
const sequence = Math.floor(committedAt / 1000);
const bundle = {
  schemaVersion: 1,
  type: "bundle",
  channel,
  sequence,
  generatedAt: iso(committedAt),
  notices: [{ license: lock.license.spdx, attribution: lock.license.attribution, url: lock.license.url }],
  profiles: validProfiles,
};
check("registry/bundle.v1", bundle);
const bundleBytes = Buffer.from(JSON.stringify(bundle) + "\n");
if (bundleBytes.length > MAX_UNCOMPRESSED) throw new Error(`Bundle is ${bundleBytes.length} bytes, above the limit`);
const compressed = zstdCompressSync(bundleBytes, { params: { [constants.ZSTD_c_compressionLevel]: 19 } });
const bundlePath = `bundles/${channel}-${String(sequence).padStart(6, "0")}.json.zst`;

// --- Index and root ------------------------------------------------------------

const registryCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
const index = {
  schemaVersion: 1,
  type: "index",
  channel,
  sequence,
  publishedAt: iso(committedAt),
  expires: iso(committedAt + 90 * DAY_MS),
  minAppVersion: MIN_APP_VERSION,
  bundle: {
    path: bundlePath,
    sha256: sha256(compressed),
    size: compressed.length,
    uncompressedSize: bundleBytes.length,
    profileCount: validProfiles.length,
  },
  source: { repository: "SaveForge/saveforge-registry", commit: registryCommit },
};
check("registry/index.v1", index);

const root = {
  schemaVersion: 1,
  type: "root",
  version: 1,
  expires: iso(committedAt + 365 * DAY_MS),
  rootThreshold: 1,
  rootKeys: [publicKeyEntry(keys.root)],
  onlineKeys: [{ ...publicKeyEntry(keys.online), channels: ["*"] }],
};
check("registry/root.v1", root);

// --- Write -------------------------------------------------------------------

rmSync(out, { recursive: true, force: true });
const rootBytes = json(root);
const indexBytes = json(index);
write("root.json", rootBytes);
write("root.json.sig", signatureFile(keys.root, rootBytes));
write("roots/1.json", rootBytes);
write("roots/1.json.sig", signatureFile(keys.root, rootBytes));
write(`channels/${channel}/index.json`, indexBytes);
write(`channels/${channel}/index.json.sig`, signatureFile(keys.online, indexBytes));
write(`channels/${channel}/${bundlePath}`, compressed);
write("report.json", json({ upstream: lock.commit, ...report, valid: validProfiles.length }));

// --- Summary -----------------------------------------------------------------

const top = (counts) =>
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, n]) => `    ${String(n).padStart(6)}  ${reason}`)
    .join("\n");
console.log(`Entries: ${report.entries}, profiles: ${validProfiles.length}`);
console.log(`Skipped entries:\n${top(report.skippedGames)}`);
console.log(`Dropped paths:\n${top(report.droppedPaths)}`);
console.log(`Dropped registry keys:\n${top(report.droppedKeys)}`);
console.log(
  `Bundle: ${(bundleBytes.length / 1048576).toFixed(1)} MiB -> ${(compressed.length / 1048576).toFixed(2)} MiB (zstd), sequence ${sequence}`,
);
if (keys.insecure) console.log("WARNING: signed with PUBLIC TEST KEYS (development only).");
console.log(`Written to ${out}`);
