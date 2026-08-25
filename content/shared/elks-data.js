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

  function playerIdentityKey(player) {
    if (!player) return '';
    const name = (joinName(player.firstName, player.lastName) || player.name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    if (!name || name === 'unnamed') return '';
    return name + '|' + String(player.birthdate || '').trim();
  }

  function playerRecordWeight(player) {
    if (!player) return 0;
    let n = 0;
    if (player.number) n += 2;
    if (player.photo) n += 3;
    if (player.position) n += 1;
    if (player.assignedTeamId) n += 1;
    if (player.birthdate) n += 1;
    if (player.scores && typeof player.scores === 'object' && Object.keys(player.scores).length) n += 2;
    return n;
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
    if (!Array.isArray(state.removedPlayerKeys)) state.removedPlayerKeys = [];
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

  function isUnassignedId(teamId) {
    return teamId === 'unassigned';
  }

  function realTeamId(teamId) {
    if (isAllTeamsId(teamId) || isUnassignedId(teamId)) return null;
    return teamId;
  }

  function applySelectedHubTeam() {
    const hub = global.HUB_SOFTBALL;
    if (!hub) return {};
    let saved = null;
    try {
      saved = global.sessionStorage && sessionStorage.getItem(selectedTeamKey());
    } catch (e) {}
    if (saved === 'unassigned') {
      hub.teamId = 'unassigned';
      hub.teamName = 'Not assigned';
      return hub;
    }
    if (saved === 'all' || ((hub.role === 'owner' || hub.showAllPicker) && (saved == null || saved === ''))) {
      hub.teamId = 'all';
      hub.teamName = 'Any / all players';
      return hub;
    }
    const teams = allKnownTeams();
    let team = teams.find((item) => item.id === saved);
    if (!team && saved) {
      const leftover = storedFormationTeams().find((item) => item.id === saved);
      if (leftover) {
        team = hubOrgTeams().find((item) => teamNamesMatch(item.name, leftover.name));
      }
    }
    if (!team && saved) {
      team = teams.find((item) => teamNamesMatch(item.name, saved));
    }
    if (!team) {
      team =
        teams.find((item) => item.id === hub.teamId && realTeamId(hub.teamId)) ||
        hubOrgTeams()[0] ||
        teams[0];
    }
    if (team) {
      hub.teamId = team.id;
      hub.teamName = team.name;
      if (team.clubId) hub.clubId = team.clubId;
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

  function normalizeTeamName(name) {
    return String(name || '')
      .trim()
      .toLowerCase()
      .replace(/^(mn\s+elks|elks)\s*[·\-:]+\s*/i, '')
      .replace(/\s+/g, ' ');
  }

  function teamNamesMatch(a, b) {
    const left = normalizeTeamName(a);
    const right = normalizeTeamName(b);
    if (!left || !right) return false;
    if (left === right) return true;
    const sorted = (value) =>
      value
        .split(' ')
        .filter(Boolean)
        .sort()
        .join(' ');
    return sorted(left) === sorted(right);
  }

  function hubOrgTeams() {
    const hub = global.HUB_SOFTBALL || {};
    return ((hub.teams) || []).map((team) => ({
      id: team.id,
      name: team.name,
      clubId: team.clubId || hub.clubId || '',
      clubName: team.clubName || hub.clubName || 'MN Elks',
    }));
  }

  const teamIdAliases = {};

  function storedFormationTeams(teamsHint) {
    const found = [];
    const seen = new Set();
    function add(list) {
      (list || []).forEach((team) => {
        if (!team || !team.id || seen.has(team.id)) return;
        seen.add(team.id);
        found.push(team);
      });
    }
    add(teamsHint);
    try {
      const raw = loadRaw();
      add(raw && raw.teams);
    } catch (e) {}
    return found;
  }

  function allKnownTeams(extraTeams, teamsHint) {
    const teams = hubOrgTeams();
    const seen = new Set(teams.map((team) => team.id));
    const extras = extraTeams ? extraTeams.slice() : [];
    extras.push.apply(extras, storedFormationTeams(teamsHint));
    extras.forEach((team) => {
      if (!team || !team.id || seen.has(team.id)) return;
      if (teams.some((item) => teamNamesMatch(item.name, team.name))) return;
      seen.add(team.id);
      teams.push({
        id: team.id,
        name: team.name,
        clubId: team.clubId || '',
        clubName: team.clubName || (global.HUB_SOFTBALL && global.HUB_SOFTBALL.clubName) || 'MN Elks',
      });
    });
    return teams;
  }

  function canonicalTeamId(assignedId, teamsHint) {
    if (!assignedId || isAllTeamsId(assignedId) || isUnassignedId(assignedId)) return null;
    if (teamIdAliases[assignedId]) return teamIdAliases[assignedId];
    const org = hubOrgTeams();
    const exactOrg = org.find((team) => team.id === assignedId);
    if (exactOrg) return exactOrg.id;
    const namedOrg = org.find((team) => teamNamesMatch(team.name, assignedId));
    if (namedOrg) return namedOrg.id;
    const leftover = storedFormationTeams(teamsHint).find((team) => team.id === assignedId);
    if (leftover) {
      const orgMatch = org.find((team) => teamNamesMatch(team.name, leftover.name));
      if (orgMatch) return orgMatch.id;
      return leftover.id;
    }
    const known = allKnownTeams(null, teamsHint).find(
      (team) => team.id === assignedId || teamNamesMatch(team.name, assignedId),
    );
    return known ? known.id : assignedId;
  }

  function syncHubTeams(state) {
    const hub = applySelectedHubTeam();
    const hubTeams = hubOrgTeams();
    if (!state || !hubTeams.length) return state;
    if (!state.teams) state.teams = [];
    hubTeams.forEach((hubTeam) => {
      const age = ageGroupFromName(hubTeam.name);
      const duplicate = state.teams.find(
        (team) =>
          team.id !== hubTeam.id && teamNamesMatch(team.name, hubTeam.name),
      );
      if (duplicate) {
        teamIdAliases[duplicate.id] = hubTeam.id;
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
    (state.players || []).forEach((player) => {
      if (!player.assignedTeamId) return;
      const canonical = canonicalTeamId(player.assignedTeamId, state.teams);
      if (canonical && canonical !== player.assignedTeamId) {
        teamIdAliases[player.assignedTeamId] = canonical;
      }
      player.assignedTeamId = canonical;
    });
    return state;
  }

  function playerOnHubTeam(player, teamId) {
    if (!player) return false;
    if (isAllTeamsId(teamId)) return true;
    const assignedId = canonicalTeamId(player.assignedTeamId);
    if (isUnassignedId(teamId)) return !assignedId;
    const selectedId = canonicalTeamId(teamId) || teamId;
    if (!assignedId) return false;
    if (assignedId === selectedId || assignedId === teamId) return true;
    const selected =
      hubOrgTeams().find((team) => team.id === selectedId || team.id === teamId) ||
      allKnownTeams().find((team) => team.id === selectedId || team.id === teamId);
    const assigned =
      hubOrgTeams().find((team) => team.id === assignedId) ||
      allKnownTeams().find((team) => team.id === assignedId);
    if (selected && assigned) return teamNamesMatch(selected.name, assigned.name);
    return teamNamesMatch(selected && selected.name, player.assignedTeamId);
  }

  function playersOnHubTeam(players, teamId) {
    return (players || []).filter((player) => playerOnHubTeam(player, teamId));
  }

  function playersForTeam(state, teamId) {
    const id = teamId == null ? currentHubTeam().id : teamId;
    return playersOnHubTeam((state && state.players) || [], id);
  }

  function assignmentFingerprint(state) {
    const players = ((state && state.players) || [])
      .map((player) => String(player.id || '') + ':' + String(player.assignedTeamId || ''))
      .sort()
      .join('|');
    const teams = ((state && state.teams) || [])
      .map((team) => String(team.id || ''))
      .sort()
      .join(',');
    return players + '#' + teams;
  }

  function mergePlayerRecord(preferred, other) {
    const merged = Object.assign({}, other || {}, preferred || {});
    merged.assignedTeamId =
      (preferred && preferred.assignedTeamId) ||
      (other && other.assignedTeamId) ||
      merged.assignedTeamId ||
      null;
    const preferredScores =
      preferred && preferred.scores && typeof preferred.scores === 'object' ? preferred.scores : null;
    const otherScores =
      other && other.scores && typeof other.scores === 'object' ? other.scores : null;
    merged.scores =
      (preferredScores && Object.keys(preferredScores).length && preferredScores) ||
      (otherScores && Object.keys(otherScores).length && otherScores) ||
      {};
    merged.photo = (preferred && preferred.photo) || (other && other.photo) || '';
    return normalizePlayer(merged);
  }

  function mergeRemovedPlayerKeys() {
    const seen = new Set();
    const next = [];
    Array.prototype.slice.call(arguments).forEach(function (list) {
      (list || []).forEach(function (key) {
        if (!key || seen.has(key)) return;
        seen.add(key);
        next.push(key);
      });
    });
    return next;
  }

  function rememberRemovedPlayer(state, player) {
    if (!state) return;
    if (!Array.isArray(state.removedPlayerKeys)) state.removedPlayerKeys = [];
    const key = playerIdentityKey(player);
    if (!key) return;
    if (state.removedPlayerKeys.indexOf(key) < 0) state.removedPlayerKeys.push(key);
  }

  function dropRemovedPlayers(state) {
    if (!state || !Array.isArray(state.players)) return false;
    const removed = new Set(state.removedPlayerKeys || []);
    if (!removed.size) return false;
    const before = state.players.length;
    state.players = state.players.filter(function (player) {
      const key = playerIdentityKey(player);
      return !key || !removed.has(key);
    });
    return state.players.length !== before;
  }

  function mergePlayerArrays(membership, extras) {
    const extraById = new Map();
    const extraByKey = new Map();
    (extras || []).forEach(function (player) {
      if (!player || !player.id) return;
      extraById.set(String(player.id), player);
      const key = playerIdentityKey(player);
      if (key && !extraByKey.has(key)) extraByKey.set(key, player);
    });
    return (membership || [])
      .filter(Boolean)
      .map(function (player) {
        const extra =
          extraById.get(String(player.id)) || extraByKey.get(playerIdentityKey(player));
        return extra ? mergePlayerRecord(player, extra) : normalizePlayer(player);
      });
  }

  function rewritePlayerIdList(ids, aliases) {
    if (!Array.isArray(ids)) return ids;
    const seen = new Set();
    const next = [];
    ids.forEach(function (id) {
      const keep = aliases[id] || id;
      if (!keep || seen.has(keep)) return;
      seen.add(keep);
      next.push(keep);
    });
    return next;
  }

  function rewritePlayerIdRefs(state, aliases) {
    if (!state || !aliases || !Object.keys(aliases).length) return;
    function walkSegments(segments) {
      (segments || []).forEach(function (segment) {
        ((segment && segment.lanes) || []).forEach(function (lane) {
          if (lane && Array.isArray(lane.playerIds)) {
            lane.playerIds = rewritePlayerIdList(lane.playerIds, aliases);
          }
        });
      });
    }
    (state.practices || []).forEach(function (practice) {
      walkSegments(practice && practice.segments);
    });
    (state.templates || []).forEach(function (tpl) {
      walkSegments(tpl && tpl.segments);
    });
    (state.tryouts || []).forEach(function (tryout) {
      if (!tryout || !tryout.evaluations) return;
      const next = {};
      Object.keys(tryout.evaluations).forEach(function (id) {
        const keep = aliases[id] || id;
        const ev = tryout.evaluations[id];
        next[keep] = next[keep] ? Object.assign({}, ev, next[keep]) : ev;
      });
      tryout.evaluations = next;
    });
  }

  function collapseDuplicatePlayers(state) {
    if (!state || !Array.isArray(state.players) || !state.players.length) return false;
    const aliases = {};
    const kept = [];
    const byKey = new Map();
    const seenIds = new Set();
    state.players.forEach(function (player) {
      if (!player) return;
      const normalized = normalizePlayer(player);
      if (normalized.id && seenIds.has(normalized.id)) return;
      const key = playerIdentityKey(normalized);
      if (key && byKey.has(key)) {
        const existing = byKey.get(key);
        const preferNew = playerRecordWeight(normalized) > playerRecordWeight(existing);
        const winner = preferNew
          ? mergePlayerRecord(normalized, existing)
          : mergePlayerRecord(existing, normalized);
        winner.id = existing.id;
        if (normalized.id && normalized.id !== existing.id) {
          aliases[normalized.id] = existing.id;
        }
        Object.assign(existing, winner);
        existing.id = existing.id;
        return;
      }
      if (normalized.id) seenIds.add(normalized.id);
      if (key) byKey.set(key, normalized);
      kept.push(normalized);
    });
    if (kept.length === state.players.length && !Object.keys(aliases).length) return false;
    state.players = kept;
    rewritePlayerIdRefs(state, aliases);
    return true;
  }

  function mergeSharedStates(local, remote) {
    const localState = ensureDefaults(local || emptyState());
    const remoteState = ensureDefaults(remote || emptyState());
    const next = Object.assign({}, localState, remoteState);
    next.players = mergePlayerArrays(remoteState.players, localState.players);
    next.removedPlayerKeys = mergeRemovedPlayerKeys(
      localState.removedPlayerKeys,
      remoteState.removedPlayerKeys,
    );
    dropRemovedPlayers(next);
    const teamsById = new Map();
    (localState.teams || []).forEach((team) => {
      if (team && team.id) teamsById.set(team.id, team);
    });
    (remoteState.teams || []).forEach((team) => {
      if (!team || !team.id) return;
      teamsById.set(team.id, Object.assign({}, teamsById.get(team.id) || {}, team));
    });
    next.teams = [...teamsById.values()];
    if (!(remoteState.tryouts && remoteState.tryouts.length) && localState.tryouts.length) {
      next.tryouts = localState.tryouts;
      next.currentTryoutId = localState.currentTryoutId;
    }
    if (!(remoteState.practices && remoteState.practices.length) && (localState.practices || []).length) {
      next.practices = localState.practices;
    }
    if (!(remoteState.drills && remoteState.drills.length) && (localState.drills || []).length) {
      next.drills = localState.drills;
    }
    if (!(remoteState.templates && remoteState.templates.length) && (localState.templates || []).length) {
      next.templates = localState.templates;
    }
    return syncHubTeams(ensureDefaults(next));
  }

  function teamNameForPlayer(player, teams) {
    const assignedId = canonicalTeamId(player && player.assignedTeamId, teams);
    if (!assignedId) return 'Unassigned';
    const list = teams || [];
    const found =
      list.find((team) => team.id === assignedId) ||
      hubOrgTeams().find((team) => team.id === assignedId) ||
      allKnownTeams(null, teams).find((team) => team.id === assignedId);
    return (found && found.name) || 'Unassigned';
  }

  function pickerTeams(extraTeams) {
    applySelectedHubTeam();
    return allKnownTeams(extraTeams);
  }

  function mountTeamPicker(el, opts) {
    if (!el) return;
    applySelectedHubTeam();
    const hub = global.HUB_SOFTBALL || {};
    const extraTeams = opts && opts.extraTeams;
    const teams = pickerTeams(extraTeams);
    const light = opts && opts.theme === 'light';
    const showSpecials = hub.role === 'owner' || (opts && opts.allTeams) || teams.length > 1;
    if (!showSpecials && teams.length <= 1) {
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
    const specials = [
      { id: 'all', label: 'Any / all players' },
      { id: 'unassigned', label: 'Not assigned to a team' },
    ];
    specials.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.label;
      if (hub.teamId === item.id) option.selected = true;
      select.appendChild(option);
    });
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

  function restoreFransenRoster(state) {
    if (!state) return false;
    // The original 13-name seed already ran on live data. Filling in "missing"
    // seed names put Ackerman and Tischner back after they were removed.
    if (!state.restoredFransen16u) state.restoredFransen16u = true;
    return false;
  }

  function pinLoosePlayersToFransen(state) {
    if (!state) return false;
    // Same one-time pin: do not send unassigned girls back to 16U Fransen.
    if (!state.pinnedLoosePlayersToFransen16u) state.pinnedLoosePlayersToFransen16u = true;
    return false;
  }

  function load() {
    let state = loadRaw();
    if (!state) {
      const migrated = migrateFromLegacy();
      state = migrated || emptyState();
    }
    state = ensureDefaults(state);
    state = syncHubTeams(state);
    dropRemovedPlayers(state);
    // Never persist on load. Live roster only changes when a user saves.
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
    const key = playerIdentityKey(p);
    if (key && Array.isArray(state.removedPlayerKeys)) {
      state.removedPlayerKeys = state.removedPlayerKeys.filter(function (item) { return item !== key; });
    }
    state.players.push(p);
    return p;
  }

  function deletePlayer(state, playerId) {
    const player = (state.players || []).find(function (item) { return item.id === playerId; });
    if (player) rememberRemovedPlayer(state, player);
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
        return;
      }
      if (!local || remoteUpdated >= localUpdated) {
        const next = mergeSharedStates(local, data.state);
        dropRemovedPlayers(next);
        saveState(next, { skipCloud: true });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('elks-data-updated'));
        }
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

  const LANE_POSITION_OPTIONS = [
    { key: 'P', label: 'Pitchers (P)' },
    { key: 'C', label: 'Catchers (C)' },
    { key: 'IF', label: 'Infielders (1B / 2B / 3B / SS)' },
    { key: 'OF', label: 'Outfielders (LF / CF / RF)' },
    { key: '1B', label: '1B' },
    { key: '2B', label: '2B' },
    { key: '3B', label: '3B' },
    { key: 'SS', label: 'SS' },
    { key: 'LF', label: 'LF' },
    { key: 'CF', label: 'CF' },
    { key: 'RF', label: 'RF' },
    { key: 'UT', label: 'Utility' },
    { key: 'DP', label: 'DP' },
  ];

  const POSITION_EXPAND = {
    P: ['P'],
    C: ['C'],
    IF: ['IF', '1B', '2B', '3B', 'SS'],
    OF: ['OF', 'LF', 'CF', 'RF'],
    '1B': ['1B'],
    '2B': ['2B'],
    '3B': ['3B'],
    SS: ['SS'],
    LF: ['LF'],
    CF: ['CF'],
    RF: ['RF'],
    UT: ['UT'],
    DP: ['DP'],
  };

  function expandPosition(pos) {
    const key = String(pos || '').trim().toUpperCase();
    return POSITION_EXPAND[key] || (key ? [key] : []);
  }

  function playerPositionSet(player) {
    const set = new Set();
    [player && player.position, player && player.position2].forEach(function (pos) {
      expandPosition(pos).forEach(function (item) { set.add(item); });
    });
    return set;
  }

  function playerMatchesPositions(player, positions) {
    if (!player || !positions || !positions.length) return false;
    const owned = playerPositionSet(player);
    return positions.some(function (pos) {
      return expandPosition(pos).some(function (item) { return owned.has(item); });
    });
  }

  function cloneSlot(slot) {
    const src = slot || {};
    return {
      id: uid('slot'),
      name: src.name || '',
      duration: parseInt(src.duration, 10) || 0,
      description: src.description || '',
      category: src.category || null,
      drillId: src.drillId || null,
    };
  }

  function cloneLane(lane) {
    const src = lane || {};
    return {
      id: uid('lane'),
      name: src.name || '',
      playerIds: Array.isArray(src.playerIds) ? src.playerIds.slice() : [],
      positions: Array.isArray(src.positions) ? src.positions.slice() : [],
      everyoneElse: !!src.everyoneElse,
      slots: Array.isArray(src.slots) ? src.slots.map(cloneSlot) : [],
    };
  }

  function isSplitSegment(segment) {
    return !!(segment && Array.isArray(segment.lanes) && segment.lanes.length);
  }

  function cloneSegment(segment) {
    const src = segment || {};
    const next = {
      id: uid('seg'),
      name: src.name || '',
      duration: parseInt(src.duration, 10) || 0,
      description: src.description || '',
      category: src.category || null,
      drillId: src.drillId || null,
    };
    if (isSplitSegment(src)) {
      next.lanes = src.lanes.map(cloneLane);
    }
    return next;
  }

  function cloneSegments(segments) {
    return Array.isArray(segments) ? segments.map(cloneSegment) : [];
  }

  function upcomingPracticeDate() {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Chicago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date());
      const y = Number((parts.find(function (p) { return p.type === 'year'; }) || {}).value);
      const m = Number((parts.find(function (p) { return p.type === 'month'; }) || {}).value);
      const d = Number((parts.find(function (p) { return p.type === 'day'; }) || {}).value);
      const dt = new Date(y, m - 1, d);
      dt.setDate(dt.getDate() + 1);
      return (
        dt.getFullYear() +
        '-' +
        String(dt.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(dt.getDate()).padStart(2, '0')
      );
    } catch (e) {
      const dt = new Date();
      dt.setDate(dt.getDate() + 1);
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + d;
    }
  }

  function clonePractice(practice, opts) {
    const src = practice || {};
    const options = opts || {};
    return {
      id: uid('practice'),
      date: options.date !== undefined ? options.date : (src.date || null),
      time: src.time || null,
      duration: parseInt(src.duration, 10) || 0,
      focus: src.focus || '',
      location: src.location || '',
      teamId: src.teamId || null,
      segments: cloneSegments(src.segments),
    };
  }

  function clonePracticeAsUpcoming(practice) {
    return clonePractice(practice, { date: upcomingPracticeDate() });
  }

  function laneSlotSum(lane) {
    return ((lane && lane.slots) || []).reduce(function (sum, slot) {
      return sum + (parseInt(slot.duration, 10) || 0);
    }, 0);
  }

  function makeEveryoneElseLane() {
    return {
      id: uid('lane'),
      name: 'Everyone else',
      playerIds: [],
      positions: [],
      everyoneElse: true,
      slots: [],
    };
  }

  function ensureEveryoneElseLane(segment) {
    if (!isSplitSegment(segment)) return segment;
    const existing = segment.lanes.filter(function (lane) { return lane && lane.everyoneElse; });
    const others = segment.lanes.filter(function (lane) { return lane && !lane.everyoneElse; });
    const leftover = existing[0] || makeEveryoneElseLane();
    leftover.everyoneElse = true;
    if (!leftover.name) leftover.name = 'Everyone else';
    if (!Array.isArray(leftover.playerIds)) leftover.playerIds = [];
    if (!Array.isArray(leftover.positions)) leftover.positions = [];
    leftover.playerIds = [];
    leftover.positions = [];
    if (!Array.isArray(leftover.slots)) leftover.slots = [];
    segment.lanes = others.concat([leftover]);
    return segment;
  }

  function splitSegmentIntoStations(segment) {
    if (!segment) return segment;
    if (isSplitSegment(segment)) {
      return ensureEveryoneElseLane(segment);
    }
    const slot = cloneSlot({
      name: segment.name,
      duration: segment.duration,
      description: segment.description,
      category: segment.category,
      drillId: segment.drillId,
    });
    segment.lanes = [
      {
        id: uid('lane'),
        name: 'Station 1',
        playerIds: [],
        positions: [],
        everyoneElse: false,
        slots: [slot],
      },
    ];
    return ensureEveryoneElseLane(segment);
  }

  function mergeStationsToSingle(segment) {
    if (!isSplitSegment(segment)) return segment;
    const firstLane = segment.lanes.find(function (lane) { return lane && !lane.everyoneElse; }) || segment.lanes[0];
    const firstSlot = firstLane && firstLane.slots && firstLane.slots[0];
    if (firstSlot) {
      if (!segment.name) segment.name = firstSlot.name || '';
      if (!segment.description) segment.description = firstSlot.description || '';
      if (!segment.category && firstSlot.category) segment.category = firstSlot.category;
      if (!segment.drillId && firstSlot.drillId) segment.drillId = firstSlot.drillId;
    }
    delete segment.lanes;
    return segment;
  }

  function addStationLane(segment, fields) {
    splitSegmentIntoStations(segment);
    const src = fields || {};
    const others = segment.lanes.filter(function (item) { return !item.everyoneElse; });
    const leftover = segment.lanes.find(function (item) { return item.everyoneElse; }) || makeEveryoneElseLane();
    const lane = {
      id: uid('lane'),
      name: src.name || ('Station ' + (others.length + 1)),
      playerIds: Array.isArray(src.playerIds) ? src.playerIds.slice() : [],
      positions: Array.isArray(src.positions) ? src.positions.slice() : [],
      everyoneElse: false,
      slots: Array.isArray(src.slots) ? src.slots.map(cloneSlot) : [],
    };
    others.push(lane);
    segment.lanes = others.concat([leftover]);
    return lane;
  }

  function assignPlayersToLanes(lanes, players) {
    const list = Array.isArray(lanes) ? lanes : [];
    const roster = Array.isArray(players) ? players : [];
    const assigned = list.map(function () { return []; });
    const remaining = new Set(roster.map(function (player) { return player && player.id; }).filter(Boolean));

    list.forEach(function (lane, index) {
      if (!lane || lane.everyoneElse) return;
      (lane.playerIds || []).forEach(function (playerId) {
        if (!remaining.has(playerId)) return;
        const player = roster.find(function (item) { return item && item.id === playerId; });
        if (!player) return;
        assigned[index].push(player);
        remaining.delete(playerId);
      });
    });

    roster.forEach(function (player) {
      if (!player || !player.id || !remaining.has(player.id)) return;
      const index = list.findIndex(function (lane) {
        return lane && !lane.everyoneElse && playerMatchesPositions(player, lane.positions);
      });
      if (index < 0) return;
      assigned[index].push(player);
      remaining.delete(player.id);
    });

    let elseIndex = list.findIndex(function (lane) { return lane && lane.everyoneElse; });
    const leftover = roster.filter(function (player) { return player && player.id && remaining.has(player.id); });
    if (elseIndex >= 0) {
      assigned[elseIndex] = leftover.slice();
    }

    return {
      assigned: assigned,
      leftover: leftover,
    };
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
    playersForTeam,
    teamNameForPlayer,
    canonicalTeamId,
    realTeamId,
    mountTeamPicker,
    LANE_POSITION_OPTIONS,
    expandPosition,
    playerMatchesPositions,
    isSplitSegment,
    cloneSlot,
    cloneLane,
    cloneSegment,
    cloneSegments,
    clonePractice,
    clonePracticeAsUpcoming,
    upcomingPracticeDate,
    laneSlotSum,
    splitSegmentIntoStations,
    mergeStationsToSingle,
    addStationLane,
    ensureEveryoneElseLane,
    assignPlayersToLanes,
  };
})(typeof window !== 'undefined' ? window : globalThis);
