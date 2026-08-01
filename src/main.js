// ============================================
// RecordIt — Main Application Script
// Uses window.__TAURI__ global (injected by withGlobalTauri)
// ============================================

// ============================================
// State
// ============================================
let currentMode = 'video'; // 'video' or 'audio'
let isRecording = false;
let timerInterval = null;
let recordingStartTime = null;

// ============================================
// DOM Elements
// ============================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const elements = {
  cameraSelect: $('#camera-select'),
  micSelect: $('#mic-select'),
  cameraSection: $('#camera-section'),
  btnRecord: $('#btn-record'),
  btnStop: $('#btn-stop'),
  recordingIndicator: $('#recording-indicator'),
  recordingTimer: $('#recording-timer'),
  effectsList: $('#effects-list'),
  recordingsList: $('#recordings-list'),
  folderPath: $('#folder-path'),
  btnChangeFolder: $('#btn-change-folder'),
  btnOpenFolder: $('#btn-open-folder'),
  statusMessage: $('#status-message'),
  permissionsStatus: $('#permissions-status'),
};

// ============================================
// Tauri API accessor
// ============================================
function getTauriInvoke() {
  if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
    return window.__TAURI_INTERNALS__.invoke;
  }
  if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
    return window.__TAURI__.core.invoke;
  }
  if (window.__TAURI__ && window.__TAURI__.invoke) {
    return window.__TAURI__.invoke;
  }
  return null;
}

function debugTauri() {
  const info = [];
  info.push('__TAURI__: ' + (typeof window.__TAURI__));
  if (window.__TAURI__) {
    info.push('keys: ' + Object.keys(window.__TAURI__).join(', '));
    info.push('core: ' + (typeof window.__TAURI__.core));
    if (window.__TAURI__.core) {
      info.push('core.invoke: ' + (typeof window.__TAURI__.core.invoke));
    }
    info.push('invoke: ' + (typeof window.__TAURI__.invoke));
  }
  info.push('__TAURI_INTERNALS__: ' + (typeof window.__TAURI_INTERNALS__));
  return info.join('\n');
}

// ============================================
// Initialization
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
  // Show debug info
  console.log(debugTauri());

  const invoke = getTauriInvoke();
  if (!invoke) {
    setStatus('ERROR: Tauri API not found. withGlobalTauri must be enabled.', true);
    document.body.innerHTML = '<div style="padding:40px;color:red;font-family:monospace;"><h2>Tauri API Not Found</h2><pre>' + debugTauri() + '</pre></div>';
    return;
  }

  // Store invoke globally for all functions to use
  window.__recordit_invoke = invoke;

  setupEventListeners();

  try {
    await requestPermissions();
    await loadDevices();
    await loadEffects();
    await loadRecordings();
    await loadFolder();
  } catch (err) {
    console.error('Init error:', err);
    setStatus('Initialization error: ' + err, true);
  }
});

function invoke(cmd, args) {
  const fn = window.__recordit_invoke;
  if (!fn) {
    console.error('invoke called before Tauri ready');
    return Promise.reject('Tauri not ready');
  }
  return fn(cmd, args);
}

// ============================================
// Event Listeners
// ============================================
function setupEventListeners() {
  // Mode toggle
  $$('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = btn.dataset.mode;
      elements.cameraSection.style.display = currentMode === 'audio' ? 'none' : 'block';
      if (elements.effectsList.parentElement) {
        elements.effectsList.parentElement.style.display = currentMode === 'audio' ? 'none' : 'block';
      }
      setStatus(currentMode === 'video' ? 'Video + Audio mode' : 'Audio only mode');
    });
  });

  // Record / Stop
  elements.btnRecord.addEventListener('click', startRecording);
  elements.btnStop.addEventListener('click', stopRecording);

  // Camera / Mic selection
  elements.cameraSelect.addEventListener('change', async (e) => {
    if (e.target.value) {
      try {
        await invoke('select_camera', { deviceId: e.target.value });
        setStatus(`Camera: ${e.target.options[e.target.selectedIndex].text}`);
      } catch (err) {
        setStatus(`Error selecting camera: ${err}`, true);
      }
    }
  });

  elements.micSelect.addEventListener('change', async (e) => {
    if (e.target.value) {
      try {
        await invoke('select_microphone', { deviceId: e.target.value });
        setStatus(`Mic: ${e.target.options[e.target.selectedIndex].text}`);
      } catch (err) {
        setStatus(`Error selecting mic: ${err}`, true);
      }
    }
  });

  // Mic mode
  $$('.mic-mode-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      $$('.mic-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      try {
        await invoke('toggle_effect', { name: `micMode_${btn.dataset.mode}`, enabled: true });
        setStatus(`Mic mode: ${btn.textContent}`);
      } catch (err) {
        setStatus(`Error setting mic mode: ${err}`, true);
      }
    });
  });

  // Folder controls
  elements.btnChangeFolder.addEventListener('click', changeFolder);
  elements.btnOpenFolder.addEventListener('click', openFolder);
}

// ============================================
// Permissions
// ============================================
async function requestPermissions() {
  try {
    const resultStr = await invoke('request_permissions');
    const data = typeof resultStr === 'string' ? JSON.parse(resultStr) : resultStr;
    if (data && data.success) {
      elements.permissionsStatus.textContent = '✅ Permissions: ' + (data.data || 'granted');
    } else {
      elements.permissionsStatus.textContent = '⚠️ Permissions needed: ' + ((data && data.error) || '');
    }
  } catch (err) {
    elements.permissionsStatus.textContent = '⚠️ Permission check failed: ' + err;
    console.error('Permission error:', err);
  }
}

// ============================================
// Devices
// ============================================
async function loadDevices() {
  try {
    const resultStr = await invoke('list_devices');
    console.log('list_devices raw result:', resultStr);
    const data = typeof resultStr === 'string' ? JSON.parse(resultStr) : resultStr;
    console.log('list_devices parsed:', data);

    if (!data || !data.success) {
      setStatus('Failed to load devices: ' + ((data && data.error) || 'Unknown'), true);
      elements.cameraSelect.innerHTML = '<option value="">Error loading</option>';
      elements.micSelect.innerHTML = '<option value="">Error loading</option>';
      return;
    }

    const devices = data.data || [];
    console.log('Devices found:', devices.length, devices);

    const cameras = devices.filter(d => d.type === 'video');
    const mics = devices.filter(d => d.type === 'audio');

    // Populate camera select
    elements.cameraSelect.innerHTML = '';
    if (cameras.length === 0) {
      elements.cameraSelect.innerHTML = '<option value="">No cameras found</option>';
    } else {
      cameras.forEach(cam => {
        const opt = document.createElement('option');
        opt.value = cam.id;
        opt.textContent = cam.name + (cam.deviceType === 'continuity' ? ' (iPhone)' : '');
        elements.cameraSelect.appendChild(opt);
      });
    }

    // Populate mic select
    elements.micSelect.innerHTML = '';
    if (mics.length === 0) {
      elements.micSelect.innerHTML = '<option value="">No microphones found</option>';
    } else {
      mics.forEach(mic => {
        const opt = document.createElement('option');
        opt.value = mic.id;
        opt.textContent = mic.name;
        elements.micSelect.appendChild(opt);
      });
    }

    setStatus(`Found ${cameras.length} camera(s), ${mics.length} mic(s)`);
  } catch (err) {
    setStatus('Error loading devices: ' + err, true);
    console.error('Device error:', err);
    elements.cameraSelect.innerHTML = '<option value="">Error: ' + err + '</option>';
    elements.micSelect.innerHTML = '<option value="">Error: ' + err + '</option>';
  }
}

// ============================================
// Recording
// ============================================
async function startRecording() {
  try {
    elements.btnRecord.disabled = true;
    elements.btnStop.disabled = false;
    setStatus('Starting recording...');

    const resultStr = await invoke('start_recording', { mode: currentMode });
    const data = typeof resultStr === 'string' ? JSON.parse(resultStr) : resultStr;

    if (data && data.success) {
      isRecording = true;
      elements.recordingIndicator.classList.add('recording');
      recordingStartTime = Date.now();
      timerInterval = setInterval(updateTimer, 1000);
      setStatus('Recording...');
    } else {
      elements.btnRecord.disabled = false;
      elements.btnStop.disabled = true;
      setStatus('Failed to start: ' + ((data && data.error) || 'Unknown error'), true);
    }
  } catch (err) {
    elements.btnRecord.disabled = false;
    elements.btnStop.disabled = true;
    setStatus('Recording error: ' + err, true);
    console.error('Record error:', err);
  }
}

async function stopRecording() {
  try {
    elements.btnStop.disabled = true;
    setStatus('Stopping recording...');

    const resultStr = await invoke('stop_recording');
    const data = typeof resultStr === 'string' ? JSON.parse(resultStr) : resultStr;

    isRecording = false;
    elements.recordingIndicator.classList.remove('recording');
    elements.btnRecord.disabled = false;
    clearInterval(timerInterval);
    elements.recordingTimer.textContent = '00:00:00';

    if (data && data.success) {
      setStatus('Recording saved!');
      await loadRecordings();
    } else {
      setStatus('Stop error: ' + ((data && data.error) || 'Unknown'), true);
    }
  } catch (err) {
    elements.btnRecord.disabled = false;
    elements.recordingIndicator.classList.remove('recording');
    clearInterval(timerInterval);
    setStatus('Stop error: ' + err, true);
    console.error('Stop error:', err);
  }
}

function updateTimer() {
  if (!recordingStartTime) return;
  const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
  const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
  const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
  const s = String(elapsed % 60).padStart(2, '0');
  elements.recordingTimer.textContent = `${h}:${m}:${s}`;
}

// ============================================
// Effects
// ============================================
async function loadEffects() {
  try {
    const resultStr = await invoke('get_effects');
    const data = typeof resultStr === 'string' ? JSON.parse(resultStr) : resultStr;

    if (!data || !data.success) {
      elements.effectsList.innerHTML = '<p class="muted">Could not load effects</p>';
      return;
    }

    const effects = data.data || [];
    if (effects.length === 0) {
      elements.effectsList.innerHTML = '<p class="muted">No effects available</p>';
      return;
    }

    elements.effectsList.innerHTML = '';
    effects.forEach(effect => {
      const item = document.createElement('div');
      item.className = 'effect-item' + (effect.supported ? '' : ' unsupported');
      item.innerHTML = `
        <span class="effect-name">${effect.name}</span>
        <label class="toggle">
          <input type="checkbox"
            ${effect.enabled ? 'checked' : ''}
            ${!effect.canToggle ? 'disabled' : ''}
            data-effect="${effect.id}">
          <span class="toggle-slider"></span>
        </label>
      `;
      elements.effectsList.appendChild(item);

      const checkbox = item.querySelector('input');
      if (effect.canToggle && checkbox) {
        checkbox.addEventListener('change', async (e) => {
          try {
            await invoke('toggle_effect', { name: effect.id, enabled: e.target.checked });
            setStatus(`${effect.name}: ${e.target.checked ? 'On' : 'Off'}`);
          } catch (err) {
            e.target.checked = !e.target.checked;
            setStatus(`Error toggling ${effect.name}: ${err}`, true);
          }
        });
      }
    });
  } catch (err) {
    elements.effectsList.innerHTML = '<p class="muted">Effects unavailable</p>';
    console.error('Effects error:', err);
  }
}

// ============================================
// Recordings List
// ============================================
async function loadRecordings() {
  try {
    const resultStr = await invoke('list_recordings');
    const data = typeof resultStr === 'string' ? JSON.parse(resultStr) : resultStr;

    if (!data || !data.success || !data.data || data.data.length === 0) {
      elements.recordingsList.innerHTML = '<p class="muted">No recordings yet</p>';
      return;
    }

    elements.recordingsList.innerHTML = '';
    data.data.forEach(rec => {
      const item = document.createElement('div');
      item.className = 'recording-item';
      const size = formatFileSize(rec.size || 0);
      const date = rec.modified ? new Date(rec.modified).toLocaleString() : '';
      const ext = (rec.name || '').split('.').pop().toUpperCase();

      item.innerHTML = `
        <div class="recording-info">
          <div class="recording-name" title="${rec.name}">${rec.name}</div>
          <div class="recording-meta">${ext} · ${size} · ${date}</div>
        </div>
        <div class="recording-actions">
          <button class="play-btn" title="Open">▶</button>
          <button class="rename-btn" title="Rename">✏️</button>
          <button class="reveal-btn" title="Reveal in Finder">📂</button>
          <button class="delete-btn" title="Delete">🗑</button>
        </div>
      `;

      // Play
      item.querySelector('.play-btn').addEventListener('click', async () => {
        try {
          await invoke('open_recording', { path: rec.path });
        } catch (err) {
          setStatus('Open error: ' + err, true);
        }
      });

      // Rename
      item.querySelector('.rename-btn').addEventListener('click', () => {
        startRename(item, rec);
      });

      // Reveal
      item.querySelector('.reveal-btn').addEventListener('click', async () => {
        try {
          await invoke('reveal_in_finder', { path: rec.path });
        } catch (err) {
          setStatus('Reveal error: ' + err, true);
        }
      });

      // Delete
      item.querySelector('.delete-btn').addEventListener('click', async () => {
        if (confirm(`Delete "${rec.name}"?`)) {
          try {
            await invoke('delete_recording', { path: rec.path });
            setStatus(`Deleted ${rec.name}`);
            await loadRecordings();
          } catch (err) {
            setStatus('Delete error: ' + err, true);
          }
        }
      });

      elements.recordingsList.appendChild(item);
    });
  } catch (err) {
    elements.recordingsList.innerHTML = '<p class="muted">Error loading recordings</p>';
    console.error('Recordings error:', err);
  }
}

function startRename(item, rec) {
  const nameEl = item.querySelector('.recording-name');
  const nameWithoutExt = rec.name.replace(/\.[^.]+$/, '');
  const originalName = nameEl.textContent;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'rename-input';
  input.value = nameWithoutExt;
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  const finishRename = async () => {
    const newName = input.value.trim();
    if (newName && newName !== nameWithoutExt) {
      try {
        await invoke('rename_recording', { oldPath: rec.path, newName: newName });
        setStatus(`Renamed to ${newName}`);
        await loadRecordings();
      } catch (err) {
        setStatus('Rename error: ' + err, true);
        restoreOriginal();
      }
    } else {
      restoreOriginal();
    }
  };

  const restoreOriginal = () => {
    const newNameEl = document.createElement('div');
    newNameEl.className = 'recording-name';
    newNameEl.textContent = originalName;
    newNameEl.title = originalName;
    input.replaceWith(newNameEl);
  };

  input.addEventListener('blur', finishRename);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') { input.value = nameWithoutExt; input.blur(); }
  });
}

// ============================================
// Folder Management
// ============================================
async function loadFolder() {
  try {
    const resultStr = await invoke('get_recordings_folder');
    const data = typeof resultStr === 'string' ? JSON.parse(resultStr) : resultStr;
    if (data && data.success) {
      const path = data.data;
      elements.folderPath.textContent = path.replace(/^\/Users\/[^/]+/, '~');
      elements.folderPath.title = path;
    }
  } catch (err) {
    console.error('Folder error:', err);
  }
}

async function changeFolder() {
  try {
    // Use prompt dialog since we don't have the dialog plugin JS API without bundler
    const path = prompt('Enter new recordings folder path:');
    if (path) {
      await invoke('set_recordings_folder', { path: path });
      setStatus('Folder changed');
      await loadFolder();
      await loadRecordings();
    }
  } catch (err) {
    setStatus('Folder change error: ' + err, true);
  }
}

async function openFolder() {
  try {
    const resultStr = await invoke('get_recordings_folder');
    const data = typeof resultStr === 'string' ? JSON.parse(resultStr) : resultStr;
    if (data && data.success) {
      await invoke('reveal_in_finder', { path: data.data });
    }
  } catch (err) {
    setStatus('Open folder error: ' + err, true);
  }
}

// ============================================
// Utilities
// ============================================
function setStatus(message, isError = false) {
  elements.statusMessage.textContent = message;
  elements.statusMessage.style.color = isError ? 'var(--accent)' : 'var(--text-muted)';
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
