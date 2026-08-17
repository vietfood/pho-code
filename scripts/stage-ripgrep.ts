import path from "node:path";
import { PACKAGED_FEATURES_DIR } from "../packages/runtime/src/resource-locator.ts";
import { DESKTOP_RESOURCES_DIR, stageRipgrep } from "./stage-app-resources.ts";

const destination = stageRipgrep(path.join(DESKTOP_RESOURCES_DIR, PACKAGED_FEATURES_DIR), {
  required: true,
  fetchIfMissing: true,
});
if (!destination) {
  throw new Error("Ripgrep staging returned no destination.");
}
process.stdout.write(`Staged ripgrep at ${destination}\n`);
