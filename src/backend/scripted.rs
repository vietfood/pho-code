use std::collections::VecDeque;
use std::sync::Mutex;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use super::{BackendError, BackendRequest, ModelBackend, ModelEvent};

pub struct ScriptedBackend {
    scripts: Mutex<VecDeque<Vec<ModelEvent>>>,
}

impl ScriptedBackend {
    pub fn empty() -> Self {
        Self {
            scripts: Mutex::new(VecDeque::new()),
        }
    }

    pub fn new(scripts: impl IntoIterator<Item = Vec<ModelEvent>>) -> Self {
        Self {
            scripts: Mutex::new(scripts.into_iter().collect()),
        }
    }
}

impl ModelBackend for ScriptedBackend {
    fn stream<'a>(
        &'a self,
        _request: BackendRequest,
        events: mpsc::Sender<ModelEvent>,
        cancellation: CancellationToken,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), BackendError>> + Send + 'a>>
    {
        Box::pin(async move {
            let script = self
                .scripts
                .lock()
                .map_err(|_| BackendError::Protocol("script lock poisoned"))?
                .pop_front()
                .ok_or(BackendError::ScriptExhausted)?;
            for event in script {
                if cancellation.is_cancelled() {
                    return Err(BackendError::Cancelled);
                }
                events
                    .send(event)
                    .await
                    .map_err(|_| BackendError::EventChannelClosed)?;
            }
            Ok(())
        })
    }
}

#[cfg(test)]
mod tests {
    use crate::agent::types::BackendRequestId;

    use super::*;

    #[tokio::test]
    async fn replays_one_deterministic_script() {
        let backend = ScriptedBackend::new([vec![ModelEvent::ResponseCompleted {
            provider_completion_id: "fixture-response".into(),
            finish: crate::backend::FinishClass::Stop,
        }]]);
        let (sender, mut receiver) = mpsc::channel(2);
        backend
            .stream(
                BackendRequest {
                    request_id: BackendRequestId::new(),
                    model: "fixture".into(),
                    system_instructions: String::new(),
                    messages: vec![],
                    tools: vec![],
                },
                sender,
                CancellationToken::new(),
            )
            .await
            .unwrap();
        assert!(matches!(
            receiver.recv().await,
            Some(ModelEvent::ResponseCompleted { .. })
        ));
    }
}
