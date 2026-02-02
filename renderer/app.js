// DOM Elements
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const clearBtn = document.getElementById('clearBtn');
const uploadBtn = document.getElementById('uploadBtn');
const uploadedFileEl = document.getElementById('uploadedFile');
const knowledgeBaseToggle = document.getElementById('knowledgeBase');
const webSearchToggle = document.getElementById('webSearch');
const connectionStatus = document.getElementById('connectionStatus');

// State
let conversationHistory = [];
let uploadedFile = null;
let isConnected = false;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  checkConnection();
  setInterval(checkConnection, 30000); // Check every 30s
  
  // Auto-resize textarea
  messageInput.addEventListener('input', autoResize);
  messageInput.addEventListener('keydown', handleKeydown);
  
  // Enable/disable send button
  messageInput.addEventListener('input', updateSendButton);
  
  // Button handlers
  sendBtn.addEventListener('click', sendMessage);
  clearBtn.addEventListener('click', clearChat);
  uploadBtn.addEventListener('click', handleUpload);
  
  // Remove file handler
  uploadedFileEl.querySelector('.remove-file').addEventListener('click', removeFile);
});

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
  
  // Clear input
  messageInput.value = '';
  autoResize();
  updateSendButton();
  
  // Remove welcome message
  const welcomeMsg = messagesContainer.querySelector('.welcome-message');
  if (welcomeMsg) welcomeMsg.remove();
  
  // Build message with optional file context
  let userMessage = content;
  if (uploadedFile) {
    userMessage = `[Attached file: ${uploadedFile.name}]\n\nFile content:\n${uploadedFile.content}\n\n---\n\nUser question: ${content}`;
    removeFile();
  }
  
  // Add user message to UI
  addMessage(content, 'user');
  
  // Add to history
  conversationHistory.push({
    role: 'user',
    content: userMessage
  });
  
  // Show typing indicator
  const typingIndicator = addTypingIndicator();
  
  // Build system prompt based on options
  let systemPrompt = 'You are Spark, a helpful AI assistant running on a local NVIDIA Jetson system. Be concise but thorough.';
  
  if (knowledgeBaseToggle.checked) {
    systemPrompt += ' Use your knowledge base to provide accurate information about CCSA policies and procedures when relevant.';
  }
  
  if (webSearchToggle.checked) {
    systemPrompt += ' You can reference current web information if needed to answer questions.';
  }
  
  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory
  ];
  
  try {
    const response = await window.sparkAPI.sendMessage(messages, {
      useKnowledgeBase: knowledgeBaseToggle.checked,
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
  
  // Basic markdown-like formatting
  let formatted = content
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
  
  // Wrap in paragraphs (simplified)
  if (!formatted.includes('<pre>')) {
    formatted = formatted.split('<br><br>').map(p => `<p>${p}</p>`).join('');
  }
  
  messageEl.innerHTML = formatted;
  messagesContainer.appendChild(messageEl);
  scrollToBottom();
  
  return messageEl;
}

// Add typing indicator
function addTypingIndicator() {
  const indicator = document.createElement('div');
  indicator.className = 'message assistant typing-indicator';
  indicator.innerHTML = '<span></span><span></span><span></span>';
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
