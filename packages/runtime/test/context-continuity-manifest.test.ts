import { describe, expect, test } from "bun:test";
import { CONTEXT_CONTINUITY_FEATURE_ID } from "@pho-agent/runtime/context-continuity-feature";
import { createDefaultFeatureManifest, emptyFeatureManifest } from "../src/features";

describe("context continuity manifest toggle", () => {
  test("the default manifest carries the owner-promoted context-continuity entry", () => {
    const manifest = createDefaultFeatureManifest();
    const feature = manifest.features.find((candidate) => candidate.id === CONTEXT_CONTINUITY_FEATURE_ID);
    expect(feature).toBeDefined();
    expect(feature?.extensionFactories).toHaveLength(1);
  });

  test("contextContinuity: false removes the tools, injector, and hook together", () => {
    const manifest = createDefaultFeatureManifest(undefined, { contextContinuity: false });
    expect(manifest.features.some((candidate) => candidate.id === CONTEXT_CONTINUITY_FEATURE_ID)).toBe(false);
  });

  test("the empty manifest stays empty", () => {
    expect(emptyFeatureManifest().features).toHaveLength(0);
  });
});
