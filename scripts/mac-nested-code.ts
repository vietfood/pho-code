import path from "node:path";

export const NESTED_NATIVE_EXTENSIONS = [".node", ".dylib", ".so"] as const;
export const NESTED_EXECUTABLE_BASENAMES = ["rg", "github-mcp-server"] as const;

export const REQUIRED_NESTED_CODE_PATH_PATTERNS = [
  /Contents\/Resources\/features\/ripgrep\/.+\/rg$/,
  /Contents\/Resources\/features\/github\/github-mcp-server\/.+\/github-mcp-server$/,
  /Contents\/Resources\/app\.asar\.unpacked\/.+\.(?:node|dylib)$/,
] as const;

export function isNestedCodeRelativePath(relativePath: string): boolean {
  const normalized = relativePath.split(path.sep).join("/");
  const base = path.posix.basename(normalized);
  if ((NESTED_EXECUTABLE_BASENAMES as readonly string[]).includes(base)) {
    return true;
  }
  const extension = path.posix.extname(normalized);
  return (NESTED_NATIVE_EXTENSIONS as readonly string[]).includes(extension);
}
