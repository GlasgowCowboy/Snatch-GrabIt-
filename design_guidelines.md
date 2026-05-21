# Design Guidelines: Snatch&GrabIt! Multiplayer Card Game

**Powered by AppSmith**

## Design Approach

**System-Based Approach**: Drawing from successful online card games (Microsoft Solitaire, online poker interfaces) with Material Design principles for clarity and responsiveness. Focus on functional excellence over visual decoration - every element serves gameplay.

**Key Principles**:
- Instant visual feedback for real-time actions
- Clear spatial organization for multiple player areas
- High contrast for card readability during fast gameplay
- Minimal distractions to maintain focus on strategy

---

## Core Design Elements

### A. Color Palette

**Dark Mode (Primary)**:
- Background: 140 25% 12% (deep forest green, traditional card table feel)
- Surface: 140 20% 18% (elevated areas for player zones)
- Card Background: 0 0% 98% (crisp white for maximum contrast)
- Primary Action: 220 85% 55% (vibrant blue for interactive elements)
- Success/Win: 142 70% 45% (green for valid moves)
- Danger/Invalid: 0 70% 50% (red for invalid plays)
- Text on dark: 0 0% 95%
- Text on cards: 0 0% 10%

**Card Suits**:
- Hearts/Diamonds: 0 75% 45% (traditional red)
- Spades/Clubs: 0 0% 15% (traditional black)

### B. Typography

**Font Stack**: 
- Primary: 'Inter', system-ui, sans-serif (clean, modern readability)
- Card Values: 'Roboto Mono', monospace (clear number distinction)

**Scale**:
- Card rank/suit: text-2xl to text-3xl font-bold
- Player names: text-sm font-medium
- Game status: text-base font-semibold
- Room codes: text-lg font-mono

### C. Layout System

**Spacing Primitives**: Use Tailwind units of 2, 3, 4, 6, 8 consistently
- Card gaps: gap-2 to gap-3
- Section padding: p-4, p-6, p-8
- Player area margins: m-4

**Grid Structure**:
- Foundation piles: Centered horizontal row (flex or grid-cols-4)
- Player areas: Grid layout based on player count (grid-cols-2 for 2-4 players, grid-cols-3 for 5-8 players)
- Each player area contains: Bone pile (left), Tableau (center 4 cards), Draw pile (right)

### D. Component Library

**Card Component** (Foundation of entire UI):
- Size: w-16 h-24 to w-20 h-28 (responsive based on player count)
- Border radius: rounded-lg
- Shadow: Drop shadow for depth (shadow-lg when dragging, shadow-md at rest)
- Hover state: -translate-y-1 scale-105 transition-transform
- Stack indicator: Subtle offset for stacked cards (translate-x-1 translate-y-1)

**Player Area Container**:
- Background: Surface color with border (border-2 border-opacity-30)
- Border highlight when active player or on turn: border-blue-400
- Padding: p-4
- Label: Player name badge (top-left, text-sm, bg-opacity-80)

**Foundation Piles (Shared Center)**:
- Empty foundation: Dashed border placeholder (border-dashed border-2)
- Suit icon watermark in empty foundations
- Slightly larger cards than tableau (w-18 h-26)
- Glow effect when valid drop target (ring-2 ring-green-400)

**Bone Pile Indicator**:
- Card count badge: Positioned on pile (top-right)
- Style: bg-red-500 text-white rounded-full px-2 py-1 text-xs font-bold
- Pulse animation when low (< 5 cards): animate-pulse

**Draw Pile Display**:
- Show top 3 cards fanned out slightly (overlapping with translate-x offset)
- Current playable card highlighted with ring-2 ring-blue-400

**Game Controls**:
- Room code display: Large, copy-able text with icon
- Player list: Compact sidebar or top bar showing all players with status indicators
- Action buttons: Rounded, solid colors with clear icons (Leave Game, New Game)

**Drag and Drop Indicators**:
- Valid drop zone: Pulsing green border (ring-2 ring-green-400 animate-pulse)
- Invalid drop zone: Red border flash
- Dragging card: Increased opacity, larger shadow, follows cursor smoothly

### E. Game State Visualization

**Real-time Updates**:
- Card movement: Smooth CSS transitions (transition-all duration-200)
- Other player actions: Brief highlight flash on their area (bg-blue-500 bg-opacity-20)
- Win state: Confetti effect or full-screen overlay with winner announcement

**Lobby/Waiting Room**:
- Player slots: Show filled vs empty spots clearly
- Ready indicators: Checkmark icons when player is ready
- Room code: Large, centered, easily shareable

---

## Animations

**Minimal but Meaningful**:
- Card flip: 200ms 3D rotation (rotateY)
- Card move: 250ms smooth translation
- Valid move feedback: Quick scale pulse (scale-105)
- Avoid distracting loop animations - focus on action feedback only

---

## Responsive Behavior

**Desktop (Primary)**: Full layout with all player areas visible
**Tablet**: Reduce card sizes slightly, maintain grid
**Mobile**: Stack player areas vertically, increase touch targets (min 44px tap areas), show own area prominently with others scrollable

---

## Technical Requirements

- Use Heroicons for UI icons (share, copy, users, trophy)
- WebSocket connection status indicator (subtle dot: green=connected, red=disconnected)
- Loading states: Skeleton cards with pulse animation
- Error states: Toast notifications (top-right, auto-dismiss)