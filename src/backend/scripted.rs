use std::collections::VecDeque;
use std::sync::Mutex;

use tokio::sync::{Notify, mpsc};
use tokio_util::sync::CancellationToken;

use super::{BackendError, BackendRequest, CancellationStage, ModelBackend, ModelEvent};

#[derive(Clone, Debug)]
pub enum ScriptedStep {
    Emit(ModelEvent),
    Fail(BackendError),
    WaitForCancellation { stage: CancellationStage },
}

#[derive(Clone, Debug)]
pub struct ScriptedResponse {
    steps: Vec<ScriptedStep>,
}

impl ScriptedResponse {
    pub fn new(steps: impl IntoIterator<Item = ScriptedStep>) -> Self {
        Self {
            steps: steps.into_iter().collect(),
        }
    }
}

impl From<Vec<ModelEvent>> for ScriptedResponse {
    fn from(events: Vec<ModelEvent>) -> Self {
        Self::new(events.into_iter().map(ScriptedStep::Emit))
    }
}

pub struct ScriptedBackend {
    scripts: Mutex<VecDeque<ScriptedResponse>>,
    requests: Mutex<Vec<BackendRequest>>,
    request_recorded: Notify,
}

impl ScriptedBackend {
    pub fn empty() -> Self {
        Self {
            scripts: Mutex::new(VecDeque::new()),
            requests: Mutex::new(Vec::new()),
            request_recorded: Notify::new(),
        }
    }

    pub fn new(scripts: impl IntoIterator<Item = Vec<ModelEvent>>) -> Self {
        Self {
            scripts: Mutex::new(scripts.into_iter().map(Into::into).collect()),
            requests: Mutex::new(Vec::new()),
            request_recorded: Notify::new(),
        }
    }

    pub fn from_responses(scripts: impl IntoIterator<Item = ScriptedResponse>) -> Self {
        Self {
            scripts: Mutex::new(scripts.into_iter().collect()),
            requests: Mutex::new(Vec::new()),
            request_recorded: Notify::new(),
        }
    }

    pub fn request_snapshot(&self) -> Result<Vec<BackendRequest>, BackendError> {
        self.requests
            .lock()
            .map(|requests| requests.clone())
            .map_err(|_| BackendError::Protocol("script request lock poisoned"))
    }

    pub async fn wait_for_request_count(&self, expected: usize) -> Result<(), BackendError> {
        loop {
            let recorded = self.request_recorded.notified();
            if self.request_snapshot()?.len() >= expected {
                return Ok(());
            }
            recorded.await;
        }
    }
}

impl ModelBackend for ScriptedBackend {
    fn stream<'a>(
        &'a self,
        request: BackendRequest,
        events: mpsc::Sender<ModelEvent>,
        cancellation: CancellationToken,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), BackendError>> + Send + 'a>>
    {
        Box::pin(async move {
            let request_id = request.request_id;
            let model = request.model.clone();
            self.requests
                .lock()
                .map_err(|_| BackendError::Protocol("script request lock poisoned"))?
                .push(request);
            self.request_recorded.notify_waiters();
            let script = self
                .scripts
                .lock()
                .map_err(|_| BackendError::Protocol("script lock poisoned"))?
                .pop_front()
                .ok_or(BackendError::ScriptExhausted)?;
            for step in script.steps {
                match step {
                    ScriptedStep::WaitForCancellation { stage } => {
                        cancellation.cancelled().await;
                        events
                            .send(ModelEvent::ResponseCancelled {
                                stage,
                                transport_terminated: true,
                            })
                            .await
                            .map_err(|_| BackendError::EventChannelClosed)?;
                        return Ok(());
                    }
                    ScriptedStep::Emit(mut event) => {
                        if cancellation.is_cancelled() {
                            return Err(BackendError::Cancelled);
                        }
                        event.bind_request_identity(request_id, &model);
                        events
                            .send(event)
                            .await
                            .map_err(|_| BackendError::EventChannelClosed)?;
                    }
                    ScriptedStep::Fail(error) => {
                        if cancellation.is_cancelled() {
                            return Err(BackendError::Cancelled);
                        }
                        return Err(error);
                    }
                }
            }
            Ok(())
        })
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use crate::agent::types::{BackendRequestId, ItemId};
    use crate::backend::{BackendMessage, UserMessage};

    use super::*;

    fn request(text: &str) -> BackendRequest {
        BackendRequest {
            request_id: BackendRequestId::new(),
            model: "fixture".into(),
            system_instructions: String::new(),
            messages: vec![BackendMessage::User(UserMessage {
                item_id: ItemId::new(),
                text: text.into(),
            })],
            tools: vec![],
        }
    }

    #[tokio::test]
    async fn replays_one_deterministic_script() {
        let backend = ScriptedBackend::new([vec![ModelEvent::ResponseCompleted {
            request_id: BackendRequestId::new(),
            provider_completion_id: "fixture-response".into(),
            model: "fixture".into(),
            finish: crate::backend::FinishClass::Stop,
        }]]);
        let (sender, mut receiver) = mpsc::channel(2);
        backend
            .stream(request("fixture request"), sender, CancellationToken::new())
            .await
            .unwrap();
        assert!(matches!(
            receiver.recv().await,
            Some(ModelEvent::ResponseCompleted { .. })
        ));
    }

    #[tokio::test]
    async fn captures_a_cloned_request_snapshot() {
        let backend = ScriptedBackend::new([vec![]]);
        let expected = request("captured request");
        let (sender, _receiver) = mpsc::channel(1);

        backend
            .stream(expected.clone(), sender, CancellationToken::new())
            .await
            .unwrap();

        assert_eq!(backend.request_snapshot().unwrap(), vec![expected]);
    }

    #[tokio::test]
    async fn can_fail_after_emitting_an_event() {
        let backend = ScriptedBackend::from_responses([ScriptedResponse::new([
            ScriptedStep::Emit(ModelEvent::ResponseStarted {
                request_id: BackendRequestId::new(),
                provider_completion_id: Some("fixture-response".into()),
                model: "fixture".into(),
            }),
            ScriptedStep::Fail(BackendError::Transport("scripted failure")),
        ])]);
        let (sender, mut receiver) = mpsc::channel(2);
        let expected_request = request("failure request");

        let result = backend
            .stream(expected_request.clone(), sender, CancellationToken::new())
            .await;

        assert_eq!(
            receiver.recv().await,
            Some(ModelEvent::ResponseStarted {
                request_id: expected_request.request_id,
                provider_completion_id: Some("fixture-response".into()),
                model: "fixture".into(),
            })
        );
        assert_eq!(result, Err(BackendError::Transport("scripted failure")));
    }

    #[tokio::test]
    async fn wait_for_cancellation_emits_normalized_acknowledgement() {
        let backend = Arc::new(ScriptedBackend::from_responses([ScriptedResponse::new([
            ScriptedStep::WaitForCancellation {
                stage: CancellationStage::AfterStreamStarted,
            },
        ])]));
        let cancellation = CancellationToken::new();
        let (sender, mut receiver) = mpsc::channel(1);
        let running = {
            let backend = Arc::clone(&backend);
            let cancellation = cancellation.clone();
            tokio::spawn(async move {
                backend
                    .stream(request("cancel request"), sender, cancellation)
                    .await
            })
        };

        backend.wait_for_request_count(1).await.unwrap();
        cancellation.cancel();

        assert_eq!(running.await.unwrap(), Ok(()));
        assert_eq!(
            receiver.recv().await,
            Some(ModelEvent::ResponseCancelled {
                stage: CancellationStage::AfterStreamStarted,
                transport_terminated: true,
            })
        );
    }
}
