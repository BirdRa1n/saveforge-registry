// Converts the Ludusavi manifest into SaveForge profile v1 documents.
//
// Ludusavi format (per game name): files{path: {tags, when[{os, store}]}},
// registry{key: {tags, when}}, installDir{name: {}}, launch{path: [...]},
// steam{id}, gog{id}, id{steamExtra, gogExtra}, cloud{store: bool}, alias.
//
// Everything that cannot be represented safely is dropped and counted in the
// report, never guessed. The conversion is deterministic.

import { createHash } from "node:crypto";
import { impliedOs, validateRegistryKey, validateSavePath } from "../../external/specs/scripts/lib/path-rules.mjs";

const MAX_SAVE_RULES = 64;
const MAX_PATHS_PER_RULE = 32;
const MAX_REGISTRY_RULES = 16;
const MAX_KEYS_PER_RULE = 16;

const OS_MAP = { windows: "windows", linux: "linux", mac: "macos" };

// Ludusavi store names -> spec store names. Missing entries are unsupported.
const STORE_MAP = {
  steam: "steam",
  epic: "epic",
  legendary: "epic",
  gog: "gog",
  gogGalaxy: "gog",
  heroic: "heroic",
  lutris: "lutris",
  origin: "ea",
  ea: "ea",
  prime: "amazon",
  uplay: "ubisoft",
  other: "other",
};

// Ludusavi placeholders with no SaveForge equivalent yet.
const UNSUPPORTED_PLACEHOLDERS = ["<root>", "<game>", "<winDir>", "<regHkcu>", "<regHklm>"];

const shortHash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 6);

/** Lower-case ASCII slug from a game name; empty when nothing usable remains. */
export function slugify(name) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90)
    .replace(/-+$/g, "");
}

class Report {
  constructor() {
    this.entries = 0;
    this.converted = 0;
    this.skippedGames = {};
    this.droppedPaths = {};
    this.droppedKeys = {};
  }
  skipGame(reason) {
    this.skippedGames[reason] = (this.skippedGames[reason] ?? 0) + 1;
  }
  dropPath(reason) {
    this.droppedPaths[reason] = (this.droppedPaths[reason] ?? 0) + 1;
  }
  dropKey(reason) {
    this.droppedKeys[reason] = (this.droppedKeys[reason] ?? 0) + 1;
  }
}

function convertTags(tags) {
  const result = [...new Set((tags ?? []).filter((t) => t === "save" || t === "config"))].sort();
  return result.length > 0 ? result : ["save"];
}

/** One `when` entry -> {os?, store?} or a drop reason. */
function convertCondition(when) {
  const condition = {};
  if (when?.os !== undefined) {
    const os = OS_MAP[when.os];
    if (!os) return { reason: `unsupported os "${when.os}"` };
    condition.os = os;
  }
  if (when?.store !== undefined) {
    const store = STORE_MAP[when.store];
    if (!store) return { reason: `unsupported store "${when.store}"` };
    condition.store = store;
  }
  return { condition };
}

/** Ludusavi path -> SaveForge path template or a drop reason. */
function convertPath(path) {
  for (const placeholder of UNSUPPORTED_PLACEHOLDERS) {
    if (path.includes(placeholder)) return { reason: `placeholder ${placeholder}` };
  }
  const trimmed = path.replace(/\/+$/, "");
  const check = validateSavePath(trimmed);
  if (!check.valid) return { reason: `path rule ${check.violations[0]}` };
  return { path: trimmed };
}

function convertRegistryKey(key) {
  const parts = key.split("/");
  const hive = parts[0].toUpperCase();
  if (hive !== "HKEY_CURRENT_USER" && hive !== "HKCU") return { reason: "hive outside HKCU" };
  const converted = ["HKCU", ...parts.slice(1)].join("/").replace(/\/+$/, "");
  const check = validateRegistryKey(converted);
  if (!check.valid) return { reason: `registry rule ${check.violations[0]}` };
  return { key: converted };
}

const ruleId = (tags) => (tags.includes("save") ? "save" : "config");

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function convertFiles(files, report) {
  // Group paths by (tags, os, store) so each group becomes one save rule.
  const groups = new Map();
  for (const [rawPath, info] of Object.entries(files ?? {})) {
    const converted = convertPath(rawPath);
    if (!converted.path) {
      report.dropPath(converted.reason);
      continue;
    }
    const tags = convertTags(info?.tags);
    const whens = Array.isArray(info?.when) && info.when.length > 0 ? info.when : [{}];
    for (const when of whens) {
      const { condition, reason } = convertCondition(when);
      if (!condition) {
        report.dropPath(reason);
        continue;
      }
      const implied = impliedOs(converted.path);
      if (implied && condition.os && implied !== condition.os) {
        report.dropPath("placeholder contradicts os");
        continue;
      }
      const key = JSON.stringify([tags, condition.os ?? null, condition.store ?? null]);
      if (!groups.has(key)) groups.set(key, { tags, condition, paths: [] });
      const group = groups.get(key);
      if (!group.paths.includes(converted.path)) group.paths.push(converted.path);
    }
  }

  const rules = [];
  for (const key of [...groups.keys()].sort()) {
    const { tags, condition, paths } = groups.get(key);
    for (const part of chunk(paths.sort(), MAX_PATHS_PER_RULE)) {
      const rule = { id: ruleId(tags), tags };
      if (Object.keys(condition).length > 0) rule.when = condition;
      rule.paths = part;
      rules.push(rule);
    }
  }
  return rules;
}

function convertRegistry(registry, report) {
  const groups = new Map();
  for (const [rawKey, info] of Object.entries(registry ?? {})) {
    const converted = convertRegistryKey(rawKey);
    if (!converted.key) {
      report.dropKey(converted.reason);
      continue;
    }
    const tags = convertTags(info?.tags);
    const groupKey = JSON.stringify(tags);
    if (!groups.has(groupKey)) groups.set(groupKey, { tags, keys: [] });
    const group = groups.get(groupKey);
    if (!group.keys.includes(converted.key)) group.keys.push(converted.key);
  }
  const rules = [];
  for (const groupKey of [...groups.keys()].sort()) {
    const { tags, keys } = groups.get(groupKey);
    for (const part of chunk(keys.sort(), MAX_KEYS_PER_RULE)) rules.push({ id: ruleId(tags), tags, keys: part });
  }
  return rules;
}

const bareName = (name) =>
  typeof name === "string" && name.length > 0 && name.length <= 128 && !/[\\/]/.test(name);

function positiveInts(values) {
  return [...new Set(values.filter((v) => Number.isInteger(v) && v > 0))];
}

function convertIdentifiers(name, entry) {
  const identifiers = {};
  const steam = positiveInts([entry.steam?.id, ...(entry.id?.steamExtra ?? [])]);
  const gog = positiveInts([entry.gog?.id, ...(entry.id?.gogExtra ?? [])]);
  if (steam.length > 0) identifiers.steam = steam;
  if (gog.length > 0) identifiers.gog = gog;

  const executables = [];
  for (const launchPath of Object.keys(entry.launch ?? {})) {
    const file = launchPath.split(/[\\/]/).pop();
    if (bareName(file) && !file.includes("<") && !executables.some((e) => e.toLowerCase() === file.toLowerCase()))
      executables.push(file);
  }
  if (executables.length > 0) identifiers.executables = executables.sort();

  const dirs = Object.keys(entry.installDir ?? {}).filter(bareName);
  if (dirs.length > 0) identifiers.installDirNames = [...new Set(dirs)].sort();

  if (Object.keys(identifiers).length === 0) {
    const fallback = name.replace(/[\\/]/g, " ").trim().slice(0, 128);
    if (fallback.length > 0) identifiers.installDirNames = [fallback];
  }
  return identifiers;
}

function convertCloud(cloud) {
  const stores = Object.entries(cloud ?? {})
    .filter(([, enabled]) => enabled === true)
    .map(([store]) => STORE_MAP[store])
    .filter((store) => store && store !== "other");
  return [...new Set(stores)].sort();
}

/**
 * @param {Record<string, any>} manifest parsed Ludusavi manifest
 * @param {{ license: string }} options
 * @returns {{ profiles: object[], report: Report }}
 */
export function convertManifest(manifest, { license }) {
  const report = new Report();
  const profiles = [];
  const usedIds = new Set();

  for (const name of Object.keys(manifest).sort()) {
    const entry = manifest[name];
    report.entries++;
    if (!entry || typeof entry !== "object") {
      report.skipGame("not an object");
      continue;
    }
    if (entry.alias !== undefined) {
      report.skipGame("alias of another entry");
      continue;
    }
    if (!entry.files && !entry.registry) {
      report.skipGame("no save locations upstream");
      continue;
    }
    if (name.length > 200) {
      report.skipGame("name too long");
      continue;
    }

    const saves = convertFiles(entry.files, report);
    const registry = convertRegistry(entry.registry, report);
    if (saves.length === 0 && registry.length === 0) {
      report.skipGame("no usable save locations");
      continue;
    }
    if (saves.length > MAX_SAVE_RULES || registry.length > MAX_REGISTRY_RULES) {
      report.skipGame("too many rules");
      continue;
    }

    let id = slugify(name) || `game-${shortHash(name)}`;
    if (usedIds.has(id)) id = `${id}-${shortHash(name)}`;
    if (usedIds.has(id)) {
      report.skipGame("id collision");
      continue;
    }
    usedIds.add(id);

    const profile = {
      schemaVersion: 1,
      id,
      name,
      revision: 1,
      identifiers: convertIdentifiers(name, entry),
    };
    if (saves.length > 0) profile.saves = saves;
    if (registry.length > 0) profile.registry = registry;
    const cloudSync = convertCloud(entry.cloud);
    if (cloudSync.length > 0) profile.backup = { cloudSync };
    profile.mechanism = { type: "standard" };
    profile.provenance = { source: "ludusavi", license, basedOn: { ludusavi: name } };

    profiles.push(profile);
    report.converted++;
  }
  return { profiles, report };
}
