use std::sync::Mutex;

use zeroize::Zeroize as _;

use super::{AuthError, CredentialRecord};

pub trait CredentialStore: Send + Sync {
    fn load(&self) -> Result<Option<CredentialRecord>, AuthError>;
    fn replace(&self, record: &CredentialRecord) -> Result<(), AuthError>;
    fn delete(&self) -> Result<(), AuthError>;
}

pub struct MemoryCredentialStore {
    slot: Mutex<Option<Vec<u8>>>,
}

impl MemoryCredentialStore {
    pub fn empty() -> Self {
        Self {
            slot: Mutex::new(None),
        }
    }
}

impl CredentialStore for MemoryCredentialStore {
    fn load(&self) -> Result<Option<CredentialRecord>, AuthError> {
        self.slot
            .lock()
            .map_err(|_| AuthError::CredentialStore)?
            .as_deref()
            .map(CredentialRecord::decode)
            .transpose()
    }

    fn replace(&self, record: &CredentialRecord) -> Result<(), AuthError> {
        *self.slot.lock().map_err(|_| AuthError::CredentialStore)? = Some(record.encode()?);
        Ok(())
    }

    fn delete(&self) -> Result<(), AuthError> {
        *self.slot.lock().map_err(|_| AuthError::CredentialStore)? = None;
        Ok(())
    }
}

#[cfg(target_os = "macos")]
pub struct MacKeychainStore {
    service: String,
    account: String,
}

#[cfg(target_os = "macos")]
impl MacKeychainStore {
    pub fn production() -> Self {
        Self {
            service: "com.pho-code.credentials.v1".into(),
            account: "deepseek-api".into(),
        }
    }

    pub fn development(suffix: &str) -> Result<Self, AuthError> {
        if suffix.is_empty()
            || suffix.len() > 64
            || !suffix
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        {
            return Err(AuthError::CredentialStore);
        }
        Ok(Self {
            service: format!("com.pho-code.credentials.v1.test.{suffix}"),
            account: "deepseek-api".into(),
        })
    }
}

#[cfg(target_os = "macos")]
impl CredentialStore for MacKeychainStore {
    fn load(&self) -> Result<Option<CredentialRecord>, AuthError> {
        match security_framework::passwords::get_generic_password(&self.service, &self.account) {
            Ok(mut bytes) => {
                let result = CredentialRecord::decode(&bytes).map(Some);
                bytes.zeroize();
                result
            }
            Err(error) if error.code() == -25300 => Ok(None),
            Err(_) => Err(AuthError::CredentialStore),
        }
    }

    fn replace(&self, record: &CredentialRecord) -> Result<(), AuthError> {
        let mut bytes = record.encode()?;
        let result = security_framework::passwords::set_generic_password(
            &self.service,
            &self.account,
            &bytes,
        )
        .map_err(|_| AuthError::CredentialStore);
        bytes.zeroize();
        result
    }

    fn delete(&self) -> Result<(), AuthError> {
        match security_framework::passwords::delete_generic_password(&self.service, &self.account) {
            Ok(()) => Ok(()),
            Err(error) if error.code() == -25300 => Ok(()),
            Err(_) => Err(AuthError::CredentialStore),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn memory_store_round_trips_without_debug_disclosure() {
        let store = MemoryCredentialStore::empty();
        let record =
            CredentialRecord::new("seeded-key-marker".into(), 1, 99, "digest".into()).unwrap();
        store.replace(&record).unwrap();
        let loaded = store.load().unwrap().unwrap();
        assert!(!format!("{loaded:?}").contains("seeded-key-marker"));
        store.delete().unwrap();
        assert!(store.load().unwrap().is_none());
    }
}
