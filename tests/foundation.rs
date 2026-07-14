mod support;

use std::time::Duration;

use pho_code::agent::types::BackendRequestId;
use pho_code::backend::scripted::ScriptedBackend;
use pho_code::backend::{BackendRequest, FinishClass, ModelBackend, ModelEvent};
use tokio::io::AsyncReadExt as _;
use tokio::net::TcpStream;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

#[tokio::test]
async fn loopback_fixture_can_fragment_and_disconnect() {
    let fixture = support::LoopbackFixture::fragmented(
        vec![b"data: ".to_vec(), b"fixture\n\n".to_vec()],
        Duration::from_millis(1),
    )
    .await;
    let mut stream = TcpStream::connect(fixture.address).await.unwrap();
    let mut bytes = Vec::new();
    stream.read_to_end(&mut bytes).await.unwrap();
    fixture.finish().await;
    assert_eq!(bytes, b"data: fixture\n\n");
}

#[tokio::test]
async fn headless_scripted_target_needs_no_gpui_application() {
    let backend = ScriptedBackend::new([vec![ModelEvent::ResponseCompleted {
        provider_completion_id: "fixture".into(),
        finish: FinishClass::Stop,
    }]]);
    let (sender, mut receiver) = mpsc::channel(4);
    backend
        .stream(
            BackendRequest {
                request_id: BackendRequestId::new(),
                model: "scripted".into(),
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

#[test]
fn temporary_workspace_and_deterministic_child_fixture() {
    let workspace = tempfile::tempdir().unwrap();
    std::fs::write(workspace.path().join("fixture.txt"), "fixture\n").unwrap();
    let output = std::process::Command::new("/bin/zsh")
        .args(["-f", "-c", "printf deterministic-child"])
        .current_dir(workspace.path())
        .output()
        .unwrap();
    assert!(output.status.success());
    assert_eq!(output.stdout, b"deterministic-child");
}
