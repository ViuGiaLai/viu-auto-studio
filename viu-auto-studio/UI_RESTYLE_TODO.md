# UI Restyle TODO — Key Decisions

## PROGRESS (as of now):
- ✅ index.css — global theme
- ✅ app-layout.tsx — sidebar
- ✅ projects-page.tsx — full rework
- ✅ workspace-page.tsx — full rework
- ✅ dashboard-page.tsx — full rework
- ✅ settings-page.tsx — full rework (vas-card divs, dark header, dark tabs)
- ✅ select.tsx — dark bg, purple highlight
- ✅ tabs.tsx — dark pill, purple active
- ✅ input.tsx — dark bg
- ✅ textarea.tsx — dark bg
- ✅ dialog.tsx — dark bg, rounded-xl
- ✅ button.tsx — purple gradient default, dark outline
- ✅ badge.tsx — purple/white/red colors
- ✅ switch.tsx — purple gradient checked
- ✅ card.tsx — rounded-xl, dark bg
- ✅ progress.tsx — purple gradient fill

## REMAINING:
- queue-page.tsx — still uses Card/CardHeader/CardContent + filter chips (line 85-100 has old styles)
- library-page.tsx — still uses Card
- voice-config-page.tsx — still uses Card + old tabs
- project-editor-page.tsx — still uses Card (big file)
- After all done: run tsc, vite build, browser verify all pages

## Design system applied (in index.css):
- `.vas-card` — card class: bg-[#111827], border rgba(255,255,255,0.06), rounded-xl, shadow
- `.vas-card-hover` — hover effect: border purple-500/30, shadow glow
- `.status-badge`, `.status-proposed`, `.status-producing`, `.status-failed`, `.status-pending`, `.status-success`, `.status-skipped` — status pill styles
- `.progress-track` — track bg, `.progress-fill` — fill with gradient variants
- `.nav-item-active` — sidebar active state
- `.bg-gradient-primary` — purple gradient (#7c3aed → #a855f7 → #c084fc)
- `.bg-gradient-action` — orange-red gradient (#f97316 → #ef4444)
- `.shadow-glow`, `.shadow-card` — box shadows

## Background: #080b14 (main content), #0a0e1a (sidebar), cards: #111827
## Borders: rgba(255,255,255,0.06) or border-white/8, border-white/10

## Files already restyled:
- ✅ index.css — global theme + utility classes
- ✅ app-layout.tsx — sidebar (dark navy, purple active, PRO card gradient, user card)
- ✅ projects-page.tsx — full rework (vas-card, status badges, purple gradients)
- ✅ workspace-page.tsx — full rework (vas-card, progress bars, purple/orange gradients)
- ✅ dashboard-page.tsx — full rework (vas-card, stat cards, circular progress)

## Files still need restyle (use same patterns):
- settings-page.tsx — header buttons, tabs, cards, form elements
- voice-config-page.tsx — TTS page tabs, voice list
- project-editor-page.tsx — big file, header/tabs/forms
- queue-page.tsx — filter chips, table
- library-page.tsx — grid, upload
- tts-page.tsx (if separate from voice-config-page)

## High-leverage shared component fixes needed:
- components/ui/select.tsx — dark bg, purple highlight on focus/active
- components/ui/tabs.tsx — dark pill container, purple active
- components/ui/card.tsx — use vas-card styles
- components/ui/button.tsx — purple gradient default variant
- components/ui/input.tsx — dark bg, white/10 border
- components/ui/textarea.tsx — same as input
- components/ui/dialog.tsx — dark bg, white/10 border
- components/ui/slider.tsx — purple thumb

## Key colors:
- Purple primary: #7c3aed (500), #8b5cf6 (violet-500), #a855f7 (500)
- Action orange-red: #f97316 → #ef4444
- Card bg: #111827
- Page bg: #080b14
- Sidebar bg: #0a0e1a
- User card area: #0c1120
- Text: slate-100 (primary), slate-300 (secondary), slate-500 (muted), slate-600 (faint)
- Borders: border-white/8, border-white/10, border-white/5
- Status green: #22c55e, amber: #eab308, red: #ef4444

## Final (session 2)
- [x] Project editor page restyled, Card import removed, tsc clean
- [x] Settings Engine tab rebuilt (3 install profiles + advanced tools)
- [x] Publish tab label → (Đang phát triển)
- [x] Storyboard Google Flow (Labs) button → /api/flow/project-url + electronAPI.openExternal
- [x] Workspace Flow login pill + Tài khoản Google Flow modal (matches reference)
