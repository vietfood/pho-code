import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { emptyMetadata, parseMetadata, type AppMetadata, type AppMetadataStore } from "@pho-code/application";

export function createFileMetadataStore(filePath: string): AppMetadataStore {
  return {
    load() {
      try {
        const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
        return parseMetadata(parsed);
      } catch {
        return emptyMetadata();
      }
    },
    async save(metadata: AppMetadata) {
      mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileSync(filePath, `${JSON.stringify(metadata, null, 2)}\n`);
    },
  };
}
