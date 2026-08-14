# README captures

Drop GIFs here using the filenames in the root [README](../../README.md). This page is the recording sheet: window setup, prompts, and what must be visible.

## Window

- Record the Pho Code window only (hidden-inset titlebar). Do not include the menu bar, Dock, or another editor.
- Size: 1280×800 or 1440×900. Dark mode, Default or Catppuccin.
- Permission mode: **okay, you got it** unless the shot says otherwise.
- Model: whatever you actually use. Do not fake provider chrome.
- Keep each clip 8–18 seconds. Loop. No audio.
- Export with [gifski](https://gif.ski) or `ffmpeg` so each file stays under ~4 MB.

```bash
# after a .mov from CleanShot / Kap / QuickTime
ffmpeg -i shot.mov -vf "fps=12,scale=1280:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -loop 0 docs/captures/01-conversation.gif
```

## Privacy

Use this repository as the workspace for read-only shots. For Trash, use a throwaway folder that is not this repo.

Do not record API keys, PATs, `PHO_CODE_AGENT_DIR`, home-directory paths you would not publish, or other people's code. Prefer **Stop** over waiting out a long answer.

## Shot list

Filenames, start state, prompt, and must-see UI are under each feature in the root README. Record in that order so the clips match the numbered sections.
