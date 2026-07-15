use crossterm::event::{KeyCode, KeyEvent, KeyEventKind, KeyModifiers};
use unicode_segmentation::UnicodeSegmentation as _;
use unicode_width::UnicodeWidthStr as _;

pub(super) const MAXIMUM_PROMPT_BYTES: usize = 256 * 1024;

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub(super) struct Composer {
    text: String,
    cursor: usize,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) enum EditOutcome {
    Changed,
    Submit(String),
    Clear,
    Exit,
    ToggleReasoning,
    ScrollUp,
    ScrollDown,
    RejectedLimit,
    Ignored,
}

impl Composer {
    #[cfg(test)]
    pub(super) fn with_text(text: impl Into<String>) -> Self {
        let text = text.into();
        Self {
            cursor: text.len(),
            text,
        }
    }

    pub(super) fn text(&self) -> &str {
        &self.text
    }

    #[cfg(test)]
    pub(super) fn cursor(&self) -> usize {
        self.cursor
    }

    pub(super) fn is_empty(&self) -> bool {
        self.text.is_empty()
    }

    pub(super) fn clear(&mut self) {
        self.text.clear();
        self.cursor = 0;
    }

    pub(super) fn handle_key(&mut self, key: KeyEvent) -> EditOutcome {
        if !matches!(key.kind, KeyEventKind::Press | KeyEventKind::Repeat) {
            return EditOutcome::Ignored;
        }
        if key.modifiers.contains(KeyModifiers::CONTROL) {
            return match key.code {
                KeyCode::Char('c') => {
                    if self.is_empty() {
                        EditOutcome::Exit
                    } else {
                        self.clear();
                        EditOutcome::Clear
                    }
                }
                KeyCode::Char('d') if self.is_empty() => EditOutcome::Exit,
                KeyCode::Char('o') => EditOutcome::ToggleReasoning,
                KeyCode::Char('a') => {
                    self.cursor = self.line_start();
                    EditOutcome::Changed
                }
                KeyCode::Char('e') => {
                    self.cursor = self.line_end();
                    EditOutcome::Changed
                }
                _ => EditOutcome::Ignored,
            };
        }
        match key.code {
            KeyCode::Enter
                if key
                    .modifiers
                    .intersects(KeyModifiers::SHIFT | KeyModifiers::ALT) =>
            {
                self.insert("\n")
            }
            KeyCode::Enter => {
                if self.text.trim().is_empty() {
                    EditOutcome::Ignored
                } else {
                    let text = std::mem::take(&mut self.text);
                    self.cursor = 0;
                    EditOutcome::Submit(text)
                }
            }
            KeyCode::Char(character) => self.insert(&character.to_string()),
            KeyCode::Tab => self.insert("    "),
            KeyCode::Backspace => self.backspace(),
            KeyCode::Delete => self.delete(),
            KeyCode::Left => {
                self.cursor = previous_grapheme_boundary(&self.text, self.cursor);
                EditOutcome::Changed
            }
            KeyCode::Right => {
                self.cursor = next_grapheme_boundary(&self.text, self.cursor);
                EditOutcome::Changed
            }
            KeyCode::Home => {
                self.cursor = self.line_start();
                EditOutcome::Changed
            }
            KeyCode::End => {
                self.cursor = self.line_end();
                EditOutcome::Changed
            }
            KeyCode::Up => {
                self.move_vertical(-1);
                EditOutcome::Changed
            }
            KeyCode::Down => {
                self.move_vertical(1);
                EditOutcome::Changed
            }
            KeyCode::PageUp => EditOutcome::ScrollUp,
            KeyCode::PageDown => EditOutcome::ScrollDown,
            _ => EditOutcome::Ignored,
        }
    }

    pub(super) fn paste(&mut self, value: &str) -> EditOutcome {
        let normalized = value
            .replace("\r\n", "\n")
            .replace('\r', "\n")
            .replace('\t', "    ");
        self.insert(&normalized)
    }

    pub(super) fn visual_cursor(&self, width: usize) -> (usize, usize) {
        let width = width.max(1);
        let mut row = 0_usize;
        let mut column = 0_usize;
        for grapheme in self.text[..self.cursor].graphemes(true) {
            if grapheme == "\n" {
                row += 1;
                column = 0;
                continue;
            }
            let grapheme_width = grapheme.width().max(1);
            if column + grapheme_width > width {
                row += 1;
                column = 0;
            }
            column += grapheme_width;
            if column == width {
                row += 1;
                column = 0;
            }
        }
        (column, row)
    }

    pub(super) fn visual_rows(&self, width: usize) -> usize {
        self.visual_cursor_at(self.text.len(), width).1 + 1
    }

    fn visual_cursor_at(&self, cursor: usize, width: usize) -> (usize, usize) {
        let mut clone = self.clone();
        clone.cursor = cursor;
        clone.visual_cursor(width)
    }

    fn insert(&mut self, value: &str) -> EditOutcome {
        if self.text.len().saturating_add(value.len()) > MAXIMUM_PROMPT_BYTES {
            return EditOutcome::RejectedLimit;
        }
        self.text.insert_str(self.cursor, value);
        self.cursor += value.len();
        EditOutcome::Changed
    }

    fn backspace(&mut self) -> EditOutcome {
        let previous = previous_grapheme_boundary(&self.text, self.cursor);
        if previous == self.cursor {
            return EditOutcome::Ignored;
        }
        self.text.drain(previous..self.cursor);
        self.cursor = previous;
        EditOutcome::Changed
    }

    fn delete(&mut self) -> EditOutcome {
        let next = next_grapheme_boundary(&self.text, self.cursor);
        if next == self.cursor {
            return EditOutcome::Ignored;
        }
        self.text.drain(self.cursor..next);
        EditOutcome::Changed
    }

    fn line_start(&self) -> usize {
        self.text[..self.cursor]
            .rfind('\n')
            .map_or(0, |index| index + 1)
    }

    fn line_end(&self) -> usize {
        self.text[self.cursor..]
            .find('\n')
            .map_or(self.text.len(), |index| self.cursor + index)
    }

    fn move_vertical(&mut self, direction: i8) {
        let start = self.line_start();
        let column = self.text[start..self.cursor].width();
        let target = if direction < 0 {
            if start == 0 {
                return;
            }
            let end = start - 1;
            let start = self.text[..end].rfind('\n').map_or(0, |index| index + 1);
            (start, end)
        } else {
            let end = self.line_end();
            if end == self.text.len() {
                return;
            }
            let start = end + 1;
            let end = self.text[start..]
                .find('\n')
                .map_or(self.text.len(), |index| start + index);
            (start, end)
        };
        self.cursor = byte_at_display_column(&self.text, target.0, target.1, column);
    }
}

fn previous_grapheme_boundary(text: &str, cursor: usize) -> usize {
    text[..cursor]
        .grapheme_indices(true)
        .next_back()
        .map_or(cursor, |(index, _)| index)
}

fn next_grapheme_boundary(text: &str, cursor: usize) -> usize {
    text[cursor..]
        .grapheme_indices(true)
        .nth(1)
        .map_or(text.len(), |(index, _)| cursor + index)
}

fn byte_at_display_column(text: &str, start: usize, end: usize, target: usize) -> usize {
    let mut width = 0_usize;
    for (offset, grapheme) in text[start..end].grapheme_indices(true) {
        let next = width + grapheme.width().max(1);
        if next > target {
            return start + offset;
        }
        width = next;
    }
    end
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(code: KeyCode) -> KeyEvent {
        KeyEvent::new(code, KeyModifiers::NONE)
    }

    #[test]
    fn composer_edits_unicode_by_grapheme() {
        let mut composer = Composer::with_text("a👩‍💻b");
        assert_eq!(
            composer.handle_key(key(KeyCode::Left)),
            EditOutcome::Changed
        );
        assert_eq!(
            composer.handle_key(key(KeyCode::Backspace)),
            EditOutcome::Changed
        );
        assert_eq!(composer.text(), "ab");
    }

    #[test]
    fn composer_moves_between_lines_at_display_column() {
        let mut composer = Composer::with_text("界x\nabc");
        composer.handle_key(key(KeyCode::Up));
        assert_eq!(composer.cursor(), "界x".len());
        composer.handle_key(key(KeyCode::Down));
        assert_eq!(composer.cursor(), composer.text().len());
    }

    #[test]
    fn composer_submit_newline_clear_and_exit_are_explicit() {
        let mut composer = Composer::with_text("hello");
        assert_eq!(
            composer.handle_key(KeyEvent::new(KeyCode::Enter, KeyModifiers::SHIFT)),
            EditOutcome::Changed
        );
        assert_eq!(composer.text(), "hello\n");
        assert_eq!(
            composer.handle_key(key(KeyCode::Char('x'))),
            EditOutcome::Changed
        );
        assert_eq!(
            composer.handle_key(key(KeyCode::Enter)),
            EditOutcome::Submit("hello\nx".into())
        );
        assert_eq!(
            composer.handle_key(key(KeyCode::Char('c'))),
            EditOutcome::Changed
        );
        assert_eq!(
            composer.handle_key(KeyEvent::new(KeyCode::Char('c'), KeyModifiers::CONTROL)),
            EditOutcome::Clear
        );
        assert_eq!(
            composer.handle_key(KeyEvent::new(KeyCode::Char('d'), KeyModifiers::CONTROL)),
            EditOutcome::Exit
        );
    }

    #[test]
    fn oversized_paste_is_rejected_without_partial_insertion() {
        let mut composer = Composer::default();
        let paste = "x".repeat(MAXIMUM_PROMPT_BYTES + 1);
        assert_eq!(composer.paste(&paste), EditOutcome::RejectedLimit);
        assert!(composer.is_empty());
    }
}
