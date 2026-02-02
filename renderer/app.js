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
const kbNewFolder = document.getElementById('kbNewFolder');
const kbNewFile = document.getElementById('kbNewFile');
const kbOpenFinder = document.getElementById('kbOpenFinder');
const kbContextMenu = document.getElementById('kbContextMenu');
const kbModal = document.getElementById('kbModal');
const modalHeader = document.getElementById('modalHeader');
const modalInput = document.getElementById('modalInput');
const modalCancel = document.getElementById('modalCancel');
const modalConfirm = document.getElementById('modalConfirm');

// State
let conversationHistory = [];
let uploadedFile = null;
let isConnected = false;
let selectedKBFiles = new Set();
let selectedKBFolders = new Set();
let kbStructure = null;
let contextTarget = null; // Current item for context menu
let modalAction = null; // Current modal action
let assistants = [];
let currentAssistant = null;

// Agent elements
const agentSelect = document.getElementById('agentSelect');
const agentManageBtn = document.getElementById('agentManageBtn');
const agentModal = document.getElementById('agentModal');
const agentModalClose = document.getElementById('agentModalClose');
const agentList = document.getElementById('agentList');
const agentForm = document.getElementById('agentForm');
const agentModalFooter = document.getElementById('agentModalFooter');
const addAgentBtn = document.getElementById('addAgentBtn');
const agentFormCancel = document.getElementById('agentFormCancel');
const agentFormSave = document.getElementById('agentFormSave');

// Selection bar elements
const kbSelectionBar = document.getElementById('kbSelectionBar');
const selectionTags = document.getElementById('selectionTags');
const clearKBSelection = document.getElementById('clearKBSelection');

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
  kbNewFolder.addEventListener('click', () => showModal('newFolder'));
  kbNewFile.addEventListener('click', () => showModal('newFile'));
  kbOpenFinder.addEventListener('click', () => window.sparkAPI.kbOpenFinder());
  
  // Modal handlers
  modalCancel.addEventListener('click', hideModal);
  modalConfirm.addEventListener('click', handleModalConfirm);
  modalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleModalConfirm();
    if (e.key === 'Escape') hideModal();
  });
  
  // Context menu handlers
  document.addEventListener('click', () => hideContextMenu());
  kbContextMenu.querySelectorAll('.context-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleContextAction(btn.dataset.action);
    });
  });
  
  // Clear KB selection button
  clearKBSelection.addEventListener('click', () => {
    selectedKBFiles.clear();
    selectedKBFolders.clear();
    updateSelectionBar();
    updateKBSelectedCount();
  });
  
  // Agent handlers
  agentSelect.addEventListener('change', handleAgentChange);
  agentManageBtn.addEventListener('click', openAgentModal);
  agentModalClose.addEventListener('click', closeAgentModal);
  addAgentBtn.addEventListener('click', showAgentForm);
  agentFormCancel.addEventListener('click', hideAgentForm);
  agentFormSave.addEventListener('click', saveAgent);
  
  // Load KB structure and agents
  loadKnowledgeBase();
  loadAssistants();
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
      
      const header = folder.querySelector('.kb-folder-header');
      header.addEventListener('click', () => {
        folder.classList.toggle('expanded');
      });
      
      // Right-click for context menu
      header.addEventListener('contextmenu', (e) => showContextMenu(e, item));
      
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
      
      // Right-click for context menu
      file.addEventListener('contextmenu', (e) => showContextMenu(e, item));
      
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
  const fileCount = selectedKBFiles.size;
  const folderCount = selectedKBFolders.size;
  const totalCount = fileCount + folderCount;
  
  // Update button style
  kbToggleBtn.classList.toggle('active', totalCount > 0);
  kbToggleBtn.textContent = totalCount > 0 ? `📚 KB (${totalCount})` : '📚 KB';
}

// Toggle KB panel - now opens separate window
function toggleKBPanel() {
  // Open the dedicated KB browser window with current selection
  window.sparkAPI.kbOpenWindow({
    files: [...selectedKBFiles],
    folders: [...selectedKBFolders]
  });
}

// Listen for selection updates from KB browser window
window.sparkAPI.onKBSelectionUpdate((data) => {
  if (Array.isArray(data)) {
    // Legacy: just files array
    selectedKBFiles = new Set(data);
    selectedKBFolders.clear();
  } else {
    // New format: {files: [], folders: []}
    selectedKBFiles = new Set(data.files || []);
    selectedKBFolders = new Set(data.folders || []);
  }
  updateKBSelectedCount();
  updateSelectionBar();
});

// Update selection bar under input
function updateSelectionBar() {
  const totalCount = selectedKBFiles.size + selectedKBFolders.size;
  
  if (totalCount === 0) {
    kbSelectionBar.classList.add('hidden');
    return;
  }
  
  kbSelectionBar.classList.remove('hidden');
  selectionTags.innerHTML = '';
  
  // Add folder tags
  for (const folder of selectedKBFolders) {
    const name = folder.split('/').pop() || folder;
    const tag = document.createElement('span');
    tag.className = 'selection-tag folder';
    tag.innerHTML = `📁 ${name} <span class="tag-remove" data-type="folder" data-path="${folder}">✕</span>`;
    tag.querySelector('.tag-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      selectedKBFolders.delete(folder);
      updateSelectionBar();
      updateKBSelectedCount();
    });
    selectionTags.appendChild(tag);
  }
  
  // Add file tags
  for (const file of selectedKBFiles) {
    const name = file.split('/').pop();
    const tag = document.createElement('span');
    tag.className = 'selection-tag';
    tag.innerHTML = `📄 ${name} <span class="tag-remove" data-type="file" data-path="${file}">✕</span>`;
    tag.querySelector('.tag-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      selectedKBFiles.delete(file);
      updateSelectionBar();
      updateKBSelectedCount();
    });
    selectionTags.appendChild(tag);
  }
}

// Show context menu
function showContextMenu(e, item) {
  e.preventDefault();
  e.stopPropagation();
  
  contextTarget = item;
  kbContextMenu.style.left = `${e.clientX}px`;
  kbContextMenu.style.top = `${e.clientY}px`;
  kbContextMenu.classList.remove('hidden');
}

// Hide context menu
function hideContextMenu() {
  kbContextMenu.classList.add('hidden');
  contextTarget = null;
}

// Handle context menu action
async function handleContextAction(action) {
  if (!contextTarget) return;
  
  hideContextMenu();
  
  if (action === 'rename') {
    showModal('rename', contextTarget.name);
  } else if (action === 'delete') {
    if (confirm(`Delete "${contextTarget.name}"? This cannot be undone.`)) {
      const result = await window.sparkAPI.kbDelete(contextTarget.path);
      if (result.success) {
        loadKnowledgeBase();
      } else {
        alert(`Error: ${result.error}`);
      }
    }
  }
}

// Show modal
function showModal(action, defaultValue = '') {
  modalAction = action;
  
  switch (action) {
    case 'newFolder':
      modalHeader.textContent = 'New Folder';
      modalInput.placeholder = 'Folder name';
      modalConfirm.textContent = 'Create';
      break;
    case 'newFile':
      modalHeader.textContent = 'New File';
      modalInput.placeholder = 'filename.md';
      modalConfirm.textContent = 'Create';
      break;
    case 'rename':
      modalHeader.textContent = 'Rename';
      modalInput.placeholder = 'New name';
      modalConfirm.textContent = 'Rename';
      break;
  }
  
  modalInput.value = defaultValue;
  kbModal.classList.remove('hidden');
  modalInput.focus();
  modalInput.select();
}

// Hide modal
function hideModal() {
  kbModal.classList.add('hidden');
  modalInput.value = '';
  modalAction = null;
}

// Handle modal confirm
async function handleModalConfirm() {
  const value = modalInput.value.trim();
  if (!value) return;
  
  let result;
  
  switch (modalAction) {
    case 'newFolder':
      result = await window.sparkAPI.kbCreateFolder(value);
      break;
    case 'newFile':
      const fileName = value.endsWith('.md') ? value : `${value}.md`;
      result = await window.sparkAPI.kbCreateFile(fileName, `# ${value.replace('.md', '')}\n\n`);
      break;
    case 'rename':
      if (contextTarget) {
        result = await window.sparkAPI.kbRename(contextTarget.path, value);
      }
      break;
  }
  
  hideModal();
  
  if (result?.success) {
    loadKnowledgeBase();
  } else if (result?.error) {
    alert(`Error: ${result.error}`);
  }
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
  
  // Add KB context if files or folders selected
  let kbContext = '';
  const allFiles = [...selectedKBFiles];
  
  // Expand folders to files
  if (selectedKBFolders.size > 0 && kbStructure) {
    for (const folderPath of selectedKBFolders) {
      const filesInFolder = getFilesInFolder(kbStructure, folderPath);
      allFiles.push(...filesInFolder);
    }
  }
  
  if (allFiles.length > 0) {
    const kbFiles = await window.sparkAPI.readKBFiles(allFiles);
    kbContext = kbFiles
      .filter(f => !f.error)
      .map(f => `--- ${f.name} ---\n${f.content}`)
      .join('\n\n');
  }
  
  // Helper function to get all files in a folder recursively
  function getFilesInFolder(items, folderPath) {
    const files = [];
    const parts = folderPath.split('/').filter(p => p);
    let current = items;
    
    // Navigate to the folder
    for (const part of parts) {
      const folder = current.find(i => i.type === 'folder' && i.name === part);
      if (folder && folder.children) {
        current = folder.children;
      } else {
        return files;
      }
    }
    
    // Collect all files recursively
    function collectFiles(items, basePath) {
      for (const item of items) {
        if (item.type === 'file') {
          files.push(basePath ? `${basePath}/${item.name}` : item.name);
        } else if (item.type === 'folder' && item.children) {
          collectFiles(item.children, basePath ? `${basePath}/${item.name}` : item.name);
        }
      }
    }
    
    collectFiles(current, folderPath);
    return files;
  }
  
  addMessage(content, 'user');
  
  conversationHistory.push({
    role: 'user',
    content: userMessage
  });
  
  // Show typing indicator
  const hasSearch = webSearchToggle.checked;
  const hasKB = selectedKBFiles.size > 0 || selectedKBFolders.size > 0;
  const typingIndicator = addTypingIndicator(hasSearch, hasKB);
  
  // Build system prompt from current agent
  let systemPrompt = currentAssistant?.prompt || 'You are Spark, a helpful AI assistant. Be concise but thorough.';
  
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
      <img src="../assets/icon.png" class="welcome-icon-img" alt="">
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

// === AGENT MANAGEMENT ===

// Load assistants
async function loadAssistants() {
  assistants = await window.sparkAPI.getAssistants();
  populateAgentSelect();
}

// Populate agent dropdown
function populateAgentSelect() {
  agentSelect.innerHTML = '';
  
  for (const agent of assistants) {
    const option = document.createElement('option');
    option.value = agent.id;
    option.textContent = agent.name;
    if (agent.description) {
      option.title = agent.description;
    }
    agentSelect.appendChild(option);
  }
  
  // Select first agent by default
  if (assistants.length > 0) {
    currentAssistant = assistants[0];
    agentSelect.value = currentAssistant.id;
  }
}

// Handle agent selection change
function handleAgentChange() {
  const selectedId = agentSelect.value;
  currentAssistant = assistants.find(a => a.id === selectedId) || null;
}

// Open agent management modal
function openAgentModal() {
  agentModal.classList.remove('hidden');
  renderAgentList();
  hideAgentForm();
}

// Close agent modal
function closeAgentModal() {
  agentModal.classList.add('hidden');
}

// Render agent list in modal
function renderAgentList() {
  agentList.innerHTML = '';
  
  for (const agent of assistants) {
    const item = document.createElement('div');
    item.className = 'agent-item';
    item.innerHTML = `
      <div class="agent-item-info">
        <div class="agent-item-name">${agent.name}</div>
        <div class="agent-item-desc">${agent.description || ''}</div>
      </div>
      <div class="agent-item-actions">
        <button class="edit" data-id="${agent.id}">✏️ Edit</button>
        ${agent.id !== 'asst_default' ? `<button class="delete" data-id="${agent.id}">🗑️</button>` : ''}
      </div>
    `;
    
    item.querySelector('.edit').addEventListener('click', (e) => {
      e.stopPropagation();
      editAgent(agent.id);
    });
    
    const deleteBtn = item.querySelector('.delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Delete "${agent.name}"?`)) {
          await window.sparkAPI.deleteAssistant(agent.id);
          await loadAssistants();
          renderAgentList();
        }
      });
    }
    
    agentList.appendChild(item);
  }
}

// Show agent form (new)
function showAgentForm(agent = null) {
  agentForm.classList.remove('hidden');
  agentModalFooter.classList.add('hidden');
  agentList.style.display = 'none';
  
  document.getElementById('agentId').value = agent?.id || '';
  document.getElementById('agentName').value = agent?.name || '';
  document.getElementById('agentDesc').value = agent?.description || '';
  document.getElementById('agentPrompt').value = agent?.prompt || '';
}

// Hide agent form
function hideAgentForm() {
  agentForm.classList.add('hidden');
  agentModalFooter.classList.remove('hidden');
  agentList.style.display = 'block';
}

// Edit existing agent
function editAgent(agentId) {
  const agent = assistants.find(a => a.id === agentId);
  if (agent) {
    showAgentForm(agent);
  }
}

// Save agent
async function saveAgent() {
  const id = document.getElementById('agentId').value;
  const name = document.getElementById('agentName').value.trim();
  const description = document.getElementById('agentDesc').value.trim();
  const prompt = document.getElementById('agentPrompt').value.trim();
  
  if (!name || !prompt) {
    alert('Name and prompt are required');
    return;
  }
  
  const agent = { name, description, prompt };
  if (id) agent.id = id;
  
  const result = await window.sparkAPI.saveAssistant(agent);
  
  if (result.success) {
    await loadAssistants();
    hideAgentForm();
    renderAgentList();
  } else {
    alert(`Error: ${result.error}`);
  }
}
