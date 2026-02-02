// DOM Elements
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const clearBtn = document.getElementById('clearBtn');
const uploadBtn = document.getElementById('uploadBtn');
const uploadedFileEl = document.getElementById('uploadedFile');
const webSearchToggle = document.getElementById('webSearch');
const connectionStatus = document.getElementById('connectionStatus');

// Knowledge Base Elements
const kbPanel = document.getElementById('kbPanel');
const kbToggleBtn = document.getElementById('kbToggleBtn');
const kbClose = document.getElementById('kbClose');
const kbTree = document.getElementById('kbTree');
const kbPath = document.getElementById('kbPath');
const kbSelected = document.getElementById('kbSelected');

// State
let conversationHistory = [];
let uploadedFile = null;
let isConnected = false;
let selectedKBFiles = new Set();
let kbStructure = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  checkConnection();
  setInterval(checkConnection, 30000);
  
  messageInput.addEventListener('input', autoResize);
  messageInput.addEventListener('keydown', handleKeydown);
  messageInput.addEventListener('input', updateSendButton);
  
  sendBtn.addEventListener('click', sendMessage);
  clearBtn.addEventListener('click', clearChat);
  uploadBtn.addEventListener('click', handleUpload);
  uploadedFileEl.querySelector('.remove-file').addEventListener('click', removeFile);
  
  // Knowledge Base handlers
  kbToggleBtn.addEventListener('click', toggleKBPanel);
  kbClose.addEventListener('click', () => kbPanel.classList.add('hidden'));
  
  // Load KB structure
  loadKnowledgeBase();
});

// Load Knowledge Base structure
async function loadKnowledgeBase() {
  const result = await window.sparkAPI.getKnowledgeBase();
  
  if (result.success) {
    kbStructure = result.structure;
    kbPath.textContent = result.path;
    renderKBTree(result.structure, kbTree);
  } else {
    kbTree.innerHTML = `<div class="kb-error">⚠️ ${result.error}</div>`;
    kbPath.textContent = result.path || 'Not configured';
  }
}

// Render KB tree
function renderKBTree(items, container) {
  container.innerHTML = '';
  
  for (const item of items) {
    if (item.type === 'folder') {
      const folder = document.createElement('div');
      folder.className = 'kb-folder';
      folder.innerHTML = `
        <div class="kb-folder-header">
          <span class="kb-folder-icon">▶</span>
          <span class="kb-folder-name">📁 ${item.name}</span>
        </div>
        <div class="kb-folder-children"></div>
      `;
      
      folder.querySelector('.kb-folder-header').addEventListener('click', () => {
        folder.classList.toggle('expanded');
      });
      
      if (item.children && item.children.length > 0) {
        renderKBTree(item.children, folder.querySelector('.kb-folder-children'));
      }
      
      container.appendChild(folder);
    } else {
      const file = document.createElement('div');
      file.className = 'kb-file';
      file.dataset.path = item.path;
      file.innerHTML = `
        <span class="kb-file-check"></span>
        <span class="kb-file-name">📄 ${item.name}</span>
      `;
      
      file.addEventListener('click', () => toggleFileSelection(file, item.path));
      
      if (selectedKBFiles.has(item.path)) {
        file.classList.add('selected');
        file.querySelector('.kb-file-check').textContent = '✓';
      }
      
      container.appendChild(file);
    }
  }
}

// Toggle file selection
function toggleFileSelection(fileEl, path) {
  if (selectedKBFiles.has(path)) {
    selectedKBFiles.delete(path);
    fileEl.classList.remove('selected');
    fileEl.querySelector('.kb-file-check').textContent = '';
  } else {
    selectedKBFiles.add(path);
    fileEl.classList.add('selected');
    fileEl.querySelector('.kb-file-check').textContent = '✓';
  }
  
  updateKBSelectedCount();
}

// Update selected count
function updateKBSelectedCount() {
  const count = selectedKBFiles.size;
  kbSelected.querySelector('.kb-selected-count').textContent = 
    `${count} file${count !== 1 ? 's' : ''} selected`;
  
  // Update button style
  kbToggleBtn.classList.toggle('active', count > 0);
  kbToggleBtn.textContent = count > 0 ? `📚 KB (${count})` : '📚 KB';
}

// Toggle KB panel
function toggleKBPanel() {
  kbPanel.classList.toggle('hidden');
}

// Check connection to Spark
async function checkConnection() {
  const statusDot = connectionStatus.querySelector('.status-dot');
  const statusText = connectionStatus.querySelector('.status-text');
  
  statusDot.className = 'status-dot checking';
  statusText.textContent = 'Checking...';
  
  try {
    isConnected = await window.sparkAPI.checkConnection();
    
    if (isConnected) {
      statusDot.className = 'status-dot connected';
      statusText.textContent = 'Connected';
    } else {
      throw new Error('Not connected');
    }
  } catch {
    isConnected = false;
    statusDot.className = 'status-dot disconnected';
    statusText.textContent = 'Disconnected';
  }
  
  updateSendButton();
}

// Auto-resize textarea
function autoResize() {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 150) + 'px';
}

// Handle keyboard shortcuts
function handleKeydown(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    if (!sendBtn.disabled) {
      sendMessage();
    }
  }
}

// Update send button state
function updateSendButton() {
  const hasContent = messageInput.value.trim().length > 0;
  sendBtn.disabled = !hasContent || !isConnected;
}

// Send message
async function sendMessage() {
  const content = messageInput.value.trim();
  if (!content || !isConnected) return;
  
  messageInput.value = '';
  autoResize();
  updateSendButton();
  
  const welcomeMsg = messagesContainer.querySelector('.welcome-message');
  if (welcomeMsg) welcomeMsg.remove();
  
  // Build message with optional file context
  let userMessage = content;
  if (uploadedFile) {
    userMessage = `[Attached file: ${uploadedFile.name}]\n\nFile content:\n${uploadedFile.content}\n\n---\n\nUser question: ${content}`;
    removeFile();
  }
  
  // Add KB context if files selected
  let kbContext = '';
  if (selectedKBFiles.size > 0) {
    const kbFiles = await window.sparkAPI.readKBFiles([...selectedKBFiles]);
    kbContext = kbFiles
      .filter(f => !f.error)
      .map(f => `--- ${f.name} ---\n${f.content}`)
      .join('\n\n');
  }
  
  addMessage(content, 'user');
  
  conversationHistory.push({
    role: 'user',
    content: userMessage
  });
  
  // Show typing indicator
  const hasSearch = webSearchToggle.checked;
  const hasKB = selectedKBFiles.size > 0;
  const typingIndicator = addTypingIndicator(hasSearch, hasKB);
  
  // Build system prompt
  let systemPrompt = 'You are Spark, a helpful AI assistant running on a local NVIDIA Jetson system. Be concise but thorough.';
  
  if (kbContext) {
    systemPrompt += `\n\nKnowledge Base Context:\n${kbContext}`;
  }
  
  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory
  ];
  
  try {
    const response = await window.sparkAPI.sendMessage(messages, {
      useKnowledgeBase: selectedKBFiles.size > 0,
      useWebSearch: webSearchToggle.checked
    });
    
    typingIndicator.remove();
    
    if (response.success) {
      addMessage(response.content, 'assistant');
      conversationHistory.push({
        role: 'assistant',
        content: response.content
      });
    } else {
      addMessage(`Error: ${response.error}`, 'error');
    }
  } catch (error) {
    typingIndicator.remove();
    addMessage(`Connection error: ${error.message}`, 'error');
  }
  
  scrollToBottom();
}

// Add message to UI
function addMessage(content, type) {
  const messageEl = document.createElement('div');
  messageEl.className = `message ${type}`;
  
  let formatted = content
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
  
  if (!formatted.includes('<pre>')) {
    formatted = formatted.split('<br><br>').map(p => `<p>${p}</p>`).join('');
  }
  
  messageEl.innerHTML = formatted;
  messagesContainer.appendChild(messageEl);
  scrollToBottom();
  
  return messageEl;
}

// Add typing indicator
function addTypingIndicator(withSearch = false, withKB = false) {
  const indicator = document.createElement('div');
  indicator.className = 'message assistant typing-indicator';
  
  let label = '';
  if (withKB && withSearch) {
    label = '<span class="search-label">📚🔍 Loading KB & searching...</span>';
  } else if (withKB) {
    label = '<span class="search-label">📚 Loading knowledge base...</span>';
  } else if (withSearch) {
    label = '<span class="search-label">🔍 Searching web...</span>';
  }
  
  indicator.innerHTML = `${label}<span></span><span></span><span></span>`;
  messagesContainer.appendChild(indicator);
  scrollToBottom();
  return indicator;
}

// Scroll to bottom
function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Clear chat
function clearChat() {
  conversationHistory = [];
  messagesContainer.innerHTML = `
    <div class="welcome-message">
      <div class="welcome-icon">⚡</div>
      <h2>Welcome to Spark Chat</h2>
      <p>Chat with Spark LLM running on your local network via Tailscale.</p>
      <p class="hint">Make sure Tailscale is connected to reach spark1 (100.86.36.112)</p>
    </div>
  `;
  removeFile();
}

// Handle file upload
async function handleUpload() {
  const file = await window.sparkAPI.selectFile();
  
  if (file) {
    uploadedFile = file;
    uploadedFileEl.classList.remove('hidden');
    uploadedFileEl.querySelector('.file-name').textContent = file.name;
  }
}

// Remove uploaded file
function removeFile() {
  uploadedFile = null;
  uploadedFileEl.classList.add('hidden');
  uploadedFileEl.querySelector('.file-name').textContent = '';
}
