// ============================================
// RecordIt Studio — Main Application Script
// Uses window.__TAURI__ global (injected by withGlobalTauri)
// ============================================

// ============================================
// State
// ============================================
let currentMode = 'video'; // 'video' or 'audio'
let isRecording = false;
let timerInterval = null;
let recordingStartTime = null;
let recordingsCache = [];
let animFrameId = null;

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
  recordingModeBadge: $('#recording-mode-badge'),
  recordingTimer: $('#recording-timer'),
  effectsList: $('#effects-list'),
  recordingsList: $('#recordings-list'),
  recordingsCount: $('#recordings-count'),
  folderPath: $('#folder-path'),
  btnChangeFolder: $('#btn-change-folder'),
  btnOpenFolder: $('#btn-open-folder'),
  searchInput: $('#search-input'),
  searchClear: $('#search-clear'),
  statusMessage: $('#status-message'),
  permissionsStatus: $('#permissions-status'),
  audioCanvas: $('#audio-canvas'),
  audioSignalState: $('#audio-signal-state'),
  chipCam: $('#chip-cam'),
  chipMic: $('#chip-mic'),
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

// ============================================
// Initialization
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
  const invoke = getTauriInvoke();
  if (!invoke) {
    setStatus('ERROR: Tauri API not found. withGlobalTauri must be enabled.', true);
    document.body.innerHTML = '<div style="padding:40px;color:#ff3b5c;font-family:sans-serif;"><h2>Tauri API Not Found</h2><p>Please launch via Tauri app wrapper.</p></div>';
    return;
  }

  window.__recordit_invoke = invoke;

  setupEventListeners();
  initAudioVisualizer();

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
      
      elements.cameraSection.style.display = currentMode === 'audio' ? 'none' : 'flex';
      const effectsSec = $('#effects-section');
      if (effectsSec) {
        effectsSec.style.display = currentMode === 'audio' ? 'none' : 'flex';
      }
      
      elements.recordingModeBadge.textContent = currentMode === 'video' ? 'REC VIDEO' : 'REC AUDIO';
      setStatus(currentMode === 'video' ? 'Video + Audio mode selected' : 'Audio only mode selected');
    });
  });

  // Record / Stop buttons
  elements.btnRecord.addEventListener('click', startRecording);
  elements.btnStop.addEventListener('click', stopRecording);

  // Search input filter
  if (elements.searchInput) {
    elements.searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      elements.searchClear.style.display = q ? 'block' : 'none';
      renderRecordingsList(recordingsCache.filter(r => r.name.toLowerCase().includes(q)));
    });

    elements.searchClear.addEventListener('click', () => {
      elements.searchInput.value = '';
      elements.searchClear.style.display = 'none';
      renderRecordingsList(recordingsCache);
    });
  }

  // Camera / Mic dropdowns
  elements.cameraSelect.addEventListener('change', async (e) => {
    if (e.target.value) {
      try {
        await invoke('select_camera', { deviceId: e.target.value });
        setStatus(`Camera switched to: ${e.target.options[e.target.selectedIndex].text}`);
      } catch (err) {
        setStatus(`Error selecting camera: ${err}`, true);
      }
    }
  });

  elements.micSelect.addEventListener('change', async (e) => {
    if (e.target.value) {
      try {
        await invoke('select_microphone', { deviceId: e.target.value });
        setStatus(`Microphone switched to: ${e.target.options[e.target.selectedIndex].text}`);
      } catch (err) {
        setStatus(`Error selecting mic: ${err}`, true);
      }
    }
  });

  // Mic mode buttons
  $$('.mic-mode-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      $$('.mic-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      try {
        await invoke('toggle_effect', { name: `micMode_${btn.dataset.mode}`, enabled: true });
        setStatus(`Mic mode set to: ${btn.textContent}`);
      } catch (err) {
        setStatus(`Error setting mic mode: ${err}`, true);
      }
    });
  });

  // Folder management
  elements.btnChangeFolder.addEventListener('click', changeFolder);
  elements.btnOpenFolder.addEventListener('click', openFolder);
}

// ============================================
// Permissions Check
// ============================================
async function requestPermissions() {
  try {
    const resultStr = await invoke('request_permissions');
    const data = typeof resultStr === 'string' ? JSON.parse(resultStr) : resultStr;
    if (data && data.success) {
      elements.permissionsStatus.textContent = 'Permissions: Granted';
      if (elements.chipCam) elements.chipCam.classList.remove('off');
      if (elements.chipMic) elements.chipMic.classList.remove('off');
    } else {
      elements.permissionsStatus.textContent = 'Permissions needed';
    }
  } catch (err) {
    elements.permissionsStatus.textContent = 'Permissions error';
    console.error('Permission error:', err);
  }
}

// ============================================
// Devices
// ============================================
async function loadDevices() {
  try {
    const resultStr = await invoke('list_devices');
    const data = typeof resultStr === 'string' ? JSON.parse(resultStr) : resultStr;

    if (!data || !data.success) {
      setStatus('Failed to load devices: ' + ((data && data.error) || 'Unknown'), true);
      elements.cameraSelect.innerHTML = '<option value="">Error loading cameras</option>';
      elements.micSelect.innerHTML = '<option value="">Error loading microphones</option>';
      return;
    }

    const devices = data.data || [];
    const cameras = devices.filter(d => d.type === 'video');
    const mics = devices.filter(d => d.type === 'audio');

    // Cameras
    elements.cameraSelect.innerHTML = '';
    if (cameras.length === 0) {
      elements.cameraSelect.innerHTML = '<option value="">No camera available</option>';
      if (elements.chipCam) elements.chipCam.classList.add('off');
    } else {
      cameras.forEach(cam => {
        const opt = document.createElement('option');
        opt.value = cam.id;
        opt.textContent = cam.name + (cam.deviceType === 'continuity' ? ' (iPhone)' : '');
        elements.cameraSelect.appendChild(opt);
      });
      if (elements.chipCam) elements.chipCam.classList.remove('off');
    }

    // Mics
    elements.micSelect.innerHTML = '';
    if (mics.length === 0) {
      elements.micSelect.innerHTML = '<option value="">No microphone available</option>';
      if (elements.chipMic) elements.chipMic.classList.add('off');
    } else {
      mics.forEach(mic => {
        const opt = document.createElement('option');
        opt.value = mic.id;
        opt.textContent = mic.name;
        elements.micSelect.appendChild(opt);
      });
      if (elements.chipMic) elements.chipMic.classList.remove('off');
    }

    setStatus(`Devices loaded: ${cameras.length} camera(s), ${mics.length} mic(s)`);
  } catch (err) {
    setStatus('Error loading devices: ' + err, true);
  }
}

// ============================================
// Recording Controls
// ============================================
async function startRecording() {
  try {
    elements.btnRecord.disabled = true;
    elements.btnStop.disabled = false;
    setStatus('Initializing recording stream...');

    const resultStr = await invoke('start_recording', { mode: currentMode });
    const data = typeof resultStr === 'string' ? JSON.parse(resultStr) : resultStr;

    if (data && data.success) {
      isRecording = true;
      elements.recordingIndicator.classList.add('recording');
      elements.recordingIndicator.parentElement.classList.add('is-recording');
      if (elements.audioSignalState) {
        elements.audioSignalState.textContent = 'LIVE';
        elements.audioSignalState.classList.add('active');
      }

      recordingStartTime = Date.now();
      timerInterval = setInterval(updateTimer, 1000);
      setStatus(`Recording started (${currentMode.toUpperCase()})`);
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
    setStatus('Finalizing recording file...');

    const resultStr = await invoke('stop_recording');
    const data = typeof resultStr === 'string' ? JSON.parse(resultStr) : resultStr;

    isRecording = false;
    elements.recordingIndicator.classList.remove('recording');
    elements.recordingIndicator.parentElement.classList.remove('is-recording');
    if (elements.audioSignalState) {
      elements.audioSignalState.textContent = 'IDLE';
      elements.audioSignalState.classList.remove('active');
    }

    elements.btnRecord.disabled = false;
    clearInterval(timerInterval);
    elements.recordingTimer.textContent = '00:00:00';

    if (data && data.success) {
      setStatus('Recording saved successfully!');
      await loadRecordings();
    } else {
      setStatus('Stop error: ' + ((data && data.error) || 'Unknown'), true);
    }
  } catch (err) {
    elements.btnRecord.disabled = false;
    elements.recordingIndicator.classList.remove('recording');
    clearInterval(timerInterval);
    setStatus('Stop error: ' + err, true);
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
// Camera Effects
// ============================================
async function loadEffects() {
  try {
    const resultStr = await invoke('get_effects');
    const data = typeof resultStr === 'string' ? JSON.parse(resultStr) : resultStr;

    if (!data || !data.success) {
      elements.effectsList.innerHTML = '<p class="empty-desc" style="padding:10px;text-align:center;">Effects unavailable</p>';
      return;
    }

    const effects = data.data || [];
    if (effects.length === 0) {
      elements.effectsList.innerHTML = '<p class="empty-desc" style="padding:10px;text-align:center;">No hardware effects found</p>';
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
            setStatus(`${effect.name}: ${e.target.checked ? 'Enabled' : 'Disabled'}`);
          } catch (err) {
            e.target.checked = !e.target.checked;
            setStatus(`Error toggling ${effect.name}: ${err}`, true);
          }
        });
      }
    });
  } catch (err) {
    elements.effectsList.innerHTML = '<p class="empty-desc" style="padding:10px;text-align:center;">Effects unavailable</p>';
  }
}

// ============================================
// Recordings List
// ============================================
async function loadRecordings() {
  try {
    const resultStr = await invoke('list_recordings');
    const data = typeof resultStr === 'string' ? JSON.parse(resultStr) : resultStr;

    if (!data || !data.success || !data.data) {
      recordingsCache = [];
      renderRecordingsList([]);
      return;
    }

    recordingsCache = data.data;
    const filterQuery = elements.searchInput ? elements.searchInput.value.toLowerCase() : '';
    const filtered = filterQuery ? recordingsCache.filter(r => r.name.toLowerCase().includes(filterQuery)) : recordingsCache;
    renderRecordingsList(filtered);
  } catch (err) {
    elements.recordingsList.innerHTML = '<p class="empty-desc" style="padding:20px;text-align:center;">Error loading recordings</p>';
  }
}

function renderRecordingsList(list) {
  elements.recordingsCount.textContent = `${list.length} item${list.length === 1 ? '' : 's'}`;

  if (!list || list.length === 0) {
    elements.recordingsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="2" width="20" height="20" rx="5"/>
            <path d="M10 9l5 3-5 3V9z"/>
          </svg>
        </div>
        <p class="empty-title">${elements.searchInput && elements.searchInput.value ? 'No matching recordings' : 'No recordings yet'}</p>
        <p class="empty-desc">${elements.searchInput && elements.searchInput.value ? 'Try clearing your search query' : 'Hit "Start Recording" to create your first video or audio clip.'}</p>
      </div>
    `;
    return;
  }

  elements.recordingsList.innerHTML = '';
  list.forEach(rec => {
    const item = document.createElement('div');
    item.className = 'recording-card';
    const size = formatFileSize(rec.size || 0);
    const date = rec.modified ? new Date(rec.modified).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const ext = (rec.name || '').split('.').pop().toLowerCase();
    const isVideoFormat = ['mp4', 'mov', 'mkv', 'webm'].includes(ext);

    item.innerHTML = `
      <div class="recording-left">
        <div class="file-icon-badge ${isVideoFormat ? 'video' : 'audio'}">
          ${isVideoFormat ? 
            `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>` : 
            `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>`
          }
        </div>
        <div class="recording-info">
          <div class="recording-name" title="${rec.name}">${rec.name}</div>
          <div class="recording-meta">
            <span class="format-tag">${ext.toUpperCase()}</span>
            <span>·</span>
            <span>${size}</span>
            <span>·</span>
            <span>${date}</span>
          </div>
        </div>
      </div>
      <div class="recording-actions">
        <button class="action-btn play-btn" title="Open / Play">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </button>
        <button class="action-btn rename-btn" title="Rename File">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
        </button>
        <button class="action-btn reveal-btn" title="Reveal in Finder">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        </button>
        <button class="action-btn delete-btn" title="Delete Clip">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    `;

    // Action handlers
    item.querySelector('.play-btn').addEventListener('click', async () => {
      try {
        await invoke('open_recording', { path: rec.path });
      } catch (err) {
        setStatus('Open error: ' + err, true);
      }
    });

    item.querySelector('.rename-btn').addEventListener('click', () => {
      startRename(item, rec);
    });

    item.querySelector('.reveal-btn').addEventListener('click', async () => {
      try {
        await invoke('reveal_in_finder', { path: rec.path });
      } catch (err) {
        setStatus('Reveal error: ' + err, true);
      }
    });

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
        setStatus(`Renamed clip to ${newName}`);
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
    const path = prompt('Enter new recordings directory path:');
    if (path) {
      await invoke('set_recordings_folder', { path: path });
      setStatus('Recordings directory updated');
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
// Audio Spectrum Visualizer Canvas
// ============================================
function initAudioVisualizer() {
  const canvas = elements.audioCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const barCount = 32;
  const bars = new Array(barCount).fill(4);

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const width = canvas.width;
    const height = canvas.height;
    const barWidth = (width / barCount) - 3;

    for (let i = 0; i < barCount; i++) {
      if (isRecording) {
        // Active recording waveform signal
        const target = Math.random() * (height - 8) + 6;
        bars[i] += (target - bars[i]) * 0.25;
      } else {
        // Ambient low amplitude signal
        const target = Math.sin(Date.now() * 0.003 + i * 0.2) * 4 + 6;
        bars[i] += (target - bars[i]) * 0.1;
      }

      const barHeight = Math.max(3, bars[i]);
      const x = i * (barWidth + 3);
      const y = (height - barHeight) / 2;

      // Gradient color based on recording status
      const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
      if (isRecording) {
        gradient.addColorStop(0, '#ff3b5c');
        gradient.addColorStop(1, '#8b5cf6');
      } else {
        gradient.addColorStop(0, '#3b82f6');
        gradient.addColorStop(1, '#10b981');
      }

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 2);
      ctx.fill();
    }

    animFrameId = requestAnimationFrame(draw);
  }

  draw();
}

// ============================================
// Helper Utilities
// ============================================
function setStatus(message, isError = false) {
  elements.statusMessage.textContent = message;
  elements.statusMessage.style.color = isError ? 'var(--accent-red)' : 'var(--text-muted)';
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
