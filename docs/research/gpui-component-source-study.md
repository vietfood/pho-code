# `gpui-component` source study for Phase 6

- Status: Complete for design; integration remains unqualified
- Audited repository: `refs/gpui-component`
- Audited revision: `b004e595cf5de98a73b6b561394a559a94ae1e2a`
- Audited package version: `0.5.2`
- Audit date: 2026-07-17
- Consumer: [GPUI workbench architecture](../architecture/gpui-workbench.md)

## Question

Can the audited `gpui-component` revision supply the visual primitives for Pho Code's four-pane workbench without adding a second GPUI source identity or moving filesystem, process, session, or runtime ownership into views?

## Finding

The component library is a strong source for presentation primitives, but it is not currently a drop-in Pho Code dependency. Its resizable layouts, tabs, sidebar, tree, virtual lists, Markdown view, multiline input, title bar, theme, and assets map well to Phase 6. Its examples frequently own raw filesystem/process work and must be treated as API demonstrations rather than application architecture.

The blocking integration issue is version identity: Pho Code pins `gpui` and `gpui_platform` to Zed revision `7cf50a771f54427f76b4584030c7b3b66f4e39f5`, while the audited component manifest uses an unqualified Zed Git URL and its lock resolves Zed revision `aeeacf5439b2d30d01e38d65d767e6f31b255ecc`. Adding it unchanged would resolve two incompatible GPUI type identities. Phase 6 must select and qualify one coherent Zed revision for every direct and transitive Zed package before component adoption.

## Evidence classification

The source paths and lock observations below are **Verified** against the audited submodule and current Pho Code checkout. Integration strategies and production-use recommendations are **Reasoned** until the Phase 6 compatibility spike actually compiles and runs on the supported macOS target.

## Component mapping

| Workbench need | Audited component | Evidence and intended use | Boundary |
| --- | --- | --- | --- |
| Four-pane resizing | `h_resizable`, `v_resizable`, `ResizablePanel` | `crates/ui/src/resizable/**`; nested fixed groups fit the shell and viewer/terminal split | Persist only UI geometry; no domain state in panel objects |
| Optional dock/tabs | `DockArea`, `DockItem`, `Panel`, `TabBar`, `Tab` | `crates/ui/src/dock/**`, `crates/ui/src/tab/**` | Prefer fixed resizable composition until dock behavior is qualified |
| Workspace/chat sidebar | `Sidebar`, `SidebarMenu`, `SidebarMenuItem` | `crates/ui/src/sidebar/**` and `examples/sidebar` | Rows render Pho projections and dispatch typed intents only |
| File tree | `TreeState`, `TreeItem`, `tree` | `crates/ui/src/tree.rs`; uniform-list virtualization and keyboard navigation are reusable | The story's `read_dir`/absolute IDs are not reusable architecture |
| Read-only text view | Code-editor mode on `InputState` | `crates/ui/src/input/state.rs` and editor docs/story | No first-class read-only mode exists; disabled input is not yet an accepted viewer |
| Transcript | `VirtualList`, `TextView` | `crates/ui/src/virtual_list.rs`, `crates/ui/src/text/**` | Virtualize immutable rows; do not create one unbounded document |
| Markdown | `TextView::markdown`, Markdown extensions | `crates/ui/src/text/text_view.rs`, `markdown_ext.rs` | Sanitize images/links/HTML and preserve canonical source |
| Composer | multiline/auto-grow `InputState` and `Input` | `crates/ui/src/input/**` | Controlled draft only; send/cancel remain application intents |
| Title bar | `TitleBar::title_bar_options` | `crates/ui/src/title_bar.rs` | Preserve macOS traffic-light and drag behavior through the real app entry point |
| Theme/icons | `gpui_component::init`, `Root`, assets crate | `crates/ui/src/lib.rs`, `crates/assets/src/lib.rs`, hello-world example | Initialize once before component use and embed reviewed local assets |

## Dependency identity

Pho Code's current lock contains one GPUI family from the qualified Zed revision and one application-owned Tokio runtime. `docs/implementation/dependencies.md` already records that `gpui-component` was deferred because its manifest would add a second source identity.

The audited component root declares unqualified Zed dependencies for `gpui`, `gpui_platform`, `gpui_web`, `gpui_macros`, and `reqwest_client`. Pinning only `gpui` is insufficient because GPUI platform, macros, and related Zed types must share one source revision. A compatibility change must cover the complete selected Zed family and then regenerate one lockfile.

Two strategies are viable enough to spike:

1. Advance Pho Code's direct Zed dependencies to the component's audited Zed revision and consume a component revision/fork whose Zed dependencies are pinned to that same revision.
2. Maintain a narrow component compatibility fork that pins every Zed dependency to Pho Code's current revision, if the component source compiles and behaves correctly against it.

The first strategy is the recommended starting point because the component revision was developed and locked against its newer Zed revision. Neither strategy is accepted until current Pho Code runtime, command, and native scaffold checks pass. `refs/**` remains read-only and cannot serve as the production dependency or be modified to force compatibility.

The integration gate verifies lock source strings and runs `cargo tree -d` plus the current offline source-family check. There must be one `gpui`, one `gpui_platform`, one `gpui_macros` family, one intended HTTP stack, and no unexplained duplicate runtime/package families.

## Feature and footprint findings

The component crate declares Apache-2.0 and has no listed default Cargo feature. Tree-sitter support is optional, but the broad `tree-sitter-languages` feature activates roughly three dozen grammars. The read-only viewer should qualify only a small language set or a separate highlighter rather than enabling the broad set by default.

Always-on component dependencies include Markdown/HTML parsing, `ropey`, `notify`, `smol`, async channels/futures, `lsp-types`, and other UI support. The component workspace lock has more package entries than Pho Code's current lock, but it includes story/workspace feature unions and therefore overstates the UI-only footprint. Phase 6 must measure a minimal consumer target rather than report the upstream workspace lock as the production graph.

Known collision points include upstream `notify 7` beside Pho Code's pinned `notify 9.0.0-rc.4`, and multiple upstream `lsp-types` versions. Duplicates are not automatically defects, but every retained identity needs a feature, license, binary-size, and supported-macOS justification.

## Source hazards

### Examples that perform application work

The file-tree story recursively calls `std::fs::read_dir` and constructs path-based item IDs. The Markdown math story calls an external Node process. Dock examples write layout JSON directly. Streaming examples use their own channels and timers. These patterns are acceptable inside a component gallery but violate Pho Code's view/runtime boundary and bounded-service rules.

Production views may reuse the widget API only. Workspace, file, Git, render, preference, and PTY operations must remain typed coordinator-owned services.

### Dock split defect risk

At the audited revision, `DockItem::split_with_sizes` appears to add the same input items in two consecutive loops while `StackPanel::add_panel` appends. This may duplicate split children. A focused native test must confirm or reject that inference. Until then, the fixed four-pane shell should use nested `h_resizable`/`v_resizable` groups instead of relying on serialized dock splits.

### No first-class read-only editor

The code-editor facility is an editable `InputState`. It can be disabled, but disabled semantics and accessibility are not equivalent to a selectable read-only viewer. Phase 6 must qualify a read-only wrapper/custom view before adopting the editor story. LSP, completion, folding, formatting, and writable buffer facilities remain disabled.

### Markdown network surface

The component's Markdown image node can render a URI and its link node can call the application URL opener after a click. Provider-authored Markdown therefore cannot be passed through unchanged. Pho Code must disable remote images and route validated clicks through its own typed link handler.

### Math story is not production support

There is no built-in production LaTeX renderer. The story's custom plugin synchronously launches `node`, searches a development `docs/node_modules/mathjax-full` directory, passes formula source in environment variables, has no timeout/output/cancellation bound, and uses an unbounded global cache. It also works around the absence of inline plugins by replacing whole paragraphs. Phase 6 uses this only as parser/rendering evidence.

## Compatibility spike

The Phase 6 spike creates a minimal non-release target that uses only the component UI crate and reviewed local assets. It must initialize `gpui-component`, wrap the first view in `Root`, and exercise the title bar, nested resizable layout, tabs, sidebar rows, tree, one Markdown row, one composer, and a candidate read-only code view.

The spike runs on the supported macOS architecture and records:

- the chosen Zed/component revisions and exact Cargo sources;
- `cargo tree -e features`, `cargo tree -d`, license/advisory output, and release binary size delta;
- startup, first-window, theme, assets, title-bar traffic lights, keyboard focus, resize, and shutdown behavior;
- duplicate-panel detection for dock APIs if they remain under consideration;
- a 100,000-row/tree-entry projection stress fixture and long Markdown-row fixture without view-owned I/O;
- the read-only viewer's selection, search, accessibility, and inability to mutate source;
- absence of network, filesystem, process, Keychain, and journal work from GPUI render paths.

Failure to align one GPUI source identity or to make selected components obey the presentation boundary blocks component adoption, not Phase 6 as a whole. Pho Code may implement the required primitives directly against GPUI while preserving the same architecture.
