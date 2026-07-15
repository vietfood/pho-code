#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PromptSource {
    ControllingTerminal,
    Stdin,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ChatPresentation {
    Interactive,
    Raw,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Command {
    Help,
    Version,
    Login,
    Status,
    Logout,
    Chat {
        source: PromptSource,
        presentation: ChatPresentation,
    },
}

pub const HELP: &str = "Pho Code command adapter\n\nUsage:\n  pho login\n  pho status\n  pho logout\n  pho chat\n  pho chat --raw\n  pho chat --stdin\n\n`pho chat` opens the interactive terminal UI. `--raw` and `--stdin` run one turn without cursor control sequences.\nPrompt text and API keys are never accepted as command arguments.\n";

pub fn parse(args: impl IntoIterator<Item = String>) -> Result<Command, &'static str> {
    let args: Vec<String> = args.into_iter().collect();
    match args.as_slice() {
        [] => Ok(Command::Help),
        [single] if single == "--help" || single == "-h" => Ok(Command::Help),
        [single] if single == "--version" || single == "-V" => Ok(Command::Version),
        [single] if single == "login" => Ok(Command::Login),
        [single] if single == "status" => Ok(Command::Status),
        [single] if single == "logout" => Ok(Command::Logout),
        [single] if single == "chat" => Ok(Command::Chat {
            source: PromptSource::ControllingTerminal,
            presentation: ChatPresentation::Interactive,
        }),
        [first, second] if first == "chat" && second == "--raw" => Ok(Command::Chat {
            source: PromptSource::ControllingTerminal,
            presentation: ChatPresentation::Raw,
        }),
        [first, second] if first == "chat" && second == "--stdin" => Ok(Command::Chat {
            source: PromptSource::Stdin,
            presentation: ChatPresentation::Raw,
        }),
        _ => Err("invalid command; run `pho --help`"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parser_never_accepts_prompt_or_key_arguments() {
        assert_eq!(
            parse(vec!["chat".into()]),
            Ok(Command::Chat {
                source: PromptSource::ControllingTerminal,
                presentation: ChatPresentation::Interactive,
            })
        );
        assert_eq!(
            parse(vec!["chat".into(), "--raw".into()]),
            Ok(Command::Chat {
                source: PromptSource::ControllingTerminal,
                presentation: ChatPresentation::Raw,
            })
        );
        assert_eq!(
            parse(vec!["chat".into(), "--stdin".into()]),
            Ok(Command::Chat {
                source: PromptSource::Stdin,
                presentation: ChatPresentation::Raw,
            })
        );
        assert!(parse(vec!["chat".into(), "secret-prompt-marker".into()]).is_err());
        assert!(parse(vec!["login".into(), "secret-key-marker".into()]).is_err());
    }
}
