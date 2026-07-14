#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ArtifactRequest {
    pub bytes: Vec<u8>,
    pub classification: &'static str,
    pub all_or_nothing: bool,
}
