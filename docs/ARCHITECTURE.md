# Spark Chat — Architecture

<!-- DOCUMENT PURPOSE: This document describes the technical architecture of Spark Chat, including the Electron process model, file structure, IPC communication, and data flow -->

This document describes how the application is built: process model, file roles, IPC, and data flow.

## Overview

<!-- OVERVIEW: High-level explanation of the Electron architecture and the three main components -->
Spark Chat is an **Electron** desktop app for macOS that talks to a Spark LLM API over the network (e.g. via Tailscale). It has:

- **Main process** (`main.js`) — window lifecycle, file system, network, IPC handlers
- **Preload script** (`preload.js`) — exposes a safe API to renderer via `contextBridge`
- **Renderer processes** — two windows:
  - **Main chat window** — `renderer/index.html` + `app.js` + `styles.css`
  - **Knowledge Base browser** — `renderer/kb-browser.html` + `kb-browser.js` + `kb-browser.css`

Context isolation is on; Node is not exposed to renderer. All OS/network/file access goes through IPC.

---

## Directory Structure

<!-- DIRECTORY STRUCTURE: Overview of the project file organization and what each directory contains -->
```
spark-chat-app/
├── main.js              # Electron main process
├── preload.js           # Preload script (contextBridge API)
├── package.json         # Dependencies and electron-builder config
├── .gitignore
├── assets/
│   ├── icon.png         # App icon (PNG, used in dev)
│   ├── icon.icns        # macOS app icon (build)
│   └── .gitkeep
├── data/
│   └── assistants.json  # Default/shipped assistant definitions
└── renderer/
    ├── index.html       # Main chat window
    ├── app.js           # Main chat UI logic
    ├── styles.css       # Main window styles
    ├── kb-browser.html  # KB browser window
    ├── kb-browser.js    # KB browser logic
    └── kb-browser.css   # KB browser styles
```

At runtime, **packaged** app uses:

- `app.getPath('userData')` for writable `assistants.json` (copy from `data/assistants.json` on first run).
- Knowledge Base path: `SPARKRAG_PATH` or `~/Documents/Brain Vault/SecondBrain/SparkRAG`.

---

## Process Model

<!-- PROCESS MODEL: Explanation of Electron's multi-process architecture and responsibilities of each process -->

### Main process (`main.js`)

<!-- MAIN PROCESS: The Node.js backend process that manages windows, file system, network, and IPC -->
- Creates and owns windows.
- Registers all IPC handlers.
- Uses Node/Electron APIs: `fs`, `path`, `dialog`, `shell`, `fetch`, and npm packages `pdf-parse`, `mammoth`.

Responsibilities:

1. **Window lifecycle** — create main window and optional KB browser window; handle `window-all-closed` and `activate`.
2. **Assistants** — `initAssistants()`: copy default `data/assistants.json` to userData when packaged and file missing.
3. **Chat** — `chat-request`: build messages (optional web search + KB context), POST to Spark URL, return response.
4. **Connection check** — `check-connection`: GET Spark `/v1/models` to verify reachability.
5. **File upload** — `select-file`: native dialog; read PDF (pdf-parse) or text; return `{ path, name, content, type }`.
6. **Web search** — `performWebSearch` / `web-search`: DuckDuckGo Instant Answers or direct fetch for known news sites; result text is injected as context for chat.
7. **Knowledge Base** — `get-knowledge-base`, `read-kb-files`, `kb-create-folder`, `kb-delete`, `kb-rename`, `kb-create-file`, `kb-save-file`, `kb-open-finder`, `kb-handle-drop` (with PDF/DOCX/etc. → markdown conversion via pdf-parse and mammoth).
8. **KB window** — `kb-open-window`, `kb-close-window`; forward selection via `kb-selection-changed` → `kb-selection-update` to main window.

Hardcoded endpoints in main (see REFERENCE.md for exact values):

- Spark: `http://100.86.36.112:30000/v1/chat/completions` and `/v1/models`.
- Web: DuckDuckGo API; optional direct URLs for CNN, BBC, Reuters, NPR, AP.

### Preload (`preload.js`)

<!-- PRELOAD SCRIPT: Security bridge between main and renderer processes using contextBridge -->
- Runs in a privileged context; does not have DOM.
- Uses `contextBridge.exposeInMainWorld('sparkAPI', { ... })` to expose only the following to renderer:

| Method | IPC / behavior |
|--------|-----------------|
| `sendMessage(messages, options)` | `chat-request` |
| `checkConnection()` | `check-connection` |
| `webSearch(query)` | `web-search` |
| `selectFile()` | `select-file` |
| `getKnowledgeBase()` | `get-knowledge-base` |
| `readKBFiles(filePaths)` | `read-kb-files` |
| `kbCreateFolder(path)` | `kb-create-folder` |
| `kbDelete(path)` | `kb-delete` |
| `kbRename(oldPath, newName)` | `kb-rename` |
| `kbCreateFile(path, content)` | `kb-create-file` |
| `kbSaveFile(path, content)` | `kb-save-file` |
| `kbOpenFinder()` | `kb-open-finder` |
| `kbOpenWindow(selectedFiles)` | `kb-open-window` |
| `kbHandleDrop(paths, targetFolder)` | `kb-handle-drop` |
| `kbCloseWindow()` | `kb-close-window` |
| `kbSendSelection(selectedFiles)` | `kb-selection-changed` (send) |
| `onKBSelectionUpdate(callback)` | `kb-selection-update` (on) |
| `onInitSelection(callback)` | `init-selection` (on) |
| `getAssistants()` | `get-assistants` |
| `saveAssistant(assistant)` | `save-assistant` |
| `deleteAssistant(id)` | `delete-assistant` |

So: **all** backend behavior is triggered by these `sparkAPI` calls from the renderer.

### Renderer — Main window (`index.html` + `app.js` + `styles.css`)

<!-- MAIN WINDOW RENDERER: The chat interface where users interact with Spark, manage conversations, and configure settings -->
- **index.html**: Titlebar (with icon and connection status), messages area, KB panel (tree + selection), modals (KB create/rename, agent form), input area (agent dropdown, **translation toggle** Off/🇩🇪/🇺🇸, KB toggle, web search toggle, upload, clear), textarea, send button, uploaded-file strip, KB selection bar.
- **app.js**:
  - Connection: `checkConnection()` on load and every 30s; enables/disables send.
  - **Translation**: state `translateMode` ('none' | 'to-german' | 'to-english'); UI buttons (transNone, transGerman, transEnglish) call `setTranslateMode(mode)`. When sending, if translation is active, the user message is wrapped with a "Translate … only respond with the translation" instruction (German or English); the displayed user message gets a flag prefix (🇩🇪 or 🇺🇸). Send button icon/title switch to flag or ➤ per mode.
  - Chat: build messages (user + optional file + KB context + translation wrapper when active), use selected agent’s system prompt, call `sparkAPI.sendMessage(...)` with `useKnowledgeBase` and `useWebSearch`; render assistant/error; typing indicator while waiting.
  - Agents: load list via `getAssistants()`, populate dropdown; manage (add/edit/delete) via modal and `saveAssistant` / `deleteAssistant`.
  - KB: load tree via `getKnowledgeBase()`, render tree; “KB” button opens KB window via `kbOpenWindow`; listen `onKBSelectionUpdate` to update local selection and selection bar; when sending, if folders selected, expand to file paths and call `readKBFiles`, then append to system prompt.
  - File upload: `selectFile()`, show name and “remove”; on send, prepend file content to user message.
- **styles.css**: CSS variables (dark theme), layout, titlebar, messages, input, toggles, **translation toggle** (.translate-toggle, .trans-btn, .trans-btn.active), KB panel, modals, agent list/form, context menu.

### Renderer — KB browser (`kb-browser.html` + `kb-browser.js` + `kb-browser.css`)

<!-- KB BROWSER WINDOW: Separate window for browsing, managing, and selecting files from the Knowledge Base -->
- **kb-browser.html**: Toolbar (new folder/file, open Finder, selection count, Apply), sidebar (path + folder tree), main area (file grid + drop overlay), footer (selected tags), modal, context menu.
- **kb-browser.js**:
  - On load: `getKnowledgeBase()`, render folder tree and file grid; `onInitSelection` to set initial selected files/folders.
  - Selection: toggle files/folders in sets; `kbSendSelection({ files, folders })` on change; “Apply Selection” calls `kbCloseWindow()` after sending.
  - Create/rename/delete via modals and context menu using `kbCreateFolder`, `kbCreateFile`, `kbRename`, `kbDelete`.
  - Drag-and-drop: get file paths from `DataTransfer`, call `kbHandleDrop(paths, currentFolder)`; show toast; refresh KB.
- **kb-browser.css**: Same design tokens as main app; layout for toolbar, sidebar, grid, cards, modal, context menu, drop overlay, toast.

---

## IPC Flow (Summary)

<!-- IPC FLOW: Explanation of how inter-process communication works between main and renderer processes -->
- **Renderer → Main**: `invoke('channel', ...args)` for all operations (chat, file, KB, assistants).
- **Main → Renderer**:
  - Return values of `invoke()` (e.g. chat response, connection boolean, KB structure).
  - `mainWindow.webContents.send('kb-selection-update', selectedFiles)` when KB window sends selection.
  - `kbWindow.webContents.send('init-selection', selectionData)` when KB window finishes load.

So the only “push” from main to renderer is selection updates and init-selection; everything else is request/response via `invoke`.

---

## Build and Packaging

<!-- BUILD AND PACKAGING: How the application is packaged for distribution using electron-builder -->
- **Runtime**: `electron .` (or `npm start`) — runs with `main.js` as main, loads `renderer/index.html` in the default window.
- **Packaging**: `electron-builder --mac` (see `package.json` scripts). Uses `assets/icon.icns`, includes `main.js`, `preload.js`, `renderer/**/*`, `assets/**/*`, `data/**/*`. Output: `dist/` (e.g. `.app` and `.dmg`).

For full recreation steps (from scratch), see **BUILD-AND-RECREATE.md**.
