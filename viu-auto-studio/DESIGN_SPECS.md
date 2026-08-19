# Visual Design Specs from Reference Screenshots

## Overall Theme
- **Background**: Very dark navy/black (#0a0e1a or similar, not pure black)
- **Sidebar background**: Slightly lighter dark (#0f1523 or similar)
- **Cards**: Dark navy (#111827 or #0d1320) with subtle border (#1e2a3a or rgba(255,255,255,0.06))
- **Text primary**: White/near-white (#f8fafc)
- **Text secondary**: Gray-blue (#94a3b8 or #64748b)
- **Accent/Primary**: Purple-violet gradient (from #7c3aed to #a855f7) — used for buttons, active states, progress bars
- **Success**: Green (#22c55e or #10b981)
- **Warning**: Orange/amber (#f59e0b or #eab308)
- **Error**: Red (#ef4444 or #dc2626)

## Header Bar (top of main content)
- Dark background (#0d1117 or similar)
- Left side: Channel name with ✨ sparkle icon (orange), "AI STUDIO" badge (dark with orange text), video type badge (orange/red gradient), content type badges
- Right side: Status badges (Flow login, Telegram), "Thống kê" button, "Cấu hình" button (dark with icon)

## Sidebar
- Width ~240px
- Logo: "Revo Studio" with "v1.2.7" below
- Nav items with icons, active state has purple highlight on left edge + slightly lighter background
- PRO card: Purple gradient background (#6d28d9 to #4c1d95), "PRO ACTIVE" badge (orange), "BETA" text
- User card: Avatar circle (purple), name, email, "Pro · Full" badge, "MÃ MÁY" row

## Buttons
- Primary action buttons: Purple gradient background (#7c3aed → #a855f7), white text, rounded-lg, hover brighter
- "Sinh" button: Orange-red gradient (#f97316 → #ef4444), sparkle icon
- Secondary buttons: Dark background (#1e293b), white text, border
- Ghost buttons: Transparent, icon only
- Small badges/pills: Dark bg with colored text

## Cards
- Background: #111827 or darker
- Border: 1px solid rgba(255,255,255,0.06) or #1e2a3a
- Border-radius: 12px or 16px
- Subtle shadow
- Some cards have colored left border accent (purple for active, orange for warning, red for error)

## Progress bars
- Track: Dark (#1e293b)
- Fill: Purple gradient or colored based on status (green=done, orange=in-progress, gray=pending)
- Rounded full (pill shape)

## Typography
- Font: Sans-serif (Inter or system-ui)
- Headings: Bold, white
- Body: Regular, gray-blue
- Small labels: 11-12px, uppercase or title case

## Tabs
- Dark background, pill-shaped active indicator with purple
- Active tab: White text, purple underline or background

## Status badges/pills
- Small rounded pills (4-6px radius)
- "proposed": Orange bg, orange text
- "producing": Orange/amber bg
- "failed": Red bg, red text
- "pending": Gray bg
- "success": Green bg
- "skipped": Gray/muted

## Workspace specific
- Episode cards: Dark card with thumbnail image, title below, topic tag, status badge
- Pipeline progress panel: Right sidebar with step list, each step has colored dot + progress bar + status label
- 3-column layout: Ideas | Content tabs | Production progress

## Settings page
- Tab bar with icons + text, underline indicator
- Form sections in cards
- Select dropdowns: Dark bg, white text, purple border on focus
- Toggle switches: Purple when on

## Key differences from current implementation:
1. Background should be darker navy, not just dark gray
2. Cards need subtle borders (not just shadow)
3. Purple gradient is the dominant accent color
4. More refined spacing and padding
5. Status badges should be more colorful/distinct
6. Progress bars need gradient fills
7. Header bar needs the channel/product badges layout
