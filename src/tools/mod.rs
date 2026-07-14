pub mod output;
pub mod patch;
pub mod read;
pub mod search;
pub mod shell;

pub trait ArtifactWriter: Send + Sync {
    fn write(
        &self,
        request: output::ArtifactRequest,
    ) -> Result<crate::agent::types::ArtifactId, &'static str>;
}
