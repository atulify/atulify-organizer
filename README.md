# Atulify

A personal organizer macOS menu bar app for tracking tasks, notes, brag docs, and reminders.

## Features

- **Tasks**: Track regular tasks, flag rollouts, and PR reviews with scheduling and tags
- **Notes**: Markdown-enabled notes with image support and task linking
- **Brag Docs**: Period-based achievement tracking for performance reviews
- **Reminders**: Native macOS notifications with one-off, daily weekday, and weekly schedules
- **Menu Bar**: Lives in your menu bar, hidden from dock
- **Global Hotkey**: `Cmd+Shift+B` to show/hide from anywhere
- **Wake-from-Sleep**: Automatically reloads data when Mac wakes
- **Themes**: Grove, Obsidian, and Miami Nights with dark mode support
- **Auto Backup**: Daily backups with 7-day rolling retention

## Tech Stack

- **Backend**: Rust + Tauri v2
- **Frontend**: React 19 + TypeScript + Vite
- **Storage**: JSON file at `~/Library/Application Support/atulify/`

## Development

### Prerequisites

- Node.js 18+
- Rust (via Homebrew or rustup)
- Xcode Command Line Tools

### Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev
```

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+B` | Toggle window (global) |
| `Cmd+W` | Hide window |
| `Escape` | Close menus |

## Build

### Standard Build (Current Architecture)

```bash
npm run tauri build
```

This creates:
- `src-tauri/target/release/bundle/macos/Atulify.app`
- `src-tauri/target/release/bundle/dmg/Atulify_0.1.0_aarch64.dmg`

### Universal Binary (arm64 + x86_64)

Requires Rust installed via rustup (not Homebrew):

```bash
# If using Homebrew Rust, switch to rustup first:
brew uninstall rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Add x86_64 target
rustup target add x86_64-apple-darwin

# Build universal binary
npm run tauri build -- --target universal-apple-darwin
```

### Code Signing (for distribution)

1. Get an Apple Developer certificate
2. Update `src-tauri/tauri.conf.json`:
```json
{
  "bundle": {
    "macOS": {
      "signingIdentity": "Developer ID Application: Your Name (TEAMID)"
    }
  }
}
```
3. Build with signing:
```bash
npm run tauri build
```

## Project Structure

```
├── src/                    # React frontend
│   ├── components/         # Reusable UI components
│   ├── hooks/              # Custom React hooks
│   ├── views/              # Tab view components
│   ├── styles/             # CSS and theming
│   └── types/              # TypeScript interfaces
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── lib.rs          # Main app setup, tray, hotkey, sleep/wake
│   │   ├── commands/       # Tauri IPC commands
│   │   ├── models/         # Data structures
│   │   └── storage/        # File I/O and backup logic
│   ├── capabilities/       # Tauri permissions
│   └── tauri.conf.json     # Tauri configuration
└── package.json
```

## Data Storage

All data is stored in `~/Library/Application Support/atulify/`:

- `data.json` - Main application data
- `images/` - Uploaded images
- `backups/` - Daily automatic backups

## License

Private
