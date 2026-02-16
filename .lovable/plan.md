

# Clean Up: Remove Unnecessary Files from the Project

## What gets removed

### External AI tool configs (not part of your app)
- `.claude/` folder (AI skill files for Claude)
- `AGENTS.md` (1200+ line system prompt for AI assistants)
- `.mcp.json` (MCP server config)
- `opencode.json` (OpenCode AI config)
- `.vscode/mcp.json` (VS Code MCP config)

### CI/CD configs you don't use (Lovable handles deployment)
- `.github/workflows/deploy.yml` (GitHub Pages deploy -- Lovable deploys for you)
- `.github/workflows/test.yml` (GitHub Actions test runner)
- `.gitlab-ci.yml` (GitLab CI pipeline)

### Unused UI components (never imported anywhere in the app)
These shadcn/ui components are installed but never used by any page or feature:
- `accordion`, `alert-dialog`, `aspect-ratio`, `breadcrumb`, `calendar`, `carousel`, `chart`, `checkbox`, `context-menu`, `hover-card`, `input-otp`, `menubar`, `navigation-menu`, `pagination`, `progress`, `radio-group`, `resizable`, `slider`, `table`
- `sidebar.tsx` + `sidebar-utils.ts` (unused, and it's the only consumer of `sheet.tsx`)
- `sheet.tsx` (only used by sidebar, which is itself unused)
- `toggle-variants.ts`, `navigation-menu-variants.ts` (support files for unused components)

### What stays
- All actual app code (pages, components, hooks, contexts, lib)
- UI components that ARE used: `alert`, `avatar`, `badge`, `button`, `card`, `collapsible`, `command`, `dialog`, `drawer`, `dropdown-menu`, `form`, `input`, `label`, `popover`, `scroll-area`, `select`, `separator`, `skeleton`, `switch`, `tabs`, `textarea`, `toast`, `toaster`, `toggle`, `toggle-group`, `tooltip`
- `.vscode/settings.json` (editor settings -- harmless)
- `eslint-rules/` and `eslint.config.js` (active linting)

## Technical details

### Files to delete (30+ files)
```text
.claude/skills/ai-chat/SKILL.md
.claude/skills/nostr-comments/SKILL.md
.claude/skills/nostr-direct-messages/SKILL.md
.claude/skills/nostr-infinite-scroll/SKILL.md
AGENTS.md
.mcp.json
opencode.json
.vscode/mcp.json
.github/workflows/deploy.yml
.github/workflows/test.yml
.gitlab-ci.yml
src/components/ui/accordion.tsx
src/components/ui/alert-dialog.tsx
src/components/ui/aspect-ratio.tsx
src/components/ui/breadcrumb.tsx
src/components/ui/calendar.tsx
src/components/ui/carousel.tsx
src/components/ui/chart.tsx
src/components/ui/checkbox.tsx
src/components/ui/context-menu.tsx
src/components/ui/hover-card.tsx
src/components/ui/input-otp.tsx
src/components/ui/menubar.tsx
src/components/ui/navigation-menu.tsx
src/components/ui/navigation-menu-variants.ts
src/components/ui/pagination.tsx
src/components/ui/progress.tsx
src/components/ui/radio-group.tsx
src/components/ui/resizable.tsx
src/components/ui/sheet.tsx
src/components/ui/sidebar.tsx
src/components/ui/sidebar-utils.ts
src/components/ui/slider.tsx
src/components/ui/table.tsx
```

### Unused dependencies to remove
These npm packages are only used by the deleted UI components:
- `@radix-ui/react-accordion`
- `@radix-ui/react-alert-dialog`
- `@radix-ui/react-aspect-ratio`
- `@radix-ui/react-checkbox`
- `@radix-ui/react-context-menu`
- `@radix-ui/react-hover-card`
- `@radix-ui/react-menubar`
- `@radix-ui/react-navigation-menu`
- `@radix-ui/react-progress`
- `@radix-ui/react-radio-group`
- `@radix-ui/react-slider`
- `@radix-ui/react-scroll-area` -- wait, this IS used. Keep it.
- `input-otp`
- `embla-carousel-react` (only used by carousel)
- `react-day-picker` (only used by calendar)
- `react-resizable-panels` (only used by resizable)
- `recharts` (only used by chart)

No functional changes -- the app works exactly the same, just leaner.

