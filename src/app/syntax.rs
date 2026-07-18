//! Bounded, presentation-only syntax projection.
//!
//! Tree-sitter grammars provide highlighting for a curated language set. Unsupported languages,
//! oversized input, or parse/query failures fall back to a lexical scanner so source remains
//! fully visible. This module never opens files, networks, or workspace services.

use std::ops::Range;
use std::path::Path;

use tree_sitter::{Language as TsLanguage, Parser, Query, QueryCursor, StreamingIterator};

pub const MAX_HIGHLIGHT_BYTES: usize = 2 * 1024 * 1024;
pub const MAX_HIGHLIGHT_LINES: usize = 50_000;
pub const MAX_HIGHLIGHT_SPANS: usize = 100_000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Language {
    Rust,
    JavaScript,
    TypeScript,
    Tsx,
    Json,
    Python,
    Shell,
    Toml,
    Yaml,
    Markdown,
    Html,
    Css,
    CFamily,
    Sql,
    Latex,
    Plain,
}

impl Language {
    pub fn from_path(path: &str) -> Self {
        let path = Path::new(path);
        let filename = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        let extension = path
            .extension()
            .and_then(|extension| extension.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        match extension.as_str() {
            "rs" => Self::Rust,
            "js" | "mjs" | "cjs" => Self::JavaScript,
            "jsx" => Self::JavaScript,
            "ts" => Self::TypeScript,
            "tsx" => Self::Tsx,
            "json" | "jsonc" => Self::Json,
            "py" | "pyi" => Self::Python,
            "sh" | "bash" | "zsh" | "fish" => Self::Shell,
            "toml" => Self::Toml,
            "yaml" | "yml" => Self::Yaml,
            "md" | "mdx" | "markdown" => Self::Markdown,
            "html" | "htm" | "svg" | "xml" => Self::Html,
            "css" | "scss" | "sass" | "less" => Self::Css,
            "c" | "h" | "cc" | "cpp" | "cxx" | "hpp" | "m" | "mm" | "java" | "kt" | "kts"
            | "swift" | "go" => Self::CFamily,
            "sql" => Self::Sql,
            "tex" | "latex" | "sty" | "cls" => Self::Latex,
            _ if filename == "dockerfile" => Self::Shell,
            _ => Self::Plain,
        }
    }

    pub fn from_fence(label: Option<&str>) -> Self {
        let label = label
            .unwrap_or_default()
            .split_whitespace()
            .next()
            .unwrap_or_default()
            .trim_start_matches('.')
            .to_ascii_lowercase();
        match label.as_str() {
            "rust" | "rs" => Self::Rust,
            "javascript" | "js" | "jsx" => Self::JavaScript,
            "typescript" | "ts" => Self::TypeScript,
            "tsx" => Self::Tsx,
            "json" | "jsonc" => Self::Json,
            "python" | "py" => Self::Python,
            "shell" | "sh" | "bash" | "zsh" => Self::Shell,
            "toml" => Self::Toml,
            "yaml" | "yml" => Self::Yaml,
            "markdown" | "md" | "mdx" => Self::Markdown,
            "html" | "xml" | "svg" => Self::Html,
            "css" | "scss" | "less" => Self::Css,
            "c" | "cpp" | "c++" | "objc" | "java" | "kotlin" | "swift" | "go" => Self::CFamily,
            "sql" => Self::Sql,
            "tex" | "latex" => Self::Latex,
            _ => Self::Plain,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Rust => "rust",
            Self::JavaScript => "javascript",
            Self::TypeScript => "typescript",
            Self::Tsx => "tsx",
            Self::Json => "json",
            Self::Python => "python",
            Self::Shell => "shell",
            Self::Toml => "toml",
            Self::Yaml => "yaml",
            Self::Markdown => "markdown",
            Self::Html => "html",
            Self::Css => "css",
            Self::CFamily => "c-family",
            Self::Sql => "sql",
            Self::Latex => "latex",
            Self::Plain => "text",
        }
    }

    fn treesitter_supported(self) -> bool {
        matches!(
            self,
            Self::Rust
                | Self::JavaScript
                | Self::TypeScript
                | Self::Tsx
                | Self::Json
                | Self::Python
                | Self::Shell
                | Self::Toml
                | Self::Yaml
        )
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HighlightKind {
    Comment,
    String,
    Number,
    Keyword,
    Type,
    Function,
    Property,
    Operator,
    Markup,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HighlightSpan {
    pub range: Range<usize>,
    pub kind: HighlightKind,
}

pub fn highlight(source: &str, language: Language) -> Vec<HighlightSpan> {
    if language == Language::Plain
        || source.len() > MAX_HIGHLIGHT_BYTES
        || source.lines().count() > MAX_HIGHLIGHT_LINES
    {
        return Vec::new();
    }
    if language.treesitter_supported()
        && let Some(spans) = treesitter_highlight(source, language)
    {
        return spans;
    }
    lexical_highlight(source, language)
}

fn treesitter_highlight(source: &str, language: Language) -> Option<Vec<HighlightSpan>> {
    let (grammar, query_source) = treesitter_grammar(language)?;
    let mut parser = Parser::new();
    parser.set_language(&grammar).ok()?;
    let tree = parser.parse(source, None)?;
    let query = Query::new(&grammar, query_source).ok()?;
    let mut cursor = QueryCursor::new();
    let mut matches = cursor.matches(&query, tree.root_node(), source.as_bytes());
    let mut layer = vec![None; source.len()];
    while let Some(query_match) = matches.next() {
        for capture in query_match.captures {
            let name = query.capture_names()[capture.index as usize];
            let Some(kind) = capture_kind(name) else {
                continue;
            };
            let range = capture.node.byte_range();
            if range.start >= source.len() || range.end > source.len() {
                continue;
            }
            if !source.is_char_boundary(range.start) || !source.is_char_boundary(range.end) {
                continue;
            }
            for slot in &mut layer[range] {
                *slot = Some(merge_kind(*slot, kind));
            }
        }
    }
    Some(coalesce_layer(&layer))
}

fn treesitter_grammar(language: Language) -> Option<(TsLanguage, &'static str)> {
    match language {
        Language::Rust => Some((
            tree_sitter_rust::LANGUAGE.into(),
            tree_sitter_rust::HIGHLIGHTS_QUERY,
        )),
        Language::JavaScript => Some((
            tree_sitter_javascript::LANGUAGE.into(),
            tree_sitter_javascript::HIGHLIGHT_QUERY,
        )),
        Language::TypeScript => Some((
            tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
            tree_sitter_typescript::HIGHLIGHTS_QUERY,
        )),
        Language::Tsx => Some((
            tree_sitter_typescript::LANGUAGE_TSX.into(),
            tree_sitter_typescript::HIGHLIGHTS_QUERY,
        )),
        Language::Json => Some((
            tree_sitter_json::LANGUAGE.into(),
            tree_sitter_json::HIGHLIGHTS_QUERY,
        )),
        Language::Python => Some((
            tree_sitter_python::LANGUAGE.into(),
            tree_sitter_python::HIGHLIGHTS_QUERY,
        )),
        Language::Shell => Some((
            tree_sitter_bash::LANGUAGE.into(),
            tree_sitter_bash::HIGHLIGHT_QUERY,
        )),
        Language::Toml => Some((
            tree_sitter_toml_ng::LANGUAGE.into(),
            tree_sitter_toml_ng::HIGHLIGHTS_QUERY,
        )),
        Language::Yaml => Some((
            tree_sitter_yaml::LANGUAGE.into(),
            tree_sitter_yaml::HIGHLIGHTS_QUERY,
        )),
        _ => None,
    }
}

fn capture_kind(name: &str) -> Option<HighlightKind> {
    let root = name.split('.').next().unwrap_or(name);
    match root {
        "comment" => Some(HighlightKind::Comment),
        "string" | "character" | "escape" => Some(HighlightKind::String),
        "number" | "float" => Some(HighlightKind::Number),
        "keyword" | "conditional" | "repeat" | "include" | "exception" | "boolean" | "constant"
        | "storage" | "modifier" => Some(HighlightKind::Keyword),
        "type" | "constructor" | "namespace" | "module" => Some(HighlightKind::Type),
        "function" | "method" | "macro" => Some(HighlightKind::Function),
        "property" | "attribute" | "field" | "label" | "variable" => Some(HighlightKind::Property),
        "operator" | "punctuation" => Some(HighlightKind::Operator),
        "tag" | "markup" | "title" | "heading" | "text" => Some(HighlightKind::Markup),
        _ => None,
    }
}

fn kind_priority(kind: HighlightKind) -> u8 {
    match kind {
        HighlightKind::Comment => 90,
        HighlightKind::String => 80,
        HighlightKind::Keyword => 70,
        HighlightKind::Type => 60,
        HighlightKind::Function => 50,
        HighlightKind::Number => 40,
        HighlightKind::Property => 30,
        HighlightKind::Markup => 20,
        HighlightKind::Operator => 10,
    }
}

fn merge_kind(current: Option<HighlightKind>, next: HighlightKind) -> HighlightKind {
    match current {
        None => next,
        Some(existing) if kind_priority(next) >= kind_priority(existing) => next,
        Some(existing) => existing,
    }
}

fn coalesce_layer(layer: &[Option<HighlightKind>]) -> Vec<HighlightSpan> {
    let mut spans = Vec::new();
    let mut index = 0;
    while index < layer.len() && spans.len() < MAX_HIGHLIGHT_SPANS {
        let Some(kind) = layer[index] else {
            index += 1;
            continue;
        };
        let start = index;
        index += 1;
        while index < layer.len() && layer[index] == Some(kind) {
            index += 1;
        }
        spans.push(HighlightSpan {
            range: start..index,
            kind,
        });
    }
    spans
}

fn lexical_highlight(source: &str, language: Language) -> Vec<HighlightSpan> {
    let bytes = source.as_bytes();
    let mut spans = Vec::new();
    let mut index = 0;
    while index < bytes.len() && spans.len() < MAX_HIGHLIGHT_SPANS {
        if let Some(end) = block_comment_end(bytes, index, language) {
            push(&mut spans, index..end, HighlightKind::Comment);
            index = end;
            continue;
        }
        if is_line_comment(bytes, index, language) {
            let end = bytes[index..]
                .iter()
                .position(|byte| *byte == b'\n')
                .map_or(bytes.len(), |offset| index + offset);
            push(&mut spans, index..end, HighlightKind::Comment);
            index = end;
            continue;
        }
        if matches!(bytes[index], b'"' | b'\'' | b'`') {
            let quote = bytes[index];
            let mut end = index + 1;
            while end < bytes.len() {
                if bytes[end] == b'\\' {
                    end = (end + 2).min(bytes.len());
                } else if bytes[end] == quote {
                    end += 1;
                    break;
                } else {
                    end += 1;
                }
            }
            push(&mut spans, index..end, HighlightKind::String);
            index = end;
            continue;
        }
        if bytes[index].is_ascii_digit() {
            let mut end = index + 1;
            while end < bytes.len()
                && (bytes[end].is_ascii_alphanumeric()
                    || matches!(bytes[end], b'.' | b'_' | b'+' | b'-'))
            {
                end += 1;
            }
            push(&mut spans, index..end, HighlightKind::Number);
            index = end;
            continue;
        }
        if is_identifier_start(bytes[index]) {
            let mut end = index + 1;
            while end < bytes.len() && is_identifier_continue(bytes[end]) {
                end += 1;
            }
            let word = &source[index..end];
            let kind = if is_keyword(word, language) {
                Some(HighlightKind::Keyword)
            } else if is_property(source, end, language) {
                Some(HighlightKind::Property)
            } else if next_non_space(bytes, end) == Some(b'(') {
                Some(HighlightKind::Function)
            } else if word.as_bytes().first().is_some_and(u8::is_ascii_uppercase) {
                Some(HighlightKind::Type)
            } else {
                None
            };
            if let Some(kind) = kind {
                push(&mut spans, index..end, kind);
            }
            index = end;
            continue;
        }
        if language == Language::Markdown && matches!(bytes[index], b'#' | b'*' | b'_' | b'`') {
            push(&mut spans, index..index + 1, HighlightKind::Markup);
        } else if language == Language::Latex && bytes[index] == b'\\' {
            let mut end = index + 1;
            while end < bytes.len() && bytes[end].is_ascii_alphabetic() {
                end += 1;
            }
            push(&mut spans, index..end, HighlightKind::Keyword);
            index = end;
            continue;
        } else if is_operator(bytes[index]) {
            push(&mut spans, index..index + 1, HighlightKind::Operator);
        }
        index += char_len(source, index);
    }
    spans
}

fn push(spans: &mut Vec<HighlightSpan>, range: Range<usize>, kind: HighlightKind) {
    if range.start < range.end {
        spans.push(HighlightSpan { range, kind });
    }
}

fn char_len(source: &str, index: usize) -> usize {
    source[index..].chars().next().map_or(1, char::len_utf8)
}

fn is_identifier_start(byte: u8) -> bool {
    byte.is_ascii_alphabetic() || matches!(byte, b'_' | b'$')
}

fn is_identifier_continue(byte: u8) -> bool {
    is_identifier_start(byte) || byte.is_ascii_digit()
}

fn next_non_space(bytes: &[u8], mut index: usize) -> Option<u8> {
    while index < bytes.len() && bytes[index].is_ascii_whitespace() {
        index += 1;
    }
    bytes.get(index).copied()
}

fn is_property(source: &str, end: usize, language: Language) -> bool {
    matches!(
        language,
        Language::Json | Language::Toml | Language::Yaml | Language::Css
    ) && matches!(next_non_space(source.as_bytes(), end), Some(b':' | b'='))
}

fn block_comment_end(bytes: &[u8], index: usize, language: Language) -> Option<usize> {
    if matches!(
        language,
        Language::Rust
            | Language::JavaScript
            | Language::TypeScript
            | Language::Tsx
            | Language::Css
            | Language::CFamily
    ) && bytes.get(index..index + 2) == Some(b"/*")
    {
        return bytes[index + 2..]
            .windows(2)
            .position(|window| window == b"*/")
            .map_or(Some(bytes.len()), |offset| Some(index + offset + 4));
    }
    if language == Language::Html && bytes.get(index..index + 4) == Some(b"<!--") {
        return bytes[index + 4..]
            .windows(3)
            .position(|window| window == b"-->")
            .map_or(Some(bytes.len()), |offset| Some(index + offset + 7));
    }
    None
}

fn is_line_comment(bytes: &[u8], index: usize, language: Language) -> bool {
    match language {
        Language::Rust
        | Language::JavaScript
        | Language::TypeScript
        | Language::Tsx
        | Language::CFamily => bytes.get(index..index + 2) == Some(b"//"),
        Language::Python
        | Language::Shell
        | Language::Toml
        | Language::Yaml
        | Language::Markdown => bytes[index] == b'#',
        Language::Sql => bytes.get(index..index + 2) == Some(b"--"),
        Language::Latex => bytes[index] == b'%',
        _ => false,
    }
}

fn is_operator(byte: u8) -> bool {
    matches!(
        byte,
        b'+' | b'-' | b'*' | b'/' | b'=' | b'!' | b'<' | b'>' | b'&' | b'|' | b'^' | b'%' | b':'
    )
}

fn is_keyword(word: &str, language: Language) -> bool {
    let keywords: &[&str] = match language {
        Language::Rust => &[
            "as", "async", "await", "break", "const", "continue", "crate", "dyn", "else", "enum",
            "extern", "false", "fn", "for", "if", "impl", "in", "let", "loop", "match", "mod",
            "move", "mut", "pub", "ref", "return", "self", "Self", "static", "struct", "super",
            "trait", "true", "type", "unsafe", "use", "where", "while",
        ],
        Language::JavaScript | Language::TypeScript | Language::Tsx => &[
            "async",
            "await",
            "break",
            "case",
            "catch",
            "class",
            "const",
            "continue",
            "default",
            "delete",
            "do",
            "else",
            "enum",
            "export",
            "extends",
            "false",
            "finally",
            "for",
            "from",
            "function",
            "if",
            "implements",
            "import",
            "in",
            "instanceof",
            "interface",
            "let",
            "new",
            "null",
            "of",
            "private",
            "protected",
            "public",
            "return",
            "static",
            "super",
            "switch",
            "this",
            "throw",
            "true",
            "try",
            "type",
            "typeof",
            "undefined",
            "var",
            "void",
            "while",
        ],
        Language::Python => &[
            "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del",
            "elif", "else", "except", "False", "finally", "for", "from", "global", "if", "import",
            "in", "is", "lambda", "None", "nonlocal", "not", "or", "pass", "raise", "return",
            "True", "try", "while", "with", "yield",
        ],
        Language::Shell => &[
            "case", "do", "done", "elif", "else", "esac", "export", "fi", "for", "function", "if",
            "in", "local", "readonly", "select", "then", "until", "while",
        ],
        Language::CFamily => &[
            "auto",
            "bool",
            "break",
            "case",
            "catch",
            "char",
            "class",
            "const",
            "continue",
            "default",
            "do",
            "double",
            "else",
            "enum",
            "extends",
            "false",
            "final",
            "float",
            "for",
            "func",
            "if",
            "implements",
            "import",
            "in",
            "int",
            "interface",
            "let",
            "long",
            "new",
            "nil",
            "null",
            "override",
            "private",
            "protected",
            "public",
            "return",
            "short",
            "signed",
            "static",
            "struct",
            "switch",
            "this",
            "throw",
            "true",
            "try",
            "unsigned",
            "var",
            "void",
            "while",
        ],
        Language::Sql => &[
            "ALTER", "AND", "AS", "ASC", "BEGIN", "BY", "CREATE", "DELETE", "DESC", "DISTINCT",
            "DROP", "END", "FROM", "GROUP", "HAVING", "INSERT", "INTO", "JOIN", "LIMIT", "NOT",
            "NULL", "ON", "OR", "ORDER", "SELECT", "SET", "TABLE", "UPDATE", "VALUES", "WHERE",
        ],
        Language::Json => &["false", "null", "true"],
        Language::Html => &["DOCTYPE"],
        _ => &[],
    };
    keywords.contains(&word)
        || (language == Language::Sql
            && keywords
                .iter()
                .any(|keyword| keyword.eq_ignore_ascii_case(word)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn language_detection_is_explicit_and_unknown_is_plain() {
        assert_eq!(Language::from_path("src/main.rs"), Language::Rust);
        assert_eq!(Language::from_path("web/app.tsx"), Language::Tsx);
        assert_eq!(Language::from_path("web/app.ts"), Language::TypeScript);
        assert_eq!(Language::from_fence(Some("python")), Language::Python);
        assert_eq!(Language::from_path("README.unknown"), Language::Plain);
    }

    #[test]
    fn rust_projection_finds_comments_strings_keywords_and_functions() {
        let source = "pub fn hello(value: &str) { // note\n println!(\"{value}\");\n}";
        let spans = highlight(source, Language::Rust);
        assert!(spans.iter().any(|span| span.kind == HighlightKind::Keyword));
        assert!(
            spans
                .iter()
                .any(|span| span.kind == HighlightKind::Function)
        );
        assert!(spans.iter().any(|span| span.kind == HighlightKind::Comment));
        assert!(spans.iter().any(|span| span.kind == HighlightKind::String));
        assert!(spans.iter().all(|span| {
            source.is_char_boundary(span.range.start) && source.is_char_boundary(span.range.end)
        }));
    }

    #[test]
    fn treesitter_highlights_python_and_json() {
        let python = "def greet(name):\n    # hi\n    return f\"{name}\"\n";
        let spans = highlight(python, Language::Python);
        assert!(spans.iter().any(|span| span.kind == HighlightKind::Keyword));
        assert!(spans.iter().any(|span| span.kind == HighlightKind::String));

        let json = "{\n  \"ok\": true,\n  \"count\": 3\n}\n";
        let spans = highlight(json, Language::Json);
        assert!(spans.iter().any(|span| span.kind == HighlightKind::String));
        assert!(spans.iter().any(|span| span.kind == HighlightKind::Number));
    }

    #[test]
    fn oversized_source_falls_back_without_partial_highlighting() {
        let source = "x".repeat(MAX_HIGHLIGHT_BYTES + 1);
        assert!(highlight(&source, Language::Rust).is_empty());
    }

    #[test]
    fn unsupported_language_still_uses_lexical_fallback() {
        let source = "SELECT * FROM users; -- note";
        let spans = highlight(source, Language::Sql);
        assert!(spans.iter().any(|span| span.kind == HighlightKind::Keyword));
        assert!(spans.iter().any(|span| span.kind == HighlightKind::Comment));
    }
}
