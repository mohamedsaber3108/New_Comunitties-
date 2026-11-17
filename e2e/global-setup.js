// Prepare a fresh per-run directory and make sure ./dist is the real
// (non-preview) client build the server will serve.
import fs from "node:fs";
import { execSync } from "node:child_process";

export default async function globalSetup() {
  fs.mkdirSync(process.env.E2E_DIR, { recursive: true });
  execSync("npm run build:ec2", { stdio: "ignore" });
}
