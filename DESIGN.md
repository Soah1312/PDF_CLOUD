---
name: CloudPDF Studio (The Bindery)
description: Print-shop workbench design system for CloudPDF Studio — light, warm, paper-and-ink.
tokens:
  paper: "#F1E9DA"
  vellum: "#FAF6EC"
  kraft: "#E4D7BE"
  ink: "#241B14"
  ink-soft: "#5C4F42"
  rule: "#D5C6A8"
  red: "#D9441F"
  red-dark: "#B83515"
  cyan: "#27467A"
  marigold: "#F0B429"
  moss: "#4A6B3A"
  tints:
    merge: "#F6DFA4"
    split: "#CFDDBF"
    compress: "#F0C9B4"
    convert: "#C9D7E8"
    protect: "#CBC3D6"
typography:
  display:
    family: "'Gloock', 'Young Serif', Georgia, serif"
    leading: 1.02
  body:
    family: "'Schibsted Grotesk', system-ui, -apple-system, sans-serif"
    weights: [400, 500, 600]
  mono:
    family: "'Martian Mono', ui-monospace, SFMono-Regular, monospace"
    weights: [400, 500, 600]
    letterSpacing: "0.06em"
radii:
  sm: "4px"
  base: "6px"
  lg: "8px"
shadows:
  ink-red: "0 2px 0 #B83515"
  ink-drag: "0 8px 16px -2px rgba(36,27,20,0.18), 0 2px 0 #241B14"
motion:
  t-fast: "120ms"
  t-base: "200ms"
  t-slow: "320ms"
  t-stamp: "600ms"
  ease-out: "cubic-bezier(0.2, 0.8, 0.2, 1)"
---

# Design System — The Bindery

## Philosophy
"The Bindery" reimagines CloudPDF Studio as a master craftsman's print-shop workbench. It repudiates the generic dark AI/SaaS aesthetics of glowing purples, synthetic neon gradients, and floating glassmorphism. In their place is the quiet authority of physical craft: tactile paper grounds, dense typographic ink, crisp 1px rule lines, and purposeful micro-mechanical motion.

## Color Palette (Light Theme Only)
- **Paper Ground (`--paper`, `#F1E9DA`):** Warm unbleached paper sheet forming the foundation ground.
- **Vellum Surface (`--vellum`, `#FAF6EC`):** Refined card and workbench panel surfaces resting on paper.
- **Kraft Recessed (`--kraft`, `#E4D7BE`):** Tactile recessed trays, dropped-file areas, and secondary panels.
- **Master Ink (`--ink`, `#241B14`):** Deep lampblack ink for crisp, high-contrast typography (13.5:1 contrast against paper).
- **Soft Ink (`--ink-soft`, `#5C4F42`):** Walnut-tinted secondary typography and descriptive annotations (6.5:1 contrast).
- **Rule Lines (`--rule`, `#D5C6A8`):** 1px structural hairline borders defining workbench edges.
- **Vermillion Red (`--red`, `#D9441F`, shadow `#B83515`):** Signal ink for primary workbench actions, press operations, and seals.
- **Prussian Cyan (`--cyan`, `#27467A`):** Focused links, accessible focus rings (2px solid with 2px offset).
- **Marigold Highlight (`--marigold`, `#F0B429`):** Hand-annotated text highlights, selection fills, and keyboard focus states.
- **Moss Green (`--moss`, `#4A6B3A`):** Verification stamps, completion badges, and secure status indicators.

### Tool Tints (Muted Workshop Bins)
- **Merge (`--tint-merge`, `#F6DFA4`):** Manila folder tint (`bind`).
- **Split (`--tint-split`, `#CFDDBF`):** Sage drafting mat tint (`cut`).
- **Compress (`--tint-compress`, `#F0C9B4`):** Terracotta press tint (`press`).
- **Convert (`--tint-convert`, `#C9D7E8`):** Blueprint cyan tint (`render` / `compile`).
- **Protect & Canary (`--tint-protect`, `#CBC3D6`):** Archival seal lavender tint (`seal` / `audit`).

## Typography
- **Headlines & Big Display:** `Gloock` (with fallback to `Young Serif` then `Georgia`). Editorial authority with tight display leading (~1.02) and left-aligned discipline.
- **UI & Prose:** `Schibsted Grotesk` (weights 400, 500, 600). Clear, neutral, modern European grotesque typography.
- **Technical Annotations & Telemetry:** `Martian Mono` (weights 400, 500). Uppercase, small, with tabular numerals (`tabular-nums`) and deliberate letter-spacing (`0.06em`).

## Structural Rules & Grid
- **12-Column Editorial Grid:** Max content width ~1200px. Left-aligned hierarchy, generous whitespace.
- **Hairlines over Shadows:** Flat surfaces bounded by 1px `--rule` lines. Elevation is achieved through tone shifts (`paper` $\rightarrow$ `kraft` $\rightarrow$ `vellum`) rather than blurry drop-shadows.
- **6px Radii:** Snug, precision corners (`rounded-[6px]`). No bulbous pill-shaped buttons.
- **Paper Grain:** Ultra-subtle SVG `feTurbulence` grain overlay (~3% opacity) giving organic warmth to the viewport.

## Motion & Tactile Feedback
- Motion tokens: `--t-fast: 120ms`, `--t-base: 200ms`, `--t-slow: 320ms`, `--t-stamp: 600ms`.
- Custom easing: `--ease-out: cubic-bezier(0.2, 0.8, 0.2, 1)`.
- Physical buttons: 1px press translation with offset ink shadow collapse (`0 2px 0 #B83515`).
- Respects `prefers-reduced-motion` across all interactions.
