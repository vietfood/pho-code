use serde::{Deserialize, Serialize};
use uuid::Uuid;

macro_rules! local_id {
    ($name:ident) => {
        #[derive(
            Clone, Copy, Debug, Deserialize, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize,
        )]
        pub struct $name(Uuid);

        impl $name {
            pub fn new() -> Self {
                Self(Uuid::new_v4())
            }
        }

        impl Default for $name {
            fn default() -> Self {
                Self::new()
            }
        }
    };
}

local_id!(WorkspaceId);
local_id!(SessionId);
local_id!(TurnId);
local_id!(ItemId);
local_id!(BackendRequestId);
local_id!(ToolCallId);
local_id!(ApprovalId);
local_id!(ArtifactId);

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum TurnStatus {
    Preparing,
    RequestingModel,
    StreamingModel,
    AwaitingApproval,
    RunningTool,
    ContinuingModel,
    Cancelling,
    Completed,
    Failed,
    Cancelled,
    Interrupted,
    Uncertain,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum ToolStatus {
    Requested,
    Validated,
    AwaitingApproval,
    Running,
    Completed,
    Denied,
    Failed,
    Cancelled,
    Uncertain,
}

impl ToolStatus {
    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            Self::Completed | Self::Denied | Self::Failed | Self::Cancelled | Self::Uncertain
        )
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum ApprovalStatus {
    Pending,
    Approved,
    Denied,
    Unavailable,
    Invalidated,
}

impl ApprovalStatus {
    pub fn is_terminal(self) -> bool {
        self != Self::Pending
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum TerminalReason {
    Completed,
    Failed,
    Cancelled,
    Interrupted,
    Uncertain,
    LimitExceeded,
}

impl TurnStatus {
    pub fn is_terminal(&self) -> bool {
        matches!(
            self,
            Self::Completed | Self::Failed | Self::Cancelled | Self::Interrupted | Self::Uncertain
        )
    }
}
