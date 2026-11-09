---
name: CloudPDF Studio (Swiss High-Precision Specimen)
description: Production-grade Swiss architectural design system for Cloud-Native PDF Intelligence
colors:
  void: "#09090b"
  subtle: "#121215"
  surface: "#18181b"
  raised: "#222226"
  border: "#27272a"
  border-strong: "#3f3f46"
  ink: "#fafafa"
  muted: "#a1a1aa"
  faint: "#71717a"
  accent: "#e11d48"
  accent-hover: "#f43f5e"
  accent-faint: "rgba(225, 29, 72, 0.12)"
  telemetry-emerald: "#10b981"
  telemetry-amber: "#f59e0b"
  telemetry-rose: "#f43f5e"
typography:
  display:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "3rem"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.035em"
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
    fontSize: "0.6875rem"
    letterSpacing: "0.04em"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.void}"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
  card-specimen:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "20px"
---

# Design System — Swiss High-Precision Specimen

## Overview
CloudPDF Studio is an architectural, precision-engineered cloud PDF platform. Its visual grammar refuses conventional AI-generated web tropes (saturated indigo gradients, blurry glowing halos, cards nested inside cards, and generic rounded icon tiles). Instead, it adopts the discipline of Swiss typography, architectural schematics, and high-security vault machinery.

## Colors
- **Void Ground (`#09090b`):** Deepest obsidian canvas providing complete contrast isolation.
- **Recessed Surface (`#121215`):** Subdued ground for grouped panels and secondary containers.
- **Specimen Surface (`#18181b`):** Primary interactive cards, workbench tool runner zones, and data tables.
- **Raised Hover (`#222226`):** Immediate contrast feedback on interactive surface hover.
- **Hairline Borders (`#27272a`, `#3f3f46`):** 1px structural gridlines separating components without bulky visual weight.
- **High-Contrast Ink (`#fafafa`):** Primary white text with maximum legibility.
- **Muted Metadata (`#a1a1aa`, `#71717a`):** Secondary structural labels and descriptions.
- **Signal Vermillion Accent (`#e11d48`):** Restrained signal color for critical states and high-priority indicators.
- **Telemetry Indicators:** Emerald (`#10b981`), Amber (`#f59e0b`), Rose (`#f43f5e`).

## Typography
- **Display & Headings:** System grotesk with tight letter-spacing (`tracking-tighter`, `tracking-tight`), heavy bold weights, and solid monochrome color. Zero gradient text.
- **Body:** Neutral, clean 14px / 12px font scale with generous line height (`leading-relaxed`) ensuring effortless scanability across technical parameters.
- **Monospace Metadata:** Dense `ui-monospace` for index tags (`[DOC-01]`, `[SEC-01]`), AWS region telemetry, cryptographic tokens, byte sizes, and timestamps.
- **Tabular Numerals:** Native `tabular-nums` applied to all measurements and counters.

## Layout
- **Architectural Asymmetry:** Split-hero layout balancing typographic narrative with a live telemetry readout.
- **Section Rhythm:** Structured spacing using 8px-scale vertical padding (`py-10`, `py-14`, `py-20`).
- **Container Architecture:** Constrained `max-w-7xl` and `max-w-4xl` bounds preventing uncontrolled line-length stretching.

## Elevation & Depth
- **Zero Faux Blur / Zero Glows:** Elevation is established strictly through 1px hairline borders (`#27272a`) and tonal value shifts between Void (`#09090b`), Surface (`#18181b`), and Raised (`#222226`).
- **No Decorative Halos:** Colored drop-shadows and artificial radial glows are banned.

## Shapes
- **Sharp Precision Radii:** Controlled small corner rounding (`rounded`, 4px–8px) preserving the architectural feel.
- **Zero Pill Badges on Cards:** Badges are rectangular with subtle 4px borders (`rounded px-1.5 py-0.5 text-[10px] font-mono`).

## Components
- **Masthead (Navbar):** Monolithic branding with bracketed specimen versioning, live AWS RDS telemetry readout with animated ping dot, and high-contrast auth controls.
- **Specimen Tool Cards:** 1px hairline borders, index tags (`[DOC-01]`), integrated technical icons without floating colored tile backgrounds, and single-click touch targets.
- **Workbench (ToolRunner):** Precision dropzone with dashed border, queued document management with reordering, responsive option inputs, and comprehensive execution reports.
- **Cloud Vault (Workspace):** Tabular data ledger with storage quota telemetry, presigned S3 downloads, and deletion safeguards.
- **Pipeline Blueprint (WorkflowStudio):** Architectural node visualizer for chained document transformations.
- **Authentication:** Distraction-free, centered cryptographic login, registration, and email verification portals.

## Do's and Don'ts
- **DO** use solid, high-contrast text and let heading weight establish hierarchy.
- **DO** use monospace tabular numerals for all metrics, dates, and byte counts.
- **DO** tint secondary and muted text from the neutral or foreground palette; never use gray text on colored backgrounds.
- **DON'T** introduce purple-to-indigo gradients, colored text fills, or glassmorphic blur decorations.
- **DON'T** place rounded icon tiles floating above headings.
- **DON'T** place kickers or eyebrow pills above headings.
- **DON'T** nest cards inside cards with identical border weights.
