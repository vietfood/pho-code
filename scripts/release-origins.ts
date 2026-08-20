/**
 * Website and update origins consumed by V4. Values are named placeholders until
 * the separate website work publishes exact HTTPS locations.
 */
export const RELEASE_ORIGINS_ARE_PLACEHOLDERS = true;

const PLACEHOLDER_ORIGIN = "https://website-pending.pho-code.invalid";

export const RELEASE_ORIGINS = {
  downloadPage: `${PLACEHOLDER_ORIGIN}/download`,
  releaseNotes: `${PLACEHOLDER_ORIGIN}/releases`,
  privacyPolicy: `${PLACEHOLDER_ORIGIN}/privacy`,
  securityContact: `${PLACEHOLDER_ORIGIN}/security`,
  updateFeed: `${PLACEHOLDER_ORIGIN}/updates/beta/feed.json`,
  updatePayloadHost: PLACEHOLDER_ORIGIN,
} as const;

export function assertHttpsOrigin(url: string): void {
  if (!URL.canParse(url)) {
    throw new Error(`Release origin is not a URL: ${url}`);
  }
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error(`Release origin must be https: ${url}`);
  }
}

export function assertReleaseOriginsShape(): void {
  for (const url of Object.values(RELEASE_ORIGINS)) {
    assertHttpsOrigin(url);
  }
}
