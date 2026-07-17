//! GPUI-neutral focus, keyboard, and modal routing for the native workbench.
//!
//! The router owns only presentation focus. It does not know about views, sessions, tools, or
//! processes; adapters translate its typed actions into application intents.

pub const MAX_ROVING_ITEMS: usize = 4_096;
pub const MAX_MODAL_CONTROLS: usize = 64;
pub const MAX_MODAL_DEPTH: usize = 8;

/// Stable pane traversal order from the native workbench contract.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FocusRegion {
    Navigation,
    ChatTabsHeaderTranscriptComposer,
    ViewerTabsContent,
    TerminalTabsContent,
    FileTree,
}

impl FocusRegion {
    const ORDER: [Self; 5] = [
        Self::Navigation,
        Self::ChatTabsHeaderTranscriptComposer,
        Self::ViewerTabsContent,
        Self::TerminalTabsContent,
        Self::FileTree,
    ];

    fn index(self) -> usize {
        match self {
            Self::Navigation => 0,
            Self::ChatTabsHeaderTranscriptComposer => 1,
            Self::ViewerTabsContent => 2,
            Self::TerminalTabsContent => 3,
            Self::FileTree => 4,
        }
    }

    fn next(self, direction: TraversalDirection) -> Self {
        let index = match direction {
            TraversalDirection::Next => (self.index() + 1) % Self::ORDER.len(),
            TraversalDirection::Previous => {
                (self.index() + Self::ORDER.len() - 1) % Self::ORDER.len()
            }
        };
        Self::ORDER[index]
    }
}

/// Roving groups are the only groups whose children become individual focus targets.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RovingGroup {
    NavigationTree,
    ChatTabs,
    ViewerTabs,
    TerminalTabs,
    FileTree,
}

impl RovingGroup {
    fn region(self) -> FocusRegion {
        match self {
            Self::NavigationTree => FocusRegion::Navigation,
            Self::ChatTabs => FocusRegion::ChatTabsHeaderTranscriptComposer,
            Self::ViewerTabs => FocusRegion::ViewerTabsContent,
            Self::TerminalTabs => FocusRegion::TerminalTabsContent,
            Self::FileTree => FocusRegion::FileTree,
        }
    }

    fn index(self) -> usize {
        match self {
            Self::NavigationTree => 0,
            Self::ChatTabs => 1,
            Self::ViewerTabs => 2,
            Self::TerminalTabs => 3,
            Self::FileTree => 4,
        }
    }

    fn target(self, index: usize) -> FocusTarget {
        match self {
            Self::NavigationTree | Self::FileTree => FocusTarget::TreeRow {
                region: self.region(),
                index,
            },
            Self::ChatTabs | Self::ViewerTabs | Self::TerminalTabs => FocusTarget::Tab {
                region: self.region(),
                index,
            },
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FocusTarget {
    Region(FocusRegion),
    Composer,
    Tab { region: FocusRegion, index: usize },
    TreeRow { region: FocusRegion, index: usize },
    Modal { kind: ModalKind, index: usize },
}

impl FocusTarget {
    pub fn region(self) -> Option<FocusRegion> {
        match self {
            Self::Region(region) | Self::Tab { region, .. } | Self::TreeRow { region, .. } => {
                Some(region)
            }
            Self::Composer => Some(FocusRegion::ChatTabsHeaderTranscriptComposer),
            Self::Modal { .. } => None,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ModalKind {
    Credential,
    Approval,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TraversalDirection {
    Next,
    Previous,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ComposerAction {
    Send,
    InsertNewline,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Shortcut {
    Command1,
    Command2,
    Command3,
    Command4,
    ControlBacktick,
    PreviousFocusedTab,
    NextFocusedTab,
    CloseFocusedPresentationTab,
    RequestShutdown,
    ComposerEnter,
    ComposerShiftEnter,
    Escape,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ShortcutAction {
    FocusRegion(FocusRegion),
    FocusTab(TraversalDirection),
    CloseFocusedPresentationTab(FocusTarget),
    RequestShutdown,
    Composer(ComposerAction),
    CloseModal(ModalKind),
    RequestTurnCancellation,
    CloseTransientSurface,
    Ignored,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct RovingState {
    count: usize,
    index: usize,
}

impl RovingState {
    const EMPTY: Self = Self { count: 0, index: 0 };

    fn set_count(&mut self, count: usize) {
        self.count = count.min(MAX_ROVING_ITEMS);
        if self.count == 0 {
            self.index = 0;
        } else {
            self.index = self.index.min(self.count - 1);
        }
    }

    fn move_by(&mut self, direction: TraversalDirection) -> bool {
        if self.count == 0 {
            return false;
        }
        self.index = match direction {
            TraversalDirection::Next => (self.index + 1) % self.count,
            TraversalDirection::Previous => (self.index + self.count - 1) % self.count,
        };
        true
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct ModalFrame {
    kind: ModalKind,
    invoking_target: FocusTarget,
    control_count: usize,
}

/// Bounded focus state and typed shortcut router.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FocusRouter {
    focused: FocusTarget,
    groups: [RovingState; 5],
    modal_stack: Vec<ModalFrame>,
    ime_composing: bool,
}

impl Default for FocusRouter {
    fn default() -> Self {
        Self::new()
    }
}

impl FocusRouter {
    pub fn new() -> Self {
        Self {
            focused: FocusTarget::Region(FocusRegion::Navigation),
            groups: [RovingState::EMPTY; 5],
            modal_stack: Vec::new(),
            ime_composing: false,
        }
    }

    pub fn focused(&self) -> FocusTarget {
        self.focused
    }

    pub fn ime_composing(&self) -> bool {
        self.ime_composing
    }

    pub fn set_ime_composing(&mut self, composing: bool) {
        self.ime_composing = composing;
    }

    pub fn set_group_count(&mut self, group: RovingGroup, count: usize) {
        self.groups[group.index()].set_count(count);
        self.normalize_target();
        for index in 0..self.modal_stack.len() {
            let invoking_target = self.modal_stack[index].invoking_target;
            let invoking_target = self.clamp_target(invoking_target);
            self.modal_stack[index].invoking_target = invoking_target;
        }
    }

    pub fn group_count(&self, group: RovingGroup) -> usize {
        self.groups[group.index()].count
    }

    pub fn roving_index(&self, group: RovingGroup) -> Option<usize> {
        let state = self.groups[group.index()];
        (state.count > 0).then_some(state.index)
    }

    pub fn focus_region(&mut self, region: FocusRegion) -> bool {
        if self.has_modal() {
            return false;
        }
        self.focused = FocusTarget::Region(region);
        true
    }

    pub fn focus_composer(&mut self) -> bool {
        if self.has_modal() {
            return false;
        }
        self.focused = FocusTarget::Composer;
        true
    }

    pub fn focus_item(&mut self, group: RovingGroup, index: usize) -> bool {
        if self.has_modal() || index >= self.group_count(group) {
            return false;
        }
        self.groups[group.index()].index = index;
        self.focused = group.target(index);
        true
    }

    /// Move the roving index within a tab/tree group, wrapping at both bounds.
    pub fn move_roving(&mut self, group: RovingGroup, direction: TraversalDirection) -> bool {
        if self.has_modal() || !self.groups[group.index()].move_by(direction) {
            return false;
        }
        self.focused = group.target(self.groups[group.index()].index);
        true
    }

    /// Move through the five stable regions. Entering a region focuses its first roving item.
    pub fn traverse(&mut self, direction: TraversalDirection) -> bool {
        if self.has_modal() {
            return self.move_modal(direction);
        }
        let current = self.focused.region().unwrap_or(FocusRegion::Navigation);
        let region = current.next(direction);
        self.focus_region_entry(region);
        true
    }

    pub fn open_modal(&mut self, kind: ModalKind, control_count: usize) -> bool {
        if self.modal_stack.len() >= MAX_MODAL_DEPTH {
            return false;
        }
        let frame = ModalFrame {
            kind,
            invoking_target: self.focused,
            control_count: control_count.min(MAX_MODAL_CONTROLS),
        };
        self.modal_stack.push(frame);
        self.focused = FocusTarget::Modal { kind, index: 0 };
        true
    }

    pub fn close_modal(&mut self, kind: ModalKind) -> bool {
        if self
            .modal_stack
            .last()
            .is_none_or(|frame| frame.kind != kind)
        {
            return false;
        }
        let Some(frame) = self.modal_stack.pop() else {
            return false;
        };
        self.focused = self.clamp_target(frame.invoking_target);
        true
    }

    pub fn close_top_modal(&mut self) -> Option<ModalKind> {
        let kind = self.modal_stack.last().map(|frame| frame.kind)?;
        self.close_modal(kind).then_some(kind)
    }

    pub fn active_modal(&self) -> Option<ModalKind> {
        self.modal_stack.last().map(|frame| frame.kind)
    }

    pub fn modal_depth(&self) -> usize {
        self.modal_stack.len()
    }

    pub fn modal_control_count(&self) -> Option<usize> {
        self.modal_stack.last().map(|frame| frame.control_count)
    }

    /// Route a typed application shortcut. Modal focus traps suppress pane/tab/composer actions.
    pub fn route_shortcut(
        &mut self,
        shortcut: Shortcut,
        cancel_control_focused: bool,
    ) -> ShortcutAction {
        if matches!(shortcut, Shortcut::RequestShutdown) {
            return ShortcutAction::RequestShutdown;
        }
        if let Some(kind) = self.active_modal() {
            return if matches!(shortcut, Shortcut::Escape) {
                self.close_modal(kind);
                ShortcutAction::CloseModal(kind)
            } else {
                ShortcutAction::Ignored
            };
        }
        match shortcut {
            Shortcut::Command1 => {
                self.focus_region(FocusRegion::Navigation);
                ShortcutAction::FocusRegion(FocusRegion::Navigation)
            }
            Shortcut::Command2 => {
                self.focus_region(FocusRegion::ChatTabsHeaderTranscriptComposer);
                ShortcutAction::FocusRegion(FocusRegion::ChatTabsHeaderTranscriptComposer)
            }
            Shortcut::Command3 => {
                self.focus_region(FocusRegion::ViewerTabsContent);
                ShortcutAction::FocusRegion(FocusRegion::ViewerTabsContent)
            }
            Shortcut::Command4 => {
                self.focus_region(FocusRegion::FileTree);
                ShortcutAction::FocusRegion(FocusRegion::FileTree)
            }
            Shortcut::ControlBacktick => {
                self.focus_region(FocusRegion::TerminalTabsContent);
                ShortcutAction::FocusRegion(FocusRegion::TerminalTabsContent)
            }
            Shortcut::PreviousFocusedTab => self.route_focused_tab(TraversalDirection::Previous),
            Shortcut::NextFocusedTab => self.route_focused_tab(TraversalDirection::Next),
            Shortcut::CloseFocusedPresentationTab => match self.focused {
                FocusTarget::Tab { .. } => {
                    ShortcutAction::CloseFocusedPresentationTab(self.focused)
                }
                _ => ShortcutAction::Ignored,
            },
            Shortcut::ComposerEnter => self.route_composer(ComposerAction::Send),
            Shortcut::ComposerShiftEnter => self.route_composer(ComposerAction::InsertNewline),
            Shortcut::Escape => {
                if cancel_control_focused {
                    ShortcutAction::RequestTurnCancellation
                } else {
                    ShortcutAction::CloseTransientSurface
                }
            }
            Shortcut::RequestShutdown => ShortcutAction::RequestShutdown,
        }
    }

    fn route_focused_tab(&mut self, direction: TraversalDirection) -> ShortcutAction {
        let group = match self.focused {
            FocusTarget::Tab { region, .. } => match region {
                FocusRegion::ChatTabsHeaderTranscriptComposer => RovingGroup::ChatTabs,
                FocusRegion::ViewerTabsContent => RovingGroup::ViewerTabs,
                FocusRegion::TerminalTabsContent => RovingGroup::TerminalTabs,
                _ => return ShortcutAction::Ignored,
            },
            _ => return ShortcutAction::Ignored,
        };
        self.move_roving(group, direction);
        ShortcutAction::FocusTab(direction)
    }

    fn route_composer(&self, action: ComposerAction) -> ShortcutAction {
        if !matches!(self.focused, FocusTarget::Composer) || self.ime_composing {
            ShortcutAction::Ignored
        } else {
            ShortcutAction::Composer(action)
        }
    }

    fn focus_region_entry(&mut self, region: FocusRegion) {
        self.focused = FocusTarget::Region(region);
        let group = match region {
            FocusRegion::Navigation => Some(RovingGroup::NavigationTree),
            FocusRegion::ChatTabsHeaderTranscriptComposer => Some(RovingGroup::ChatTabs),
            FocusRegion::ViewerTabsContent => Some(RovingGroup::ViewerTabs),
            FocusRegion::TerminalTabsContent => Some(RovingGroup::TerminalTabs),
            FocusRegion::FileTree => Some(RovingGroup::FileTree),
        };
        if let Some(group) = group.filter(|group| self.group_count(*group) > 0) {
            self.focused = group.target(self.groups[group.index()].index);
        }
    }

    fn move_modal(&mut self, direction: TraversalDirection) -> bool {
        let Some(frame) = self.modal_stack.last() else {
            return false;
        };
        if frame.control_count == 0 {
            return false;
        }
        let FocusTarget::Modal { index, .. } = self.focused else {
            return false;
        };
        let index = match direction {
            TraversalDirection::Next => (index + 1) % frame.control_count,
            TraversalDirection::Previous => (index + frame.control_count - 1) % frame.control_count,
        };
        self.focused = FocusTarget::Modal {
            kind: frame.kind,
            index,
        };
        true
    }

    fn has_modal(&self) -> bool {
        !self.modal_stack.is_empty()
    }

    fn normalize_target(&mut self) {
        self.focused = self.clamp_target(self.focused);
    }

    fn clamp_target(&self, target: FocusTarget) -> FocusTarget {
        match target {
            FocusTarget::Tab { region, index } => {
                let group = match region {
                    FocusRegion::ChatTabsHeaderTranscriptComposer => Some(RovingGroup::ChatTabs),
                    FocusRegion::ViewerTabsContent => Some(RovingGroup::ViewerTabs),
                    FocusRegion::TerminalTabsContent => Some(RovingGroup::TerminalTabs),
                    _ => None,
                };
                group
                    .and_then(|group| self.bounded_item_target(group, index))
                    .unwrap_or(FocusTarget::Region(region))
            }
            FocusTarget::TreeRow { region, index } => {
                let group = match region {
                    FocusRegion::Navigation => Some(RovingGroup::NavigationTree),
                    FocusRegion::FileTree => Some(RovingGroup::FileTree),
                    _ => None,
                };
                group
                    .and_then(|group| self.bounded_item_target(group, index))
                    .unwrap_or(FocusTarget::Region(region))
            }
            other => other,
        }
    }

    fn bounded_item_target(&self, group: RovingGroup, index: usize) -> Option<FocusTarget> {
        (index < self.group_count(group)).then_some(group.target(index))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stable_traversal_enters_each_nonempty_roving_region() {
        let mut router = FocusRouter::new();
        router.set_group_count(RovingGroup::NavigationTree, 1);
        router.set_group_count(RovingGroup::ChatTabs, 2);
        router.set_group_count(RovingGroup::ViewerTabs, 1);
        router.set_group_count(RovingGroup::TerminalTabs, 1);
        router.set_group_count(RovingGroup::FileTree, 1);

        assert!(router.traverse(TraversalDirection::Next));
        assert_eq!(
            router.focused(),
            FocusTarget::Tab {
                region: FocusRegion::ChatTabsHeaderTranscriptComposer,
                index: 0
            }
        );
        router.traverse(TraversalDirection::Next);
        assert_eq!(
            router.focused(),
            FocusTarget::Tab {
                region: FocusRegion::ViewerTabsContent,
                index: 0
            }
        );
        router.traverse(TraversalDirection::Next);
        assert_eq!(
            router.focused(),
            FocusTarget::Tab {
                region: FocusRegion::TerminalTabsContent,
                index: 0
            }
        );
        router.traverse(TraversalDirection::Next);
        assert_eq!(
            router.focused(),
            FocusTarget::TreeRow {
                region: FocusRegion::FileTree,
                index: 0
            }
        );
        router.traverse(TraversalDirection::Next);
        assert_eq!(
            router.focused(),
            FocusTarget::TreeRow {
                region: FocusRegion::Navigation,
                index: 0
            }
        );
    }

    #[test]
    fn roving_indices_wrap_and_empty_groups_are_safe() {
        let mut router = FocusRouter::new();
        assert!(!router.move_roving(RovingGroup::ChatTabs, TraversalDirection::Next));
        assert!(!router.focus_item(RovingGroup::ChatTabs, 0));
        router.set_group_count(RovingGroup::ChatTabs, 3);
        assert!(router.focus_item(RovingGroup::ChatTabs, 2));
        assert!(router.move_roving(RovingGroup::ChatTabs, TraversalDirection::Next));
        assert_eq!(router.roving_index(RovingGroup::ChatTabs), Some(0));
        assert!(router.move_roving(RovingGroup::ChatTabs, TraversalDirection::Previous));
        assert_eq!(router.roving_index(RovingGroup::ChatTabs), Some(2));
        router.set_group_count(RovingGroup::ChatTabs, 0);
        assert_eq!(router.roving_index(RovingGroup::ChatTabs), None);
        assert_eq!(
            router.focused(),
            FocusTarget::Region(FocusRegion::ChatTabsHeaderTranscriptComposer)
        );
    }

    #[test]
    fn modal_stack_traps_focus_and_restores_nested_invoking_targets() {
        let mut router = FocusRouter::new();
        router.set_group_count(RovingGroup::FileTree, 4);
        router.focus_item(RovingGroup::FileTree, 3);
        assert!(router.open_modal(ModalKind::Credential, 2));
        assert_eq!(router.active_modal(), Some(ModalKind::Credential));
        assert!(router.traverse(TraversalDirection::Next));
        assert_eq!(
            router.focused(),
            FocusTarget::Modal {
                kind: ModalKind::Credential,
                index: 1
            }
        );
        assert!(router.open_modal(ModalKind::Approval, 1));
        assert_eq!(
            router.focused(),
            FocusTarget::Modal {
                kind: ModalKind::Approval,
                index: 0
            }
        );
        assert!(router.close_modal(ModalKind::Approval));
        assert_eq!(
            router.focused(),
            FocusTarget::Modal {
                kind: ModalKind::Credential,
                index: 1
            }
        );
        assert!(router.close_modal(ModalKind::Credential));
        assert_eq!(
            router.focused(),
            FocusTarget::TreeRow {
                region: FocusRegion::FileTree,
                index: 3
            }
        );
    }

    #[test]
    fn shortcut_routing_is_typed_and_has_no_global_approval_action() {
        let mut router = FocusRouter::new();
        assert_eq!(
            router.route_shortcut(Shortcut::Command3, false),
            ShortcutAction::FocusRegion(FocusRegion::ViewerTabsContent)
        );
        assert_eq!(
            router.focused(),
            FocusTarget::Region(FocusRegion::ViewerTabsContent)
        );
        assert_eq!(
            router.route_shortcut(Shortcut::ControlBacktick, false),
            ShortcutAction::FocusRegion(FocusRegion::TerminalTabsContent)
        );
        assert_eq!(
            router.route_shortcut(Shortcut::RequestShutdown, false),
            ShortcutAction::RequestShutdown
        );
        router.set_group_count(RovingGroup::ChatTabs, 2);
        router.focus_item(RovingGroup::ChatTabs, 0);
        assert_eq!(
            router.route_shortcut(Shortcut::CloseFocusedPresentationTab, false),
            ShortcutAction::CloseFocusedPresentationTab(router.focused())
        );
        assert_eq!(
            router.route_shortcut(Shortcut::NextFocusedTab, false),
            ShortcutAction::FocusTab(TraversalDirection::Next)
        );
        assert!(router.open_modal(ModalKind::Approval, 2));
        assert_eq!(
            router.route_shortcut(Shortcut::Command1, false),
            ShortcutAction::Ignored
        );
    }

    #[test]
    fn composer_shortcuts_require_focus_and_inactive_ime() {
        let mut router = FocusRouter::new();
        assert_eq!(
            router.route_shortcut(Shortcut::ComposerEnter, false),
            ShortcutAction::Ignored
        );
        router.focus_composer();
        router.set_ime_composing(true);
        assert_eq!(
            router.route_shortcut(Shortcut::ComposerEnter, false),
            ShortcutAction::Ignored
        );
        assert_eq!(
            router.route_shortcut(Shortcut::ComposerShiftEnter, false),
            ShortcutAction::Ignored
        );
        router.set_ime_composing(false);
        assert_eq!(
            router.route_shortcut(Shortcut::ComposerEnter, false),
            ShortcutAction::Composer(ComposerAction::Send)
        );
        assert_eq!(
            router.route_shortcut(Shortcut::ComposerShiftEnter, false),
            ShortcutAction::Composer(ComposerAction::InsertNewline)
        );
    }

    #[test]
    fn escape_has_transient_and_cancel_control_semantics() {
        let mut router = FocusRouter::new();
        assert_eq!(
            router.route_shortcut(Shortcut::Escape, false),
            ShortcutAction::CloseTransientSurface
        );
        assert_eq!(
            router.route_shortcut(Shortcut::Escape, true),
            ShortcutAction::RequestTurnCancellation
        );
        router.open_modal(ModalKind::Credential, 1);
        assert_eq!(
            router.route_shortcut(Shortcut::Escape, true),
            ShortcutAction::CloseModal(ModalKind::Credential)
        );
        assert_eq!(router.modal_depth(), 0);
    }

    #[test]
    fn all_counts_and_modal_depth_are_bounded() {
        let mut router = FocusRouter::new();
        router.set_group_count(RovingGroup::FileTree, usize::MAX);
        assert_eq!(router.group_count(RovingGroup::FileTree), MAX_ROVING_ITEMS);
        assert!(router.focus_item(RovingGroup::FileTree, MAX_ROVING_ITEMS - 1));
        assert!(!router.focus_item(RovingGroup::FileTree, MAX_ROVING_ITEMS));
        for index in 0..MAX_MODAL_DEPTH {
            assert!(router.open_modal(ModalKind::Credential, MAX_MODAL_CONTROLS + index));
        }
        assert_eq!(router.modal_depth(), MAX_MODAL_DEPTH);
        assert!(!router.open_modal(ModalKind::Approval, usize::MAX));
        assert_eq!(router.modal_control_count(), Some(MAX_MODAL_CONTROLS));
    }

    #[test]
    fn shortcut_escape_does_not_reuse_a_stale_modal_kind() {
        let mut router = FocusRouter::new();
        router.open_modal(ModalKind::Credential, 1);
        assert!(!router.close_modal(ModalKind::Approval));
        assert_eq!(router.active_modal(), Some(ModalKind::Credential));
    }
}
