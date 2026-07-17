use std::ops::Range;

use gpui::{
    App, Bounds, Context, ElementInputHandler, Entity, EntityInputHandler, FocusHandle, Focusable,
    GlobalElementId, LayoutId, MouseButton, MouseDownEvent, Pixels, Style, UTF16Selection, Window,
    div, prelude::*, relative,
};
use unicode_segmentation::UnicodeSegmentation as _;
use zeroize::Zeroize as _;

use crate::auth::SecretText;

pub const MAX_SECRET_INPUT_BYTES: usize = 4_096;

gpui::actions!(secure_input, [Backspace, Delete, Left, Right, Home, End]);

pub struct SecureInput {
    focus_handle: FocusHandle,
    content: String,
    selected_range: Range<usize>,
    selection_reversed: bool,
    marked_range: Option<Range<usize>>,
}

impl std::fmt::Debug for SecureInput {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("SecureInput")
            .field("content", &"[REDACTED]")
            .field("bytes", &self.content.len())
            .finish()
    }
}

impl Drop for SecureInput {
    fn drop(&mut self) {
        self.content.zeroize();
    }
}

impl SecureInput {
    pub fn new(cx: &mut Context<Self>) -> Self {
        Self {
            focus_handle: cx.focus_handle(),
            content: String::new(),
            selected_range: 0..0,
            selection_reversed: false,
            marked_range: None,
        }
    }

    pub fn is_empty(&self) -> bool {
        self.content.is_empty()
    }

    pub fn take_secret(&mut self, cx: &mut Context<Self>) -> Option<SecretText> {
        if self.content.is_empty() {
            return None;
        }
        let value = std::mem::take(&mut self.content);
        self.selected_range = 0..0;
        self.selection_reversed = false;
        self.marked_range = None;
        cx.notify();
        Some(SecretText::new(value))
    }

    pub fn clear(&mut self, cx: &mut Context<Self>) {
        self.content.zeroize();
        self.content.clear();
        self.selected_range = 0..0;
        self.selection_reversed = false;
        self.marked_range = None;
        cx.notify();
    }

    fn cursor_offset(&self) -> usize {
        if self.selection_reversed {
            self.selected_range.start
        } else {
            self.selected_range.end
        }
    }

    fn move_to(&mut self, offset: usize, cx: &mut Context<Self>) {
        let offset = clamp_boundary(&self.content, offset);
        self.selected_range = offset..offset;
        self.selection_reversed = false;
        cx.notify();
    }

    fn backspace(&mut self, _: &Backspace, _: &mut Window, cx: &mut Context<Self>) {
        if self.selected_range.is_empty() {
            let cursor = self.cursor_offset();
            self.selected_range = previous_boundary(&self.content, cursor)..cursor;
        }
        self.replace_range(None, "", cx);
    }

    fn delete(&mut self, _: &Delete, _: &mut Window, cx: &mut Context<Self>) {
        if self.selected_range.is_empty() {
            let cursor = self.cursor_offset();
            self.selected_range = cursor..next_boundary(&self.content, cursor);
        }
        self.replace_range(None, "", cx);
    }

    fn left(&mut self, _: &Left, _: &mut Window, cx: &mut Context<Self>) {
        let destination = if self.selected_range.is_empty() {
            previous_boundary(&self.content, self.cursor_offset())
        } else {
            self.selected_range.start
        };
        self.move_to(destination, cx);
    }

    fn right(&mut self, _: &Right, _: &mut Window, cx: &mut Context<Self>) {
        let destination = if self.selected_range.is_empty() {
            next_boundary(&self.content, self.cursor_offset())
        } else {
            self.selected_range.end
        };
        self.move_to(destination, cx);
    }

    fn home(&mut self, _: &Home, _: &mut Window, cx: &mut Context<Self>) {
        self.move_to(0, cx);
    }

    fn end(&mut self, _: &End, _: &mut Window, cx: &mut Context<Self>) {
        self.move_to(self.content.len(), cx);
    }

    fn focus_at_end(&mut self, _: &MouseDownEvent, window: &mut Window, cx: &mut Context<Self>) {
        self.move_to(self.content.len(), cx);
        self.focus_handle.focus(window, cx);
    }

    fn replace_range(
        &mut self,
        range_utf16: Option<Range<usize>>,
        new_text: &str,
        cx: &mut Context<Self>,
    ) -> Option<Range<usize>> {
        if new_text.bytes().any(|byte| byte.is_ascii_control()) {
            return None;
        }
        let range = range_utf16
            .as_ref()
            .map(|range| range_from_utf16(&self.content, range))
            .or_else(|| self.marked_range.clone())
            .unwrap_or_else(|| self.selected_range.clone());
        let range = safe_range(&self.content, range);
        let new_len = self
            .content
            .len()
            .saturating_sub(range.end.saturating_sub(range.start))
            .saturating_add(new_text.len());
        if new_len > MAX_SECRET_INPUT_BYTES {
            return None;
        }

        let mut previous = std::mem::take(&mut self.content);
        let mut replacement = String::with_capacity(new_len);
        replacement.push_str(&previous[..range.start]);
        replacement.push_str(new_text);
        replacement.push_str(&previous[range.end..]);
        previous.zeroize();
        self.content = replacement;
        let inserted = range.start..range.start + new_text.len();
        self.selected_range = inserted.end..inserted.end;
        self.selection_reversed = false;
        self.marked_range = None;
        cx.notify();
        Some(inserted)
    }

    fn masked_text(&self) -> String {
        "•".repeat(self.content.graphemes(true).count())
    }
}

impl Focusable for SecureInput {
    fn focus_handle(&self, _: &App) -> FocusHandle {
        self.focus_handle.clone()
    }
}

impl EntityInputHandler for SecureInput {
    fn text_for_range(
        &mut self,
        range_utf16: Range<usize>,
        actual_range: &mut Option<Range<usize>>,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<String> {
        let total = utf16_len(&self.content);
        let start = range_utf16.start.min(total);
        let end = range_utf16.end.max(start).min(total);
        actual_range.replace(start..end);
        Some("•".repeat(end - start))
    }

    fn selected_text_range(
        &mut self,
        _: bool,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<UTF16Selection> {
        Some(UTF16Selection {
            range: range_to_utf16(&self.content, &self.selected_range),
            reversed: self.selection_reversed,
        })
    }

    fn marked_text_range(&self, _: &mut Window, _: &mut Context<Self>) -> Option<Range<usize>> {
        self.marked_range
            .as_ref()
            .map(|range| range_to_utf16(&self.content, range))
    }

    fn unmark_text(&mut self, _: &mut Window, _: &mut Context<Self>) {
        self.marked_range = None;
    }

    fn replace_text_in_range(
        &mut self,
        range_utf16: Option<Range<usize>>,
        new_text: &str,
        _: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.replace_range(range_utf16, new_text, cx);
    }

    fn replace_and_mark_text_in_range(
        &mut self,
        range_utf16: Option<Range<usize>>,
        new_text: &str,
        new_selected_range_utf16: Option<Range<usize>>,
        _: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(inserted) = self.replace_range(range_utf16, new_text, cx) else {
            return;
        };
        if !inserted.is_empty() {
            self.marked_range = Some(inserted.clone());
        }
        if let Some(selection) = new_selected_range_utf16 {
            let relative = range_from_utf16(new_text, &selection);
            self.selected_range = inserted.start + relative.start..inserted.start + relative.end;
        }
        cx.notify();
    }

    fn bounds_for_range(
        &mut self,
        _: Range<usize>,
        bounds: Bounds<Pixels>,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<Bounds<Pixels>> {
        Some(bounds)
    }

    fn character_index_for_point(
        &mut self,
        _: gpui::Point<Pixels>,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<usize> {
        Some(utf16_len(&self.content))
    }
}

impl gpui::Render for SecureInput {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let masked = self.masked_text();
        div()
            .id("deepseek-api-key")
            .role(gpui::Role::TextInput)
            .aria_label("DeepSeek API key secure input")
            .key_context("SecureInput")
            .track_focus(&self.focus_handle)
            .w_full()
            .h_8()
            .relative()
            .overflow_hidden()
            .on_action(cx.listener(Self::backspace))
            .on_action(cx.listener(Self::delete))
            .on_action(cx.listener(Self::left))
            .on_action(cx.listener(Self::right))
            .on_action(cx.listener(Self::home))
            .on_action(cx.listener(Self::end))
            .on_mouse_down(MouseButton::Left, cx.listener(Self::focus_at_end))
            .child(
                div()
                    .absolute()
                    .inset_0()
                    .flex()
                    .items_center()
                    .px_2()
                    .child(if masked.is_empty() {
                        "Enter API key".to_owned()
                    } else {
                        masked
                    }),
            )
            .child(InputCapture { input: cx.entity() })
    }
}

struct InputCapture {
    input: Entity<SecureInput>,
}

impl IntoElement for InputCapture {
    type Element = Self;

    fn into_element(self) -> Self::Element {
        self
    }
}

impl gpui::Element for InputCapture {
    type RequestLayoutState = ();
    type PrepaintState = ();

    fn id(&self) -> Option<gpui::ElementId> {
        None
    }

    fn source_location(&self) -> Option<&'static core::panic::Location<'static>> {
        None
    }

    fn request_layout(
        &mut self,
        _: Option<&GlobalElementId>,
        _: Option<&gpui::InspectorElementId>,
        window: &mut Window,
        cx: &mut App,
    ) -> (LayoutId, Self::RequestLayoutState) {
        let mut style = Style::default();
        style.size.width = relative(1.).into();
        style.size.height = relative(1.).into();
        (window.request_layout(style, [], cx), ())
    }

    fn prepaint(
        &mut self,
        _: Option<&GlobalElementId>,
        _: Option<&gpui::InspectorElementId>,
        bounds: Bounds<Pixels>,
        _: &mut Self::RequestLayoutState,
        _: &mut Window,
        _: &mut App,
    ) -> Self::PrepaintState {
        let _ = bounds;
    }

    fn paint(
        &mut self,
        _: Option<&GlobalElementId>,
        _: Option<&gpui::InspectorElementId>,
        bounds: Bounds<Pixels>,
        _: &mut Self::RequestLayoutState,
        _: &mut Self::PrepaintState,
        window: &mut Window,
        cx: &mut App,
    ) {
        let focus_handle = self.input.read(cx).focus_handle.clone();
        window.handle_input(
            &focus_handle,
            ElementInputHandler::new(bounds, self.input.clone()),
            cx,
        );
    }
}

fn clamp_boundary(content: &str, offset: usize) -> usize {
    let mut offset = offset.min(content.len());
    while offset > 0 && !content.is_char_boundary(offset) {
        offset -= 1;
    }
    offset
}

fn safe_range(content: &str, range: Range<usize>) -> Range<usize> {
    let start = clamp_boundary(content, range.start);
    let end = clamp_boundary(content, range.end.max(start));
    start..end
}

fn previous_boundary(content: &str, offset: usize) -> usize {
    content
        .grapheme_indices(true)
        .rev()
        .find_map(|(index, _)| (index < offset).then_some(index))
        .unwrap_or(0)
}

fn next_boundary(content: &str, offset: usize) -> usize {
    content
        .grapheme_indices(true)
        .find_map(|(index, _)| (index > offset).then_some(index))
        .unwrap_or(content.len())
}

fn offset_from_utf16(content: &str, offset: usize) -> usize {
    let mut utf8 = 0;
    let mut utf16 = 0;
    for character in content.chars() {
        if utf16 >= offset {
            break;
        }
        utf8 += character.len_utf8();
        utf16 += character.len_utf16();
    }
    clamp_boundary(content, utf8)
}

fn offset_to_utf16(content: &str, offset: usize) -> usize {
    content[..clamp_boundary(content, offset)]
        .encode_utf16()
        .count()
}

fn utf16_len(content: &str) -> usize {
    content.encode_utf16().count()
}

fn range_from_utf16(content: &str, range: &Range<usize>) -> Range<usize> {
    offset_from_utf16(content, range.start)..offset_from_utf16(content, range.end)
}

fn range_to_utf16(content: &str, range: &Range<usize>) -> Range<usize> {
    offset_to_utf16(content, range.start)..offset_to_utf16(content, range.end)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utf16_ranges_round_trip_at_character_boundaries() {
        let value = "a😀é";
        for byte in [0, 1, 5, value.len()] {
            let utf16 = offset_to_utf16(value, byte);
            assert_eq!(offset_from_utf16(value, utf16), byte);
        }
    }
}
