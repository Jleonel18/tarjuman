---
name: Tarjuman Heritage AI
colors:
  surface: '#0c1419'
  surface-dim: '#0c1419'
  surface-bright: '#323a40'
  surface-container-lowest: '#070f14'
  surface-container-low: '#151d22'
  surface-container: '#192126'
  surface-container-high: '#232b30'
  surface-container-highest: '#2e363b'
  on-surface: '#dbe4eb'
  on-surface-variant: '#bbcabf'
  inverse-surface: '#dbe4eb'
  inverse-on-surface: '#293137'
  outline: '#86948a'
  outline-variant: '#3c4a42'
  surface-tint: '#4edea3'
  primary: '#4edea3'
  on-primary: '#003824'
  primary-container: '#10b981'
  on-primary-container: '#00422b'
  inverse-primary: '#006c49'
  secondary: '#e9c349'
  on-secondary: '#3c2f00'
  secondary-container: '#af8d11'
  on-secondary-container: '#342800'
  tertiary: '#ffb3af'
  on-tertiary: '#650911'
  tertiary-container: '#fc7c78'
  on-tertiary-container: '#711419'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#6ffbbe'
  primary-fixed-dim: '#4edea3'
  on-primary-fixed: '#002113'
  on-primary-fixed-variant: '#005236'
  secondary-fixed: '#ffe088'
  secondary-fixed-dim: '#e9c349'
  on-secondary-fixed: '#241a00'
  on-secondary-fixed-variant: '#574500'
  tertiary-fixed: '#ffdad7'
  tertiary-fixed-dim: '#ffb3af'
  on-tertiary-fixed: '#410005'
  on-tertiary-fixed-variant: '#842225'
  background: '#0c1419'
  on-background: '#dbe4eb'
  surface-variant: '#2e363b'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 17px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.03em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 0.75rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system expresses the intersection of ancient linguistic scholarship and cutting-edge conversational artificial intelligence. Designed for deep study, linguistic immersion, and contextual dialogue, the aesthetic balances modern digital minimalism with subtle historical gravitas.

The visual style is **Contemporary Neo-Minimalism infused with Heritage Accents**. It relies on deep, nocturnal surfaces reminiscent of dark parchment or midnight ink, offset by luminous emerald greens representing vitality, discovery, and classical manuscript binding tones. Ambient accents of desert amber evoke lantern illumination and historic brass navigational instruments.

The emotional goal is focused serenity and scholarly confidence. Interfaces avoid loud ornamentation; instead, visual sophistication is achieved through disciplined typographic scales, crisp micro-borders, atmospheric surface elevations, and tactile feedback tailored for high-frequency conversational learning.

## Colors

The color palette centers on high-contrast readability against low-fatigue midnight canvas surfaces.

- **Primary (`#10B981`)**: The vibrant emerald anchor used for primary action states, active transcript indicators, verified translation badges, and interactive chat affordances. Supported by deep shade `#059669` for hover/pressed states and tint `#34D399` for dark surface luminescence.
- **Secondary (`#D4AF37`)**: Warm desert gold, designated for mastery indicators, grammatical highlights, cultural annotations, phonetic focus marks, and elevated interactive states. Complemented by `#F59E0B` and `#FBBF24` for high-visibility alerts and reward milestones.
- **Neutral Base Surfaces**:
  - Deep Ground: `#0B1114` (Canvas / Scrim background)
  - Surface Default: `#121A1F` (Main panel, message stream, side navigation)
  - Surface Elevated: `#182229` (Cards, popovers, chat bubbles, input wells)
- **Borders & Dividers**:
  - Subdued Border: `#1F2D35` (Component boundaries, column separators)
  - Focused Border: `#263842` (Active card edges, hover boundaries)
- **Text & Content**:
  - Primary Content: `#F3F4F6` (Main messages, headings, active states)
  - Secondary Content: `#9CA3AF` (Subtitles, metadata, timestamps, translations)
  - Muted/Disabled: `#4B5563` (Inactive tabs, placeholders)

## Typography

The typography leverages `Plus Jakarta Sans` across all display, body, and label roles to maintain structural uniformity, high legibility, and geometric cleanliness against dark, low-emissivity canvases.

- **Numerics & Metadata**: Monospaced variants or tabular figures (`tnum`) should be enabled for timecodes, lesson counters, and grammatical root indices.
- **RTL & Bilingual Alignment**: While the Latin UI utilizes Plus Jakarta Sans, parallel Arabic script blocks require proportional baseline matching, maintaining a 1.4x line-height multiplier to accommodate calligraphic descenders and vocalization marks (tashkeel).
- **Hierarchy Rules**: Primary conversational speech bubbles sit firmly in `body-lg` or `body-md` for maximum legibility during extended reading sessions, while auxiliary notes, transliterations, and morphological roots sit in `label-md` or `label-sm` with distinct secondary text color mapping (`#9CA3AF`).

## Layout & Spacing

The layout is built upon an adaptive 12-column structural grid system tailored to real-time chat panes, contextual study panels, and progressive curriculum streams.

- **Desktop (1024px and above)**: 12-column split layout. Navigation and conversation history occupy a persistent 280px left rail, the central dialogue occupies 6 to 7 columns with constrained line-lengths (max 720px for text readability), and an auxiliary grammar/vocabulary inspector docks into the right 3 columns. Gutters remain fixed at `gutter` (1.5rem).
- **Tablet (768px – 1023px)**: 8-column layout. The inspector transitions to a collapsible slide-over surface, granting full focus to the central thread.
- **Mobile (below 768px)**: 4-column layout utilizing edge-to-edge full width with `margin-mobile` (1rem) screen boundary clearance. The conversation input remains fixed to the bottom viewport boundary.
- **Vertical Rhythm**: Spacing operates on a rigid 4px/8px modular base. Consecutive chat messages from the same author group tightly with `space-xs` (0.25rem) separation, distinct message groups scale to `space-md` (1rem), and contextual lesson cards utilize `space-lg` (1.5rem) boundaries.

## Elevation & Depth

Visual depth is produced using **Tonal Layering combined with Low-Contrast Micro-Borders** and ambient luminescent diffusion, avoiding harsh drop shadows that degrade in dark themes.

- **Level 0 (Canvas Base)**: `#0B1114` - Ground canvas, background beneath scrollable dialogue areas. Flat, non-bordered.
- **Level 1 (Structural Panels & Sidebars)**: `#121A1F` - Standard container surface. Delineated by a 1px solid border (`#1F2D35`). No shadow.
- **Level 2 (Interactive Cards, Message Tiles, Inputs)**: `#182229` - Floating containers and message bubbles. Bordered with 1px `#263842`. Soft ambient drop shadow: `0 4px 20px -2px rgba(0, 0, 0, 0.45)`.
- **Level 3 (Dropdowns, Overlays, Floating Prompts)**: `#182229` with a subtle green-tinted ambient glow: `0 12px 32px -4px rgba(0, 0, 0, 0.65), 0 0 0 1px #263842`.
- **Active / Focused Depth**: Active language chips or selected words employ an interior emerald halo (`0 0 16px -2px rgba(16, 185, 129, 0.25)`) to signal current conversational context.

## Shapes

The design system implements a cohesive geometric curve profile with a default roundedness index of `2` (8px / 0.5rem base radius).

- **Base Radius (`0.5rem`)**: Standard input inputs, utility buttons, inline code blocks, grammatical chip tags, and secondary action items.
- **Large Radius (`1rem` / `rounded-lg`)**: Chat message containers, grammatical breakdown drawers, translation flashcards, and modal dialogue surfaces.
- **Extra Large Radius (`1.5rem` / `rounded-xl`)**: Primary conversation canvas panels and floating toolbar pods.
- **Geometric Motifs**: Subtle arabesque geometric touches are integrated as restrained background watermarks (low opacity vector lines at 4% opacity) and precise 45-degree octagonal badge trims for lesson rank and fluency meters.

## Components

### Buttons
- **Primary**: Solid emerald background (`#10B981`), high-contrast dark text (`#0B1114`), font-weight 600, radius `0.5rem`. Hover transitions to `#059669`. Pressed states contract slightly by scale (0.98).
- **Secondary (Heritage Gold)**: Outlined 1px solid `#D4AF37` with subtle golden text (`#FBBF24`) and transparent background. Hover adds `#D4AF37` at 10% opacity.
- **Ghost/Tertiary**: Transparent fill with slate text (`#9CA3AF`), shifting to `#F3F4F6` and background `#182229` on hover.

### Chat Bubbles
- **User Message**: Solid surface container (`#182229`), bordered with `#263842`, text color `#F3F4F6`. Border radius `1rem` on three corners, with the bottom-right corner contracted to `0.25rem` to designate speaker direction.
- **Tarjuman AI Message**: Midnight surface (`#121A1F`), left-aligned, subtly bordered with `#1F2D35`. Accented with a 2px vertical emerald indicator (`#10B981`) on the leading edge for immediate visual identification.

### Input Fields
- Dark field surface (`#0B1114`), surrounded by 1px border (`#1F2D35`), text color `#F3F4F6`.
- Focus state activates an emerald border transition (`#10B981`) with a subtle `rgba(16, 185, 129, 0.15)` outer ring. Placeholder text set to `#4B5563`.

### Chips & Vocabulary Tokens
- Inline interactive words inside translations sit on `rgba(24, 34, 41, 0.8)` with a 1px `#1F2D35` border and `0.5rem` radius.
- Grammar classifications display localized color rings: Emerald for verbs/roots, Amber for particles/adjectives, and Slate for conjunctions.

### Cards & Study Drawers
- Constructed with `#182229` background, `#1F2D35` borders, and padding `1.5rem`.
- Header bars feature subtle Arabesque lattice motifs etched into corner margins at minimal contrast.

### Checkboxes & Radios
- Square checkbox (`0.25rem` radius) and circular radio with dark foundation `#0B1114` and `#263842` perimeter.
- Checked state fills with `#10B981` featuring a crisp `#0B1114` checkmark icon.