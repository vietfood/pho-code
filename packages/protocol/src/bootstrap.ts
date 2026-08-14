import type { SessionSnapshot } from "./conversation";
import type { FeatureSnapshot } from "./resources";
import type { ProtocolVersion } from "./version";
import type { ModelSummary, RecentWorkspaceRecord, SessionSummary, WorkspaceSummary } from "./workspace";

export interface BootstrapVersions {
  electron: string;
  embeddedNode: string;
}

export interface BootstrapCapabilities {
  piRuntime: boolean;
}

export type BootstrapMilestone = "bootstrap" | "vertical-slice";

export interface BootstrapState {
  protocolVersion: ProtocolVersion;
  appName: string;
  appVersion: string;
  milestone: BootstrapMilestone;
  capabilities: BootstrapCapabilities;
  versions: BootstrapVersions;
  embeddedNodeCompatible: boolean;
  intendedPiSdk: {
    packageName: string;
    version: string;
    enginesNode: string;
  };
  recentWorkspaces: RecentWorkspaceRecord[];
  selectedWorkspace?: WorkspaceSummary;
  sessions: SessionSummary[];
  models: ModelSummary[];
  features?: FeatureSnapshot;
  modelError?: string;
  activeSession?: SessionSnapshot;
}
