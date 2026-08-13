import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { FileFinder } from "@ff-labs/fff-node";

const root = await mkdtemp(path.join(tmpdir(), "fff-probe-"));
const ws = path.join(root, "ws");
await mkdir(path.join(ws, "packages", "app"), { recursive: true });
await mkdir(path.join(ws, "packages", "core"), { recursive: true });
await mkdir(path.join(ws, "refs", "foo", "packages", "bar"), { recursive: true });
await mkdir(path.join(ws, "docs"), { recursive: true });
await writeFile(path.join(ws, "packages", "app", "a.ts"), "alpha renderer\n");
await writeFile(path.join(ws, "packages", "core", "c.ts"), "alpha renderer preload\n");
await writeFile(path.join(ws, "refs", "foo", "packages", "bar", "b.ts"), "alpha renderer\n");
await writeFile(path.join(ws, "docs", "readme.md"), "alpha renderer preload\n");

const created = FileFinder.create({
  basePath: ws,
  aiMode: true,
  enableFsRootScanning: false,
  enableHomeDirScanning: false,
  followSymlinks: false,
});
if (!created.ok) {
  console.error("create failed", created.error);
  process.exit(1);
}
const f = created.value;
await f.waitForScan(15000);

function show(label: string, items: Array<{ relativePath: string; lineNumber: number; lineContent: string }>) {
  console.log(`\n=== ${label} ===`);
  for (const it of items) console.log(`  ${it.relativePath}:${it.lineNumber} ${JSON.stringify(it.lineContent)}`);
}

for (const pats of [
  ["zzz"],
  ["zzz", "yyy"],
  ["zzz", "preload"],
  ["zzz", "renderer"],
  ["preload", "zzz"],
  ["renderer", "preload", "zzz"],
  ["re", "pre"],
]) {
  const m = f.multiGrep({ patterns: pats, pageSize: 50 });
  if (m.ok) show(`multiGrep patterns=${JSON.stringify(pats)}`, m.value.items);
  else console.log(`multiGrep patterns=${JSON.stringify(pats)} err`, m.error);
}

f.destroy();
