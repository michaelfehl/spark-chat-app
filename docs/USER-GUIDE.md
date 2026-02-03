# Spark Chat — User Guide

<!-- DOCUMENT PURPOSE: Complete user guide for installing, configuring, and using Spark Chat, including all features like agents, Knowledge Base, translation, and web search -->

How to use Spark Chat: connection, chatting, agents, Knowledge Base, file upload, and web search.

---

## Requirements

<!-- REQUIREMENTS: System and network prerequisites for running Spark Chat -->
- **macOS** 11.0 or later
- **Tailscale** (or other way to reach the Spark server at `100.86.36.112`)
- Spark backend running at `http://100.86.36.112:30000` (see Configuration to change this)

---

## Installation

<!-- INSTALLATION: How to install Spark Chat from a DMG file or build from source code -->

### From DMG (recommended)

1. Download the latest release DMG.
2. Open the DMG and drag **Spark Chat** to **Applications**.
3. Launch **Spark Chat** from Applications (or Spotlight).

### From source

```bash
git clone https://github.com/michaelfehl/spark-chat-app.git
cd spark-chat-app
npm install
npm start
```

To build a distributable app: `npm run build` or `npm run build:dmg`.

---

## First launch

<!-- FIRST LAUNCH: What to expect when starting Spark Chat for the first time and connection status indicators -->
1. Make sure **Tailscale** is connected (or your network can reach the Spark host).
2. Open **Spark Chat**.
3. In the title bar you’ll see:
   - **Checking…** (yellow) — app is testing the connection.
   - **Connected** (green) — Spark is reachable; you can send messages.
   - **Disconnected** (red) — Spark is not reachable; check network and Spark URL.

If you see Disconnected, check Tailscale, firewall, and that the Spark server is running. See Configuration below to change the server address.

---

## Main window

<!-- MAIN WINDOW: Overview of the main chat interface and its components -->
- **Title bar** — App name, icon, connection status. On macOS the window can be dragged by the title bar.
- **Messages area** — Welcome text at start; then your messages (right, blue) and Spark’s replies (left, gray). Errors appear in red.
- **Input area** — Agent selector, **KB** button, **Web Search** toggle, **Upload**, **Clear**, text box, and **Send** (arrow).

---

## Sending messages

<!-- SENDING MESSAGES: How to compose and send messages to Spark, including keyboard shortcuts -->
1. Type in the text box at the bottom.
2. **Send**:
   - Click the **Send** (➤) button, or  
   - Press **⌘ + Enter**.
3. Send is disabled when:
   - The connection status is **Disconnected**, or  
   - The message is empty.

Optional before sending:

- Choose an **agent** (see Agents).
- Turn **Web Search** on to add web context to the last user message.
- **Upload** a PDF or text file to attach to the message.
- Select **KB** files/folders to add Knowledge Base context (see Knowledge Base).

---

## Agents

<!-- AGENTS: How to use and manage AI assistants with custom system prompts -->
Agents define the **system prompt** (persona and instructions) used for the conversation.

- **Dropdown** (above the text box) — Select which agent to use. The first in the list is the default.
- **⚙️ (Manage Agents)** — Open the agent management modal.

In the modal you can:

- **Add** — “+ Add New Agent”, then fill Name, Description, System Prompt; Save.
- **Edit** — Click “✏️ Edit” on an agent, change fields, Save.
- **Delete** — Click “🗑️” (not available for the default “Spark (Default)” agent).

Changes are saved to disk and used the next time you send a message with that agent.

---

## Knowledge Base (KB)

<!-- KNOWLEDGE BASE: How to use the Knowledge Base feature to include context from markdown/text files in conversations -->
The Knowledge Base is a folder of markdown/text files (e.g. policies, docs) that can be included as context when chatting.

### Where the KB lives

<!-- KB LOCATION: Default and custom paths for the Knowledge Base directory -->
By default the app uses:

- **Path**: `~/Documents/Brain Vault/SecondBrain/SparkRAG`  
  (or the path set by `SPARKRAG_PATH` in the environment; see REFERENCE.md).

If that path doesn’t exist, the KB panel/window will show an error. Create the folder or set `SPARKRAG_PATH` to your real KB path.

### Selecting KB files for context

<!-- KB SELECTION: Step-by-step process for selecting Knowledge Base files to include in chat context -->
1. Click **📚 KB** in the input area.
2. A **Knowledge Base Browser** window opens with:
   - **Sidebar** — Folder tree. Click a folder to see its contents; click again to select/deselect the whole folder for context.
   - **Main area** — Files and folders. Click to select/deselect. Selected items get a checkmark.
   - **Toolbar** — New Folder, New File, Open in Finder, selection count, **✓ Apply Selection**.
3. Select the files and/or folders you want as context.
4. Click **✓ Apply Selection**. The browser closes and the main window shows “KB Context” tags under the input.
5. Send a message as usual. The app will:
   - Read the selected files (and all files inside selected folders),
   - Add their contents to the system prompt as “Knowledge Base Context”,
   - Then send the conversation to Spark.

You can remove individual tags with **✕** on the tag, or **Clear** to remove all KB context.

### Managing the KB (in the browser window)

<!-- KB MANAGEMENT: How to create, rename, delete files/folders and drag-and-drop files for conversion -->
- **New Folder** / **New File** — Create folder or `.md` file in the current folder.
- **Open Folder** — Open the KB root folder in Finder.
- **Right‑click** a file or folder — **Rename** or **Delete** (irreversible).
- **Drag and drop** — Drop files or folders onto the main area; the app will convert supported types (e.g. PDF, DOCX) to markdown and add them to the KB. A toast shows the result.

Supported conversions on drop: PDF, DOCX, DOC, TXT, RTF, MD, HTML, JSON, XML, CSV → markdown or plain text in the KB.

---

## File upload (per message)

<!-- FILE UPLOAD: How to attach a single file (PDF, TXT, MD) to a message without adding it to the Knowledge Base -->
Use this to attach a **single** file to your **next** message (not stored in the KB).

1. Click **📄 Upload**.
2. In the file dialog, choose a **PDF**, **TXT**, or **MD** file.
3. The file name appears under the input with an **✕** to remove it.
4. Send your message. The app sends the file contents plus your text as the user message; the file is not saved in the KB.

To use many documents over time, put them in the Knowledge Base and select them via the KB browser instead.

---

## Translation

<!-- TRANSLATION: How to use the translation feature to translate text to German or English -->
You can send a message as a **translation request** so Spark replies with only the translation (no extra commentary).

- **🌐 Off** — Normal chat; no translation (default).
- **🇩🇪** — **Translate to German**: your message is sent as “Translate the following text to German. Only respond with the translation, nothing else” plus your text. Spark’s reply is shown as the translation.
- **🇺🇸** — **Translate to English**: your message is sent as “Translate the following German text to English. Only respond with the translation, nothing else” plus your text. Use this for German → English.

**How to use**

<!-- TRANSLATION WORKFLOW: Detailed steps for using the translation modes -->
1. In the input area, find the **🌐** translation controls (Off / 🇩🇪 / 🇺🇸).
2. Click **Off**, **🇩🇪**, or **🇺🇸** to set the mode. The active button is highlighted.
3. When a translation mode is active, the **Send** button shows the flag (🇩🇪 or 🇺🇸) and its tooltip changes to “Translate to German” or “Translate to English”.
4. Type your text and send as usual (button or ⌘+Enter). Your message appears in the chat with a flag prefix (🇩🇪 or 🇺🇸); the assistant’s reply is the translation.

Translation uses the same Spark model and agent as normal chat; it only changes the instruction wrapped around your text. You can combine translation with Web Search or Knowledge Base if needed.

---

## Web search

- **Toggle “🔍 Web Search”** — When **on** (default), before calling Spark the app will:
  - Use the **last user message** to run a web search (DuckDuckGo Instant Answers, or direct fetch for certain news sites).
  - Inject the result as extra context so Spark can use current or factual information.
- When **off**, no web search is performed; only your message and any KB/upload context are sent.

So: one toggle controls whether “this conversation” uses web-augmented context for the last user message.

---

## Clear chat

<!-- CLEAR CHAT: How to start a new conversation by clearing the current one -->
- **🗑️ Clear** — Clears the **current** conversation in the UI and in memory (no KB or agent change). The welcome message reappears. Use this to start a new thread.

---

## Keyboard shortcuts

<!-- KEYBOARD SHORTCUTS: Available keyboard shortcuts for common actions -->
| Shortcut      | Action           |
|---------------|------------------|
| **⌘ + Enter** | Send message (or send translation when a translation mode is active) |

Note: ⌘ + N (New conversation) is currently not implemented; use the Clear button instead.

---

## Configuration

<!-- CONFIGURATION: How to customize the Spark server URL and Knowledge Base path -->

### Spark server URL

The app talks to:

- Chat: `http://100.86.36.112:30000/v1/chat/completions`
- Models (connection check): `http://100.86.36.112:30000/v1/models`

To use a different host/port you must **edit the source** (e.g. in `main.js`) and rebuild or run from source. See REFERENCE.md for the exact variable names and locations.

### Knowledge Base path

Default: `~/Documents/Brain Vault/SecondBrain/SparkRAG`.  
Override with environment variable **SPARKRAG_PATH** (e.g. in a shell or launch script) before starting the app. The app reads this in the main process at startup.

---

## Troubleshooting

<!-- TROUBLESHOOTING: Common issues and how to resolve them -->
- **Disconnected**  
  - Confirm Tailscale (or your VPN) is on and the Spark host is reachable (e.g. `ping 100.86.36.112`).  
  - Confirm Spark is running and serving `/v1/models` and `/v1/chat/completions` on that host/port.

- **KB path not found**  
  - Create `~/Documents/Brain Vault/SecondBrain/SparkRAG` or set `SPARKRAG_PATH` to your KB root and restart the app.

- **Agents not saving**  
  - When packaged, agents are stored in the app’s user data directory. If the app can’t write there (permissions/sandbox), saving may fail. Run from terminal to see any errors.

- **Upload / KB conversion errors**  
  - For PDFs: ensure the file isn’t corrupted or image-only (OCR not implemented).  
  - For DOCX: the app uses the `mammoth` library; very complex layouts may not convert perfectly.

---

## Summary

1. **Connect** — Tailscale on, wait for “Connected”.
2. **Optionally** pick an **agent**, set **Translation** (Off / German / English), turn **Web Search** on/off, **upload** a file, or select **KB** files.
3. **Type** and **Send** (button or ⌘+Enter).
4. Use **Clear** to start a new conversation.
5. Use **Manage Agents** and the **KB browser** to configure agents and Knowledge Base content.

For developers: see **ARCHITECTURE.md**, **REFERENCE.md**, and **BUILD-AND-RECREATE.md**.
