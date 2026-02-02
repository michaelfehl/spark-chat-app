# Spark Chat — Build and Full Recreation Guide

<!-- DOCUMENT PURPOSE: Step-by-step guide to recreate the entire Spark Chat application from scratch, useful for setting up on a new machine or rebuilding without the original repository -->

This guide lets you **recreate the entire application from scratch**: prerequisites, project setup, and every file you need with a short description of its role. Use it to rebuild the app on a new machine or from zero.

---

## Prerequisites

<!-- PREREQUISITES: System requirements and tools needed before starting the project setup -->
- **Node.js** 18+ (LTS recommended)
- **npm** (comes with Node)
- **macOS** 11+ (for building the macOS app; Electron runs on other platforms but the app is tailored for macOS)
- **Tailscale** (optional, for reaching the Spark backend at `100.86.36.112`)

---

## Step 1: Project scaffold

<!-- STEP 1: Initialize a new Node.js project and create the basic directory structure -->
```bash
mkdir spark-chat-app
cd spark-chat-app
npm init -y
```

Edit `package.json` so it matches the project (see Step 2). Then create directories:

```bash
mkdir -p assets data renderer docs
touch assets/.gitkeep
```

---

## Step 2: package.json

<!-- STEP 2: Configure dependencies, scripts, and electron-builder settings for the project -->
Create or replace `package.json` with:

```json
{
  "name": "spark-chat",
  "version": "1.0.0",
  "description": "Spark LLM Chat Application for macOS",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder --mac",
    "build:dmg": "electron-builder --mac dmg",
    "build:app": "electron-builder --mac dir"
  },
  "author": "CCS Associates",
  "license": "MIT",
  "devDependencies": {
    "electron": "^28.0.0",
    "electron-builder": "^24.9.1"
  },
  "dependencies": {
    "mammoth": "^1.11.0",
    "marked": "^11.0.0",
    "pdf-parse": "^2.4.5"
  },
  "build": {
    "appId": "com.ccsa.spark-chat",
    "productName": "Spark Chat",
    "mac": {
      "category": "public.app-category.productivity",
      "icon": "assets/icon.icns",
      "target": ["dmg", "dir"]
    },
    "directories": {
      "output": "dist"
    },
    "files": [
      "main.js",
      "preload.js",
      "renderer/**/*",
      "assets/**/*",
      "data/**/*"
    ],
    "extraResources": []
  }
}
```

Then run:

```bash
npm install
```

- **electron** — app runtime
- **electron-builder** — packaging for macOS (`.app`, DMG)
- **mammoth** — DOCX → text (for KB and file handling)
- **marked** — reserved for markdown rendering if needed
- **pdf-parse** — PDF → text for uploads and KB

---

## Step 3: .gitignore

<!-- STEP 3: Configure Git to ignore build artifacts, dependencies, and temporary files -->
Create `.gitignore`:

```
node_modules/
dist/
.DS_Store
*.log
npm-debug.log*
.env
.env.local
```

---

## Step 4: Main process — main.js

<!-- STEP 4: Create the Electron main process that handles windows, IPC, network requests, and file operations -->
Create `main.js` at the project root. It must:

1. Require: `electron` (app, BrowserWindow, ipcMain, dialog), `path`, `fs`, `os`.
2. Define:
   - `BRAVE_API_KEY` (optional; from env or placeholder)
   - `KB_PATH` = `process.env.SPARKRAG_PATH` or `path.join(os.homedir(), 'Documents', 'Brain Vault', 'SecondBrain', 'SparkRAG')`
   - `ASSISTANTS_PATH` = in packaged app `app.getPath('userData')/assistants.json`, else `__dirname/data/assistants.json`
3. Implement `initAssistants()`: if packaged and `ASSISTANTS_PATH` missing, copy from `process.resourcesPath/app.asar/data/assistants.json`.
4. Create main window with `loadFile('renderer/index.html')`, `preload: path.join(__dirname, 'preload.js')`, `contextIsolation: true`, `nodeIntegration: false`, `titleBarStyle: 'hiddenInset'`, `trafficLightPosition`, `backgroundColor: '#1a1a2e'`.
5. On `app.whenReady()`: call `initAssistants()`, then `createWindow()`.
6. Handle `window-all-closed` (quit if not darwin) and `activate` (create window if none).
7. IPC handlers (see REFERENCE.md or ARCHITECTURE.md for full list):
   - `select-file` — dialog, read PDF (pdf-parse) or text, return `{ path, name, content, type }`
   - `chat-request` — build messages (optional web search + KB), POST to Spark URL, return `{ success, content }` or `{ success: false, error }`
   - `web-search` — call `performWebSearch(query)` (DuckDuckGo or direct news URLs), return results
   - `check-connection` — GET Spark `/v1/models`, return boolean
   - `get-assistants`, `save-assistant`, `delete-assistant` — read/write `ASSISTANTS_PATH`
   - `get-knowledge-base` — scan `KB_PATH` for `.md`/`.txt`, return tree
   - `read-kb-files` — read files under `KB_PATH` by relative path
   - `kb-create-folder`, `kb-delete`, `kb-rename`, `kb-create-file`, `kb-save-file`, `kb-open-finder`, `kb-handle-drop` — KB filesystem ops; `kb-handle-drop` uses pdf-parse and mammoth to convert PDF/DOCX/etc. to markdown
   - `kb-open-window` — create second BrowserWindow with `renderer/kb-browser.html`, same preload; send `init-selection` on `did-finish-load`
   - `kb-close-window` — close KB window
   - Subscribe to `kb-selection-changed` and forward to main window with `kb-selection-update`

Spark URL used in code: `http://100.86.36.112:30000/v1/chat/completions` (and `/v1/models` for check). For full implementation details, copy from the existing `main.js` in the repo (it contains all of the above logic).

---

## Step 5: Preload — preload.js

Create `preload.js` at the project root. Use `contextBridge.exposeInMainWorld('sparkAPI', { ... })` and expose exactly the API described in ARCHITECTURE.md (e.g. `sendMessage`, `checkConnection`, `webSearch`, `selectFile`, all KB and assistant methods, and `onKBSelectionUpdate` / `onInitSelection`). Each method should call `ipcRenderer.invoke('channel', ...)` or `ipcRenderer.send` / `ipcRenderer.on` as appropriate. Copy the implementation from the repo’s `preload.js`.

---

## Step 6: Renderer — main window

- **renderer/index.html**  
  - DOCTYPE, html lang="en", head (charset, viewport, CSP `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'`), title “Spark Chat”, link to `styles.css`.
  - Body: app container, titlebar (drag region, icon, “Spark Chat”, connection status), chat container (messages div with welcome message), KB panel (header, path, tree, selected count), context menu (rename/delete), modal (folder/file name input), input area (agent select, **translation toggle** 🌐 Off / 🇩🇪 / 🇺🇸 with ids transNone, transGerman, transEnglish, KB button, web search toggle, upload, clear, textarea, send button, uploaded file strip, KB selection bar), agent modal (list + form for name/description/prompt).
  - Script: `app.js`.

- **renderer/app.js**  
  - DOM refs, state (conversationHistory, uploadedFile, isConnected, selectedKBFiles, selectedKBFolders, kbStructure, assistants, currentAssistant, **translateMode** 'none'|'to-german'|'to-english'), **translation elements** (transNone, transGerman, transEnglish).
  - On DOMContentLoaded: checkConnection, setInterval(checkConnection, 30000), input/keydown/send/clear/upload/KB/modal/**translation**/context/agent listeners; loadKnowledgeBase(), loadAssistants().
  - **Translation**: setTranslateMode(mode) updates translateMode, button active state, and send button icon/title (➤ vs 🇩🇪 vs 🇺🇸). In sendMessage, if translateMode is to-german or to-english, wrap user message with “Translate … only respond with the translation” and show user message with flag prefix (🇩🇪 or 🇺🇸).
  - Implement: loadKnowledgeBase, renderKBTree, toggleFileSelection, updateKBSelectedCount, toggleKBPanel (opens KB window), onKBSelectionUpdate handler, updateSelectionBar, context menu and modal (new folder/file, rename, delete), checkConnection, autoResize, handleKeydown (⌘+Enter send), updateSendButton, sendMessage (build user message with file + KB context **+ translation wrapper when active**, system prompt from current agent, call sparkAPI.sendMessage, addMessage/addTypingIndicator), addMessage (simple markdown-like formatting), addTypingIndicator, setTranslateMode, clearChat, handleUpload, removeFile, loadAssistants, populateAgentSelect, handleAgentChange, openAgentModal, closeAgentModal, renderAgentList, showAgentForm, hideAgentForm, editAgent, saveAgent. Copy from repo `app.js` for exact behavior.

- **renderer/styles.css**  
  - CSS variables (--bg-primary, --bg-secondary, --accent, --text-primary, etc.), layout (titlebar, messages, input, send button), connection status dots, welcome message, message bubbles (user/assistant/error), typing indicator, toggles, **translation toggle** (.translate-toggle, .translate-label, .trans-btn, .trans-btn.active), KB panel and tree, agent selector and modal, context menu, modals, selection bar. Copy from repo `styles.css`.

---

## Step 7: Renderer — KB browser window

<!-- STEP 7: Create the Knowledge Base browser window for managing and selecting files -->
- **renderer/kb-browser.html**  
  - Same CSP as index. Title “Knowledge Base Browser”. Link `kb-browser.css`. Body: toolbar (new folder/file, open Finder, selection count, Apply), sidebar (path, folder tree), main (drop overlay, file grid), footer (selected tags), modal, context menu. Script: `kb-browser.js`.

- **renderer/kb-browser.js**  
  - Load KB, render folder tree and file grid; onInitSelection to set initial selection; toggle files/folders and call kbSendSelection; new folder/file and rename/delete via modal and context menu; drag-and-drop: get paths, kbHandleDrop(paths, currentFolder), toast, refresh. Copy from repo `kb-browser.js`.

- **renderer/kb-browser.css**  
  - Same design tokens as main app; toolbar, sidebar, folder tree, file grid, file cards, modal, context menu, drop overlay, toast. Copy from repo `kb-browser.css`.

---

## Step 8: Data and assets

<!-- STEP 8: Set up default assistant definitions and application icons -->
- **data/assistants.json**  
  - JSON array of assistant objects. Each: `id`, `name`, `description`, `prompt`, `createdBy`, `createdAt`. Include at least one default, e.g. id `asst_default`, name “Spark (Default)”. See repo `data/assistants.json` for schema and example.

- **assets/icon.png**  
  - PNG icon (e.g. 256×256 or 512×512) used in development and in the titlebar/welcome area. Create or copy from repo. Recommended minimum size: 512×512 pixels for best quality.

- **assets/icon.icns**  
  - macOS app icon set for the built .app. Generate from icon.png (e.g. with `iconutil` or an online converter) or copy from repo.

---

## Step 9: Verify run and build

<!-- STEP 9: Test the application in development mode and build distributable packages -->
```bash
npm start
```

- Main window should open, show “Checking…” then “Connected” or “Disconnected”.
- Send a message (if Spark is reachable); use KB, upload, agents as in USER-GUIDE.md.

Build:

```bash
npm run build
# or
npm run build:dmg
npm run build:app
```

Output is under `dist/`. Install the .app or DMG and run Spark Chat from Applications.

---

## Step 10: Optional — Environment and config

<!-- STEP 10: Customize URLs, paths, and API keys for different environments or backends -->
- **Spark URL**: Edit `main.js` and change the `SPARK_URL` (and models URL) if your backend is different.
- **Knowledge Base path**: Set `SPARKRAG_PATH` in the environment or change `KB_PATH` in `main.js`.
- **Brave API**: Used only if you add Brave search; currently web search uses DuckDuckGo and direct news URLs. Set `BRAVE_API_KEY` in env if you use it.

---

## File checklist (recreation)

<!-- FILE CHECKLIST: Complete list of all files needed to recreate the application with their purposes -->
| Path | Purpose |
|------|--------|
| `package.json` | Dependencies, scripts, electron-builder config |
| `.gitignore` | Ignore node_modules, dist, logs, .env |
| `main.js` | Main process: windows, IPC, Spark, KB, assistants |
| `preload.js` | contextBridge API for renderer |
| `renderer/index.html` | Main chat UI structure |
| `renderer/app.js` | Main chat logic |
| `renderer/styles.css` | Main window styles |
| `renderer/kb-browser.html` | KB window structure |
| `renderer/kb-browser.js` | KB window logic |
| `renderer/kb-browser.css` | KB window styles |
| `data/assistants.json` | Default assistants |
| `assets/icon.png` | Dev/titlebar icon |
| `assets/icon.icns` | macOS .app icon |

With these files and the described behavior (best taken by copying from the repo), you can recreate the entire application from scratch.
