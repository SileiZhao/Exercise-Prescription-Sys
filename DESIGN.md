# Design

## Visual System

- Surface: page background `#f5f7fb`, cards `#ffffff`, borders `#e5eaf2`.
- Text: primary `#172033`, secondary `#667085`.
- Brand and actions: primary `#1677ff`, medical deep teal `#0b3f5c`, auxiliary teal `#0f766e`.
- Risk colors are fixed: R0 `#2f9e44`, R1 `#0f766e`, R2 `#d97706`, R3 `#d9363e`.
- Cards use 8px radius and very light shadow `0 8px 24px rgba(24,44,74,.06)`.

## Typography

Use the existing system sans stack. Product typography is fixed scale, not fluid: page title 22-24px, section title 16-18px, table/form body 13-14px, helper text 12px. Letter spacing is 0. Do not use negative tracking.

## Layout

Default app layout is left role navigation, top page context, central workspace. Sidebar width 188-208px, top bar 64px, normal page content max-width 1280px, expert review can use full width. Section gap 16px; card padding 16-20px. Below 900px, sidebar becomes Drawer and multi-column workspaces stack.

## Components

Use React + Vite + Ant Design + ECharts + lucide-react + framer-motion. Do not replace the UI framework. Use lucide icons only; icon-only buttons need tooltips. Loading uses Skeleton or Spin with copy. Empty states provide a short explanation and next action. Error states use Alert only when the content is genuinely blocking or safety-critical.

## Motion

Use 120-180ms fade plus translateY(4px) for page/state entry. Hover only deepens border or light shadow. Respect `prefers-reduced-motion`.

## Product Surfaces

- Public home: compact platform workbench entry, not a marketing hero.
- User: today's safety state, FITT-VP summary, feedback warnings, onboarding wizard with six data categories.
- Expert: true three-column review workstation with queue, structured prescription editor, rules/evidence/version/audit sidebar.
- Admin: operations cockpit with KPI strip, charts, rules/templates/knowledge/actions/users/audit/research export.
- Research: de-identified aggregate console with export approval workflow.
