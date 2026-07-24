# Repository instructions

@/Users/nathan/.codex/RTK.md

## Strict UI consistency

Before creating or changing any user interface:

1. Inspect all sibling pages and components that solve a similar problem. Search the
   repository for existing layout, card, form, table, empty-state, loading, error,
   navigation, action, spacing, typography, and responsive patterns.
2. Use the established shared component and its existing composition. Do not add a
   one-off wrapper, spacing value, visual treatment, label style, or interaction when
   an equivalent pattern already exists.
3. Compare the changed UI with every relevant peer page, not only with the page named
   in the request. Match component structure, padding, gaps, alignment, heading
   hierarchy, control sizing, action placement, breakpoints, and state behavior.
4. If similar pages currently disagree, identify the dominant shared pattern and
   normalize the affected UI to it. Prefer improving or reusing a shared abstraction
   when that prevents the pages from drifting again.
5. Check all applicable states: populated, empty, loading, error, filtered, disabled,
   light theme, dark theme, desktop, and mobile.
6. Before handoff, run the relevant formatting, type, lint, unit, and browser checks.
   Visually inspect changed pages alongside their peers at matching viewport sizes
   whenever browser tooling is available.

Treat consistency as a completion requirement. Do not consider a UI change finished
until the relevant peer pages and existing repository patterns have been checked.
