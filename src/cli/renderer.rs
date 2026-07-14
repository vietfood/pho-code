use std::io::{self, Write};

use crate::app::action::RuntimeEvent;
use crate::backend::profile::estimate_cost;

pub struct Renderer {
    stdout: Box<dyn Write>,
    stderr: Box<dyn Write>,
    reasoning_started: bool,
    text_started: bool,
}

impl Renderer {
    pub fn stdio() -> Self {
        Self {
            stdout: Box::new(io::stdout()),
            stderr: Box::new(io::stderr()),
            reasoning_started: false,
            text_started: false,
        }
    }

    pub fn render(&mut self, event: &RuntimeEvent) -> io::Result<()> {
        match event {
            RuntimeEvent::CredentialChanged { state } => {
                writeln!(self.stderr, "credential: {state:?}")
            }
            RuntimeEvent::ReasoningDelta { text, .. } => {
                if !self.reasoning_started {
                    write!(self.stderr, "reasoning: ")?;
                    self.reasoning_started = true;
                }
                write!(self.stderr, "{text}")
            }
            RuntimeEvent::TextDelta { text, .. } => {
                self.text_started = true;
                write!(self.stdout, "{text}")
            }
            RuntimeEvent::UsageUpdated { usage, .. } => {
                if self.reasoning_started {
                    writeln!(self.stderr)?;
                    self.reasoning_started = false;
                }
                write!(
                    self.stderr,
                    "usage: prompt={:?} output={:?} total={:?}",
                    usage.prompt_tokens, usage.output_tokens, usage.total_tokens
                )?;
                if let Some(cost) = estimate_cost(usage) {
                    writeln!(
                        self.stderr,
                        "; estimated USD ${}.{:09} (rates observed {})",
                        cost.nano_usd / 1_000_000_000,
                        cost.nano_usd % 1_000_000_000,
                        cost.observed_on
                    )
                } else {
                    writeln!(self.stderr, "; estimated cost unknown")
                }
            }
            RuntimeEvent::TurnFailed { code, .. } => writeln!(self.stderr, "turn failed: {code}"),
            RuntimeEvent::TurnCancelled { .. } => writeln!(self.stderr, "turn cancelled"),
            _ => Ok(()),
        }
    }

    pub fn finish(&mut self) -> io::Result<()> {
        if self.text_started {
            writeln!(self.stdout)?;
        }
        self.stdout.flush()?;
        self.stderr.flush()
    }
}
