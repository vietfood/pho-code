pub mod artifacts;
pub mod journal;
pub mod record;
pub mod recovery;

pub trait SessionStore: Send + Sync {
    fn append(&self, record: &[u8]) -> Result<(), &'static str>;
}
