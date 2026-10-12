---
name: Tarjuman Heritage AI
colors:
  surface: '#f9f9ff'
  surface-dim: '#cfdaf2'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eeff'
  surface-container-high: '#dee8ff'
  surface-container-highest: '#d8e3fb'
  on-surface: '#111c2d'
  on-surface-variant: '#404944'
  inverse-surface: '#263143'
  inverse-on-surface: '#ecf1ff'
  outline: '#707974'
  outline-variant: '#c0c9c2'
  surface-tint: '#316853'
  primary: '#003626'
  on-primary: '#ffffff'
  primary-container: '#134e3a'
  on-primary-container: '#85bea4'
  inverse-primary: '#99d3b8'
  secondary: '#735c00'
  on-secondary: '#ffffff'
  secondary-container: '#fed65b'
  on-secondary-container: '#745c00'
  tertiary: '#00314e'
  on-tertiary: '#ffffff'
  tertiary-container: '#194869'
  on-tertiary-container: '#8cb6dd'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#b5efd3'
  primary-fixed-dim: '#99d3b8'
  on-primary-fixed: '#002115'
  on-primary-fixed-variant: '#16503c'
  secondary-fixed: '#ffe088'
  secondary-fixed-dim: '#e9c349'
  on-secondary-fixed: '#241a00'
  on-secondary-fixed-variant: '#574500'
  tertiary-fixed: '#cce5ff'
  tertiary-fixed-dim: '#a1cbf2'
  on-tertiary-fixed: '#001d31'
  on-tertiary-fixed-variant: '#1c4a6b'
  background: '#f9f9ff'
  on-background: '#111c2d'
  surface-variant: '#d8e3fb'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  title-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.04em
  phonetic-annotation:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
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

This design system synthesizes contemporary conversational AI clarity with the timeless architectural harmony of Arabesque geometry and heritage. Designed for learners, scholars, and polyglots, the interface balances functional efficiency with warm, scholarly authority. 

The aesthetic is Modern Scholarly Minimalism: high legibility, deliberate whitespace, and structured typography paired with warm parchment undertones and deep malachite green accents. Visual cues evoke classical manuscripts translated into pristine software: balanced geometry, disciplined line work, and purposeful ornament without clutter. Interactions are calm, tactile, and precise, avoiding synthetic neon glows in favor of mineral tones, soft brass highlights, and physical-world dignity.

## Colors

The palette draws directly from classical Islamic bookbinding and desert landscapes:
- **Primary (`#134E3A`)**: Deep Islamic Emerald / Malachite. Applied to primary CTAs, active selection states, assistant identification, and high-emphasis highlights.
- **Secondary (`#D4AF37`)**: Warm Middle Eastern Brass & Gold. Used for phonetics accents, mastery level badges, corrective feedback callouts, and conversational milestones.
- **Tertiary (`#1E4C6D`)**: Lapis Lazuli. Applied to grammar category tags, syntactic breakdowns, and verb-root highlighting.
- **Neutral (`#1E293B`)**: Charcoal Slate for crisp, readable copy across interfaces.

### Surface Tones (Light Mode)
- **Canvas Base**: `#FBF9F5` (Warm Desert Parchment).
- **Surface Elevation 1**: `#F4EFE6` (Sandstone Card Surface).
- **Surface Elevation 2 / Borders**: `#EAE2D5` (Soft Gilded Bordering).

### Dark Surface Mappings
When switching modes, surfaces transition to Obsidian Night (`#0B1114` canvas, `#111A1E` container, `#18242A` elevated cards), maintaining `#134E3A` through muted desaturation and retaining brass gold (`#E5C158`) for structural visibility.

## Typography

The type system blends structured clarity with humanist cadence. **Plus Jakarta Sans** provides structural elegance in headings and brand elements, echoing geometric Kufic proportions with modern softness. **Inter** ensures exceptional readability across dense, multi-tiered linguistic cards, phonetic transliterations, and morphological breakdowns.

### Linguistic Typography Rules
- **Arabic Script Support**: When rendering native script, pair with an authentic Naskh or modern clean companion font (such as Amiri or Noto Sans Arabic) using a minimum base size of 18px and a generous `1.75` line height to prevent diacritic clipping.
- **Interlinear Transliteration**: Sub-labels and phonetic annotations sit 4px above or below targeted words in uppercase or romanized text with `letterSpacing: 0.04em`.

## Layout & Spacing

The layout is built around a desktop-first responsive structure:
- **Desktop (1200px+)**: A split workbench structure featuring a 280px collapsible sidebar for session history and grammar units, a central 768px reading column for conversation flow, and an optional 360px collapsible context drawer for root analysis and vocabulary decks.
- **Tablet (768px - 1199px)**: Sidebar shifts to an off-canvas slide-out rail; the conversation canvas expands to 100% fluid width with 24px margins.
- **Mobile (< 768px)**: Unified single-column view with bottom sheet navigation and compact floating input composer docked above browser chrome.

### Rhythm
The layout operates on an 8px rhythmic grid with an inner 4px micro-increment for annotations, tags, and badge indicators. Gaps between message clusters expand to `space-xl` (40px) to give distinct cognitive boundaries to each pedagogical exchange.

## Elevation & Depth

This system avoids heavy drop shadows, relying instead on warm parchment surface stacking, delicate outline contrasts, and tinted ambient diffusion:

1. **Base Tier (Ground)**: `#FBF9F5` (Canvas background).
2. **Structural Tier (Sidebar / Panels)**: `#F4EFE6` with a right border in `#EAE2D5` (1px solid).
3. **Card Tier (Message Modules / Word Breakdowns)**: `#FFFFFF` resting on `#FBF9F5`, outlined by a 1px border of `#EAE2D5` with an ultra-subtle tinted shadow: `0 2px 8px -2px rgba(19, 78, 58, 0.04)`.
4. **Floating Tier (Composer Bar / Tooltips)**: `#FFFFFF` or `#F4EFE6` with a warm mineral elevation: `0 8px 24px -4px rgba(19, 78, 58, 0.08), 0 2px 6px -1px rgba(19, 78, 58, 0.04)` and a 1px gilded border (`#E5C158` at 30% opacity).
5. **Dark Mode Adaptation**: Shadows shift to true obsidian depths (`rgba(0, 0, 0, 0.45)`) while 1px surface borders rely on `#18242A` to maintain crisp boundary clarity.

## Shapes

The interface adheres to **Roundedness 2 (0.5rem / 8px)**, reflecting balanced geometric stability:
- **Base Components (Inputs, Cards, Message Panels)**: `0.5rem` (`8px`) border radius.
- **Large Panels (Sidebar containers, Modal dialogs)**: `rounded-lg` (`1rem` / `16px`).
- **Interactive Micro-elements (Chips, Pills, Language badges)**: Pill-radius (`9999px`) to distinguish interactive linguistic toggles from content cards.
- **Arabic Inscription Panels**: Card corners maintain clean 8px rounding, framed by subtle 1px inner hairline borders.

## Components

### Buttons
- **Primary**: Background `#134E3A`, text `#FBF9F5`, `0.5rem` radius, 10px 20px padding. Hover: `#0D281E`. Focus: ring of 2px `#D4AF37`.
- **Secondary (Brass Accent)**: Border 1px `#D4AF37`, text `#134E3A`, background `transparent`. Hover: `#D4AF37` at 10% opacity.
- **Ghost / Action**: Minimalist icons (audio phonetics, copy, bookmark) with 8px radius; background shifts to `#F4EFE6` on hover.

### Conversation Bubbles
- **User Message**: Aligned right, `#F4EFE6` fill, 1px border in `#EAE2D5`, text `#1E293B`.
- **Assistant Message**: Aligned left, `#FFFFFF` fill with an understated left boundary accent in `#134E3A` (3px solid), featuring stacked sub-components:
  - *Word-by-word Interlinear Block*: Clickable lexical tokens with phonetics stacked overhead in `#1E4C6D`.
  - *Grammar Coaching Drawer*: `#FBF9F5` interior container bordered with `#EAE2D5`, holding concise morphological explanations and root etymology badges.

### Floating Prompt Composer
Fixed at the base of the conversation canvas, max-width 768px, pill/rounded hybrid container (`16px` radius).
- Background `#FFFFFF` with gilded ambient outline (`1px solid #EAE2D5`).
- Left: Speech/dictation wave button.
- Center: Auto-expanding textarea with placeholder in `#1E293B` (50% opacity).
- Right: Linguistic context chip (e.g., "MSA ⇄ English") and circular Send button in `#134E3A`.

### Language Selector Pills & Filter Chips
- Height 32px, `rounded-full`, padding 0 14px.
- Inactive: `#F4EFE6` background, `#1E293B` text, no border.
- Active: `#134E3A` background, `#FBF9F5` text, paired with gold micro-dot indicator.

### Input Fields
- Background `#FFFFFF`, 1px solid border `#EAE2D5`, 8px radius.
- Focused state: 1px border `#134E3A`, shadow ring `0 0 0 3px rgba(19, 78, 58, 0.12)`.

### History Sidebar
- Navigational section grouping ("Today", "Previous 7 Days", "Mastery Units") rendered in `label-sm` with 60% opacity.
- Session items: 8px radius, padding 8px 12px, hover `#EAE2D5` (40% opacity), active item `#134E3A` at 8% opacity with deep emerald text.