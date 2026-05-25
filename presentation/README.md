# TrustStream — Pre-Defence Presentation

This folder contains the pre-defence presentation deck for the TrustStream thesis project.

## File

- `TrustStream-PreDefence.md` — Marp-formatted slide deck (~22 slides).

## How to View / Export

The deck is written in [Marp](https://marp.app/) — a Markdown-based presentation format. Choose any of the options below.

### Option 1 — VS Code (easiest, recommended)

1. Install the **"Marp for VS Code"** extension.
2. Open `TrustStream-PreDefence.md`.
3. Click the Marp preview icon in the top-right of the editor.
4. Use the export button to save as **PDF**, **PPTX**, or **HTML**.

### Option 2 — Marp CLI (command line)

```bash
# Install once (Node.js required)
npm install -g @marp-team/marp-cli

# From the presentation/ folder, run any of the following:

# Export to PDF
marp TrustStream-PreDefence.md --pdf --allow-local-files

# Export to PowerPoint (.pptx) — best for university defence
marp TrustStream-PreDefence.md --pptx --allow-local-files

# Export to standalone HTML (open in browser, present in fullscreen)
marp TrustStream-PreDefence.md --html --allow-local-files

# Live preview server with hot reload
marp -s .
```

### Option 3 — Marp Web

1. Go to https://web.marp.app/
2. Paste the contents of `TrustStream-PreDefence.md`.
3. Export to PDF / PPTX / HTML from the menu.

## Slide Order (22 slides)

1. Title
2. Outline
3. Motivation
4. Research Gaps
5. Project Overview
6. System Architecture
7. Tech Stack
8. Smart Contract — 3-Org Consortium
9. Smart Contract — Function Surface
10. C2PA — Video (8 assertions)
11. C2PA — Image (7 assertions)
12. Video Upload Pipeline
13. Image Upload Pipeline (IPFS-only)
14. Verification Flow
15. Sync / Recovery Flow
16. Video Forensics — 4 Modules
17. Image Forensics — 2 Modules
18. Score Fusion Engine
19. Experimental Results
20. Frontend — Facebook-style Timeline
21. Immutability Guarantees
22. Storage Summary
23. Blockchain & IPFS Info
24. Key Contributions Recap
25. Live Demo Walkthrough
26. Future Work
27. Q&A — Thank You

## Editing Tips

- Each `---` marks a new slide.
- The `<!-- _class: lead -->` directive turns a slide into a centered cover-style slide.
- The `<div class="columns">` blocks render two-column layouts.
- All custom styles are defined in the `style:` block at the top — change theme colors in one place.

## Pre-Defence Checklist

- [ ] Export to PPTX and rehearse with the actual file open
- [ ] Test the live demo on the same machine you'll present from (backend + frontend running, MetaMask connected to Sepolia)
- [ ] Have a fallback PDF in case projector doesn't render PPTX correctly
- [ ] Time the talk: target ~15 minutes for slides + ~5 minutes for the live demo
- [ ] Prepare 2–3 anticipated questions per chapter (gaps, contract design, forensic formula, immutability)
