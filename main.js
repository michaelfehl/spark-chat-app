const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

let mainWindow;

// Brave Search API key (get free key at https://brave.com/search/api/)
const BRAVE_API_KEY = process.env.BRAVE_API_KEY || 'BSAcz5U2xM27VNzkhVmvBlDiSiA1F8a';

// Knowledge Base path - SparkRAG folder
const KB_PATH = process.env.SPARKRAG_PATH || path.join(os.homedir(), 'Documents', 'Brain Vault', 'SecondBrain', 'SparkRAG');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 500,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: '#1a1a2e',
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.loadFile('renderer/index.html');

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle file selection for PDF/text upload
ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Documents', extensions: ['pdf', 'txt', 'md'] }
    ]
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const ext = path.extname(filePath).toLowerCase();
    
    try {
      let content;
      
      if (ext === '.pdf') {
        // Parse PDF using pdf-parse
        const pdfParse = require('pdf-parse');
        const dataBuffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(dataBuffer);
        content = pdfData.text;
        console.log(`Parsed PDF: ${pdfData.numpages} pages, ${content.length} chars`);
      } else {
        // Read text files directly
        content = fs.readFileSync(filePath, 'utf-8');
      }
      
      return {
        path: filePath,
        name: path.basename(filePath),
        content: content,
        type: ext
      };
    } catch (error) {
      console.error('File read error:', error);
      return {
        path: filePath,
        name: path.basename(filePath),
        content: `[Error reading file: ${error.message}]`,
        type: ext,
        error: true
      };
    }
  }
  return null;
});

// Web search and page fetching
async function performWebSearch(query) {
  try {
    // Check if query mentions specific news sites - fetch directly
    const newsPatterns = [
      { pattern: /cnn/i, url: 'https://lite.cnn.com/' },
      { pattern: /bbc/i, url: 'https://www.bbc.com/news' },
      { pattern: /reuters/i, url: 'https://www.reuters.com/' },
      { pattern: /npr/i, url: 'https://text.npr.org/' },
      { pattern: /ap news|associated press/i, url: 'https://apnews.com/' }
    ];
    
    for (const site of newsPatterns) {
      if (site.pattern.test(query)) {
        return await fetchPageContent(site.url, query);
      }
    }
    
    // For general queries, use DuckDuckGo Instant Answers API
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
    
    const response = await fetch(ddgUrl, {
      headers: { 'User-Agent': 'SparkChat/1.0' }
    });
    
    if (response.ok) {
      const data = await response.json();
      
      let results = '';
      
      if (data.AbstractText) {
        results += `Summary: ${data.AbstractText}\nSource: ${data.AbstractURL}\n\n`;
      }
      
      if (data.RelatedTopics && data.RelatedTopics.length > 0) {
        const topics = data.RelatedTopics
          .filter(t => t.Text)
          .slice(0, 5)
          .map((t, i) => `[${i + 1}] ${t.Text}`)
          .join('\n');
        if (topics) results += `Related:\n${topics}`;
      }
      
      if (results) {
        return { success: true, results, count: 1 };
      }
    }
    
    // Fallback: return helpful message
    return {
      success: true,
      results: `Web search attempted for: "${query}". For best results with news sites, ask about specific outlets (CNN, BBC, Reuters, NPR, AP News) and I'll fetch their latest content directly.`,
      count: 0
    };
    
  } catch (error) {
    console.error('Web search error:', error);
    return { success: false, error: error.message };
  }
}

// Fetch and extract content from a page
async function fetchPageContent(url, query) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }
    
    const html = await response.text();
    
    // Extract text content (basic HTML stripping)
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<[^>]+>/g, '\n')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\n\s*\n/g, '\n')
      .trim();
    
    // Limit length
    if (text.length > 4000) {
      text = text.substring(0, 4000) + '...';
    }
    
    return {
      success: true,
      results: `Content from ${url} (fetched ${new Date().toLocaleTimeString()}):\n\n${text}`,
      count: 1,
      directFetch: true
    };
    
  } catch (error) {
    return {
      success: false,
      error: `Could not fetch ${url}: ${error.message}`
    };
  }
}

// Handle chat requests to Spark
ipcMain.handle('chat-request', async (event, { messages, useKnowledgeBase, useWebSearch, searchQuery }) => {
  const SPARK_URL = 'http://100.86.36.112:30000/v1/chat/completions';
  
  try {
    let contextMessages = [...messages];
    
    // If web search is enabled, search for relevant info
    if (useWebSearch && messages.length > 0) {
      const lastUserMessage = messages.filter(m => m.role === 'user').pop();
      if (lastUserMessage) {
        const searchResult = await performWebSearch(lastUserMessage.content);
        
        if (searchResult.success && searchResult.count > 0) {
          // Insert search results as system context
          const searchContext = {
            role: 'system',
            content: `Web search results for context:\n\n${searchResult.results}\n\nUse these results to inform your response if relevant.`
          };
          
          // Insert after the first system message
          const systemIndex = contextMessages.findIndex(m => m.role === 'system');
          if (systemIndex >= 0) {
            contextMessages.splice(systemIndex + 1, 0, searchContext);
          } else {
            contextMessages.unshift(searchContext);
          }
        }
      }
    }
    
    const response = await fetch(SPARK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        messages: contextMessages,
        max_tokens: 4000,
        temperature: 0.7,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      success: true,
      content: data.choices[0].message.content,
      webSearchUsed: useWebSearch
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

// Standalone web search handler
ipcMain.handle('web-search', async (event, query) => {
  return await performWebSearch(query);
});

// Check Spark connection
ipcMain.handle('check-connection', async () => {
  try {
    const response = await fetch('http://100.86.36.112:30000/v1/models', {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    return response.ok;
  } catch {
    return false;
  }
});

// Scan knowledge base directory
function scanDirectory(dirPath, basePath = '') {
  const items = [];
  
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
      
      const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
      
      if (entry.isDirectory()) {
        items.push({
          name: entry.name,
          path: relativePath,
          type: 'folder',
          children: scanDirectory(path.join(dirPath, entry.name), relativePath)
        });
      } else if (entry.name.endsWith('.md') || entry.name.endsWith('.txt')) {
        const stats = fs.statSync(path.join(dirPath, entry.name));
        items.push({
          name: entry.name,
          path: relativePath,
          type: 'file',
          size: stats.size
        });
      }
    }
  } catch (error) {
    console.error('Error scanning directory:', error);
  }
  
  return items;
}

// Get knowledge base structure
ipcMain.handle('get-knowledge-base', async () => {
  try {
    if (!fs.existsSync(KB_PATH)) {
      return { success: false, error: 'Knowledge base path not found', path: KB_PATH };
    }
    
    const structure = scanDirectory(KB_PATH);
    return { success: true, structure, path: KB_PATH };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Read knowledge base file(s)
ipcMain.handle('read-kb-files', async (event, filePaths) => {
  const contents = [];
  
  for (const relativePath of filePaths) {
    try {
      const fullPath = path.join(KB_PATH, relativePath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      contents.push({
        path: relativePath,
        name: path.basename(relativePath),
        content: content
      });
    } catch (error) {
      contents.push({
        path: relativePath,
        error: error.message
      });
    }
  }
  
  return contents;
});

// Create new folder in KB
ipcMain.handle('kb-create-folder', async (event, relativePath) => {
  try {
    const fullPath = path.join(KB_PATH, relativePath);
    fs.mkdirSync(fullPath, { recursive: true });
    return { success: true, path: relativePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Delete file or folder from KB
ipcMain.handle('kb-delete', async (event, relativePath) => {
  try {
    const fullPath = path.join(KB_PATH, relativePath);
    const stats = fs.statSync(fullPath);
    
    if (stats.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true });
    } else {
      fs.unlinkSync(fullPath);
    }
    
    return { success: true, path: relativePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Rename file or folder in KB
ipcMain.handle('kb-rename', async (event, oldPath, newName) => {
  try {
    const oldFullPath = path.join(KB_PATH, oldPath);
    const parentDir = path.dirname(oldFullPath);
    const newFullPath = path.join(parentDir, newName);
    
    fs.renameSync(oldFullPath, newFullPath);
    
    const newRelativePath = path.join(path.dirname(oldPath), newName);
    return { success: true, oldPath, newPath: newRelativePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Create new file in KB
ipcMain.handle('kb-create-file', async (event, relativePath, content = '') => {
  try {
    const fullPath = path.join(KB_PATH, relativePath);
    const dir = path.dirname(fullPath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(fullPath, content, 'utf-8');
    return { success: true, path: relativePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Save/update file content in KB
ipcMain.handle('kb-save-file', async (event, relativePath, content) => {
  try {
    const fullPath = path.join(KB_PATH, relativePath);
    fs.writeFileSync(fullPath, content, 'utf-8');
    return { success: true, path: relativePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Open KB folder in Finder
ipcMain.handle('kb-open-finder', async () => {
  const { shell } = require('electron');
  shell.openPath(KB_PATH);
  return { success: true };
});
