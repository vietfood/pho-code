//! Identity-bound interactive approval bridge shared by native presentation and the agent loop.
//!
//! The GPUI adapter never completes an effect directly. It submits a typed response to this
//! bounded policy, which accepts only the one live request with an exact identity and digest.

use std::future::Future;
use std::pin::Pin;

use tokio::sync::{Mutex, oneshot};
use tokio_util::sync::CancellationToken;

use super::{ApprovalDecision, ApprovalPolicy, ApprovalRequest, ApprovalResponse};

#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum InteractiveApprovalError {
    #[error("no matching approval is pending")]
    Stale,
    #[error("another approval is already pending")]
    Capacity,
}

struct PendingApproval {
    request: ApprovalRequest,
    response: oneshot::Sender<ApprovalResponse>,
}

/// One-pending-approval V1 policy. The summary is intentionally absent from `Debug` output.
pub struct InteractiveApprovalPolicy {
    pending: Mutex<Option<PendingApproval>>,
}

impl std::fmt::Debug for InteractiveApprovalPolicy {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("InteractiveApprovalPolicy")
            .finish_non_exhaustive()
    }
}

impl Default for InteractiveApprovalPolicy {
    fn default() -> Self {
        Self::new()
    }
}

impl InteractiveApprovalPolicy {
    pub fn new() -> Self {
        Self {
            pending: Mutex::new(None),
        }
    }

    pub async fn resolve(
        &self,
        response: ApprovalResponse,
    ) -> Result<(), InteractiveApprovalError> {
        let mut pending = self.pending.lock().await;
        let matches = pending.as_ref().is_some_and(|pending| {
            response.turn_id == pending.request.turn_id
                && response.approval_id == pending.request.approval_id
                && response.tool_call_id == pending.request.tool_call_id
                && response.effect_digest == pending.request.effect_digest
        });
        if !matches {
            return Err(InteractiveApprovalError::Stale);
        }
        let Some(pending) = pending.take() else {
            return Err(InteractiveApprovalError::Stale);
        };
        pending
            .response
            .send(response)
            .map_err(|_| InteractiveApprovalError::Stale)
    }

    pub async fn invalidate(&self) {
        let mut pending = self.pending.lock().await;
        if let Some(pending) = pending.take() {
            let response = unavailable_response(&pending.request);
            let _ = pending.response.send(response);
        }
    }

    pub async fn has_pending(&self) -> bool {
        self.pending.lock().await.is_some()
    }

    async fn wait_for_decision(
        &self,
        request: &ApprovalRequest,
        cancellation: CancellationToken,
    ) -> ApprovalResponse {
        let (response, receiver) = oneshot::channel();
        {
            let mut pending = self.pending.lock().await;
            if pending.is_some() {
                return unavailable_response(request);
            }
            *pending = Some(PendingApproval {
                request: request.clone(),
                response,
            });
        }

        tokio::select! {
            _ = cancellation.cancelled() => {
                let mut pending = self.pending.lock().await;
                if pending.as_ref().is_some_and(|pending| same_request(&pending.request, request)) {
                    pending.take();
                }
                unavailable_response(request)
            }
            response = receiver => {
                response.unwrap_or_else(|_| unavailable_response(request))
            }
        }
    }
}

impl ApprovalPolicy for InteractiveApprovalPolicy {
    fn decide<'a>(
        &'a self,
        request: &'a ApprovalRequest,
        cancellation: CancellationToken,
    ) -> Pin<Box<dyn Future<Output = ApprovalResponse> + Send + 'a>> {
        Box::pin(self.wait_for_decision(request, cancellation))
    }
}

fn same_request(left: &ApprovalRequest, right: &ApprovalRequest) -> bool {
    left.turn_id == right.turn_id
        && left.approval_id == right.approval_id
        && left.tool_call_id == right.tool_call_id
        && left.effect_digest == right.effect_digest
}

fn unavailable_response(request: &ApprovalRequest) -> ApprovalResponse {
    ApprovalResponse {
        turn_id: request.turn_id,
        approval_id: request.approval_id,
        tool_call_id: request.tool_call_id,
        effect_digest: request.effect_digest.clone(),
        decision: ApprovalDecision::Unavailable,
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use crate::agent::types::{ApprovalId, ToolCallId, TurnId};

    use super::*;

    fn request() -> ApprovalRequest {
        ApprovalRequest {
            turn_id: TurnId::new(),
            approval_id: ApprovalId::new(),
            tool_call_id: ToolCallId::new(),
            effect_digest: "effect-digest".into(),
            summary: "sensitive preview marker".into(),
        }
    }

    fn response(request: &ApprovalRequest, decision: ApprovalDecision) -> ApprovalResponse {
        ApprovalResponse {
            turn_id: request.turn_id,
            approval_id: request.approval_id,
            tool_call_id: request.tool_call_id,
            effect_digest: request.effect_digest.clone(),
            decision,
        }
    }

    #[tokio::test]
    async fn exact_identity_resolves_the_one_pending_request() {
        let policy = Arc::new(InteractiveApprovalPolicy::new());
        let request = request();
        let waiter = {
            let policy = policy.clone();
            let request = request.clone();
            tokio::spawn(async move { policy.decide(&request, CancellationToken::new()).await })
        };
        tokio::task::yield_now().await;
        assert!(policy.has_pending().await);
        policy
            .resolve(response(&request, ApprovalDecision::Approved))
            .await
            .unwrap();
        assert_eq!(waiter.await.unwrap().decision, ApprovalDecision::Approved);
        assert!(!policy.has_pending().await);
    }

    #[tokio::test]
    async fn stale_response_cannot_consume_the_live_request() {
        let policy = Arc::new(InteractiveApprovalPolicy::new());
        let request = request();
        let cancellation = CancellationToken::new();
        let waiter = {
            let policy = policy.clone();
            let request = request.clone();
            let cancellation = cancellation.clone();
            tokio::spawn(async move { policy.decide(&request, cancellation).await })
        };
        tokio::task::yield_now().await;
        let mut stale = response(&request, ApprovalDecision::Denied);
        stale.approval_id = ApprovalId::new();
        assert_eq!(
            policy.resolve(stale).await,
            Err(InteractiveApprovalError::Stale)
        );
        assert!(policy.has_pending().await);
        cancellation.cancel();
        assert_eq!(
            waiter.await.unwrap().decision,
            ApprovalDecision::Unavailable
        );
    }

    #[tokio::test]
    async fn invalidation_denies_without_claiming_approval() {
        let policy = Arc::new(InteractiveApprovalPolicy::new());
        let request = request();
        let waiter = {
            let policy = policy.clone();
            let request = request.clone();
            tokio::spawn(async move { policy.decide(&request, CancellationToken::new()).await })
        };
        tokio::task::yield_now().await;
        policy.invalidate().await;
        assert_eq!(
            waiter.await.unwrap().decision,
            ApprovalDecision::Unavailable
        );
        assert!(!format!("{policy:?}").contains("sensitive preview marker"));
    }
}
