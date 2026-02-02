# Spark Chat — Reference

Central reference for URLs, paths, environment variables, data formats, and IPC channels. Use this when recreating the app or changing configuration.

---

## Spark API

| Item | Value |
|------|--------|
| Chat completions | `http://100.86.36.112:30000/v1/chat/completions` |
| Models (connection check) | `http://100.86.36.112:30000/v1/models` |
| Model name in request body | `openai/gpt-oss-20b` |
| Request body (non-streaming) | `{ model, messages, max_tokens: 8192, temperature: 0.7, stream: false }` |

Defined in **main.js** (e.g. `SPARK_URL` and the fetch URL in `check-connection`). Change there to point at another host/port.

---

## Paths

| Purpose | Location | Notes |
|--------|----------|--------|
| Knowledge Base root | `process.env.SPARKRAG_PATH` or `path.join(os.homedir(), 'Documents', 'Brain Vault', 'SecondBrain', 'SparkRAG')` | main.js `KB_PATH` |
| Assistants (dev) | `__dirname/data/assistants.json` | When not packaged |
| Assistants (packaged) | `app.getPath('userData')/assistants.json` | Writable; default copied from app.asar on first run |
| Default assistants (packaged) | `process.resourcesPath/app.asar/data/assistants.json` | Read-only in app bundle |

---

## Environment variables

| Variable | Used in | Purpose |
|----------|---------|---------|
| `SPARKRAG_PATH` | main.js | Override Knowledge Base root path |
| `BRAVE_API_KEY` | main.js | Optional; Brave Search API key (currently web search uses DuckDuckGo and direct news URLs) |
| `NODE_ENV` | main.js | If `'development'`, main window opens DevTools on create |

---

## External HTTP

- **DuckDuckGo Instant Answers**: `https://api.duckduckgo.com/?q=...&format=json&no_html=1`
- **News / direct fetch** (when the user’s message matches): CNN Lite, BBC News, Reuters, NPR (text), AP News. Exact URLs are in `main.js` in `performWebSearch` (e.g. `https://lite.cnn.com/`, etc.).

---

## Data formats

### assistants.json

JSON file: **array of objects**. Each object:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique id, e.g. `asst_default` or `asst_<timestamp>` |
| `name` | string | Display name in dropdown |
| `description` | string | Optional short description |
| `prompt` | string | System prompt for the model |
| `createdBy` | string | Optional |
| `createdAt` | string | ISO date |
| `updatedAt` | string | Optional; set on update |

Example:

```json
[
  {
    "id": "asst_default",
    "name": "Spark (Default)",
    "description": "General-purpose AI assistant",
    "prompt": "You are Spark, a helpful AI assistant...",
    "createdBy": "system",
    "createdAt": "2026-02-01T00:00:00.000Z"
  }
]
```

### Knowledge Base tree (get-knowledge-base)

Returned structure: **array of items**. Each item:

- **Folder**: `{ name, path, type: 'folder', children: [ ... ] }`
- **File**: `{ name, path, type: 'file', size? }`

Only `.md` and `.txt` files are included. `path` is relative to KB root (e.g. `"folder/file.md"`).

### Chat request (renderer → main)

`invoke('chat-request', { messages, useKnowledgeBase, useWebSearch, searchQuery? })`

- `messages`: array of `{ role: 'system'|'user'|'assistant', content: string }`
- `useKnowledgeBase`: boolean
- `useWebSearch`: boolean
- `searchQuery`: optional; web search uses the last user message if not provided

**Translation** is handled entirely in the renderer: when translation mode is active (to-german or to-english), the user message content sent in `messages` is prefixed with a translation instruction (e.g. “Translate the following text to German. Only respond with the translation, nothing else:\n\n”). No separate IPC channel; the same `chat-request` is used.

### Select-file result (main → renderer)

`{ path, name, content, type }` or `{ path, name, content, type, error: true }` on read error. `type` is extension (e.g. `.pdf`, `.txt`).

---

## IPC channels (reference)

| Channel | Direction | Handler in main.js | Purpose |
|---------|-----------|--------------------|---------|
| `select-file` | invoke | Yes | Open file dialog; return file content (PDF via pdf-parse, else UTF-8 text) |
| `chat-request` | invoke | Yes | Build context (web search + KB), POST to Spark, return response |
| `web-search` | invoke | Yes | performWebSearch(query), return results |
| `check-connection` | invoke | Yes | GET Spark /v1/models, return boolean |
| `get-assistants` | invoke | Yes | Read ASSISTANTS_PATH, return array |
| `save-assistant` | invoke | Yes | Create/update assistant in ASSISTANTS_PATH |
| `delete-assistant` | invoke | Yes | Remove assistant by id |
| `get-knowledge-base` | invoke | Yes | Scan KB_PATH, return { success, structure, path } or error |
| `read-kb-files` | invoke | Yes | Read files by relative path; return array of { path, name, content } or { path, error } |
| `kb-create-folder` | invoke | Yes | Create folder under KB_PATH |
| `kb-delete` | invoke | Yes | Delete file or folder |
| `kb-rename` | invoke | Yes | Rename file or folder |
| `kb-create-file` | invoke | Yes | Create .md file with content |
| `kb-save-file` | invoke | Yes | Overwrite file content |
| `kb-open-finder` | invoke | Yes | shell.openPath(KB_PATH) |
| `kb-handle-drop` | invoke | Yes | Convert dropped paths to markdown in KB (PDF, DOCX, etc.) |
| `kb-open-window` | invoke | Yes | Create KB browser window; send init-selection on load |
| `kb-close-window` | invoke | Yes | Close KB window |
| `kb-selection-changed` | send | Yes | From KB window; main forwards to main window as kb-selection-update |
| `kb-selection-update` | on (renderer) | — | Main window receives { files, folders } |
| `init-selection` | on (renderer) | — | KB window receives initial { files, folders } |

---

## Preload API (window.sparkAPI)

As defined in **preload.js** (see ARCHITECTURE.md for the full table). All renderer→main calls go through these:

- Chat: `sendMessage(messages, options)`, `checkConnection()`, `webSearch(query)`
- File: `selectFile()`
- KB read: `getKnowledgeBase()`, `readKBFiles(filePaths)`
- KB write: `kbCreateFolder(path)`, `kbDelete(path)`, `kbRename(oldPath, newName)`, `kbCreateFile(path, content)`, `kbSaveFile(path, content)`, `kbOpenFinder()`
- KB window: `kbOpenWindow(selectedFiles)`, `kbHandleDrop(paths, targetFolder)`, `kbCloseWindow()`, `kbSendSelection(selectedFiles)`
- Events: `onKBSelectionUpdate(callback)`, `onInitSelection(callback)`
- Assistants: `getAssistants()`, `saveAssistant(assistant)`, `deleteAssistant(id)`

---

## Build (electron-builder)

- **appId**: `com.ccsa.spark-chat`
- **productName**: `Spark Chat`
- **mac.icon**: `assets/icon.icns`
- **mac.target**: `dmg`, `dir`
- **files**: `main.js`, `preload.js`, `renderer/**/*`, `assets/**/*`, `data/**/*`
- **directories.output**: `dist`

---

## npm scripts

| Script | Command | Purpose |
|--------|---------|---------|
| start | `electron .` | Run app in development |
| build | `electron-builder --mac` | Build macOS app (default targets) |
| build:dmg | `electron-builder --mac dmg` | Build DMG installer |
| build:app | `electron-builder --mac dir` | Build .app directory only |

---

## Dependencies (package.json)

- **electron** ^28.0.0 — runtime
- **electron-builder** ^24.9.1 — packaging
- **mammoth** ^1.11.0 — DOCX → text
- **marked** ^11.0.0 — (available for markdown; used if needed)
- **pdf-parse** ^2.4.5 — PDF → text

All of these are required for the current behavior (chat, KB conversion, file upload). See BUILD-AND-RECREATE.md for exact versions when recreating.
