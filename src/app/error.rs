use std::fmt;

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum RetryClass {
    Never,
    UserAction,
    ExplicitRetry,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SafeError {
    pub code: &'static str,
    pub operation: &'static str,
    pub safe_identity: Option<String>,
    pub user_message: &'static str,
    pub retry: RetryClass,
}

impl fmt::Display for SafeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}: {}", self.operation, self.user_message)
    }
}

impl std::error::Error for SafeError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_excludes_unstructured_context() {
        let error = SafeError {
            code: "network_unavailable",
            operation: "backend_request",
            safe_identity: Some("request-7".into()),
            user_message: "The service could not be reached.",
            retry: RetryClass::ExplicitRetry,
        };
        let rendered = format!("{error:?} {error}");
        assert!(!rendered.contains("seeded-secret-marker"));
    }
}
