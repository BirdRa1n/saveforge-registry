import assert from "node:assert/strict";
import { test } from "node:test";
import { convertManifest, slugify } from "../lib/convert-ludusavi.mjs";
import { validatorFor } from "../lib/validator.mjs";

const LICENSE = "CC-BY-NC-SA-3.0";
const validateProfile = validatorFor("profile/profile.v1");
const convert = (manifest) => convertManifest(manifest, { license: LICENSE });

const hollowKnight = {
  cloud: { gog: true, steam: true },
  files: {
    "<base>/hollow_knight_Data/Config.ini": { tags: ["config"], when: [{ os: "windows" }, { os: "linux" }] },
    "<home>/AppData/LocalLow/Team Cherry/Hollow Knight/*.dat": { tags: ["save"], when: [{ os: "windows" }] },
    "<home>/Library/Application Support/unity.Team Cherry.Hollow Knight": { tags: ["save"], when: [{ os: "mac" }] },
  },
  installDir: { "Hollow Knight": {} },
  launch: { "<base>/hollow_knight.exe": [{ when: [{ os: "windows" }] }] },
  steam: { id: 367520 },
  gog: { id: 1308320804 },
};

test("converts a typical entry into a valid profile", () => {
  const { profiles, report } = convert({ "Hollow Knight": hollowKnight });
  assert.equal(report.converted, 1);
  const [profile] = profiles;
  assert.equal(profile.id, "hollow-knight");
  assert.deepEqual(profile.identifiers, {
    steam: [367520],
    gog: [1308320804],
    executables: ["hollow_knight.exe"],
    installDirNames: ["Hollow Knight"],
  });
  assert.deepEqual(profile.backup, { cloudSync: ["gog", "steam"] });
  assert.deepEqual(profile.provenance, { source: "ludusavi", license: LICENSE, basedOn: { ludusavi: "Hollow Knight" } });
  // One path with two `when` entries becomes two rules (one per OS).
  const config = profile.saves.filter((r) => r.id === "config");
  assert.deepEqual(config.map((r) => r.when.os).sort(), ["linux", "windows"]);
  assert.equal(profile.saves.find((r) => r.when?.os === "macos").paths[0],
    "<home>/Library/Application Support/unity.Team Cherry.Hollow Knight");
  assert.deepEqual(validateProfile(profile), { ok: true, error: null });
});

test("drops unsafe or unsupported locations and reports why", () => {
  const { profiles, report } = convert({
    Game: {
      files: {
        "<root>/userdata/<storeUserId>/123/remote": {},
        "<winDir>/system.ini": {},
        "<home>/**": {},
        "<home>/.ssh/config": {},
        "<winAppData>/Studio/Game/save.dat": { when: [{ os: "linux" }] },
        "<winDocuments>/Xbox/save.dat": { when: [{ store: "microsoft" }] },
        "<base>/save/*.sav": { when: [{ os: "dos" }, { os: "windows" }] },
      },
      registry: { "HKEY_LOCAL_MACHINE/Software/Studio": {}, "HKEY_CURRENT_USER/Software/Studio/Game": { tags: ["config"] } },
    },
  });
  assert.equal(profiles.length, 1);
  assert.deepEqual(profiles[0].saves, [{ id: "save", tags: ["save"], when: { os: "windows" }, paths: ["<base>/save/*.sav"] }]);
  assert.deepEqual(profiles[0].registry, [{ id: "config", tags: ["config"], keys: ["HKCU/Software/Studio/Game"] }]);
  assert.equal(report.droppedPaths["placeholder <root>"], 1);
  assert.equal(report.droppedPaths["placeholder <winDir>"], 1);
  assert.equal(report.droppedPaths["path rule P5"], 1);
  assert.equal(report.droppedPaths["path rule P6"], 1);
  assert.equal(report.droppedPaths["placeholder contradicts os"], 1);
  assert.equal(report.droppedPaths['unsupported store "microsoft"'], 1);
  assert.equal(report.droppedPaths['unsupported os "dos"'], 1);
  assert.equal(report.droppedKeys["hive outside HKCU"], 1);
  assert.equal(validateProfile(profiles[0]).ok, true);
});

test("skips aliases, entries without saves and entries left empty", () => {
  const { profiles, report } = convert({
    Alias: { alias: "Hollow Knight" },
    "No Saves": { installDir: { X: {} }, steam: { id: 1 } },
    "Only Unsafe": { files: { "<home>/*": {} } },
  });
  assert.equal(profiles.length, 0);
  assert.deepEqual(report.skippedGames, {
    "alias of another entry": 1,
    "no save locations upstream": 1,
    "no usable save locations": 1,
  });
});

test("ids are stable slugs and collisions get a name-derived suffix", () => {
  assert.equal(slugify("Ōkami HD"), "okami-hd");
  assert.equal(slugify("Hollow Knight: Silksong"), "hollow-knight-silksong");
  assert.equal(slugify("!!!"), "");

  const entry = { files: { "<base>/save.dat": {} } };
  const { profiles } = convert({ "Game!": entry, "Game?": entry, "★": entry });
  const ids = profiles.map((p) => p.id);
  assert.equal(ids.length, 3);
  assert.equal(new Set(ids).size, 3);
  assert.ok(ids.includes("game"));
  assert.ok(ids.some((id) => /^game-[0-9a-f]{6}$/.test(id)));
  assert.ok(ids.some((id) => /^game-[0-9a-f]{6}$/.test(id) && id !== "game"));
  for (const p of profiles) assert.equal(validateProfile(p).ok, true, p.id);
});

test("conversion is deterministic", () => {
  const manifest = { B: hollowKnight, A: hollowKnight };
  assert.equal(JSON.stringify(convert(manifest).profiles), JSON.stringify(convert({ A: hollowKnight, B: hollowKnight }).profiles));
});
