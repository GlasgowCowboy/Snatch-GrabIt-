# Snatch&GrabIt! - Multiplayer Card Game

## Overview

Snatch&GrabIt! is a fast-paced multiplayer competitive solitaire card game built as a real-time web application. Players race to empty their "bone pile" first by playing cards to shared foundation piles and managing their personal tableau. The application features a lobby system for creating/joining games, customizable scoring methods, and an interactive game board with instant visual feedback.

**Powered by AppSmith**

**Core Technologies:**
- **Frontend:** React with TypeScript, Vite build system
- **UI Framework:** shadcn/ui components built on Radix UI primitives
- **Styling:** Tailwind CSS with custom design system
- **Backend:** Express.js server with TypeScript
- **Database:** Drizzle ORM configured for PostgreSQL (via Neon serverless)
- **State Management:** TanStack Query (React Query) for server state
- **Routing:** Wouter (lightweight client-side routing)

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Component Structure:**
- **Atomic Design Pattern:** Small, reusable components (`PlayingCard`, `CardPile`) compose into larger feature components (`PlayerArea`, `GameBoard`)
- **Component Organization:**
  - `/components/ui/` - shadcn/ui base components (buttons, cards, dialogs, etc.)
  - `/components/` - Game-specific components (GameLobby, GameBoard, PlayingCard, etc.)
  - `/components/examples/` - Example usage/documentation for components
  - `/pages/` - Route-level components (Home, NotFound)

**State Management Approach:**
- **Local State:** React `useState` for UI interactions and temporary game state
- **Server State:** TanStack Query for API data fetching and caching
- **Game State:** Currently managed locally in `GameBoardInteractive` component with full game logic implementation
- **Future Pattern:** Game state should be managed server-side with WebSocket synchronization for multiplayer

**Design System:**
- Dark mode primary with traditional card table aesthetic (deep forest green background)
- CSS custom properties for theming (`--background`, `--primary`, etc.)
- Consistent spacing using Tailwind units (2, 3, 4, 6, 8)
- Typography: Inter for UI, Roboto Mono for card values
- Responsive design with mobile breakpoint at 768px

### Backend Architecture

**Server Setup:**
- Express.js application with TypeScript
- Vite middleware for development HMR
- Request/response logging middleware
- Error handling middleware

**API Structure:**
- Routes defined in `server/routes.ts` with `/api` prefix convention
- HTTP server created for potential WebSocket upgrade
- Currently minimal routes - designed for expansion

**Storage Layer:**
- **Interface-based Design:** `IStorage` interface defines CRUD operations
- **Current Implementation:** In-memory storage (`MemStorage`) for development
- **Production Pattern:** Swap to database-backed implementation without changing business logic
- **User Operations:** `getUser`, `getUserByUsername`, `createUser`

### Data Models

**Database Schema** (`shared/schema.ts`):
- **Users Table:** UUID primary key, username (unique), password
- **Validation:** Zod schemas generated from Drizzle schema for runtime validation

**Game Models:**
```typescript
Card: { suit: Suit, rank: Rank, id: string, playedBy?: string }
PlayerState: { id, name, tableau[][], bonePile[], drawPile[], currentDraw[], score, roundScore }
FoundationPile: { id, suit, cards[] }
GameState: { id, players[], foundations[], status, winnerId, scoringSettings }
```

**Design Decisions:**
- Shared types between client/server via `@shared` alias prevents type drift
- Card IDs include player ID to prevent conflicts in multiplayer
- Foundation piles track which player played each card for scoring

### Game Logic

**Core Mechanics:**
- Deck generation and Fisher-Yates shuffle algorithm
- Card dealing: 13 to bone pile, 4 to tableau columns, rest to draw pile
- Foundation building: Ace to King by suit (shared between players)
- Tableau building: Descending rank, alternating colors
- Scoring methods: "fullHand" (single round to 0) or "round" (multiple rounds to target score)

**Interactive Features:**
- Card selection system with yellow border visual highlights (border-[3px] border-yellow-400)
- Drag-free click-based card movement
- Valid move validation (foundation and tableau rules)
- Round completion with scoring overlay
- Customizable card backs via image URLs
- Click-to-draw interaction on draw pile (no button, shows "Click to turn 3" / "Click to reset" hints)
- Disabled draw pile for opponents (opacity-50, cursor-not-allowed, no interactivity)

### Authentication & Authorization

**Current State:** Basic user schema exists but no authentication implemented

**Planned Pattern:**
- Session-based authentication with `connect-pg-simple` (already in dependencies)
- Password hashing (implementation needed)
- Protect game routes to authenticated users
- User ID association with game rooms

## Recent UI Improvements (October 2025)

### Player Area Optimization
- **Space-saving header redesign**: Player name moved to far right, "You" badge removed
- Shows "Your Area" label on left, player name on right for current player
- "Player Area" label for opponents

### Draw Pile Interaction Enhancement  
- **Removed button-based interface**: Draw pile cards are now directly clickable
- **Current player**: Shows "Click to turn 3" text below face-down card, or "Click to reset" when empty
- **Opponents**: Draw pile shows disabled state (50% opacity, cursor-not-allowed, no text hints)
- Maintains accessibility with proper aria-disabled attributes

### Visual Feedback Improvements
- **Demo badge removed**: Cleaner game header without "Demo - Cards move for testing!" message
- **Enhanced scoreboard ticker**: Added ChevronRight icon on left with "Scoreboard" label
- Scrolling scores now fade behind gradient overlays for smooth visual effect
- Fixed duplicate players bug in scoreboard display

### Mobile Responsiveness
- Draw pile positioned at bottom-right on mobile layout
- No horizontal scrolling on iPhone 15
- Responsive player area with stacked layout for small screens

## External Dependencies

### Third-Party UI Libraries
- **Radix UI:** Headless accessible component primitives (dialog, dropdown, popover, tooltip, etc.)
- **Lucide React:** Icon library for UI elements (Heart, Diamond, Spade, Club icons)
- **cmdk:** Command palette component
- **embla-carousel-react:** Carousel/slider components

### Data & State Management
- **TanStack Query (React Query):** Server state management and caching
- **React Hook Form:** Form state management with `@hookform/resolvers`
- **Zod:** Runtime schema validation
- **Drizzle Zod:** Bridge between Drizzle schema and Zod validation

### Database & ORM
- **Drizzle ORM:** Type-safe database queries with migrations
- **@neondatabase/serverless:** PostgreSQL connection for serverless environments
- **drizzle-kit:** CLI for schema migrations and pushes

### Styling & UI Utilities
- **Tailwind CSS:** Utility-first CSS framework
- **class-variance-authority:** Component variant management
- **clsx & tailwind-merge:** Conditional className utilities
- **date-fns:** Date formatting utilities

### Build & Development Tools
- **Vite:** Frontend build tool and dev server
- **esbuild:** Server-side bundling for production
- **tsx:** TypeScript execution for development
- **@replit/vite-plugin-*:** Replit-specific dev tooling (error overlay, cartographer, dev banner)

### Routing & Navigation
- **Wouter:** Lightweight client-side routing library

### Fonts
- **Google Fonts:** Inter (UI text) and Roboto Mono (card values) loaded via CDN

### Missing Integrations
- **WebSockets:** Not yet implemented - needed for real-time multiplayer
- **Authentication Library:** No bcrypt/passport/jwt implemented yet
- **Session Store:** connect-pg-simple installed but not configured
- **Real-time Communication:** Consider Socket.io or native WebSockets for game synchronization