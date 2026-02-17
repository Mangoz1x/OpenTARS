# Design Language — TARS

Reference for all UI work in the TARS project. Consult this before writing any component, page, or styling.

## Philosophy

- **Dark-first.** The default theme is dark. Light mode exists but dark is the primary design target.
- **Minimal.** Every element earns its place. No decorative flourishes, gradients, or shadows unless they serve a functional purpose.
- **Utilitarian.** The UI is a tool. Clarity and speed over polish. Information density over whitespace.
- **Consistent.** Use the design system tokens and shadcn components. Never freestyle.

## Color System

**Always use semantic tokens. Never use raw Tailwind colors (e.g., `zinc-800`, `red-400`).**

| Token | Use for |
|-------|---------|
| `bg-background` | Page/app background |
| `text-foreground` | Primary text |
| `text-muted-foreground` | Secondary/supporting text |
| `bg-muted` | Subtle background sections |
| `bg-card` / `text-card-foreground` | Card surfaces |
| `bg-primary` / `text-primary-foreground` | Primary actions (buttons) |
| `bg-secondary` / `text-secondary-foreground` | Secondary actions |
| `bg-accent` / `text-accent-foreground` | Hover states, highlights |
| `text-destructive` | Errors, dangerous actions |
| `border-border` | Default borders |
| `border-input` | Form input borders |
| `ring-ring` | Focus rings |
| `bg-popover` / `text-popover-foreground` | Dropdowns, popovers |

To change the entire theme, edit the CSS variables in `src/app/globals.css` (`:root` for light, `.dark` for dark). All OKLCH values.

## Typography

- **Sans:** Geist Sans (`font-sans`) — all UI text
- **Mono:** Geist Mono (`font-mono`) — code, terminal output, IDs
- **Default body size:** `text-sm` (14px)
- **Headings:** use `text-lg`, `text-xl`, `text-2xl` — sparingly
- **Tracking:** `tracking-tight` on headings only
- **Weight:** `font-medium` for labels/buttons, `font-semibold` for titles, `font-normal` for body

## Spacing

- Component internal padding: `p-4` or `p-6`
- Spacing between elements: `space-y-4` (forms), `gap-4` or `gap-6` (layouts)
- Page-level padding: `px-6` on mobile, `px-8` on desktop
- Keep spacing consistent within a context — don't mix `gap-3` and `gap-5` in the same layout

## Border Radius

Controlled by `--radius` CSS variable (default `0.625rem`). Use Tailwind's `rounded-md`, `rounded-lg`, etc. — they map to the variable. Don't use arbitrary values like `rounded-[12px]`.

## File Organization

- **Page-specific components** live in `src/app/<route>/components/` — colocated with the route (e.g., `src/app/(chat)/components/`)
- **Shared components** live in `src/components/` — used across multiple routes
- **shadcn primitives** stay in `src/components/ui/`

## Components

### Always use shadcn/ui

All standard UI primitives (buttons, inputs, cards, dialogs, dropdowns, etc.) come from `src/components/ui/`. These are shadcn/ui components installed via `npx shadcn add <name>`.

Never build a custom button, input, select, dialog, etc. from scratch. If shadcn has it, use it.

### Custom components

Project-specific components live in `src/components/` (not in `ui/`). The `ui/` directory is reserved for shadcn primitives.

### Composition pattern

```tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
```

## Interaction Patterns

- **No decorative animations.** Only use transitions for state changes (`transition-colors`, `transition-opacity`).
- **Disabled states:** `disabled:opacity-50 disabled:pointer-events-none` (built into shadcn).
- **Focus:** Let shadcn's built-in focus rings handle it. Don't add custom focus styles.
- **Loading:** Show inline text change (e.g., "Signing in..."), not spinners, unless the operation is long-running.

## Quick Reference

### Do

- Use semantic color tokens (`bg-background`, `text-muted-foreground`)
- Use shadcn components for all standard UI
- Use `text-sm` as default body text size
- Use `cn()` from `@/lib/utils` to merge classes
- Keep the dark theme as the primary design target

### Don't

- Use raw Tailwind colors (`bg-zinc-900`, `text-red-400`)
- Build custom versions of components shadcn already provides
- Add decorative shadows, gradients, or animations
- Use arbitrary Tailwind values (`w-[347px]`, `rounded-[12px]`)
- Put custom components in `src/components/ui/`
