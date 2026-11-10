// Validates documents against the schemas in the savevault-specs submodule.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { repoRoot } from "./upstream.mjs";

const specsRoot = join(repoRoot, "external", "specs");

function schemaFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) schemaFiles(full, out);
    else if (full.endsWith(".schema.json") && basename(dirname(full)) === "schema") out.push(full);
  }
  return out;
}

const ajv = new Ajv2020({ strict: true, allErrors: false });
addFormats(ajv);
for (const file of schemaFiles(specsRoot)) ajv.addSchema(JSON.parse(readFileSync(file, "utf8")));

const SCHEMA_BASE = "https://savevault.github.io/savevault-specs/schemas/";

/** Returns a validator for e.g. "profile/profile.v1" or "registry/index.v1". */
export function validatorFor(name) {
  const validate = ajv.getSchema(`${SCHEMA_BASE}${name}.schema.json`);
  if (!validate) throw new Error(`Unknown schema ${name}`);
  return (document) => {
    const ok = validate(document);
    return { ok, error: ok ? null : `${validate.errors[0].instancePath || "/"} ${validate.errors[0].message}` };
  };
}
