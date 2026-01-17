# Atulify - Implementation Plan

A Mac menu bar app for tracking work, maintaining a brag doc, and managing notifications.

**Tech Stack:** Tauri v2 (Rust backend) + React 19 + TypeScript + Vite

---

## Decisions

| Decision | Choice |
|----------|--------|
| App name | Atulify |
| Menu bar icon | 📝 (memo emoji) |
| Tag colors | Predefined palette (12 colors) |
| Note content | Basic Markdown rendering |

### Predefined Tag Color Palette
```
Red: #E53E3E       Orange: #DD6B20    Yellow: #D69E2E
Green: #38A169     Teal: #319795      Blue: #3182CE
Indigo: #5A67D8    Purple: #805AD5    Pink: #D53F8C
Gray: #718096      Brown: #8B5A2B     Slate: #4A5568
```

---

## Phase 1: Project Scaffolding & Basic Shell

### 1.1 Initialize Tauri v2 Project
- [ ] Install Tauri CLI and prerequisites (Rust, Xcode CLI tools)
- [ ] Create new Tauri v2 project with React + TypeScript + Vite template
- [ ] Configure for menu bar app (no dock icon, system tray)
- [ ] Set up app identifier: `com.atulify.app`
- [ ] Configure data directory: `~/Library/Application Support/atulify/`

### 1.2 Basic Window Setup
- [ ] Configure initial window size (quarter-screen calculation)
- [ ] Window state persistence (size, position) - release builds only
- [ ] Close-to-tray behavior (window hides, app keeps running)
- [ ] Menu bar icon with Show/Quit context menu
- [ ] Click menu bar icon to toggle window visibility

### 1.3 Project Structure
```
src-tauri/
  src/
    main.rs           # Entry point, tray setup
    lib.rs            # Module exports
    commands/         # Tauri commands (IPC)
    models/           # Data structures
    storage/          # File I/O, backup logic
    notifications/    # macOS notification integration

src/
  components/         # React components
  views/              # 8 main tab views
  hooks/              # Custom React hooks
  styles/             # Theme CSS/styling
  types/              # TypeScript interfaces
  App.tsx
  main.tsx
```

---

## Phase 2: Data Layer (Rust Backend)

### 2.1 Data Models (Rust structs + TypeScript types)
- [ ] **Tag**: `{ id, name, color }`
- [ ] **ResourceLink**: `{ id, url, label, link_type (github_issue, github_pr, url) }`
- [ ] **Task**: `{ id, title, completed, created_at, completed_at, scheduled_date, tags[], resource_links[], archived }`
- [ ] **Note**: `{ id, content, created_at, updated_at, tags[], linked_task_ids[], images[] }`
- [ ] **BragEntry**: `{ id, title, description, date, images[], links[] }`
- [ ] **BragDoc**: `{ id, title, start_date, end_date, entries[] }`
- [ ] **Notification**: `{ id, title, message, schedule_type (daily/weekly), time, days_of_week[], enabled }`
- [ ] **Settings**: `{ theme, launch_at_login, user_name, onboarding_complete }`
- [ ] **AppData**: Root struct containing all of the above

### 2.2 Storage Layer (Rust)
- [ ] Initialize data directory structure on first run
- [ ] Load `data.json` on startup (create default if missing)
- [ ] Save data (debounced writes to prevent excessive I/O)
- [ ] Image storage in `images/` directory
- [ ] Backup system:
  - [ ] Daily automatic backup on app launch
  - [ ] Rolling 7-day retention (delete older backups)
  - [ ] Corruption recovery (fallback to latest backup)

### 2.3 Tauri Commands (IPC Bridge)
- [ ] `get_all_data()` - Load complete app state
- [ ] `save_data(data)` - Persist changes
- [ ] `save_image(bytes, filename)` - Store image, return path
- [ ] `delete_image(path)` - Remove image file
- [ ] `export_brag_doc(doc_id)` - Generate Markdown export
- [ ] `get_backups()` - List available backups
- [ ] `restore_backup(backup_name)` - Restore from backup

---

## Phase 3: Core UI Shell

### 3.1 Navigation & Layout
- [ ] Tab bar with 7 tabs: Today, Tasks, Backlog, Notes, Brag Doc, Notifications, Settings
- [ ] Active tab indicator
- [ ] Three-dot menu button (dark mode toggle, about, quit)

### 3.2 Theming System
- [x] CSS custom properties for theme values
- [x] **Grove theme**: Cream backgrounds (#F5F2EB), sage green accents (#7D8471)
- [x] **Obsidian theme** (default): Deep black (#0D0D0D), amber accents (#FFB347)
- [x] **Miami Nights theme**: Dark backgrounds (#0A0A0B), purple accents (#A855F7)
- [x] Dark mode variants for all themes
- [x] Theme toggle in three-dot menu
- [x] Persist theme choice in settings

### 3.3 Common Components
- [ ] Modal component (with Escape to close)
- [ ] Tag selector/creator component
- [ ] Image lightbox (with Escape to close)
- [ ] Resource link input (URL + label + type selector)
- [ ] Date picker
- [ ] Confirmation dialog

---

## Phase 4: Feature Views

### 4.1 Today View (Dashboard)
- [x] Today's scheduled tasks (auto-populated from Tasks)
- [x] Carry-over section: incomplete tasks from previous days
- [x] Recent notes (last 5-7 notes)
- [x] Quick navigation links to other views
- [x] Quick-add task button

### 4.2 Tasks View
- [x] Date navigation (prev/next day, date picker)
- [x] Task list for selected date
- [x] Add new task (title, tags, resource links)
- [x] Mark task complete (moves to archived section)
- [x] Defer task to backlog
- [x] Edit task inline
- [x] Filter/search by tags
- [x] Archived tasks section (collapsible)
- [x] Carry-forward logic: incomplete past tasks auto-show in Today
- [x] **Task Types**: Regular, Flag Rollout (with URL), PR Review (with URL + Claude button)
- [x] **PR Review**: Claude button opens Terminal window "Claude Code Review" and runs `code_review <url>`

### 4.3 Backlog View
- [x] List of unscheduled tasks
- [x] Add task directly to backlog
- [x] Schedule task (assign to specific date)
- [x] Filter/search by tags
- [x] Reorder tasks (up/down buttons)

### 4.4 Notes View
- [x] Note list with timestamps
- [x] Create note (content, tags, images, linked tasks)
- [x] Basic Markdown rendering (bold, italic, links, lists, code)
- [x] Image support: drag-drop and clipboard paste (Cmd+V)
- [x] Edit note
- [x] Delete note (with confirmation)
- [x] Filter by tags
- [x] Search notes content
- [x] Link/unlink tasks from notes
- [x] Cmd+Enter to save new note

### 4.5 Brag Doc View
- [x] List of brag doc periods
- [x] Create new brag doc (title, start date, end date)
- [x] Auto-create prompt when current date exceeds latest end date
- [x] Add entry to brag doc (title, description, date, images, links)
- [x] Edit/delete entries
- [x] Image support (drag-drop, clipboard paste)
- [x] Export to Markdown button
- [x] View past brag docs

### 4.6 Notifications View
- [x] List of configured reminders
- [x] Create reminder:
  - [x] Title and message
  - [x] Schedule type: one-off, daily (weekdays), weekly
  - [x] Time picker
  - [x] Day-of-week selector (for weekly)
  - [x] Date picker (for one-off)
- [x] Enable/disable toggle per reminder
- [x] Edit/delete reminders
- [ ] Test notification button

### 4.7 Settings View
- [x] User name (for personalization)
- [x] Theme selector (Grove/Obsidian/Miami Nights)
- [x] Dark mode toggle
- [x] Launch at login toggle
- [ ] Notification permissions status/request
- [ ] Backup management:
  - [ ] View backup list
  - [x] Manual backup button
  - [ ] Restore from backup
- [x] About section (version)

---

## Phase 5: System Integration

### 5.1 Menu Bar / System Tray
- [x] Custom tray icon
- [x] Click to toggle window
- [x] Right-click context menu: Show Window, Quit
- [x] Hide dock icon (LSUIElement or Tauri equivalent)

### 5.2 macOS Notifications
- [ ] Request notification permission
- [ ] Schedule local notifications based on reminders
- [ ] Notification click opens app window

### 5.3 System Events
- [ ] Auto-reload data on Mac wake from sleep
- [ ] Launch at login integration (launchd or login items)
- [ ] Global hotkey: Cmd+Shift+B to show window

### 5.4 Window Behavior
- [ ] Remember window position/size (release builds only)
- [x] Cmd+W hides window (not quit)
- [x] First-run: auto-size to quarter screen

---

## Phase 6: Onboarding & Polish

### 6.1 First-Run Onboarding
- [x] Welcome screen with app introduction
- [x] Name input
- [x] Theme selection (Grove/Obsidian/Miami Nights)
- [ ] Notification permission request
- [x] Launch at login option
- [x] "Get Started" completion

### 6.2 Keyboard Shortcuts
- [x] Cmd+W - Hide window
- [ ] Cmd+Shift+B - Global hotkey to show window
- [x] Cmd+Enter - Save quick note (in Notes view)
- [x] Escape - Close modals and lightbox

### 6.3 Final Polish
- [x] Loading states for async operations
- [x] Error handling and user feedback
- [x] Empty states for each view
- [x] Smooth transitions between views (fadeIn, slideUp animations)
- [ ] Accessibility (keyboard navigation, screen reader labels)

---

## Phase 7: Build & Distribution

### 7.1 Build Configuration
- [ ] App icon (menu bar + app icon if shown)
- [ ] Build for Apple Silicon (arm64) and Intel (x86_64)
- [ ] Universal binary option
- [ ] Code signing (if distributing outside App Store)

### 7.2 Testing
- [ ] Manual testing on macOS
- [ ] Test backup/restore flow
- [ ] Test notification scheduling
- [ ] Test wake-from-sleep behavior

---

## Data File Locations

```
~/Library/Application Support/atulify/
├── data.json          # All app data
├── images/            # Stored images
│   ├── note-xxx.png
│   └── brag-xxx.jpg
└── backups/           # Rolling 7-day backups
    ├── data-2026-01-16.json
    └── data-2026-01-15.json
```

---

## Progress Tracking

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Scaffolding | Complete | Tauri v2 project with menu bar, tray icon, close-to-tray |
| Phase 2: Data Layer | Complete | Models, storage, all commands registered |
| Phase 3: Core UI | Complete | Navigation, theming (Grove/Obsidian/Miami Nights), common components |
| Phase 4: Features | Complete | All views implemented: Today, Tasks, Backlog, Notes, Brag Doc, Notifications, Settings |
| Phase 5: System Integration | Partial | Tray icon, Cmd+W hide. TODO: macOS notifications, global hotkey, wake-from-sleep |
| Phase 6: Polish | Mostly Complete | Onboarding flow, loading states, animations. TODO: notification permissions, accessibility |
| Phase 7: Build | Not Started | |

---

## Recent Changes (2026-01-16)

- Added **Miami Nights** theme (dark with purple accents)
- Implemented **Onboarding flow** (welcome, name, theme selection, permissions)
- Added **Task Types**: Regular, Flag Rollout, PR Review
- **PR Review tasks**: Claude button opens Terminal "Claude Code Review" window/tab and runs `code_review <url>`
- Added **Cmd+W** keyboard shortcut to hide window
- Added **loading states** and **smooth animations** (fadeIn, slideUp)
- **Backlog reordering** with up/down buttons

---

*Last updated: 2026-01-16*
