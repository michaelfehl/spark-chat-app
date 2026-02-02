const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

let mainWindow;
let kbWindow = null;

// Brave Search API key (get free key at https://brave.com/search/api/)
const BRAVE_API_KEY = process.env.BRAVE_API_KEY || 'BSAwPklB-4RtpmYsaAdukW1XOqyLTBK';

// Spark API URL for agents and KB
const SPARK_API_URL = 'http://100.86.36.112:30001';

// Knowledge Base path - SparkRAG folder (local fallback)
const KB_PATH = process.env.SPARKRAG_PATH || path.join(os.homedir(), 'Documents', 'Brain Vault', 'SecondBrain', 'SparkRAG');

// Assistants data path - use app.getPath for writable location (local fallback)
const ASSISTANTS_PATH = app.isPackaged 
  ? path.join(app.getPath('userData'), 'assistants.json')
  : path.join(__dirname, 'data', 'assistants.json');

// HTTP helper for Spark API
const http = require('http');
function sparkApiRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const postData = data ? JSON.stringify(data) : null;
    const options = {
      hostname: '100.86.36.112',
      port: 30001,
      path: path,
      method: method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    };
    if (postData) options.headers['Content-Length'] = Buffer.byteLength(postData);
    
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    if (postData) req.write(postData);
    req.end();
  });
}

// Copy default assistants on first run
function initAssistants() {
  if (app.isPackaged && !fs.existsSync(ASSISTANTS_PATH)) {
    const defaultPath = path.join(process.resourcesPath, 'app.asar', 'data', 'assistants.json');
    if (fs.existsSync(defaultPath)) {
      const defaultData = fs.readFileSync(defaultPath, 'utf-8');
      fs.writeFileSync(ASSISTANTS_PATH, defaultData);
    }
  }
}

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

app.whenReady().then(() => {
  initAssistants();
  createWindow();
});

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

// Web search using Brave Search API
async function performWebSearch(query) {
  try {
    // Use Brave Search API (working endpoint)
    const braveUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;
    
    const response = await fetch(braveUrl, {
      headers: {
        'X-Subscription-Token': BRAVE_API_KEY,
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      console.error('Brave Search error:', response.status, await response.text());
      throw new Error(`Brave Search failed: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.web && data.web.results && data.web.results.length > 0) {
      const results = data.web.results
        .slice(0, 5)
        .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.description || ''}`)
        .join('\n\n');
      
      return {
        success: true,
        results: results,
        count: data.web.results.length
      };
    }
    
    return {
      success: true,
      results: `No results found for: "${query}"`,
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
        max_tokens: 8192,
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

// === ASSISTANTS MANAGEMENT ===

// Get all assistants from Spark API
ipcMain.handle('get-assistants', async () => {
  try {
    // Try Spark API first
    const agents = await sparkApiRequest('GET', '/api/agents');
    if (agents && Array.isArray(agents)) {
      // Map to expected format
      return agents.map(a => ({
        id: a.id,
        name: a.name,
        description: a.systemPrompt ? a.systemPrompt.substring(0, 100) + '...' : '',
        prompt: a.systemPrompt || '',
        defaultKB: a.defaultKB || [],
        isDefault: a.isDefault || false
      }));
    }
    
    // Fallback to local file
    initAssistants();
    if (fs.existsSync(ASSISTANTS_PATH)) {
      const data = fs.readFileSync(ASSISTANTS_PATH, 'utf-8');
      return JSON.parse(data);
    }
    
    // Default fallback
    return [{
      id: "asst_default",
      name: "Spark (Default)",
      description: "General-purpose AI assistant",
      prompt: "You are Spark, a helpful AI assistant running on a local NVIDIA Jetson system. Be concise but thorough.",
      defaultKB: []
    }];
  } catch (error) {
    console.error('Error reading assistants:', error);
    return [];
  }
});

// Save assistant to Spark API (create or update)
ipcMain.handle('save-assistant', async (event, assistant) => {
  try {
    const data = {
      name: assistant.name,
      systemPrompt: assistant.prompt || assistant.systemPrompt || '',
      defaultKB: assistant.defaultKB || []
    };
    
    let result;
    if (assistant.id && !assistant.id.startsWith('asst_')) {
      // Update existing in Spark API
      result = await sparkApiRequest('PUT', `/api/agents/${assistant.id}`, data);
    } else {
      // Create new in Spark API
      result = await sparkApiRequest('POST', '/api/agents', data);
    }
    
    if (result && result.id) {
      return { success: true, assistant: result };
    }
    
    // Fallback to local storage
    let assistants = [];
    if (fs.existsSync(ASSISTANTS_PATH)) {
      assistants = JSON.parse(fs.readFileSync(ASSISTANTS_PATH, 'utf-8'));
    }
    
    const existingIndex = assistants.findIndex(a => a.id === assistant.id);
    if (existingIndex >= 0) {
      assistants[existingIndex] = { ...assistants[existingIndex], ...assistant, updatedAt: new Date().toISOString() };
    } else {
      assistant.id = `asst_${Date.now()}`;
      assistant.createdAt = new Date().toISOString();
      assistants.push(assistant);
    }
    
    const dataDir = path.dirname(ASSISTANTS_PATH);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(ASSISTANTS_PATH, JSON.stringify(assistants, null, 2));
    return { success: true, assistant };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Delete assistant from Spark API
ipcMain.handle('delete-assistant', async (event, assistantId) => {
  try {
    // Try Spark API first
    if (assistantId && !assistantId.startsWith('asst_')) {
      const result = await sparkApiRequest('DELETE', `/api/agents/${assistantId}`);
      if (result && result.success) {
        return { success: true };
      }
    }
    
    // Fallback to local
    if (fs.existsSync(ASSISTANTS_PATH)) {
      let assistants = JSON.parse(fs.readFileSync(ASSISTANTS_PATH, 'utf-8'));
      assistants = assistants.filter(a => a.id !== assistantId);
      fs.writeFileSync(ASSISTANTS_PATH, JSON.stringify(assistants, null, 2));
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Reorder agents via Spark API
ipcMain.handle('reorder-agents', async (event, order) => {
  try {
    const result = await sparkApiRequest('POST', '/api/agents/reorder', { order });
    return { success: !!result?.success };
  } catch (error) {
    return { success: false, error: error.message };
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

// Read knowledge base file(s) - try Spark API first, fallback to local
ipcMain.handle('read-kb-files', async (event, filePaths) => {
  // Try Spark API bulk fetch first
  try {
    const result = await sparkApiRequest('POST', '/api/kb/contents', { paths: filePaths });
    if (result && result.files && result.files.length > 0) {
      return result.files.map(f => ({
        path: f.path,
        name: path.basename(f.path),
        content: f.content
      }));
    }
  } catch (e) {
    // Fall through to local
  }
  
  // Fallback to local files
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

// Handle dropped files/folders - convert ALL to markdown
ipcMain.handle('kb-handle-drop', async (event, droppedPaths, targetFolder) => {
  const results = [];
  const pdfParse = require('pdf-parse');
  const mammoth = require('mammoth');
  
  for (const sourcePath of droppedPaths) {
    try {
      const fileName = path.basename(sourcePath);
      
      // Check if source exists
      if (!fs.existsSync(sourcePath)) {
        results.push({ path: sourcePath, success: false, error: 'Source not found' });
        continue;
      }
      
      const stats = fs.statSync(sourcePath);
      
      if (stats.isDirectory()) {
        // Process directory recursively
        const destPath = path.join(KB_PATH, targetFolder || '', fileName);
        const converted = await convertDirToMarkdown(sourcePath, destPath, pdfParse, mammoth);
        results.push({ path: sourcePath, success: true, type: 'folder', name: fileName, converted: converted });
      } else {
        // Convert single file
        const result = await convertFileToMarkdown(sourcePath, targetFolder, pdfParse, mammoth);
        results.push(result);
      }
    } catch (error) {
      results.push({ path: sourcePath, success: false, error: error.message });
    }
  }
  
  return results;
});

// Convert a single file to markdown
async function convertFileToMarkdown(sourcePath, targetFolder, pdfParse, mammoth) {
  const fileName = path.basename(sourcePath);
  const ext = path.extname(sourcePath).toLowerCase();
  const baseName = fileName.replace(/\.[^.]+$/, '');
  const mdFileName = baseName + '.md';
  const destPath = path.join(KB_PATH, targetFolder || '', mdFileName);
  const date = new Date().toLocaleDateString();
  
  let content = '';
  let converted = true;
  
  try {
    if (ext === '.pdf') {
      // PDF conversion
      const dataBuffer = fs.readFileSync(sourcePath);
      const pdfData = await pdfParse(dataBuffer);
      content = `# ${baseName}\n\n*Converted from PDF on ${date}*\n\n---\n\n${pdfData.text}`;
      
    } else if (ext === '.docx') {
      // Word document conversion
      const result = await mammoth.extractRawText({ path: sourcePath });
      content = `# ${baseName}\n\n*Converted from DOCX on ${date}*\n\n---\n\n${result.value}`;
      
    } else if (ext === '.doc') {
      // Old Word format - try mammoth, may not work perfectly
      try {
        const result = await mammoth.extractRawText({ path: sourcePath });
        content = `# ${baseName}\n\n*Converted from DOC on ${date}*\n\n---\n\n${result.value}`;
      } catch {
        return { path: sourcePath, success: false, error: 'DOC format not fully supported' };
      }
      
    } else if (ext === '.txt') {
      // Plain text - wrap in markdown
      const text = fs.readFileSync(sourcePath, 'utf-8');
      content = `# ${baseName}\n\n*Converted from TXT on ${date}*\n\n---\n\n${text}`;
      
    } else if (ext === '.rtf') {
      // RTF - strip formatting, keep text
      const rtfText = fs.readFileSync(sourcePath, 'utf-8');
      const plainText = rtfText.replace(/\{\\[^{}]+\}|\\[a-z]+\d* ?/gi, '').replace(/[{}]/g, '');
      content = `# ${baseName}\n\n*Converted from RTF on ${date}*\n\n---\n\n${plainText}`;
      
    } else if (ext === '.md') {
      // Already markdown - just copy
      fs.copyFileSync(sourcePath, destPath);
      return { path: sourcePath, success: true, type: 'file', name: mdFileName, converted: false };
      
    } else if (['.html', '.htm'].includes(ext)) {
      // HTML - strip tags
      const html = fs.readFileSync(sourcePath, 'utf-8');
      const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                       .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                       .replace(/<[^>]+>/g, '\n')
                       .replace(/\n\s*\n/g, '\n\n')
                       .trim();
      content = `# ${baseName}\n\n*Converted from HTML on ${date}*\n\n---\n\n${text}`;
      
    } else if (['.json', '.xml', '.csv'].includes(ext)) {
      // Data files - wrap as code block
      const data = fs.readFileSync(sourcePath, 'utf-8');
      content = `# ${baseName}\n\n*Converted from ${ext.toUpperCase().slice(1)} on ${date}*\n\n---\n\n\`\`\`${ext.slice(1)}\n${data}\n\`\`\``;
      
    } else {
      // Unsupported - skip
      return { path: sourcePath, success: false, error: `Unsupported file type: ${ext}` };
    }
    
    // Ensure directory exists
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    fs.writeFileSync(destPath, content, 'utf-8');
    return { 
      path: sourcePath, 
      success: true, 
      type: 'file', 
      name: mdFileName, 
      converted: converted,
      originalName: fileName 
    };
    
  } catch (error) {
    return { path: sourcePath, success: false, error: error.message };
  }
}

// Convert directory recursively - only keep markdown files
async function convertDirToMarkdown(src, dest, pdfParse, mammoth) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  let convertedCount = 0;
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    
    if (entry.isDirectory()) {
      const subConverted = await convertDirToMarkdown(srcPath, path.join(dest, entry.name), pdfParse, mammoth);
      convertedCount += subConverted;
    } else {
      const result = await convertFileToMarkdown(srcPath, path.relative(KB_PATH, dest), pdfParse, mammoth);
      if (result.success && result.converted) {
        convertedCount++;
      }
    }
  }
  
  return convertedCount;
}

// Helper: Copy directory recursively
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Open KB browser window
ipcMain.handle('kb-open-window', async (event, selectionData) => {
  if (kbWindow && !kbWindow.isDestroyed()) {
    kbWindow.focus();
    return { success: true };
  }
  
  kbWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 500,
    minHeight: 400,
    parent: mainWindow,
    title: 'Knowledge Base Browser',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: '#1a1a2e'
  });
  
  kbWindow.loadFile('renderer/kb-browser.html');
  
  // Send initial selected files/folders
  kbWindow.webContents.once('did-finish-load', () => {
    kbWindow.webContents.send('init-selection', selectionData || { files: [], folders: [] });
  });
  
  kbWindow.on('closed', () => {
    kbWindow = null;
  });
  
  return { success: true };
});

// Send selection back to main window
ipcMain.on('kb-selection-changed', (event, selectedFiles) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('kb-selection-update', selectedFiles);
  }
});

// Close KB window
ipcMain.handle('kb-close-window', async () => {
  if (kbWindow && !kbWindow.isDestroyed()) {
    kbWindow.close();
  }
  return { success: true };
});
