pub mod api_key;
pub mod keychain;

use std::fmt;

use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, ZeroizeOnDrop};

#[derive(Clone, Zeroize, ZeroizeOnDrop)]
pub struct SecretText(String);

impl SecretText {
    pub fn new(value: String) -> Self {
        Self(value)
    }

    pub(crate) fn expose(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for SecretText {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("[REDACTED]")
    }
}

impl fmt::Display for SecretText {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("[REDACTED]")
    }
}

#[derive(Clone, Zeroize, ZeroizeOnDrop)]
pub struct CredentialRecord {
    pub(crate) schema_version: u32,
    pub(crate) api_key: SecretText,
    pub(crate) profile_revision: u32,
    pub(crate) last_validated_unix_seconds: u64,
    pub(crate) model_set_digest: String,
    pub(crate) invalidated: bool,
}

impl fmt::Debug for CredentialRecord {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("CredentialRecord")
            .field("schema_version", &self.schema_version)
            .field("api_key", &"[REDACTED]")
            .field("profile_revision", &self.profile_revision)
            .field(
                "last_validated_unix_seconds",
                &self.last_validated_unix_seconds,
            )
            .field("model_set_digest", &self.model_set_digest)
            .field("invalidated", &self.invalidated)
            .finish()
    }
}

#[derive(Deserialize, Serialize, Zeroize, ZeroizeOnDrop)]
struct StoredCredentialRecord {
    schema_version: u32,
    api_key: String,
    profile_revision: u32,
    last_validated_unix_seconds: u64,
    model_set_digest: String,
    #[serde(default)]
    invalidated: bool,
}

impl CredentialRecord {
    pub const VERSION: u32 = 1;

    pub fn new(
        api_key: String,
        profile_revision: u32,
        last_validated_unix_seconds: u64,
        model_set_digest: String,
    ) -> Result<Self, AuthError> {
        validate_candidate(&api_key)?;
        if profile_revision == 0 || model_set_digest.is_empty() || model_set_digest.len() > 128 {
            return Err(AuthError::CredentialsMalformed);
        }
        Ok(Self {
            schema_version: Self::VERSION,
            api_key: SecretText::new(api_key),
            profile_revision,
            last_validated_unix_seconds,
            model_set_digest,
            invalidated: false,
        })
    }

    pub(crate) fn encode(&self) -> Result<Vec<u8>, AuthError> {
        serde_json::to_vec(&StoredCredentialRecord {
            schema_version: self.schema_version,
            api_key: self.api_key.expose().into(),
            profile_revision: self.profile_revision,
            last_validated_unix_seconds: self.last_validated_unix_seconds,
            model_set_digest: self.model_set_digest.clone(),
            invalidated: self.invalidated,
        })
        .map_err(|_| AuthError::CredentialsMalformed)
    }

    pub(crate) fn decode(bytes: &[u8]) -> Result<Self, AuthError> {
        if bytes.len() > 8 * 1024 {
            return Err(AuthError::CredentialsMalformed);
        }
        let stored: StoredCredentialRecord =
            serde_json::from_slice(bytes).map_err(|_| AuthError::CredentialsMalformed)?;
        if stored.schema_version != Self::VERSION {
            return Err(AuthError::CredentialsMalformed);
        }
        let mut record = Self::new(
            stored.api_key.clone(),
            stored.profile_revision,
            stored.last_validated_unix_seconds,
            stored.model_set_digest.clone(),
        )?;
        record.invalidated = stored.invalidated;
        Ok(record)
    }
}

pub fn validate_candidate(value: &str) -> Result<(), AuthError> {
    if value.is_empty()
        || value.len() > 4096
        || value.trim() != value
        || value.bytes().any(|byte| byte.is_ascii_control())
    {
        Err(AuthError::CredentialsMalformed)
    } else {
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CredentialState {
    Missing,
    Installing,
    Validating,
    Ready,
    TemporarilyUnavailable,
    Invalid,
    Malformed,
    RemovalFailed,
}

#[derive(Clone, Debug, Eq, PartialEq, thiserror::Error)]
pub enum AuthError {
    #[error("credentials are missing")]
    CredentialsMissing,
    #[error("credentials are malformed")]
    CredentialsMalformed,
    #[error("credential storage failed")]
    CredentialStore,
    #[error("credential validation failed")]
    ValidationFailed,
    #[error("credential is invalid")]
    Invalid,
    #[error("qualified model is unavailable")]
    ModelUnavailable,
    #[error("authentication was cancelled")]
    Cancelled,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secret_and_record_debug_are_redacted() {
        let record =
            CredentialRecord::new("seeded-secret-marker".into(), 1, 0, "digest".into()).unwrap();
        assert!(!format!("{record:?}").contains("seeded-secret-marker"));
        assert!(record.encode().unwrap().len() > 10);
    }

    #[test]
    fn candidate_rejects_whitespace_control_and_excess() {
        for value in ["", " key", "key\n", "key "] {
            assert_eq!(
                validate_candidate(value),
                Err(AuthError::CredentialsMalformed)
            );
        }
        assert!(validate_candidate(&"x".repeat(4097)).is_err());
    }
}
