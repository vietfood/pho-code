//! Bounded, inert Markdown/TeX source projection.
//!
//! The original source is retained verbatim. Parsed blocks are disposable safe data: links are
//! classified into typed preview targets, images and HTML are inert, and no node can open a URL or
//! access a file, process, network, or renderer.

use std::fmt;

pub const MAX_SOURCE_BYTES: usize = 512 * 1024;
pub const MAX_BLOCKS: usize = 4_096;
pub const MAX_MATH_RUNS: usize = 256;
pub const MAX_FORMULA_BYTES: usize = 16 * 1024;
pub const MAX_LANGUAGE_BYTES: usize = 256;
pub const MAX_LINK_BYTES: usize = 4 * 1024;
pub const MAX_DIAGNOSTICS: usize = 128;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MathDisplay {
    Inline,
    Block,
}

#[derive(Clone, Eq, PartialEq)]
pub struct MathRun {
    pub source: String,
    pub display: MathDisplay,
}

impl fmt::Debug for MathRun {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("MathRun")
            .field("source", &"[REDACTED]")
            .field("source_bytes", &self.source.len())
            .field("display", &self.display)
            .finish()
    }
}

#[derive(Clone, Eq, PartialEq)]
pub enum LinkTarget {
    WorkspaceRelative(String),
    HttpsPreview(String),
    Inert(String),
}

impl fmt::Debug for LinkTarget {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let (kind, bytes) = match self {
            Self::WorkspaceRelative(path) => ("WorkspaceRelative", path.len()),
            Self::HttpsPreview(url) => ("HttpsPreview", url.len()),
            Self::Inert(value) => ("Inert", value.len()),
        };
        formatter
            .debug_struct(kind)
            .field("value_bytes", &bytes)
            .finish()
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum LinkIntent {
    OpenWorkspaceRelative { path: String },
    PreviewHttps { url: String },
}

impl LinkTarget {
    pub fn intent(&self) -> Option<LinkIntent> {
        match self {
            Self::WorkspaceRelative(path) => {
                Some(LinkIntent::OpenWorkspaceRelative { path: path.clone() })
            }
            Self::HttpsPreview(url) => Some(LinkIntent::PreviewHttps { url: url.clone() }),
            Self::Inert(_) => None,
        }
    }
}

#[derive(Clone, Eq, PartialEq)]
pub enum InlineNode {
    Text(String),
    Emphasis(String),
    Strikethrough(String),
    Code(String),
    Link { label: String, target: LinkTarget },
    InertImage { alt: String },
    InertMarkup(String),
    Math(MathRun),
}

impl fmt::Debug for InlineNode {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Text(text)
            | Self::Emphasis(text)
            | Self::Strikethrough(text)
            | Self::Code(text) => formatter
                .debug_struct("InlineText")
                .field("bytes", &text.len())
                .finish(),
            Self::Link { label, target } => formatter
                .debug_struct("Link")
                .field("label_bytes", &label.len())
                .field("target", target)
                .finish(),
            Self::InertImage { alt } => formatter
                .debug_struct("InertImage")
                .field("alt_bytes", &alt.len())
                .finish(),
            Self::InertMarkup(markup) => formatter
                .debug_struct("InertMarkup")
                .field("bytes", &markup.len())
                .finish(),
            Self::Math(math) => math.fmt(formatter),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum LiteralReason {
    Streaming,
    SourceTooLarge,
    BlockLimit,
    UnclosedFence,
    Malformed,
    MathLimit,
    FormulaTooLarge,
    UnsupportedMath,
    UnclosedMath,
}

#[derive(Clone, Eq, PartialEq)]
pub enum MarkdownBlock {
    Paragraph {
        inlines: Vec<InlineNode>,
    },
    Heading {
        level: u8,
        inlines: Vec<InlineNode>,
    },
    List {
        ordered: bool,
        items: Vec<Vec<InlineNode>>,
    },
    Quote {
        inlines: Vec<InlineNode>,
    },
    Rule,
    Table {
        rows: Vec<Vec<Vec<InlineNode>>>,
    },
    CodeFence {
        language: Option<String>,
        source: String,
    },
    Math(MathRun),
    InertHtml {
        source: String,
    },
    Literal {
        source: String,
        reason: LiteralReason,
    },
}

impl fmt::Debug for MarkdownBlock {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Paragraph { inlines } => formatter
                .debug_struct("Paragraph")
                .field("inlines", &inlines.len())
                .finish(),
            Self::Heading { level, inlines } => formatter
                .debug_struct("Heading")
                .field("level", level)
                .field("inlines", &inlines.len())
                .finish(),
            Self::List { ordered, items } => formatter
                .debug_struct("List")
                .field("ordered", ordered)
                .field("items", &items.len())
                .finish(),
            Self::Quote { inlines } => formatter
                .debug_struct("Quote")
                .field("inlines", &inlines.len())
                .finish(),
            Self::Rule => formatter.write_str("Rule"),
            Self::Table { rows } => formatter
                .debug_struct("Table")
                .field("rows", &rows.len())
                .finish(),
            Self::CodeFence { language, source } => formatter
                .debug_struct("CodeFence")
                .field("language", language)
                .field("source_bytes", &source.len())
                .finish(),
            Self::Math(math) => math.fmt(formatter),
            Self::InertHtml { source } => formatter
                .debug_struct("InertHtml")
                .field("source_bytes", &source.len())
                .finish(),
            Self::Literal { source, reason } => formatter
                .debug_struct("Literal")
                .field("source_bytes", &source.len())
                .field("reason", reason)
                .finish(),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MarkdownDiagnostic {
    StreamingLiteral,
    SourceTooLarge,
    BlockLimit,
    UnclosedFence,
    RawMarkupInert,
    Malformed,
    MathLimit,
    FormulaTooLarge,
    UnsupportedMath,
    UnclosedMath,
}

#[derive(Clone, Eq, PartialEq)]
pub struct MarkdownDocument {
    source: String,
    blocks: Vec<MarkdownBlock>,
    diagnostics: Vec<MarkdownDiagnostic>,
    complete: bool,
}

impl fmt::Debug for MarkdownDocument {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("MarkdownDocument")
            .field("source_bytes", &self.source.len())
            .field("blocks", &self.blocks.len())
            .field("diagnostics", &self.diagnostics)
            .field("complete", &self.complete)
            .finish()
    }
}

impl MarkdownDocument {
    pub fn parse(source: &str, complete: bool) -> Self {
        let source = source.to_owned();
        if !complete {
            return Self::literal(source, false, MarkdownDiagnostic::StreamingLiteral);
        }
        if source.len() > MAX_SOURCE_BYTES {
            return Self::literal(source, true, MarkdownDiagnostic::SourceTooLarge);
        }
        let parsed = {
            let mut parser = Parser {
                lines: source.lines().collect(),
                blocks: Vec::new(),
                diagnostics: Vec::new(),
                math_runs: 0,
            };
            match parser.parse() {
                Ok(()) => Ok((parser.blocks, parser.diagnostics)),
                Err(error) => Err(error),
            }
        };
        match parsed {
            Ok((blocks, diagnostics)) => Self {
                source,
                blocks,
                diagnostics,
                complete: true,
            },
            Err(error) => Self::literal(source, true, error.diagnostic()),
        }
    }

    pub fn source(&self) -> &str {
        &self.source
    }

    pub fn copy_source(&self) -> String {
        self.source.clone()
    }

    pub fn blocks(&self) -> &[MarkdownBlock] {
        &self.blocks
    }

    pub fn diagnostics(&self) -> &[MarkdownDiagnostic] {
        &self.diagnostics
    }

    pub fn is_complete(&self) -> bool {
        self.complete
    }

    fn literal(source: String, complete: bool, diagnostic: MarkdownDiagnostic) -> Self {
        let reason = match diagnostic {
            MarkdownDiagnostic::StreamingLiteral => LiteralReason::Streaming,
            MarkdownDiagnostic::SourceTooLarge => LiteralReason::SourceTooLarge,
            MarkdownDiagnostic::BlockLimit => LiteralReason::BlockLimit,
            MarkdownDiagnostic::UnclosedFence => LiteralReason::UnclosedFence,
            MarkdownDiagnostic::MathLimit => LiteralReason::MathLimit,
            MarkdownDiagnostic::FormulaTooLarge => LiteralReason::FormulaTooLarge,
            MarkdownDiagnostic::UnsupportedMath => LiteralReason::UnsupportedMath,
            MarkdownDiagnostic::UnclosedMath => LiteralReason::UnclosedMath,
            MarkdownDiagnostic::RawMarkupInert | MarkdownDiagnostic::Malformed => {
                LiteralReason::Malformed
            }
        };
        Self {
            source: source.clone(),
            blocks: vec![MarkdownBlock::Literal { source, reason }],
            diagnostics: vec![diagnostic],
            complete,
        }
    }
}

struct Parser<'a> {
    lines: Vec<&'a str>,
    blocks: Vec<MarkdownBlock>,
    diagnostics: Vec<MarkdownDiagnostic>,
    math_runs: usize,
}

#[derive(Clone, Copy)]
enum ParseError {
    BlockLimit,
    UnclosedFence,
    Malformed,
    MathLimit,
    FormulaTooLarge,
    UnsupportedMath,
    UnclosedMath,
}

impl ParseError {
    fn diagnostic(self) -> MarkdownDiagnostic {
        match self {
            Self::BlockLimit => MarkdownDiagnostic::BlockLimit,
            Self::UnclosedFence => MarkdownDiagnostic::UnclosedFence,
            Self::Malformed => MarkdownDiagnostic::Malformed,
            Self::MathLimit => MarkdownDiagnostic::MathLimit,
            Self::FormulaTooLarge => MarkdownDiagnostic::FormulaTooLarge,
            Self::UnsupportedMath => MarkdownDiagnostic::UnsupportedMath,
            Self::UnclosedMath => MarkdownDiagnostic::UnclosedMath,
        }
    }
}

impl<'a> Parser<'a> {
    fn parse(&mut self) -> Result<(), ParseError> {
        let mut index = 0;
        while index < self.lines.len() {
            let line = self.lines[index];
            if line.trim().is_empty() {
                index += 1;
                continue;
            }
            if is_fence_start(line) {
                let (block, next) = self.parse_fence(index)?;
                self.push(block)?;
                index = next;
                continue;
            }
            if is_block_math_start(line) {
                let (block, next) = self.parse_math_block(index)?;
                self.push(block)?;
                index = next;
                continue;
            }
            if let Some(heading) = heading_line(line) {
                let inlines = self.inline(heading.1)?;
                self.push(MarkdownBlock::Heading {
                    level: heading.0,
                    inlines,
                })?;
                index += 1;
                continue;
            }
            if is_rule(line) {
                self.push(MarkdownBlock::Rule)?;
                index += 1;
                continue;
            }
            if line.trim_start().starts_with('<') {
                self.push_diagnostic(MarkdownDiagnostic::RawMarkupInert);
                self.push(MarkdownBlock::InertHtml {
                    source: line.to_owned(),
                })?;
                index += 1;
                continue;
            }
            if line.trim_start().starts_with('>') {
                let inlines = self.inline(line.trim_start()[1..].trim_start())?;
                self.push(MarkdownBlock::Quote { inlines })?;
                index += 1;
                continue;
            }
            if let Some((ordered, item)) = list_line(line) {
                let mut items = vec![self.inline(item)?];
                let mut next = index + 1;
                while next < self.lines.len() {
                    let Some((same_order, item)) = list_line(self.lines[next]) else {
                        break;
                    };
                    if same_order != ordered {
                        break;
                    }
                    items.push(self.inline(item)?);
                    next += 1;
                }
                self.push(MarkdownBlock::List { ordered, items })?;
                index = next;
                continue;
            }
            if line.contains('|')
                && index + 1 < self.lines.len()
                && is_table_separator(self.lines[index + 1])
            {
                let mut rows = Vec::new();
                rows.push(self.table_row(line)?);
                let mut next = index + 2;
                while next < self.lines.len()
                    && self.lines[next].contains('|')
                    && !self.lines[next].trim().is_empty()
                {
                    rows.push(self.table_row(self.lines[next])?);
                    next += 1;
                }
                self.push(MarkdownBlock::Table { rows })?;
                index = next;
                continue;
            }
            let mut paragraph = String::from(line);
            let mut next = index + 1;
            while next < self.lines.len() {
                let candidate = self.lines[next];
                if candidate.trim().is_empty() || is_special_line(candidate) {
                    break;
                }
                paragraph.push('\n');
                paragraph.push_str(candidate);
                next += 1;
            }
            let inlines = self.inline(&paragraph)?;
            self.push(MarkdownBlock::Paragraph { inlines })?;
            index = next;
        }
        Ok(())
    }

    fn parse_fence(&self, start: usize) -> Result<(MarkdownBlock, usize), ParseError> {
        let opening = self.lines[start].trim_start();
        let marker = opening.as_bytes()[0];
        let language = opening[3..].trim();
        if language.len() > MAX_LANGUAGE_BYTES {
            return Err(ParseError::Malformed);
        }
        let mut code = String::new();
        let mut index = start + 1;
        while index < self.lines.len() {
            if self.lines[index]
                .trim_start()
                .starts_with(marker as char)
                .then_some(())
                .is_some()
                && self.lines[index]
                    .trim_start()
                    .starts_with(if marker == b'`' { "```" } else { "~~~" })
            {
                return Ok((
                    MarkdownBlock::CodeFence {
                        language: (!language.is_empty()).then(|| language.to_owned()),
                        source: code,
                    },
                    index + 1,
                ));
            }
            if !code.is_empty() {
                code.push('\n');
            }
            code.push_str(self.lines[index]);
            index += 1;
        }
        Err(ParseError::UnclosedFence)
    }

    fn parse_math_block(&mut self, start: usize) -> Result<(MarkdownBlock, usize), ParseError> {
        let opening = self.lines[start].trim();
        let (open, close, display) = if opening.starts_with("$$") {
            ("$$", "$$", MathDisplay::Block)
        } else {
            (r"\[", r"\]", MathDisplay::Block)
        };
        let remainder = opening.strip_prefix(open).unwrap_or_default();
        if let Some(end) = remainder.find(close) {
            let formula = &remainder[..end];
            return Ok((
                MarkdownBlock::Math(self.math_run(formula, display)?),
                start + 1,
            ));
        }
        let mut formula = String::new();
        if !remainder.trim().is_empty() {
            formula.push_str(remainder.trim());
        }
        let mut index = start + 1;
        while index < self.lines.len() {
            let line = self.lines[index].trim();
            if line == close {
                return Ok((
                    MarkdownBlock::Math(self.math_run(&formula, display)?),
                    index + 1,
                ));
            }
            if !formula.is_empty() {
                formula.push('\n');
            }
            formula.push_str(self.lines[index]);
            index += 1;
        }
        Err(ParseError::UnclosedMath)
    }

    fn table_row(&mut self, line: &str) -> Result<Vec<Vec<InlineNode>>, ParseError> {
        line.trim_matches('|')
            .split('|')
            .map(|cell| self.inline(cell.trim()))
            .collect()
    }

    fn inline(&mut self, text: &str) -> Result<Vec<InlineNode>, ParseError> {
        parse_inline(text, &mut self.math_runs, &mut self.diagnostics)
    }

    fn math_run(&mut self, formula: &str, display: MathDisplay) -> Result<MathRun, ParseError> {
        validate_math(formula, &mut self.math_runs, display)
    }

    fn push_diagnostic(&mut self, diagnostic: MarkdownDiagnostic) {
        if self.diagnostics.len() < MAX_DIAGNOSTICS {
            self.diagnostics.push(diagnostic);
        }
    }

    fn push(&mut self, block: MarkdownBlock) -> Result<(), ParseError> {
        if self.blocks.len() >= MAX_BLOCKS {
            return Err(ParseError::BlockLimit);
        }
        self.blocks.push(block);
        Ok(())
    }
}

fn is_fence_start(line: &str) -> bool {
    let line = line.trim_start();
    line.starts_with("```") || line.starts_with("~~~")
}

fn is_block_math_start(line: &str) -> bool {
    let trimmed = line.trim_start();
    trimmed == "$$" || trimmed.starts_with("$$") || trimmed == r"\[" || trimmed.starts_with(r"\[")
}

fn heading_line(line: &str) -> Option<(u8, &str)> {
    let trimmed = line.trim_start();
    let level = trimmed.bytes().take_while(|byte| *byte == b'#').count();
    (1..=6)
        .contains(&level)
        .then(|| {
            trimmed
                .get(level + 1..)
                .filter(|_| trimmed.as_bytes().get(level) == Some(&b' '))
        })
        .flatten()
        .map(|text| (level as u8, text))
}

fn is_rule(line: &str) -> bool {
    let trimmed = line.trim();
    ["---", "***", "___"].contains(&trimmed)
}

fn list_line(line: &str) -> Option<(bool, &str)> {
    let trimmed = line.trim_start();
    for marker in ["- ", "* ", "+ "] {
        if let Some(item) = trimmed.strip_prefix(marker) {
            return Some((false, item));
        }
    }
    let digits = trimmed.bytes().take_while(u8::is_ascii_digit).count();
    (digits > 0)
        .then(|| {
            trimmed
                .get(digits + 1..)
                .filter(|_| trimmed.as_bytes().get(digits) == Some(&b'.'))
        })
        .flatten()
        .map(|item| (true, item.trim_start()))
}

fn is_table_separator(line: &str) -> bool {
    let trimmed = line.trim().trim_matches('|');
    !trimmed.is_empty()
        && trimmed.split('|').all(|cell| {
            let cell = cell.trim();
            cell.len() >= 3 && cell.bytes().all(|byte| byte == b'-' || byte == b':')
        })
}

fn is_special_line(line: &str) -> bool {
    is_fence_start(line)
        || heading_line(line).is_some()
        || is_rule(line)
        || line.trim_start().starts_with('>')
        || list_line(line).is_some()
}

fn parse_inline(
    text: &str,
    math_runs: &mut usize,
    diagnostics: &mut Vec<MarkdownDiagnostic>,
) -> Result<Vec<InlineNode>, ParseError> {
    let mut nodes = Vec::new();
    let mut cursor = 0;
    while cursor < text.len() {
        let Some(relative) = text[cursor..].find(['`', '*', '~', '[', '!', '<', '$', '\\']) else {
            push_text(&mut nodes, &text[cursor..]);
            break;
        };
        let start = cursor + relative;
        if start > cursor {
            push_text(&mut nodes, &text[cursor..start]);
        }
        let rest = &text[start..];
        if rest.starts_with('`') {
            if let Some(end) = find_unescaped(text, start + 1, '`') {
                push_node(
                    &mut nodes,
                    InlineNode::Code(text[start + 1..end].to_owned()),
                );
                cursor = end + 1;
            } else {
                push_text(&mut nodes, rest);
                break;
            }
        } else if rest.starts_with("![") {
            if let Some((end_label, end_url)) = bracket_target(text, start + 1) {
                let alt = &text[start + 2..end_label];
                push_node(
                    &mut nodes,
                    InlineNode::InertImage {
                        alt: alt.to_owned(),
                    },
                );
                cursor = end_url + 1;
            } else {
                push_text(&mut nodes, "!");
                cursor = start + 1;
            }
        } else if rest.starts_with('[') {
            if let Some((end_label, end_url)) = bracket_target(text, start) {
                let label = text[start + 1..end_label].to_owned();
                let url = text[end_label + 2..end_url].trim();
                let target = classify_link(url);
                push_node(&mut nodes, InlineNode::Link { label, target });
                cursor = end_url + 1;
            } else {
                push_text(&mut nodes, "[");
                cursor = start + 1;
            }
        } else if rest.starts_with("**") || rest.starts_with('*') {
            let marker = if rest.starts_with("**") { "**" } else { "*" };
            if let Some(end) =
                find_unescaped(text, start + marker.len(), marker.as_bytes()[0] as char)
            {
                let inner_end = end;
                push_node(
                    &mut nodes,
                    InlineNode::Emphasis(text[start + marker.len()..inner_end].to_owned()),
                );
                cursor = end + marker.len();
            } else {
                push_text(&mut nodes, marker);
                cursor = start + marker.len();
            }
        } else if rest.starts_with("~~") {
            if let Some(end) = find_unescaped(text, start + 2, '~') {
                push_node(
                    &mut nodes,
                    InlineNode::Strikethrough(text[start + 2..end].to_owned()),
                );
                cursor = end + 2;
            } else {
                push_text(&mut nodes, "~~");
                cursor = start + 2;
            }
        } else if rest.starts_with('<') {
            if let Some(end) = text[start + 1..].find('>') {
                let end = start + 1 + end;
                if diagnostics.len() < MAX_DIAGNOSTICS {
                    diagnostics.push(MarkdownDiagnostic::RawMarkupInert);
                }
                push_node(
                    &mut nodes,
                    InlineNode::InertMarkup(text[start..=end].to_owned()),
                );
                cursor = end + 1;
            } else {
                push_text(&mut nodes, rest);
                break;
            }
        } else if rest.starts_with('$') {
            if let Some(end) = find_unescaped(text, start + 1, '$') {
                let formula = &text[start + 1..end];
                if formula.is_empty() || is_currency(formula) {
                    push_text(&mut nodes, &text[start..=end]);
                } else {
                    push_math(
                        nodes_mut(&mut nodes),
                        formula,
                        MathDisplay::Inline,
                        math_runs,
                    )?;
                }
                cursor = end + 1;
            } else {
                push_text(&mut nodes, rest);
                break;
            }
        } else if rest.starts_with("\\(") || rest.starts_with("\\[") {
            let (closing, offset, display) = if rest.starts_with("\\(") {
                ("\\)", 2, MathDisplay::Inline)
            } else {
                ("\\]", 2, MathDisplay::Block)
            };
            if let Some(end) = text[start + offset..].find(closing) {
                let end = start + offset + end;
                let formula = &text[start + offset..end];
                push_math(nodes_mut(&mut nodes), formula, display, math_runs)?;
                cursor = end + closing.len();
            } else {
                push_text(&mut nodes, rest);
                break;
            }
        } else if rest.starts_with('\\') {
            let next = start + 1;
            if next < text.len() {
                let end = next + text[next..].chars().next().map(char::len_utf8).unwrap_or(1);
                push_text(&mut nodes, &text[next..end]);
                cursor = end;
            } else {
                cursor = text.len();
            }
        } else {
            push_text(&mut nodes, &text[start..start + 1]);
            cursor = start + 1;
        }
    }
    Ok(nodes)
}

fn nodes_mut(nodes: &mut Vec<InlineNode>) -> &mut Vec<InlineNode> {
    nodes
}

fn push_math(
    nodes: &mut Vec<InlineNode>,
    formula: &str,
    display: MathDisplay,
    math_runs: &mut usize,
) -> Result<(), ParseError> {
    nodes.push(InlineNode::Math(validate_math(
        formula, math_runs, display,
    )?));
    Ok(())
}

fn validate_math(
    formula: &str,
    math_runs: &mut usize,
    display: MathDisplay,
) -> Result<MathRun, ParseError> {
    if formula.len() > MAX_FORMULA_BYTES {
        return Err(ParseError::FormulaTooLarge);
    }
    if formula.contains("\\begin{") || formula.contains("\\include") || formula.contains("\\write")
    {
        return Err(ParseError::UnsupportedMath);
    }
    *math_runs = math_runs.saturating_add(1);
    if *math_runs > MAX_MATH_RUNS {
        return Err(ParseError::MathLimit);
    }
    Ok(MathRun {
        source: formula.to_owned(),
        display,
    })
}

fn push_node(nodes: &mut Vec<InlineNode>, node: InlineNode) {
    nodes.push(node);
}

fn push_text(nodes: &mut Vec<InlineNode>, text: &str) {
    if text.is_empty() {
        return;
    }
    if let Some(InlineNode::Text(existing)) = nodes.last_mut() {
        existing.push_str(text);
    } else {
        nodes.push(InlineNode::Text(text.to_owned()));
    }
}

fn bracket_target(text: &str, start: usize) -> Option<(usize, usize)> {
    let label_start = if text[start..].starts_with("![") {
        start + 1
    } else {
        start
    };
    let end_label = text[label_start + 1..].find(']')? + label_start + 1;
    if text.get(end_label + 1..end_label + 2) != Some("(") {
        return None;
    }
    let end_url = text[end_label + 2..].find(')')? + end_label + 2;
    Some((end_label, end_url))
}

fn classify_link(url: &str) -> LinkTarget {
    if url.is_empty() || url.len() > MAX_LINK_BYTES || url.chars().any(char::is_control) {
        return LinkTarget::Inert(url.to_owned());
    }
    if url.starts_with("https://") {
        return LinkTarget::HttpsPreview(url.to_owned());
    }
    let path = url.replace('\\', "/");
    let has_scheme = path
        .find(':')
        .is_some_and(|colon| !path[..colon].contains('/'));
    if path.starts_with('/')
        || path.starts_with('~')
        || path.contains("://")
        || has_scheme
        || path.starts_with('#')
        || path.starts_with('?')
        || path.split('/').any(|part| part == ".." || part.is_empty())
    {
        LinkTarget::Inert(url.to_owned())
    } else {
        LinkTarget::WorkspaceRelative(path)
    }
}

fn find_unescaped(text: &str, start: usize, delimiter: char) -> Option<usize> {
    let mut escaped = false;
    for (offset, character) in text[start..].char_indices() {
        let index = start + offset;
        if escaped {
            escaped = false;
        } else if character == '\\' {
            escaped = true;
        } else if character == delimiter {
            return Some(index);
        }
    }
    None
}

fn is_currency(formula: &str) -> bool {
    let trimmed = formula.trim();
    !trimmed.is_empty()
        && trimmed
            .chars()
            .all(|character| character.is_ascii_digit() || matches!(character, '.' | ','))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn all_inlines(document: &MarkdownDocument) -> Vec<&InlineNode> {
        let mut result = Vec::new();
        for block in document.blocks() {
            match block {
                MarkdownBlock::Paragraph { inlines }
                | MarkdownBlock::Heading { inlines, .. }
                | MarkdownBlock::Quote { inlines } => result.extend(inlines),
                MarkdownBlock::List { items, .. } => {
                    for item in items {
                        result.extend(item);
                    }
                }
                MarkdownBlock::Table { rows } => {
                    for row in rows {
                        for cell in row {
                            result.extend(cell);
                        }
                    }
                }
                _ => {}
            }
        }
        result
    }

    #[test]
    fn completed_blocks_cover_safe_markdown_subset() {
        let document = MarkdownDocument::parse(
            "# Heading\n\n**bold** ~~gone~~ `code`\n\n- one\n- two\n\n> quote\n\n---\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```rust\nlet x = 1;\n```",
            true,
        );
        assert!(
            document
                .blocks()
                .iter()
                .any(|block| matches!(block, MarkdownBlock::Heading { level: 1, .. }))
        );
        assert!(
            document
                .blocks()
                .iter()
                .any(|block| matches!(block, MarkdownBlock::List { .. }))
        );
        assert!(
            document
                .blocks()
                .iter()
                .any(|block| matches!(block, MarkdownBlock::Table { .. }))
        );
        assert!(
            document
                .blocks()
                .iter()
                .any(|block| matches!(block, MarkdownBlock::CodeFence { .. }))
        );
        assert!(
            all_inlines(&document)
                .iter()
                .any(|node| matches!(node, InlineNode::Emphasis(_)))
        );
    }

    #[test]
    fn streaming_and_incomplete_fences_remain_literal_source() {
        let streaming = MarkdownDocument::parse("**unfinished", false);
        assert!(matches!(
            streaming.blocks()[0],
            MarkdownBlock::Literal {
                reason: LiteralReason::Streaming,
                ..
            }
        ));
        let incomplete = MarkdownDocument::parse("```rust\nopen", true);
        assert!(matches!(
            incomplete.blocks()[0],
            MarkdownBlock::Literal {
                reason: LiteralReason::UnclosedFence,
                ..
            }
        ));
        assert_eq!(incomplete.copy_source(), "```rust\nopen");
    }

    #[test]
    fn links_are_inert_typed_targets_and_images_never_fetch() {
        let document = MarkdownDocument::parse(
            "[file](src/main.rs) [web](https://example.com) [bad](/etc/passwd) [script](javascript:alert(1)) ![alt](https://example.com/x.png)",
            true,
        );
        let nodes = all_inlines(&document);
        assert!(nodes.iter().any(|node| matches!(node, InlineNode::Link { target: LinkTarget::WorkspaceRelative(path), .. } if path == "src/main.rs")));
        assert!(nodes.iter().any(|node| matches!(node, InlineNode::Link { target: LinkTarget::HttpsPreview(url), .. } if url.starts_with("https://"))));
        assert!(nodes.iter().any(|node| matches!(
            node,
            InlineNode::Link {
                target: LinkTarget::Inert(_),
                ..
            }
        )));
        assert!(
            nodes
                .iter()
                .any(|node| matches!(node, InlineNode::InertImage { alt } if alt == "alt"))
        );
        assert!(
            LinkTarget::HttpsPreview("https://example.com".into())
                .intent()
                .is_some()
        );
    }

    #[test]
    fn math_scanner_handles_currency_code_escapes_and_source_fallback() {
        let document = MarkdownDocument::parse(
            "$5.00 and `$x$` and escaped \\$x$ plus $x+y$ and \\(z\\)",
            true,
        );
        let nodes = all_inlines(&document);
        assert!(nodes.iter().any(
            |node| matches!(node, InlineNode::Math(MathRun { source, .. }) if source == "x+y")
        ));
        assert!(!nodes.iter().any(
            |node| matches!(node, InlineNode::Math(MathRun { source, .. }) if source == "5.00")
        ));
        let unsupported = MarkdownDocument::parse("$\\begin{matrix}x\\end{matrix}$", true);
        assert!(matches!(
            unsupported.blocks()[0],
            MarkdownBlock::Literal {
                reason: LiteralReason::UnsupportedMath,
                ..
            }
        ));
        let huge =
            MarkdownDocument::parse(&format!("${}$", "x".repeat(MAX_FORMULA_BYTES + 1)), true);
        assert!(matches!(
            huge.blocks()[0],
            MarkdownBlock::Literal {
                reason: LiteralReason::FormulaTooLarge,
                ..
            }
        ));
    }

    #[test]
    fn block_math_is_source_bearing_and_unclosed_math_is_literal() {
        let document = MarkdownDocument::parse("$$\nx + y\n$$\n\n\\[z\\]", true);
        assert!(matches!(
            document.blocks()[0],
            MarkdownBlock::Math(MathRun {
                display: MathDisplay::Block,
                ..
            })
        ));
        assert!(matches!(
            &document.blocks()[1],
            MarkdownBlock::Math(MathRun { source, .. }) if source == "z"
        ));
        let incomplete = MarkdownDocument::parse("$$\nx", true);
        assert!(matches!(
            incomplete.blocks()[0],
            MarkdownBlock::Literal {
                reason: LiteralReason::UnclosedMath,
                ..
            }
        ));
    }

    #[test]
    fn raw_html_mdx_scripts_and_styles_are_inert() {
        let document = MarkdownDocument::parse(
            "<script>alert(1)</script>\n<div>{danger}</div>\n<style>x{}</style>",
            true,
        );
        assert!(
            document
                .blocks()
                .iter()
                .all(|block| matches!(block, MarkdownBlock::InertHtml { .. }))
        );
        assert!(
            document
                .diagnostics()
                .contains(&MarkdownDiagnostic::RawMarkupInert)
        );
        assert!(!format!("{document:?}").contains("alert(1)"));
    }

    #[test]
    fn source_and_limits_are_bounded_without_losing_copy_source() {
        let source = "x\n".repeat(MAX_BLOCKS + 10);
        let document = MarkdownDocument::parse(&source, true);
        assert!(document.blocks().len() <= MAX_BLOCKS);
        assert_eq!(document.copy_source(), source);
        let huge = "x".repeat(MAX_SOURCE_BYTES + 1);
        let document = MarkdownDocument::parse(&huge, true);
        assert!(matches!(
            document.blocks()[0],
            MarkdownBlock::Literal {
                reason: LiteralReason::SourceTooLarge,
                ..
            }
        ));
    }

    #[test]
    fn debug_redacts_formula_and_source_content() {
        let document = MarkdownDocument::parse("secret prompt \\(SECRET_TEX\\)", true);
        let rendered = format!("{document:?}");
        assert!(!rendered.contains("SECRET_TEX"));
        assert!(!rendered.contains("secret prompt"));
        assert_eq!(document.copy_source(), "secret prompt \\(SECRET_TEX\\)");
    }
}
