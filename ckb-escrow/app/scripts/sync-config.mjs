import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = (name) => resolve(appDir, "src/ckb", name);

function die(message) {
  console.error(`sync-config: ${message}`);
  process.exit(1);
}

// The devnet's system scripts live in the genesis block, so their out-points
// change whenever the chain data is recreated (`offckb clean`). Regenerating
// them here keeps the browser client's script map in step with the chain it
// is about to talk to.
let knownScripts;
try {
  const raw = execFileSync("offckb", ["system-scripts", "--export-style", "ccc"], {
    encoding: "utf8",
  });
  knownScripts = JSON.parse(raw.slice(raw.indexOf("{")));
} catch {
  die("could not read devnet system scripts — is `offckb` installed and the devnet initialised?");
}
writeFileSync(out("devnet-known-scripts.json"), `${JSON.stringify(knownScripts, null, 2)}\n`);

// The escrow's own code hash changes on every redeploy, so read it from the
// deployment record rather than pinning a copy in the frontend.
const deployment = JSON.parse(
  readFileSync(resolve(appDir, "../deployment/scripts.json"), "utf8"),
);
const escrow = deployment.devnet?.escrow;
if (!escrow?.codeHash) {
  die("escrow is not deployed to devnet — run `offckb deploy --network devnet --target build/release`");
}
writeFileSync(out("escrow-script.json"), `${JSON.stringify(escrow, null, 2)}\n`);

console.log(`sync-config: devnet scripts (${Object.keys(knownScripts).length}) + escrow ${escrow.codeHash}`);
