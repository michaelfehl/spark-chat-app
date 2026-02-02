// Elements
const folderTree = document.getElementById('folderTree');
const fileGrid = document.getElementById('fileGrid');
const kbPath = document.getElementById('kbPath');
const selectionCount = document.getElementById('selectionCount');
const selectedTags = document.getElementById('selectedTags');
const newFolderBtn = document.getElementById('newFolderBtn');
const newFileBtn = document.getElementById('newFileBtn');
const openFinderBtn = document.getElementById('openFinderBtn');
const applyBtn = document.getElementById('applyBtn');
const modal = document.getElementById('modal');
const modalHeader = document.getElementById('modalHeader');
const modalInput = document.getElementById('modalInput');
const modalCancel = document.getElementById('modalCancel');
const modalConfirm = document.getElementById('modalConfirm');
const contextMenu = document.getElementById('contextMenu');

// State
let kbStructure = null;
let selectedFiles = new Set();
let currentFolder = '';
let contextTarget = null;
let modalAction = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadKnowledgeBase();
  
  // Toolbar buttons
  newFolderBtn.addEventListener('click', () => showModal('newFolder'));
  newFileBtn.addEventListener('click', () => showModal('newFile'));
  openFinderBtn.addEventListener('click', () => window.sparkAPI.kbOpenFinder());
  applyBtn.addEventListener('click', applySelection);
  
  // Modal
  modalCancel.addEventListener('click', hideModal);
  modalConfirm.addEventListener('click', handleModalConfirm);
  modalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleModalConfirm();
    if (e.key === 'Escape') hideModal();
  });
  
  // Context menu
  document.addEventListener('click', () => hideContextMenu());
  contextMenu.querySelectorAll('.context-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleContextAction(btn.dataset.action);
    });
  });
  
  // Receive initial selection from main window
  window.sparkAPI.onInitSelection((files) => {
    selectedFiles = new Set(files);
    updateSelectionUI();
  });
});

// Load KB structure
async function loadKnowledgeBase() {
  const result = await window.sparkAPI.getKnowledgeBase();
  
  if (result.success) {
    kbStructure = result.structure;
    kbPath.textContent = result.path;
    renderFolderTree(result.structure);
    showFolder(''); // Show root
  } else {
    fileGrid.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${result.error}</p></div>`;
  }
}

// Render folder tree in sidebar
function renderFolderTree(items, container = folderTree, basePath = '') {
  if (container === folderTree) container.innerHTML = '';
  
  // Add root folder
  if (basePath === '') {
    const rootItem = document.createElement('div');
    rootItem.className = 'folder-item active';
    rootItem.innerHTML = '<span class="folder-icon">📁</span> SparkRAG (Root)';
    rootItem.addEventListener('click', () => {
      document.querySelectorAll('.folder-item').forEach(f => f.classList.remove('active'));
      rootItem.classList.add('active');
      showFolder('');
    });
    container.appendChild(rootItem);
  }
  
  // Add folders
  for (const item of items) {
    if (item.type === 'folder') {
      const folderPath = basePath ? `${basePath}/${item.name}` : item.name;
      
      const folderItem = document.createElement('div');
      folderItem.className = 'folder-item';
      folderItem.innerHTML = `<span class="folder-icon">▶</span> 📁 ${item.name}`;
      folderItem.style.marginLeft = basePath ? '20px' : '0';
      
      folderItem.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.folder-item').forEach(f => f.classList.remove('active'));
        folderItem.classList.add('active');
        folderItem.classList.toggle('expanded');
        showFolder(folderPath);
      });
      
      folderItem.addEventListener('contextmenu', (e) => showContextMenu(e, item, folderPath));
      
      container.appendChild(folderItem);
      
      // Render children recursively
      if (item.children && item.children.length > 0) {
        const childContainer = document.createElement('div');
        childContainer.className = 'folder-children';
        renderFolderTree(item.children, childContainer, folderPath);
        container.appendChild(childContainer);
      }
    }
  }
}

// Show files in a folder
function showFolder(folderPath) {
  currentFolder = folderPath;
  const items = getItemsAtPath(kbStructure, folderPath);
  
  fileGrid.innerHTML = '';
  
  const files = items.filter(i => i.type === 'file');
  const folders = items.filter(i => i.type === 'folder');
  
  if (files.length === 0 && folders.length === 0) {
    fileGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">📂</div><p>This folder is empty</p></div>';
    return;
  }
  
  // Show folders first
  for (const folder of folders) {
    const fullPath = folderPath ? `${folderPath}/${folder.name}` : folder.name;
    const card = createFileCard(folder, fullPath, true);
    fileGrid.appendChild(card);
  }
  
  // Then files
  for (const file of files) {
    const fullPath = folderPath ? `${folderPath}/${file.name}` : file.name;
    const card = createFileCard(file, fullPath, false);
    fileGrid.appendChild(card);
  }
}

// Get items at a specific path
function getItemsAtPath(items, path) {
  if (!path) return items;
  
  const parts = path.split('/');
  let current = items;
  
  for (const part of parts) {
    const folder = current.find(i => i.type === 'folder' && i.name === part);
    if (folder && folder.children) {
      current = folder.children;
    } else {
      return [];
    }
  }
  
  return current;
}

// Create file/folder card
function createFileCard(item, fullPath, isFolder) {
  const card = document.createElement('div');
  card.className = 'file-card';
  
  if (!isFolder && selectedFiles.has(fullPath)) {
    card.classList.add('selected');
  }
  
  const icon = isFolder ? '📁' : '📄';
  const size = item.size ? formatSize(item.size) : '';
  
  card.innerHTML = `
    <div class="check-badge">✓</div>
    <div class="file-icon">${icon}</div>
    <div class="file-name">${item.name}</div>
    ${size ? `<div class="file-size">${size}</div>` : ''}
  `;
  
  if (isFolder) {
    card.addEventListener('click', () => {
      document.querySelectorAll('.folder-item').forEach(f => f.classList.remove('active'));
      showFolder(fullPath);
    });
    card.addEventListener('dblclick', () => showFolder(fullPath));
  } else {
    card.addEventListener('click', () => toggleFileSelection(card, fullPath));
  }
  
  card.addEventListener('contextmenu', (e) => showContextMenu(e, item, fullPath));
  
  return card;
}

// Toggle file selection
function toggleFileSelection(card, path) {
  if (selectedFiles.has(path)) {
    selectedFiles.delete(path);
    card.classList.remove('selected');
  } else {
    selectedFiles.add(path);
    card.classList.add('selected');
  }
  
  updateSelectionUI();
  notifySelectionChanged();
}

// Update selection UI
function updateSelectionUI() {
  const count = selectedFiles.size;
  selectionCount.textContent = `${count} file${count !== 1 ? 's' : ''} selected`;
  
  // Update tags
  selectedTags.innerHTML = '';
  for (const path of selectedFiles) {
    const name = path.split('/').pop();
    const tag = document.createElement('span');
    tag.className = 'selected-tag';
    tag.innerHTML = `${name} <span class="remove-tag" data-path="${path}">✕</span>`;
    tag.querySelector('.remove-tag').addEventListener('click', (e) => {
      e.stopPropagation();
      selectedFiles.delete(path);
      updateSelectionUI();
      notifySelectionChanged();
      // Update card if visible
      document.querySelectorAll('.file-card').forEach(card => {
        if (card.querySelector('.file-name')?.textContent === name) {
          card.classList.remove('selected');
        }
      });
    });
    selectedTags.appendChild(tag);
  }
}

// Notify main window of selection changes
function notifySelectionChanged() {
  window.sparkAPI.kbSendSelection([...selectedFiles]);
}

// Apply selection and close
function applySelection() {
  notifySelectionChanged();
  window.sparkAPI.kbCloseWindow();
}

// Format file size
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Context menu
function showContextMenu(e, item, path) {
  e.preventDefault();
  e.stopPropagation();
  
  contextTarget = { ...item, fullPath: path };
  contextMenu.style.left = `${e.clientX}px`;
  contextMenu.style.top = `${e.clientY}px`;
  contextMenu.classList.remove('hidden');
}

function hideContextMenu() {
  contextMenu.classList.add('hidden');
  contextTarget = null;
}

async function handleContextAction(action) {
  if (!contextTarget) return;
  hideContextMenu();
  
  if (action === 'rename') {
    showModal('rename', contextTarget.name);
  } else if (action === 'delete') {
    if (confirm(`Delete "${contextTarget.name}"? This cannot be undone.`)) {
      const result = await window.sparkAPI.kbDelete(contextTarget.fullPath);
      if (result.success) {
        selectedFiles.delete(contextTarget.fullPath);
        loadKnowledgeBase();
        updateSelectionUI();
        notifySelectionChanged();
      } else {
        alert(`Error: ${result.error}`);
      }
    }
  }
}

// Modal
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
  modal.classList.remove('hidden');
  modalInput.focus();
  modalInput.select();
}

function hideModal() {
  modal.classList.add('hidden');
  modalInput.value = '';
  modalAction = null;
}

async function handleModalConfirm() {
  const value = modalInput.value.trim();
  if (!value) return;
  
  let result;
  const basePath = currentFolder ? `${currentFolder}/` : '';
  
  switch (modalAction) {
    case 'newFolder':
      result = await window.sparkAPI.kbCreateFolder(basePath + value);
      break;
    case 'newFile':
      const fileName = value.endsWith('.md') ? value : `${value}.md`;
      result = await window.sparkAPI.kbCreateFile(basePath + fileName, `# ${value.replace('.md', '')}\n\n`);
      break;
    case 'rename':
      if (contextTarget) {
        result = await window.sparkAPI.kbRename(contextTarget.fullPath, value);
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
