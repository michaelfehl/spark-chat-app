# ⚡ Spark Chat

A native macOS desktop application for chatting with Spark LLM via Tailscale.

![Spark Chat Screenshot](docs/screenshot.png)

## Features

- 💬 **Native macOS App** - Runs from /Applications folder
- 🔗 **Tailscale Connection** - Connects to Spark at 100.86.36.112:30000
- 📚 **Knowledge Base Toggle** - Enable CCSA knowledge base context
- 🔍 **Web Search Toggle** - Allow web search augmentation
- 📄 **File Upload** - Attach PDFs and text files for context
- 🌙 **Dark Theme** - Easy on the eyes

## Requirements

- macOS 11.0 or later
- [Tailscale](https://tailscale.com) connected to the network
- Access to spark1 (100.86.36.112)

## Installation

### From DMG (Recommended)
1. Download the latest release from [Releases](../../releases)
2. Open the DMG file
3. Drag Spark Chat to Applications
4. Launch from Applications folder

### From Source
```bash
# Clone the repository
git clone https://github.com/michaelfehl/spark-chat-app.git
cd spark-chat-app

# Install dependencies
npm install

# Run in development
npm start

# Build for macOS
npm run build
```

## Usage

1. Ensure Tailscale is connected
2. Launch Spark Chat
3. Wait for "Connected" status (green dot)
4. Start chatting!

### Options

- **📚 Knowledge Base** - Includes CCSA policies/procedures context
- **🔍 Web Search** - Enables web-augmented responses (on by default)
- **📄 Upload** - Attach a file for context in your query
- **🗑️ Clear** - Reset the conversation

### Keyboard Shortcuts

- `⌘ + Enter` - Send message
- `⌘ + N` - New conversation (clear)

## Configuration

The app connects to Spark at:
```
http://100.86.36.112:30000/v1/chat/completions
```

To change the endpoint, edit `main.js`:
```javascript
const SPARK_URL = 'http://your-spark-url:port/v1/chat/completions';
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm start

# Build for distribution
npm run build:dmg  # Creates DMG installer
npm run build:app  # Creates .app bundle only
```

## Tech Stack

- [Electron](https://www.electronjs.org/) - Cross-platform desktop framework
- [electron-builder](https://www.electron.build/) - Build and package
- Native macOS styling with CSS

## Network Architecture

```
┌──────────────┐     Tailscale     ┌──────────────┐
│  Spark Chat  │ ───────────────── │   spark1     │
│  (macOS App) │   100.86.36.112   │  (Jetson)    │
└──────────────┘                   │  SGLang API  │
                                   └──────────────┘
```

## License

MIT

## Author

CCS Associates
