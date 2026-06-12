# 启衡运动处方系统 Design System

## Product Register

This is a restrained clinical operations product. The interface serves regulated healthcare workflows: risk triage, AI-assisted exercise prescription review, audit evidence, and approved research export. It should feel accountable, dense, calm, and safe rather than like a consumer fitness app or a marketing surface.

## Color

Use a restrained light system with clinical neutrals and semantic state colors. Accent color is reserved for primary actions, active navigation, and selected states.

| Token | Value | Use |
| --- | --- | --- |
| `--color-bg` | `#eef3f7` | App background |
| `--color-bg-strong` | `#dfe9f0` | Sidebar and page bands |
| `--color-surface` | `#ffffff` | Main work surfaces |
| `--color-surface-muted` | `#f7fafc` | Secondary panels |
| `--color-line` | `#d8e2ea` | Borders and separators |
| `--color-ink` | `#132235` | Primary text |
| `--color-muted` | `#5f7186` | Secondary text |
| `--color-primary` | `#145c72` | Clinical brand anchor |
| `--color-action` | `#1d6fd8` | Primary action |
| `--color-teal` | `#0f766e` | Operational positive |
| `--risk-r0` | `#228b4e` | R0 safe |
| `--risk-r1` | `#087c83` | R1 caution but executable |
| `--risk-r2` | `#b76504` | R2 expert review |
| `--risk-r3` | `#bf3030` | R3 referral/no training |

Risk colors must never be the only signal. Pair color with text labels, icons, and action copy.

## Type

Use the system sans stack for reliability in Chinese and English UI: `-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`.

| Role | Size | Weight |
| --- | --- | --- |
| Page title | 22px | 700 |
| Section title | 17px | 650 |
| Body | 14px | 400 |
| Dense data | 13px | 400 |
| Metadata | 12px | 500 |

Avoid display-scale headings inside the app. Product screens should load directly into the task.

## Spacing, Radius, Shadow

Use `4 / 8 / 12 / 16 / 24 / 32` spacing. Cards and panels use 8px radius. Pills and tags can be full rounded. Default cards should prefer borders and tonal surfaces over broad shadows. Shadow is only for sticky headers, drawers, and elevated action bars.

## Components

### App Shell

The shell has a grouped role sidebar, real breadcrumb labels, a page task statement, and compact operational context in the header. The header should answer: where am I, what is the current task, what state matters now?

### Clinical Status

Use one status vocabulary across the app:

- R0/R1/R2/R3 risk status
- Review status: pending, in review, approved, rejected, referred
- Exercise gate: can exercise, blocked, red flag
- Readiness: ready, degraded, blocked
- Export approval: pending, approved, rejected, expired, downloaded

### Tables

Tables are dense but readable. Use sticky or persistent filters for high-volume pages. Row actions must be explicit verbs. High-risk rows use badges and metadata, not thick side borders.

### Forms

Long forms are grouped by task: required minimum, optional enrichment, clinical triggers, evidence, governance. Use inline validation and avoid showing every advanced field at once when the task can be staged.

### Charts

Charts live in named sections: safety, business, reference data, model, research. Empty trends should show a data explanation card instead of an empty canvas.

### Empty And Error States

Every empty state should say why it is empty and the next action. Loading states should reserve layout height. Error states should identify permission, dependency, or data-readiness cause when possible.

## Page Patterns

- User dashboard: "today pass" first, charts later.
- User onboarding: staged data collection with a fixed clinical explanation panel.
- Risk result: report layout with risk decision, rule hits, data sources, and forbidden actions.
- Prescription page: publication panel, visibility gate, version timeline.
- Today exercise: pre-exercise safety gate before feedback.
- Expert review: priority inbox, editor, evidence tabs, fixed publish action.
- Admin dashboard: readiness and operating blockers before KPI charts.
- Content/rules/users: master-detail or staged authoring, not all fields at once.
- Research/admin export: separate researcher analysis from administrator approval queue.
