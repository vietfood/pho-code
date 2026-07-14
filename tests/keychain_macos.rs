#![cfg(target_os = "macos")]

use pho_code::auth::CredentialRecord;
use pho_code::auth::keychain::{CredentialStore, MacKeychainStore};
use uuid::Uuid;

#[test]
#[ignore = "opt-in macOS Keychain component check; may display a system authorization prompt"]
fn development_keychain_round_trip_and_delete() {
    let suffix = Uuid::new_v4().simple().to_string();
    let store = MacKeychainStore::development(&suffix).unwrap();
    let record =
        CredentialRecord::new("fixture-key".into(), 1, 123, "fixture-digest".into()).unwrap();
    store.replace(&record).unwrap();
    assert!(store.load().unwrap().is_some());
    store.delete().unwrap();
    assert!(store.load().unwrap().is_none());
}
