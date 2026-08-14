---
name: repository-investigation
description: Trace behavior and dependencies, distinguish evidence from inference, and report file/line evidence before proposing changes. Use when investigating how a repository works, locating the source of a behavior, or explaining a system from the code.
---

# Repository investigation

Investigate the selected workspace from evidence, not from guesswork.

## Do this first

1. Name the behavior, symbol, or path you are tracing.
2. Search and read the actual files. Prefer local retrieval and file reads over shell.
3. Record file and line evidence for each claim.
4. Separate **observed in the repo** from **inferred**.

## Report shape

- **Question:** what you are answering
- **Evidence:** file paths and line ranges
- **Inference:** only after evidence, labeled as inference
- **Open questions:** what the files do not settle

Do not propose edits until the owner asks for a change. Do not invent files, APIs, or tests that you have not seen.
