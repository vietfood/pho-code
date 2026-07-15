use crate::agent::types::{ArtifactId, ToolCallId, TurnId};
use sha2::{Digest as _, Sha256};
use std::collections::HashMap;
use std::sync::Mutex;

use super::ArtifactWriter;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TruncationPolicy {
    Head,
    Tail,
    HeadAndTail,
    LineWindow,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Truncation {
    pub policy: TruncationPolicy,
    pub original_bytes: Option<usize>,
    pub retained_bytes: usize,
    pub omitted_bytes: Option<usize>,
    pub original_lines: Option<usize>,
    pub retained_lines: Option<usize>,
    pub artifact_ref: Option<ArtifactId>,
    pub artifact_truncated: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ArtifactPurpose {
    ToolOutput,
    MutationRecovery,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ArtifactRequest {
    pub turn_id: TurnId,
    pub tool_call_id: ToolCallId,
    pub bytes: Vec<u8>,
    pub classification: &'static str,
    pub purpose: ArtifactPurpose,
    pub all_or_nothing: bool,
    pub maximum_bytes: usize,
}

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
pub struct ArtifactCommit {
    pub artifact_id: ArtifactId,
    pub byte_count: usize,
    pub sha256: String,
    pub truncated: bool,
}

pub struct MemoryArtifactWriter {
    maximum_total_bytes: usize,
    state: Mutex<MemoryArtifactState>,
}

#[derive(Default)]
struct MemoryArtifactState {
    total_bytes: usize,
    artifacts: HashMap<ArtifactId, Vec<u8>>,
}

impl MemoryArtifactWriter {
    pub fn new(maximum_total_bytes: usize) -> Self {
        Self {
            maximum_total_bytes,
            state: Mutex::new(MemoryArtifactState::default()),
        }
    }

    pub fn artifact_count(&self) -> usize {
        self.state.lock().map_or(0, |state| state.artifacts.len())
    }
}

impl ArtifactWriter for MemoryArtifactWriter {
    fn write(&self, request: ArtifactRequest) -> Result<ArtifactCommit, &'static str> {
        if request.maximum_bytes == 0 {
            return Err("artifact limit is zero");
        }
        let mut bytes = request.bytes;
        let truncated = bytes.len() > request.maximum_bytes;
        if truncated {
            if request.all_or_nothing {
                return Err("all-or-nothing artifact exceeds its limit");
            }
            bytes.truncate(request.maximum_bytes);
        }
        let mut state = self
            .state
            .lock()
            .map_err(|_| "artifact writer unavailable")?;
        let next_total = state
            .total_bytes
            .checked_add(bytes.len())
            .ok_or("artifact total overflow")?;
        if next_total > self.maximum_total_bytes {
            return Err("artifact total limit reached");
        }
        let artifact_id = ArtifactId::new();
        let sha256 = format!("{:x}", Sha256::digest(&bytes));
        let byte_count = bytes.len();
        state.artifacts.insert(artifact_id, bytes);
        state.total_bytes = next_total;
        Ok(ArtifactCommit {
            artifact_id,
            byte_count,
            sha256,
            truncated,
        })
    }
}

pub fn bounded_head(bytes: &[u8], maximum: usize) -> (Vec<u8>, Option<Truncation>) {
    if bytes.len() <= maximum {
        return (bytes.to_vec(), None);
    }
    let retained = bytes[..maximum].to_vec();
    (
        retained,
        Some(Truncation {
            policy: TruncationPolicy::Head,
            original_bytes: Some(bytes.len()),
            retained_bytes: maximum,
            omitted_bytes: Some(bytes.len() - maximum),
            original_lines: None,
            retained_lines: None,
            artifact_ref: None,
            artifact_truncated: false,
        }),
    )
}

pub fn bounded_head_tail(bytes: &[u8], maximum: usize) -> (Vec<u8>, Option<Truncation>) {
    if bytes.len() <= maximum {
        return (bytes.to_vec(), None);
    }
    let head = maximum / 2;
    let tail = maximum - head;
    let mut retained = Vec::with_capacity(maximum);
    retained.extend_from_slice(&bytes[..head]);
    retained.extend_from_slice(&bytes[bytes.len() - tail..]);
    (
        retained,
        Some(Truncation {
            policy: TruncationPolicy::HeadAndTail,
            original_bytes: Some(bytes.len()),
            retained_bytes: maximum,
            omitted_bytes: Some(bytes.len() - maximum),
            original_lines: None,
            retained_lines: None,
            artifact_ref: None,
            artifact_truncated: false,
        }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn head_tail_reports_exact_omission() {
        let (bytes, truncation) = bounded_head_tail(b"0123456789", 6);
        assert_eq!(bytes, b"012789");
        let truncation = truncation.unwrap();
        assert_eq!(truncation.retained_bytes, 6);
        assert_eq!(truncation.omitted_bytes, Some(4));
    }
}
