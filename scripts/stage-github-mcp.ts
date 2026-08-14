import path from "node:path";
import { PACKAGED_FEATURES_DIR } from "../packages/runtime/src/resource-locator.ts";
import { DESKTOP_RESOURCES_DIR, stageGitHubMcpServer } from "./stage-app-resources.ts";

const destination = stageGitHubMcpServer(path.join(DESKTOP_RESOURCES_DIR, PACKAGED_FEATURES_DIR), {
  required: true,
  fetchIfMissing: true,
});
if (!destination) {
  throw new Error("GitHub MCP staging returned no destination.");
}
process.stdout.write(`Staged GitHub MCP server at ${destination}\n`);
