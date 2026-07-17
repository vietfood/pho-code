use std::collections::BTreeMap;
use std::future::Future;
use std::pin::Pin;
use std::process::Command;
use std::sync::Arc;

use pho_code::app::action::{Intent, RuntimeEvent};
use pho_code::app::runtime::RuntimeConfig;
use pho_code::app::services::{ApplicationPaths, ApplicationServicesFactory, BackendSelection};
use pho_code::auth::api_key::{CredentialValidator, ValidationResult};
use pho_code::auth::keychain::MemoryCredentialStore;
use pho_code::auth::{AuthError, CredentialState, SecretText};
use pho_code::tools::{ApprovalDecision, NoToolRuntime, StaticApprovalPolicy};

#[test]
fn native_target_rejects_launch_arguments_without_echoing_them() {
    let output = Command::new(env!("CARGO_BIN_EXE_pho-native"))
        .arg("seeded-secret-marker")
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(2));
    let rendered = String::from_utf8_lossy(&output.stderr);
    assert!(rendered.contains("launch arguments are not supported"));
    assert!(!rendered.contains("seeded-secret-marker"));
}

#[test]
fn cargo_lock_contains_one_coherent_gpui_source_family() {
    let lock = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/Cargo.lock")).unwrap();
    let packages = lock.split("[[package]]").filter_map(parse_package).fold(
        BTreeMap::<String, Vec<Option<String>>>::new(),
        |mut packages, (name, source)| {
            packages.entry(name).or_default().push(source);
            packages
        },
    );
    let expected_revision = "7cf50a771f54427f76b4584030c7b3b66f4e39f5";
    for name in ["gpui", "gpui_macos", "gpui_macros", "gpui_platform"] {
        let sources = packages
            .get(name)
            .unwrap_or_else(|| panic!("{name} is absent from Cargo.lock"));
        assert_eq!(sources.len(), 1, "{name} has multiple package identities");
        let source = sources[0]
            .as_deref()
            .unwrap_or_else(|| panic!("{name} has no pinned source"));
        assert!(
            source.contains(expected_revision),
            "{name} is not pinned to the qualified Zed revision"
        );
    }
    assert!(
        !packages.contains_key("gpui-component"),
        "the unqualified component candidate entered the production graph"
    );
}

struct AcceptingValidator;

impl CredentialValidator for AcceptingValidator {
    fn validate<'a>(
        &'a self,
        _: &'a SecretText,
    ) -> Pin<Box<dyn Future<Output = Result<ValidationResult, AuthError>> + Send + 'a>> {
        Box::pin(async {
            Ok(ValidationResult {
                model_set_digest: "phase-6-fixture".into(),
            })
        })
    }
}

#[tokio::test]
async fn shared_coordinator_projects_validating_before_ready_without_exposing_candidate() {
    let directory = tempfile::tempdir().unwrap();
    let services = ApplicationServicesFactory::with_components(
        ApplicationPaths::for_root(directory.path()).unwrap(),
        Arc::new(MemoryCredentialStore::empty()),
        Arc::new(AcceptingValidator),
        BackendSelection::LoopbackFixture("http://127.0.0.1:1/chat/completions".into()),
        Arc::new(RuntimeConfig::default()),
    )
    .open()
    .unwrap();
    let mut coordinator = services
        .coordinator(
            Arc::new(NoToolRuntime),
            Arc::new(StaticApprovalPolicy::new(ApprovalDecision::Unavailable)),
        )
        .await;
    let marker = "phase-6-secret-marker";
    let intent = Intent::InstallCredential {
        candidate: SecretText::new(marker.into()),
    };
    assert!(!format!("{intent:?}").contains(marker));

    let mut states = Vec::new();
    coordinator
        .dispatch(intent, |event| {
            if let RuntimeEvent::CredentialChanged { state } = event {
                states.push(state);
            }
        })
        .await
        .unwrap();
    assert_eq!(
        states,
        vec![CredentialState::Validating, CredentialState::Ready]
    );
}

fn parse_package(block: &str) -> Option<(String, Option<String>)> {
    let mut name = None;
    let mut source = None;
    for line in block.lines() {
        let Some((key, value)) = line.split_once(" = ") else {
            continue;
        };
        let Some(value) = value
            .strip_prefix('"')
            .and_then(|value| value.strip_suffix('"'))
        else {
            continue;
        };
        match key {
            "name" => name = Some(value.to_owned()),
            "source" => source = Some(value.to_owned()),
            _ => {}
        }
    }
    name.map(|name| (name, source))
}
