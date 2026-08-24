/**
 * MN Elks shared roster + tryout + team formation data.
 * Used by: tryout evaluator, team formation, lineup, practice planner
 * Storage key: mn-elks-shared-v1
 *
 * Players are canonical and shared. Team assignment lives on the player.
 * Tryout evaluations live per tryout session AND are denormalized onto the
 * player (latest eval for that player) so team formation can show scores.
 */
(function (global) {
  'use strict';

  const SHARED_KEY = 'mn-elks-shared-v1';
  const LEGACY_TEAMS_KEY = 'mn-elks-team-formation-v1';
  const LEGACY_TRYOUT_KEY = 'softball-tryout-evaluator-v1';

  const SKILLS = [
    { key: 'hitting', label: 'Hitting / Contact', icon: 'fa-baseball-bat-ball' },
    { key: 'power', label: 'Power', icon: 'fa-bolt' },
    { key: 'fielding', label: 'Fielding / Glove', icon: 'fa-hand' },
    { key: 'arm', label: 'Arm / Throw', icon: 'fa-paper-plane' },
    { key: 'speed', label: 'Speed / Athlete', icon: 'fa-person-running' },
    { key: 'iq', label: 'Game IQ', icon: 'fa-brain' },
    { key: 'attitude', label: 'Attitude / Coachable', icon: 'fa-heart' },
    { key: 'pitching', label: 'Pitching', icon: 'fa-baseball', optional: true },
  ];

  const RECS = [
    { key: 'offer', label: 'Offer', cls: 'rec-offer', badge: 'bg-emerald-900 text-emerald-300', bg: 'bg-emerald-950 border-emerald-800 text-emerald-300' },
    { key: 'waitlist', label: 'Waitlist', cls: 'rec-waitlist', badge: 'bg-amber-900 text-amber-300', bg: 'bg-amber-950 border-amber-800 text-amber-300' },
    { key: 'look', label: 'Need look', cls: 'rec-look', badge: 'bg-blue-900 text-blue-300', bg: 'bg-blue-950 border-blue-800 text-blue-300' },
    { key: 'pass', label: 'Pass', cls: 'rec-pass', badge: 'bg-red-900 text-red-300', bg: 'bg-red-950 border-red-900 text-red-300' },
  ];

  function uid(prefix) {
    const id = (global.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
    return prefix ? prefix + '_' + id : id;
  }

  function emptyState() {
    return {
      players: [],
      teams: [],
      tryouts: [],
      currentTryoutId: null,
      practices: [],
      drills: [],
      templates: [],
      updatedAt: 0,
      version: 1,
    };
  }

  function avgFromScores(scores) {
    if (!scores || typeof scores !== 'object') return null;
    const vals = SKILLS
      .map((s) => scores[s.key])
      .filter((v) => typeof v === 'number' && v >= 1);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  function playerAvg(player) {
    return avgFromScores(player && player.scores);
  }

  function recMeta(key) {
    return RECS.find((r) => r.key === key) || null;
  }

  function fmtAvg(n) {
    if (n == null || Number.isNaN(n)) return '—';
    return Number(n).toFixed(1);
  }

  /** Split a full name into { firstName, lastName }. Last space separates last name. */
  function splitFullName(full) {
    const s = String(full || '').trim().replace(/\s+/g, ' ');
    if (!s) return { firstName: '', lastName: '' };
    const i = s.indexOf(' ');
    if (i < 0) return { firstName: s, lastName: '' };
    return { firstName: s.slice(0, i).trim(), lastName: s.slice(i + 1).trim() };
  }

  function joinName(firstName, lastName) {
    return [firstName, lastName].map(function (x) { return String(x || '').trim(); }).filter(Boolean).join(' ');
  }

  /** Display name: prefers first+last, falls back to legacy name. */
  function displayName(player) {
    if (!player) return 'Unnamed';
    const joined = joinName(player.firstName, player.lastName);
    if (joined) return joined;
    if (player.name && String(player.name).trim()) return String(player.name).trim();
    return 'Unnamed';
  }

  function normalizePlayer(p) {
    if (!p) return null;

    let firstName = p.firstName != null ? String(p.firstName).trim() : '';
    let lastName = p.lastName != null ? String(p.lastName).trim() : '';

    // Legacy: only full name present
    if (!firstName && !lastName && p.name) {
      const parts = splitFullName(p.name);
      firstName = parts.firstName;
      lastName = parts.lastName;
    }

    // If one side provided via name + the other empty, leave as-is
    const name = joinName(firstName, lastName) || (p.name && String(p.name).trim()) || 'Unnamed';

    return {
      id: p.id || uid('p'),
      firstName: firstName,
      lastName: lastName,
      name: name, // always kept in sync for search / legacy callers
      birthdate: p.birthdate || '',
      originalTeam: p.originalTeam || '',
      number: p.number != null ? String(p.number) : '',
      position: p.position || '',
      position2: p.position2 || '',
      photo: typeof p.photo === 'string' ? p.photo : '', // compressed data URL
      assignedTeamId: p.assignedTeamId || null,
      scores: p.scores && typeof p.scores === 'object' ? { ...p.scores } : {},
      recommendation: p.recommendation || null,
      evalNotes: p.evalNotes || p.notes || '',
      evalUpdatedAt: p.evalUpdatedAt || p.updatedAt || null,
      evalTryoutId: p.evalTryoutId || null,
      createdAt: p.createdAt || Date.now(),
    };
  }

  /**
   * Resize + compress an image File/Blob for localStorage.
   * Default ~320px wide JPEG ~0.72 quality (typically 15–40KB).
   * Returns a Promise<dataURL string>.
   */
  function compressImage(file, options) {
    const opts = options || {};
    const maxWidth = opts.maxWidth || 320;
    const maxHeight = opts.maxHeight || 320;
    const quality = opts.quality != null ? opts.quality : 0.72;
    const mime = opts.mime || 'image/jpeg';

    return new Promise(function (resolve, reject) {
      if (!file) {
        reject(new Error('No file'));
        return;
      }
      const reader = new FileReader();
      reader.onerror = function () { reject(new Error('Could not read image')); };
      reader.onload = function () {
        const img = new Image();
        img.onerror = function () { reject(new Error('Invalid image')); };
        img.onload = function () {
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          if (!w || !h) {
            reject(new Error('Invalid image size'));
            return;
          }
          const scale = Math.min(1, maxWidth / w, maxHeight / h);
          w = Math.max(1, Math.round(w * scale));
          h = Math.max(1, Math.round(h * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          try {
            resolve(canvas.toDataURL(mime, quality));
          } catch (e) {
            reject(e);
          }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /** Small avatar HTML snippet (safe for data URLs; name is escaped by caller if needed). */
  function photoAvatarHTML(player, sizeClass) {
    const size = sizeClass || 'w-10 h-10';
    if (player && player.photo) {
      return `<img src="${player.photo}" alt="" class="${size} rounded-xl object-cover bg-slate-800 border border-slate-700 shrink-0" loading="lazy">`;
    }
    const initial = (displayName(player) || '?').trim().charAt(0).toUpperCase() || '?';
    return `<div class="${size} rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 text-slate-400 font-semibold text-sm">${initial}</div>`;
  }

  /**
   * Compress a canvas (or video frame) to a small JPEG data URL.
   */
  function compressFromSource(source, options) {
    const opts = options || {};
    const maxWidth = opts.maxWidth || 320;
    const maxHeight = opts.maxHeight || 320;
    const quality = opts.quality != null ? opts.quality : 0.72;
    const mime = opts.mime || 'image/jpeg';

    let sw = source.videoWidth || source.naturalWidth || source.width || 0;
    let sh = source.videoHeight || source.naturalHeight || source.height || 0;
    if (!sw || !sh) throw new Error('No image dimensions');

    const scale = Math.min(1, maxWidth / sw, maxHeight / sh);
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);
    // Mirror-friendly: draw as-is (we mirror only the preview video for selfie feel)
    ctx.drawImage(source, 0, 0, w, h);
    return canvas.toDataURL(mime, quality);
  }

  let _cameraStream = null;
  let _cameraResolve = null;
  let _cameraReject = null;

  function stopCameraStream() {
    if (_cameraStream) {
      try {
        _cameraStream.getTracks().forEach(function (t) { t.stop(); });
      } catch (e) {}
      _cameraStream = null;
    }
  }

  function closeCameraModal(result) {
    stopCameraStream();
    const el = document.getElementById('elks-camera-modal');
    if (el) el.remove();
    const resolve = _cameraResolve;
    const reject = _cameraReject;
    _cameraResolve = null;
    _cameraReject = null;
    if (result && result.ok) {
      if (resolve) resolve(result.dataUrl);
    } else if (result && result.cancelled) {
      if (reject) reject(Object.assign(new Error('cancelled'), { cancelled: true }));
    } else if (result && result.error) {
      if (reject) reject(result.error);
    }
  }

  /**
   * Open a live camera capture UI (Mac webcam or phone camera).
   * Returns Promise<dataURL>. Rejects with { cancelled: true } if user cancels.
   * Falls back: caller should catch and open file input if mediaDevices unavailable.
   */
  function openCameraCapture(options) {
    const opts = options || {};

    return new Promise(function (resolve, reject) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        reject(Object.assign(new Error('Camera API not available'), { noCameraApi: true }));
        return;
      }

      // Close any existing camera UI without rejecting the new promise
      if (document.getElementById('elks-camera-modal')) {
        stopCameraStream();
        const old = document.getElementById('elks-camera-modal');
        if (old) old.remove();
        if (_cameraReject) {
          try { _cameraReject(Object.assign(new Error('cancelled'), { cancelled: true })); } catch (e) {}
        }
        _cameraResolve = null;
        _cameraReject = null;
      }
      _cameraResolve = resolve;
      _cameraReject = reject;

      const modal = document.createElement('div');
      modal.id = 'elks-camera-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-label', 'Take player photo');
      modal.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:99999',
        'background:rgba(2,6,23,0.92)', 'display:flex',
        'align-items:center', 'justify-content:center',
        'padding:16px', 'font-family:Inter,system-ui,sans-serif',
      ].join(';');

      modal.innerHTML = [
        '<div style="width:100%;max-width:420px;background:#0f172a;border:1px solid #334155;border-radius:24px;overflow:hidden;box-shadow:0 25px 50px rgba(0,0,0,.5)">',
        '  <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #1e293b">',
        '    <div style="font-weight:600;color:#e2e8f0;font-size:16px">Take photo</div>',
        '    <button type="button" id="elks-cam-close" style="width:36px;height:36px;border-radius:12px;background:#1e293b;border:none;color:#cbd5e1;cursor:pointer;font-size:16px" aria-label="Close">✕</button>',
        '  </div>',
        '  <div style="position:relative;background:#020617;aspect-ratio:3/4;max-height:60vh">',
        '    <video id="elks-cam-video" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;transform:scaleX(-1)"></video>',
        '    <div id="elks-cam-status" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:14px;padding:24px;text-align:center">Starting camera…</div>',
        '  </div>',
        '  <div style="padding:14px 16px;display:flex;gap:10px;flex-wrap:wrap">',
        '    <button type="button" id="elks-cam-flip" style="display:none;padding:12px 14px;border-radius:14px;background:#1e293b;border:1px solid #334155;color:#e2e8f0;font-weight:600;font-size:13px;cursor:pointer">Flip</button>',
        '    <button type="button" id="elks-cam-cancel" style="flex:1;padding:12px;border-radius:14px;background:transparent;border:1px solid #475569;color:#cbd5e1;font-weight:600;font-size:14px;cursor:pointer">Cancel</button>',
        '    <button type="button" id="elks-cam-shutter" disabled style="flex:1.4;padding:12px;border-radius:14px;background:#b91c1c;border:none;color:white;font-weight:700;font-size:14px;cursor:pointer;opacity:0.5">Capture</button>',
        '  </div>',
        '  <p id="elks-cam-hint" style="margin:0;padding:0 16px 14px;font-size:11px;color:#64748b;text-align:center">Allow camera access when prompted. Works with Mac webcam and phone cameras.</p>',
        '</div>',
      ].join('');

      document.body.appendChild(modal);

      const video = modal.querySelector('#elks-cam-video');
      const status = modal.querySelector('#elks-cam-status');
      const shutter = modal.querySelector('#elks-cam-shutter');
      const flipBtn = modal.querySelector('#elks-cam-flip');
      let preferUser = opts.facingMode !== 'environment';
      let devicesWithFlip = false;

      function setStatus(msg, isError) {
        if (!status) return;
        if (!msg) {
          status.style.display = 'none';
          status.textContent = '';
          return;
        }
        status.style.display = 'flex';
        status.style.color = isError ? '#f87171' : '#94a3b8';
        status.textContent = msg;
      }

      async function startStream() {
        stopCameraStream();
        setStatus('Starting camera…');
        shutter.disabled = true;
        shutter.style.opacity = '0.5';

        const constraints = {
          audio: false,
          video: {
            facingMode: preferUser ? 'user' : 'environment',
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
        };

        try {
          _cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (e1) {
          // Retry with any camera
          try {
            _cameraStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
          } catch (e2) {
            setStatus('Could not open camera. Check System Settings → Privacy → Camera for your browser, then try again.', true);
            shutter.disabled = true;
            return;
          }
        }

        video.srcObject = _cameraStream;
        // Mirror front camera preview; leave rear unmirrored
        video.style.transform = preferUser ? 'scaleX(-1)' : 'none';

        try {
          await video.play();
        } catch (e) {}

        setStatus('');
        shutter.disabled = false;
        shutter.style.opacity = '1';

        // Show flip if multiple cameras
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const cams = devices.filter(function (d) { return d.kind === 'videoinput'; });
          devicesWithFlip = cams.length > 1;
          flipBtn.style.display = devicesWithFlip ? '' : 'none';
        } catch (e) {
          flipBtn.style.display = 'none';
        }
      }

      modal.querySelector('#elks-cam-close').onclick = function () {
        closeCameraModal({ cancelled: true });
      };
      modal.querySelector('#elks-cam-cancel').onclick = function () {
        closeCameraModal({ cancelled: true });
      };
      modal.onclick = function (e) {
        if (e.target === modal) closeCameraModal({ cancelled: true });
      };

      flipBtn.onclick = function () {
        preferUser = !preferUser;
        startStream();
      };

      shutter.onclick = function () {
        if (!_cameraStream || !video.videoWidth) return;
        try {
          // If preview is mirrored, mirror capture to match what user sees (front cam)
          let dataUrl;
          if (preferUser) {
            const sw = video.videoWidth;
            const sh = video.videoHeight;
            const maxWidth = 320;
            const maxHeight = 320;
            const scale = Math.min(1, maxWidth / sw, maxHeight / sh);
            const w = Math.max(1, Math.round(sw * scale));
            const h = Math.max(1, Math.round(sh * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.translate(w, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(video, 0, 0, w, h);
            dataUrl = canvas.toDataURL('image/jpeg', 0.72);
          } else {
            dataUrl = compressFromSource(video, { maxWidth: 320, maxHeight: 320, quality: 0.72 });
          }
          closeCameraModal({ ok: true, dataUrl: dataUrl });
        } catch (err) {
          setStatus('Capture failed. Try again.', true);
        }
      };

      startStream();
    });
  }

  /**
   * Take photo with live camera; if unavailable/cancelled with noCameraApi, call fallbackFn (e.g. file input).
   * onPhoto(dataUrl) is called on success.
   */
  async function takePlayerPhoto(onPhoto, fallbackFn) {
    try {
      const dataUrl = await openCameraCapture();
      if (dataUrl && typeof onPhoto === 'function') onPhoto(dataUrl);
    } catch (err) {
      if (err && err.cancelled) return;
      if (typeof fallbackFn === 'function') {
        fallbackFn(err);
      } else if (err && !err.cancelled) {
        alert((err && err.message) || 'Camera unavailable. Use Library instead, or allow camera access in System Settings.');
      }
    }
  }

  function createPlayer(fields) {
    return normalizePlayer({
      id: uid('p'),
      createdAt: Date.now(),
      assignedTeamId: null,
      scores: {},
      recommendation: null,
      ...fields,
    });
  }

  function createTeam(fields) {
    return {
      id: uid('t'),
      name: (fields && fields.name) || 'Team',
      ageGroup: (fields && fields.ageGroup) || '16U',
    };
  }

  function createTryout(fields) {
    return {
      id: uid('tryout'),
      name: (fields && fields.name) || 'Untitled Tryout',
      date: (fields && fields.date) || new Date().toISOString().slice(0, 10),
      ageGroup: (fields && fields.ageGroup) || '16U',
      location: (fields && fields.location) || '',
      notes: (fields && fields.notes) || '',
      evaluations: (fields && fields.evaluations) || {},
      createdAt: Date.now(),
    };
  }

  function getEval(tryout, playerId) {
    if (!tryout || !tryout.evaluations) return null;
    return tryout.evaluations[playerId] || null;
  }

  function setEvalOnTryout(tryout, playerId, evaluation) {
    if (!tryout.evaluations) tryout.evaluations = {};
    tryout.evaluations[playerId] = {
      scores: evaluation.scores ? { ...evaluation.scores } : {},
      recommendation: evaluation.recommendation || null,
      notes: evaluation.notes || '',
      updatedAt: evaluation.updatedAt || Date.now(),
    };
  }

  /** Push tryout evaluation onto shared player (denormalized for team formation). */
  function denormalizeEvalToPlayer(player, evaluation, tryoutId) {
    if (!player || !evaluation) return;
    player.scores = evaluation.scores ? { ...evaluation.scores } : {};
    player.recommendation = evaluation.recommendation || null;
    player.evalNotes = evaluation.notes || '';
    player.evalUpdatedAt = evaluation.updatedAt || Date.now();
    player.evalTryoutId = tryoutId || null;
  }

  function matchPlayerKey(p) {
    return ((p.name || '').trim().toLowerCase() + '|' + (p.birthdate || ''));
  }

  function findPlayerByIdentity(players, name, birthdate) {
    const key = (name || '').trim().toLowerCase() + '|' + (birthdate || '');
    return players.find((p) => matchPlayerKey(p) === key) || null;
  }

  function storageKey() {
    try {
      const clubId = global.HUB_SOFTBALL && global.HUB_SOFTBALL.clubId;
      if (clubId) return SHARED_KEY + ':' + clubId;
    } catch (e) {}
    return SHARED_KEY;
  }

  function loadRaw() {
    try {
      const key = storageKey();
      let raw = localStorage.getItem(key);
      if (!raw && key !== SHARED_KEY) raw = localStorage.getItem(SHARED_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('ElksData: failed to parse shared store', e);
      return null;
    }
  }

  let cloudTimer = null;

  function saveState(state, opts) {
    try {
      state.updatedAt = Date.now();
      localStorage.setItem(storageKey(), JSON.stringify(state));
      if (!opts || !opts.skipCloud) scheduleCloudSave(state);
    } catch (e) {
      console.warn('ElksData: failed to save', e);
    }
  }

  function migrateFromLegacy() {
    const state = emptyState();
    let migrated = false;

    // Team formation legacy
    try {
      const raw = localStorage.getItem(LEGACY_TEAMS_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data.players)) {
          data.players.forEach((p) => {
            state.players.push(normalizePlayer(p));
          });
          migrated = true;
        }
        if (Array.isArray(data.teams)) {
          state.teams = data.teams.map((t) => ({
            id: t.id || uid('t'),
            name: t.name || 'Team',
            ageGroup: t.ageGroup || '16U',
          }));
          migrated = true;
        }
      }
    } catch (e) {
      console.warn('ElksData: team formation migrate failed', e);
    }

    // Tryout evaluator legacy
    try {
      const raw = localStorage.getItem(LEGACY_TRYOUT_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data.tryouts)) {
          data.tryouts.forEach((t) => {
            const tryout = createTryout({
              name: t.name,
              date: t.date,
              ageGroup: t.ageGroup,
              location: t.location,
              notes: t.notes,
            });
            // preserve id if present
            if (t.id) tryout.id = t.id;
            tryout.createdAt = t.createdAt || tryout.createdAt;

            const nested = Array.isArray(t.players) ? t.players : [];
            nested.forEach((tp) => {
              // Find or create shared player
              let player = findPlayerByIdentity(state.players, tp.name, tp.birthdate);
              if (!player) {
                // also match by name only if no birthdate
                player = state.players.find(
                  (p) =>
                    (p.name || '').trim().toLowerCase() === (tp.name || '').trim().toLowerCase() &&
                    !tp.birthdate
                );
              }
              if (!player) {
                player = createPlayer({
                  name: tp.name,
                  number: tp.number,
                  position: tp.position,
                  position2: tp.position2,
                  birthdate: tp.birthdate || '',
                });
                // keep id from tryout player if possible and unique
                if (tp.id && !state.players.some((p) => p.id === tp.id)) {
                  player.id = tp.id;
                }
                state.players.push(player);
              } else {
                // merge missing fields
                if (!player.number && tp.number) player.number = String(tp.number);
                if (!player.position && tp.position) player.position = tp.position;
                if (!player.position2 && tp.position2) player.position2 = tp.position2;
              }

              const evaluation = {
                scores: tp.scores || {},
                recommendation: tp.recommendation || null,
                notes: tp.notes || '',
                updatedAt: tp.updatedAt || Date.now(),
              };
              setEvalOnTryout(tryout, player.id, evaluation);

              // Denormalize if this eval is newer
              if (!player.evalUpdatedAt || evaluation.updatedAt >= player.evalUpdatedAt) {
                denormalizeEvalToPlayer(player, evaluation, tryout.id);
              }
            });

            state.tryouts.push(tryout);
            migrated = true;
          });
          if (data.currentTryoutId) {
            state.currentTryoutId = data.currentTryoutId;
          }
        }
      }
    } catch (e) {
      console.warn('ElksData: tryout migrate failed', e);
    }

    if (migrated) {
      if (!state.currentTryoutId && state.tryouts.length) {
        state.currentTryoutId = state.tryouts[0].id;
      }
      saveState(state);
      // Keep legacy keys as read-only backup; do not delete automatically
      console.info('ElksData: migrated legacy app data into shared store');
    }

    return migrated ? state : null;
  }

  function ensureDefaults(state) {
    if (!state.players) state.players = [];
    if (!state.teams) state.teams = [];
    if (!state.tryouts) state.tryouts = [];
    if (!state.practices) state.practices = [];
    if (!state.drills) state.drills = [];
    if (!state.templates) state.templates = [];
    if (!state.updatedAt) state.updatedAt = 0;
    state.players = state.players.map(normalizePlayer);

    if (state.tryouts.length === 0) {
      const t = createTryout({
        name: 'MN Elks Tryouts',
        date: new Date().toISOString().slice(0, 10),
        ageGroup: '16U',
      });
      state.tryouts.push(t);
      state.currentTryoutId = t.id;
    }
    if (!state.currentTryoutId || !state.tryouts.find((t) => t.id === state.currentTryoutId)) {
      state.currentTryoutId = state.tryouts[0].id;
    }
    return state;
  }

  function selectedTeamKey() {
    return 'hub-softball-selected-team-v2';
  }

  function isAllTeamsId(teamId) {
    return !teamId || teamId === 'all';
  }

  function applySelectedHubTeam() {
    const hub = global.HUB_SOFTBALL;
    if (!hub) return {};
    if (!Array.isArray(hub.teams) || !hub.teams.length) return hub;
    let saved = null;
    try {
      saved = global.sessionStorage && sessionStorage.getItem(selectedTeamKey());
    } catch (e) {}
    if (hub.role === 'owner' && (saved === 'all' || saved == null || saved === '')) {
      hub.teamId = 'all';
      hub.teamName = 'All teams';
      return hub;
    }
    if (saved === 'all') {
      hub.teamId = 'all';
      hub.teamName = 'All teams';
      return hub;
    }
    const team =
      hub.teams.find((item) => item.id === saved) ||
      hub.teams.find((item) => item.id === hub.teamId && hub.teamId !== 'all') ||
      hub.teams[0];
    if (team) {
      hub.teamId = team.id;
      hub.teamName = team.name;
      hub.clubId = team.clubId || hub.clubId;
      hub.clubName = team.clubName || hub.clubName;
    }
    return hub;
  }

  function currentHubTeam() {
    const hub = applySelectedHubTeam();
    return {
      id: hub.teamId || '',
      name: hub.teamName || '16U Fransen',
      clubId: hub.clubId || '',
      clubName: hub.clubName || 'MN Elks',
    };
  }

  function setCurrentHubTeam(teamId) {
    try {
      if (global.sessionStorage) sessionStorage.setItem(selectedTeamKey(), teamId);
    } catch (e) {}
    applySelectedHubTeam();
    if (typeof global.dispatchEvent === 'function') {
      global.dispatchEvent(new CustomEvent('hub-team-changed'));
    }
  }

  function ageGroupFromName(name) {
    const match = String(name || '').match(/(\d{1,2})\s*U/i);
    return match ? match[1] + 'U' : '16U';
  }

  function teamNamesMatch(a, b) {
    const left = String(a || '').trim().toLowerCase();
    const right = String(b || '').trim().toLowerCase();
    if (!left || !right) return false;
    return left === right || left.includes(right) || right.includes(left);
  }

  function syncHubTeams(state) {
    const hub = applySelectedHubTeam();
    const hubTeams = (hub && hub.teams) || [];
    if (!state || !hubTeams.length) return state;
    if (!state.teams) state.teams = [];
    hubTeams.forEach((hubTeam) => {
      const age = ageGroupFromName(hubTeam.name);
      const duplicate = state.teams.find(
        (team) =>
          team.id !== hubTeam.id && teamNamesMatch(team.name, hubTeam.name),
      );
      if (duplicate) {
        (state.players || []).forEach((player) => {
          if (player.assignedTeamId === duplicate.id) {
            player.assignedTeamId = hubTeam.id;
          }
        });
        state.teams = state.teams.filter((team) => team.id !== duplicate.id);
      }
      const existing = state.teams.find((team) => team.id === hubTeam.id);
      if (existing) {
        existing.name = hubTeam.name;
        if (!existing.ageGroup) existing.ageGroup = age;
      } else {
        state.teams.push({
          id: hubTeam.id,
          name: hubTeam.name,
          ageGroup: age,
        });
      }
    });
    const formationIds = new Set(state.teams.map((team) => team.id));
    const hubIds = new Set(hubTeams.map((team) => team.id));
    (state.players || []).forEach((player) => {
      if (player.assignedTeamId && !formationIds.has(player.assignedTeamId)) {
        if (hubIds.size === 1) {
          player.assignedTeamId = hubTeams[0].id;
        } else {
          player.assignedTeamId = null;
        }
      }
    });
    return state;
  }

  function playerOnHubTeam(player, teamId) {
    if (!player) return false;
    if (isAllTeamsId(teamId)) return true;
    return player.assignedTeamId === teamId;
  }

  function playersOnHubTeam(players, teamId) {
    return (players || []).filter((player) => playerOnHubTeam(player, teamId));
  }

  function teamNameForPlayer(player, teams) {
    if (!player || !player.assignedTeamId) return 'Unassigned';
    const list = teams || [];
    const hubTeams = (global.HUB_SOFTBALL && global.HUB_SOFTBALL.teams) || [];
    const found =
      list.find((team) => team.id === player.assignedTeamId) ||
      hubTeams.find((team) => team.id === player.assignedTeamId);
    return (found && found.name) || 'Unassigned';
  }

  function pickerTeams() {
    const hub = applySelectedHubTeam();
    const teams = ((hub && hub.teams) || []).map((team) => ({
      id: team.id,
      name: team.name,
      clubName: team.clubName || hub.clubName || 'MN Elks',
    }));
    const seen = new Set(teams.map((team) => team.id));
    try {
      const raw = loadRaw();
      ((raw && raw.teams) || []).forEach((team) => {
        if (!team || !team.id || seen.has(team.id)) return;
        seen.add(team.id);
        teams.push({
          id: team.id,
          name: team.name,
          clubName: (hub && hub.clubName) || 'MN Elks',
        });
      });
    } catch (e) {}
    return teams;
  }

  function mountTeamPicker(el, opts) {
    if (!el) return;
    applySelectedHubTeam();
    const hub = global.HUB_SOFTBALL || {};
    const teams = pickerTeams();
    const light = opts && opts.theme === 'light';
    const owner = hub.role === 'owner';
    const showAll = owner || teams.length > 1;
    if (!showAll) {
      const only = teams[0];
      el.textContent = only
        ? (only.clubName || hub.clubName || 'MN Elks') + ' · ' + only.name
        : (hub.clubName || 'MN Elks') + ' · ' + (hub.teamName || '16U Fransen');
      return;
    }
    el.innerHTML = '';
    const select = document.createElement('select');
    select.className = light
      ? 'max-w-full rounded-xl border border-stone-300 bg-white px-2 py-1 text-xs font-semibold text-red-900 focus:outline-none focus:border-red-500'
      : 'max-w-full rounded-xl border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-semibold text-slate-200 focus:outline-none focus:border-red-500';
    if (owner) {
      const all = document.createElement('option');
      all.value = 'all';
      all.textContent = 'All teams';
      if (hub.teamId === 'all') all.selected = true;
      select.appendChild(all);
    }
    teams.forEach((team) => {
      const option = document.createElement('option');
      option.value = team.id;
      option.textContent = (team.clubName ? team.clubName + ' · ' : '') + team.name;
      if (team.id === hub.teamId) option.selected = true;
      select.appendChild(option);
    });
    select.onchange = function () {
      setCurrentHubTeam(select.value);
    };
    el.appendChild(select);
  }

  const FRANSEN_16U_SEED = [
    { firstName: 'Annabelle', lastName: 'Ackerman', number: '16' },
    { firstName: 'Emily', lastName: 'Artmann', number: '4' },
    { firstName: 'Macie', lastName: 'Backman', number: '7' },
    { firstName: 'Madison', lastName: 'Burggraff', number: '11' },
    { firstName: 'Hailee', lastName: 'Clinton', number: '13' },
    { firstName: 'Savanah', lastName: 'Emmans', number: '45' },
    { firstName: 'Tenley', lastName: 'Fransen', number: '10' },
    { firstName: 'Molly', lastName: 'Johnson', number: '27' },
    { firstName: 'Kiana', lastName: 'Pegues', number: '17' },
    { firstName: 'Avaiyah', lastName: 'Sandford', number: '9' },
    { firstName: 'Sidney', lastName: 'Tischner', number: '14' },
    { firstName: 'MaKayla', lastName: 'Uttke', number: '12' },
    { firstName: 'Paisyn', lastName: 'Wiley', number: '8' },
  ];

  function restoreFransenRoster(state) {
    if (!state || state.restoredFransen16u) return false;
    if (!state.players) state.players = [];
    let added = 0;
    FRANSEN_16U_SEED.forEach((fields) => {
      const name = joinName(fields.firstName, fields.lastName);
      if (findPlayerByIdentity(state.players, name, '')) return;
      const player = createPlayer({
        firstName: fields.firstName,
        lastName: fields.lastName,
        name: name,
        number: fields.number,
        assignedTeamId: 'team-16u-fransen',
      });
      state.players.push(player);
      added += 1;
    });
    state.restoredFransen16u = true;
    return added > 0;
  }

  function load() {
    let state = loadRaw();
    if (!state) {
      const migrated = migrateFromLegacy();
      state = migrated || emptyState();
    }
    state = syncHubTeams(ensureDefaults(state));
    if (restoreFransenRoster(state)) {
      saveState(state);
    }
    return state;
  }

  function getCurrentTryout(state) {
    return (state.tryouts || []).find((t) => t.id === state.currentTryoutId) || null;
  }

  /**
   * Build a view-model player for the tryout UI: shared identity + this tryout's eval.
   */
  function playerWithEval(player, tryout) {
    const ev = getEval(tryout, player.id);
    return {
      ...player,
      scores: ev ? { ...ev.scores } : {},
      recommendation: ev ? ev.recommendation : null,
      notes: ev ? ev.notes : '',
      updatedAt: ev ? ev.updatedAt : null,
      hasEval: !!ev,
    };
  }

  /**
   * Save evaluation for player in tryout and denormalize to shared player.
   */
  function savePlayerEvaluation(state, playerId, evaluation, tryoutId) {
    const tryout = state.tryouts.find((t) => t.id === (tryoutId || state.currentTryoutId));
    const player = state.players.find((p) => p.id === playerId);
    if (!tryout || !player) return false;

    const payload = {
      scores: evaluation.scores || {},
      recommendation: evaluation.recommendation || null,
      notes: evaluation.notes || '',
      updatedAt: Date.now(),
    };
    setEvalOnTryout(tryout, playerId, payload);
    denormalizeEvalToPlayer(player, payload, tryout.id);

    // Optional identity updates from tryout form
    if (evaluation.firstName != null || evaluation.lastName != null || evaluation.name != null) {
      let firstName = evaluation.firstName != null ? String(evaluation.firstName).trim() : player.firstName;
      let lastName = evaluation.lastName != null ? String(evaluation.lastName).trim() : player.lastName;
      if (evaluation.firstName == null && evaluation.lastName == null && evaluation.name != null) {
        const parts = splitFullName(evaluation.name);
        firstName = parts.firstName;
        lastName = parts.lastName;
      }
      player.firstName = firstName || '';
      player.lastName = lastName || '';
      player.name = joinName(player.firstName, player.lastName) || 'Unnamed';
    }
    if (evaluation.number != null) player.number = String(evaluation.number);
    if (evaluation.position != null) player.position = evaluation.position;
    if (evaluation.position2 != null) player.position2 = evaluation.position2;
    if (evaluation.birthdate != null) player.birthdate = evaluation.birthdate;
    if (evaluation.originalTeam != null) player.originalTeam = evaluation.originalTeam;
    if (evaluation.photo !== undefined) player.photo = evaluation.photo || '';

    return true;
  }

  function upsertPlayer(state, fields) {
    if (fields.id) {
      const existing = state.players.find((p) => p.id === fields.id);
      if (existing) {
        Object.assign(existing, normalizePlayer({ ...existing, ...fields, id: existing.id }));
        return existing;
      }
    }
    const p = createPlayer(fields);
    state.players.push(p);
    return p;
  }

  function deletePlayer(state, playerId) {
    state.players = state.players.filter((p) => p.id !== playerId);
    state.tryouts.forEach((t) => {
      if (t.evaluations && t.evaluations[playerId]) {
        delete t.evaluations[playerId];
      }
    });
  }

  function clearAll(state) {
    // Reset in place, then persist empty defaults so load() does not re-migrate legacy keys
    const next = ensureDefaults(emptyState());
    state.players = next.players;
    state.teams = next.teams;
    state.tryouts = next.tryouts;
    state.currentTryoutId = next.currentTryoutId;
    state.practices = next.practices;
    state.drills = next.drills;
    state.templates = next.templates;
    state.updatedAt = next.updatedAt;
    state.version = next.version;
    saveState(state);
  }

  function toLineupPlayer(player) {
    return {
      id: player.id,
      name: displayName(player),
      number: player.number ? Number(player.number) || player.number : undefined,
      notes: player.evalNotes || '',
      assignedTeamId: player.assignedTeamId || null,
    };
  }

  function lineupPlayers(state) {
    return (state.players || []).map(toLineupPlayer);
  }

  function connectCloud() {
    pullFromCloud();
  }

  async function pullFromCloud() {
    try {
      const response = await fetch('/api/softball/state');
      if (!response.ok) return;
      const data = await response.json();
      if (!data || !data.state) return;
      const local = loadRaw();
      const remoteUpdated = Number(data.state.updatedAt || 0);
      const localUpdated = Number((local && local.updatedAt) || 0);
      const remotePlayers = (data.state.players || []).length;
      const localPlayers = ((local && local.players) || []).length;
      if (remotePlayers === 0 && localPlayers > 0) {
        pushToCloud(local);
        return;
      }
      if (!local || remoteUpdated >= localUpdated) {
        const next = syncHubTeams(ensureDefaults(data.state));
        const seeded = restoreFransenRoster(next);
        saveState(next, seeded ? undefined : { skipCloud: true });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('elks-data-updated'));
        }
      } else {
        pushToCloud(local);
      }
    } catch (e) {
      console.warn('ElksData: cloud pull failed', e);
    }
  }

  function scheduleCloudSave(state) {
    if (typeof fetch !== 'function') return;
    clearTimeout(cloudTimer);
    const snapshot = JSON.parse(JSON.stringify(state));
    cloudTimer = setTimeout(function () {
      pushToCloud(snapshot);
    }, 500);
  }

  async function pushToCloud(state) {
    try {
      const response = await fetch('/api/softball/state', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state: state }),
      });
      const data = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('elks-save-failed', {
            detail: data.error || 'Could not save players to the database.',
          }));
        }
        console.warn('ElksData: cloud push failed', data.error);
        return;
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('elks-save-ok', { detail: data.stored || 'database' }));
      }
    } catch (e) {
      console.warn('ElksData: cloud push failed', e);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('elks-save-failed', {
          detail: 'Could not save players to the database.',
        }));
      }
    }
  }

  global.ElksData = {
    SHARED_KEY,
    SKILLS,
    RECS,
    uid,
    load,
    save: saveState,
    emptyState,
    ensureDefaults,
    createPlayer,
    createTeam,
    createTryout,
    normalizePlayer,
    compressImage,
    compressFromSource,
    photoAvatarHTML,
    openCameraCapture,
    takePlayerPhoto,
    splitFullName,
    joinName,
    displayName,
    avgFromScores,
    playerAvg,
    recMeta,
    fmtAvg,
    getCurrentTryout,
    getEval,
    setEvalOnTryout,
    denormalizeEvalToPlayer,
    playerWithEval,
    savePlayerEvaluation,
    upsertPlayer,
    deletePlayer,
    findPlayerByIdentity,
    clearAll,
    toLineupPlayer,
    lineupPlayers,
    connectCloud,
    applySelectedHubTeam,
    currentHubTeam,
    setCurrentHubTeam,
    syncHubTeams,
    playerOnHubTeam,
    playersOnHubTeam,
    teamNameForPlayer,
    mountTeamPicker,
  };
})(typeof window !== 'undefined' ? window : globalThis);
