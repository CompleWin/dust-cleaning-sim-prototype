(() => {
  'use strict';

  const LEVELS = {
    strong: { radius: 0.38, rate: 3.2 },
    mid: { radius: 0.22, rate: 1.4 },
    weak: { radius: 0.10, rate: 0.5 },
  };
  const TOOLS = [
    { floor: 'strong', carpet: 'mid', surface: 'weak' },
    { floor: 'mid', carpet: 'weak', surface: 'strong' },
    { floor: 'mid', carpet: 'strong', surface: 'weak' },
  ];
  const ZONE_MATERIAL = {
    floor: 'floor',
    carpet: 'carpet',
    cabinet: 'surface',
    bed: 'surface',
    windowSill: 'surface',
    desk: 'surface',
  };
  const CELL_SIZE = 0.05;
  const ZONE_DONE_AT = 0.99;
  const HINT_DURATION = 3;
  const REACH = 2.3;
  const PLAYER_RADIUS = 0.21;
  const MOVE_SPEED = 2.2;
  const CHAIR_PUSH_RATIO = 0.65;
  const CHAIR_CLEARANCE = 0.05;
  const EYE_HEIGHT = 1.6;
  const MOVEMENT_KEYS = { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD' };

  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const canvas = document.getElementById('room');
  const overlay = document.getElementById('overlay');
  const title = document.getElementById('overlay-title');
  const summary = document.getElementById('overlay-summary');
  const button = document.getElementById('play');
  const error = document.getElementById('error');
  const reticle = document.getElementById('reticle');
  const progress = document.getElementById('progress');
  const hint = document.getElementById('dust-hint');
  const tools = [...document.querySelectorAll('.tool[data-tool]')];
  const keys = new Set();
  const player = { ...HOME };
  const audio = new CleaningAudio();
  let renderer;
  let active = false;
  let started = false;
  let won = false;
  let cleaning = false;
  let tool = 0;
  let previousHit = null;
  let highlightUntil = 0;
  let needsRender = true;
  let needsProgress = true;
  let shownZone = null;

  function showError(message) {
    error.textContent = message;
    error.hidden = false;
  }

  try {
    renderer = new RoomRenderer(canvas);
  } catch (cause) {
    console.error(cause);
    button.disabled = true;
    showError('Для запуска прототипа нужен браузер с WebGL.');
    return;
  }

  const zones = Object.fromEntries(Object.entries(ZONE_MATERIAL).map(([id, material]) => {
    const row = document.querySelector(`[data-progress="${id}"]`);
    return [id, { material, initial: 0, remaining: 0, done: false, shown: -1, row,
      meter: row.querySelector('progress'), label: row.querySelector('output') }];
  }));

  const { halfWidth, halfDepth } = ROOM;
  const { faces: roomFaces, obstacles, chair } = buildRoom(renderer, CELL_SIZE);
  const chairHome = { x: chair.x, z: chair.z };
  const dustyFaces = roomFaces.filter(surface => surface.dust);

  function toolPart(x, y, z, width, height, depth, colors) {
    return Object.values(box({ x, y, z, width, height, depth }, colors));
  }

  const equipment = [
    [
      ...toolPart(-0.12, -0.035, -0.25, 0.23, 0.08, 0.16, [0xb85345, 0x974137, 0x78332c]),
      ...toolPart(-0.12, -0.055, -0.25, 0.23, 0.02, 0.16, [0x353d3a, 0x2d3533, 0x202625]),
      ...toolPart(-0.015, -0.045, -0.11, 0.05, 0.055, 0.41, [0x8b9791, 0x646e69, 0x4e5752]),
    ],
    [
      ...toolPart(-0.10, -0.018, -0.20, 0.22, 0.034, 0.23, [0xc8ab60, 0x9b7f3c, 0x8a6b34]),
      ...toolPart(-0.085, 0.016, -0.17, 0.18, 0.012, 0.045, [0xe2c982, 0xad9250, 0xb29855]),
    ],
    [
      ...toolPart(-0.11, -0.006, -0.22, 0.23, 0.048, 0.13, [0x8e5637, 0x77482e, 0x643e2a]),
      ...toolPart(-0.03, 0.03, -0.12, 0.066, 0.046, 0.27, [0xb0764c, 0x8e5939, 0x7d5033]),
      ...[-0.10, -0.056, -0.012, 0.032, 0.076].flatMap(x =>
        toolPart(x, -0.044, -0.21, 0.034, 0.038, 0.11, [0xceb489, 0xb79b73, 0xa18664])),
    ],
  ];

  function hash(x, y, seed) {
    let value = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 982451653);
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
  }

  function noise(x, y, seed) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const top = hash(ix, iy, seed) * (1 - u) + hash(ix + 1, iy, seed) * u;
    const bottom = hash(ix, iy + 1, seed) * (1 - u) + hash(ix + 1, iy + 1, seed) * u;
    return top * (1 - v) + bottom * v;
  }

  function setDust(dust, index, amount) {
    dust.amount[index] = amount;
    dust.pixels[index * 2 + 1] = Math.round(clamp(amount, 0, 1) * 200);
  }

  function resetDust() {
    const seed = Math.floor(Math.random() * 100000);
    for (const zone of Object.values(zones)) {
      zone.initial = 0;
      zone.remaining = 0;
      zone.done = false;
    }
    dustyFaces.forEach(({ dust }, faceIndex) => {
      const zone = zones[dust.zone];
      const offset = seed + faceIndex * 13;
      for (let row = 0; row < dust.rows; row++) {
        for (let column = 0; column < dust.columns; column++) {
          const index = row * dust.columns + column;
          const grain = hash(column, row, offset);
          const cloud = noise(column / 12, row / 12, offset + 1);
          const amount = dust.covered((column + 0.5) * dust.cellWidth, (row + 0.5) * dust.cellHeight)
            ? 0
            : 0.34 + 0.52 * cloud + 0.17 * grain;
          dust.pixels[index * 2] = Math.round(255 * (grain * 0.40 + cloud * 0.60));
          setDust(dust, index, amount);
          zone.initial += dust.amount[index];
        }
      }
      renderer.updateDustTexture(dust);
    });
    for (const zone of Object.values(zones)) zone.remaining = zone.initial;
    needsProgress = true;
  }

  function placeChair(x, z) {
    const dx = x - chair.x;
    const dz = z - chair.z;
    for (const surface of chair.faces) {
      surface.origin[0] += dx;
      surface.origin[2] += dz;
    }
    chair.x = x;
    chair.z = z;
  }

  function pushChair(axis, delta) {
    const alongX = axis === 'x';
    const span = alongX ? 'width' : 'depth';
    const cross = alongX ? 'z' : 'x';
    const crossSpan = alongX ? 'depth' : 'width';
    const direction = Math.sign(delta);
    const boundary = alongX ? halfWidth : halfDepth;
    const edge = chair[axis] + (direction > 0 ? chair[span] : 0);
    let travel = Math.min(Math.abs(delta), boundary - direction * edge);

    for (const bounds of obstacles) {
      if (chair[cross] >= bounds[cross] + bounds[crossSpan] + CHAIR_CLEARANCE
        || chair[cross] + chair[crossSpan] <= bounds[cross] - CHAIR_CLEARANCE) continue;
      const nearEdge = direction > 0 ? bounds[axis] - CHAIR_CLEARANCE : bounds[axis] + bounds[span] + CHAIR_CLEARANCE;
      const gap = direction * (nearEdge - edge);
      if (gap >= -1e-8) travel = Math.min(travel, gap);
    }
    if (travel <= 0) return;
    const position = chair[axis] + direction * travel;
    placeChair(alongX ? position : chair.x, alongX ? chair.z : position);
  }

  function moveAlong(axis, target) {
    const direction = Math.sign(target - player[axis]);
    if (!direction) return;
    const alongX = axis === 'x';
    const x = alongX ? target : player.x;
    const z = alongX ? player.z : target;
    if (obstacles.some(bounds => inside(x, z, bounds, PLAYER_RADIUS))) return;
    if (!inside(x, z, chair, PLAYER_RADIUS)) {
      player[axis] = target;
      return;
    }

    const nearEdge = direction > 0 ? 0 : chair[alongX ? 'width' : 'depth'];
    const margin = direction * PLAYER_RADIUS;
    const travel = target - (chair[axis] + nearEdge - margin);
    pushChair(axis, travel * CHAIR_PUSH_RATIO);
    player[axis] = chair[axis] + nearEdge - margin;
  }

  function move(dt) {
    const sideways = Number(keys.has(MOVEMENT_KEYS.right)) - Number(keys.has(MOVEMENT_KEYS.left));
    const ahead = Number(keys.has(MOVEMENT_KEYS.forward)) - Number(keys.has(MOVEMENT_KEYS.back));
    if (!sideways && !ahead) return;
    const scale = MOVE_SPEED * dt / Math.hypot(sideways, ahead);
    const sin = Math.sin(player.yaw);
    const cos = Math.cos(player.yaw);
    const x = clamp(player.x + (cos * sideways + sin * ahead) * scale,
      -halfWidth + PLAYER_RADIUS, halfWidth - PLAYER_RADIUS);
    const z = clamp(player.z + (sin * sideways - cos * ahead) * scale,
      -halfDepth + PLAYER_RADIUS, halfDepth - PLAYER_RADIUS);
    moveAlong('x', x);
    moveAlong('z', z);
  }

  function camera() {
    const sin = Math.sin(player.yaw);
    const cos = Math.cos(player.yaw);
    const pitchSin = Math.sin(player.pitch);
    const pitchCos = Math.cos(player.pitch);
    return {
      eye: [player.x, EYE_HEIGHT, player.z],
      right: [cos, 0, sin],
      up: [-sin * pitchSin, pitchCos, cos * pitchSin],
      forward: [sin * pitchCos, pitchSin, -cos * pitchCos],
    };
  }

  function aim(eye, direction) {
    let hit = null;
    let nearest = Infinity;
    for (const surface of roomFaces) {
      if (surface.plane) {
        const distance = intersectFacet(surface, eye, direction);
        if (distance !== null && distance < nearest) {
          nearest = distance;
          hit = null;
        }
        continue;
      }
      const { origin, normalAxis, uAxis, vAxis, width, height } = surface;
      const component = direction[normalAxis];
      if (Math.abs(component) < 0.00001) continue;
      const distance = (origin[normalAxis] - eye[normalAxis]) / component;
      if (distance <= 0 || distance >= nearest) continue;
      const u = eye[uAxis] + direction[uAxis] * distance - origin[uAxis];
      const v = eye[vAxis] + direction[vAxis] * distance - origin[vAxis];
      if (u < 0 || u > width || v < 0 || v > height) continue;
      nearest = distance;
      hit = { surface, u, v, distance };
    }
    return hit?.surface.dust ? hit : null;
  }

  function scrub(dust, u, v, level, dt) {
    const { columns, rows, cellWidth, cellHeight } = dust;
    const { radius, rate } = level;
    const left = Math.max(0, Math.floor((u - radius) / cellWidth));
    const right = Math.min(columns - 1, Math.floor((u + radius) / cellWidth));
    const bottom = Math.max(0, Math.floor((v - radius) / cellHeight));
    const top = Math.min(rows - 1, Math.floor((v + radius) / cellHeight));
    const radiusSquared = radius * radius;
    let removed = 0;
    for (let row = bottom; row <= top; row++) {
      const dy = (row + 0.5) * cellHeight - v;
      for (let column = left; column <= right; column++) {
        const index = row * columns + column;
        const before = dust.amount[index];
        if (before === 0) continue;
        const dx = (column + 0.5) * cellWidth - u;
        const falloff = 1 - (dx * dx + dy * dy) / radiusSquared;
        if (falloff <= 0) continue;
        const after = before - rate * dt * (0.3 + 0.7 * falloff);
        setDust(dust, index, after < 0.03 ? 0 : after);
        removed += before - dust.amount[index];
      }
    }
    return removed;
  }

  function clean(hit, level, dt) {
    const { surface, u, v } = hit;
    const { dust } = surface;
    const zone = zones[dust.zone];
    const from = previousHit?.surface === surface && Math.hypot(u - previousHit.u, v - previousHit.v) < 0.85
      ? previousHit : hit;
    const steps = Math.max(1, Math.ceil(Math.hypot(u - from.u, v - from.v) / CELL_SIZE));
    let removed = 0;
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      removed += scrub(dust, from.u + (u - from.u) * t, from.v + (v - from.v) * t, level, dt / steps);
    }
    if (!removed) return 0;
    zone.remaining -= removed;
    needsProgress = true;
    if (zone.remaining <= zone.initial * (1 - ZONE_DONE_AT)) {
      zone.remaining = 0;
      zone.done = true;
      for (const other of dustyFaces) {
        if (other.dust.zone !== dust.zone) continue;
        for (let index = 0; index < other.dust.amount.length; index++) setDust(other.dust, index, 0);
        renderer.updateDustTexture(other.dust);
      }
      const allDone = Object.values(zones).every(item => item.done);
      audio.chime(allDone);
      if (allDone) finish();
    } else {
      renderer.updateDustTexture(dust);
    }
    return removed;
  }

  function selectTool(index) {
    tools[tool].removeAttribute('aria-current');
    tool = index;
    tools[tool].setAttribute('aria-current', 'true');
    previousHit = null;
    needsRender = true;
  }

  function updateProgress() {
    for (const zone of Object.values(zones)) {
      const percent = zone.done ? 100 : clamp(Math.floor((1 - zone.remaining / zone.initial) * 100), 0, 99);
      if (zone.shown === percent) continue;
      zone.shown = percent;
      zone.meter.value = percent;
      zone.label.value = `${percent}%`;
    }
    needsProgress = false;
  }

  function showProgress(zone) {
    if (shownZone === zone) return;
    if (shownZone) zones[shownZone].row.hidden = true;
    if (zone) zones[zone].row.hidden = false;
    progress.hidden = !zone;
    shownZone = zone;
  }

  function resetRoom() {
    Object.assign(player, HOME);
    placeChair(chairHome.x, chairHome.z);
    selectTool(0);
    resetDust();
    showProgress(null);
    highlightUntil = 0;
    won = false;
    needsRender = true;
  }

  function stopInput() {
    keys.clear();
    cleaning = false;
    previousHit = null;
    audio.update(tool, false);
  }

  function finish() {
    won = true;
    active = false;
    stopInput();
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    title.textContent = 'Чисто!';
    summary.textContent = 'Вся комната убрана.';
    button.textContent = 'Убрать заново';
    overlay.hidden = false;
    button.focus();
  }

  function pointerError() {
    showError('Браузер не передал управление мышью. Нажми кнопку ещё раз.');
  }

  button.addEventListener('click', async () => {
    error.hidden = true;
    audio.start();
    try {
      if (typeof canvas.requestPointerLock !== 'function') {
        showError('Для управления нужна мышь и браузер с поддержкой захвата указателя.');
        return;
      }
      await canvas.requestPointerLock();
    } catch {
      pointerError();
    }
  });
  document.addEventListener('pointerlockerror', pointerError);
  document.addEventListener('pointerlockchange', () => {
    active = document.pointerLockElement === canvas;
    stopInput();
    if (active) {
      if (won) resetRoom();
      started = true;
      error.hidden = true;
      overlay.hidden = true;
    } else {
      if (started && !won) {
        title.textContent = 'Пауза';
        summary.textContent = 'Можно продолжить с того же места.';
        button.textContent = 'Продолжить';
      }
      overlay.hidden = false;
      button.focus();
    }
    needsRender = true;
  });
  document.addEventListener('mousemove', event => {
    if (!active) return;
    player.yaw += event.movementX * 0.0024;
    player.pitch = clamp(player.pitch - event.movementY * 0.0024, -1.54, 1.54);
  });
  canvas.addEventListener('mousedown', event => {
    if (active && event.button === 0) {
      cleaning = true;
      event.preventDefault();
    }
  });
  window.addEventListener('mouseup', event => {
    if (event.button !== 0) return;
    cleaning = false;
    previousHit = null;
  });
  window.addEventListener('wheel', event => {
    if (!active || !event.deltaY) return;
    event.preventDefault();
    selectTool((tool + Math.sign(event.deltaY) + TOOLS.length) % TOOLS.length);
  }, { passive: false });
  window.addEventListener('blur', stopInput);
  window.addEventListener('resize', () => { needsRender = true; });
  window.addEventListener('keydown', event => {
    if (!active) return;
    if (event.code === 'Escape') {
      document.exitPointerLock();
      return;
    }
    keys.add(event.code);
    const match = /^(?:Digit|Numpad)([1-3])$/.exec(event.code);
    if (match && !event.repeat) selectTool(Number(match[1]) - 1);
    if (event.code === 'KeyQ' && !event.repeat) highlightUntil = performance.now() + HINT_DURATION * 1000;
  });
  window.addEventListener('keyup', event => keys.delete(event.code));

  let lastFrame = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    requestAnimationFrame(frame);
    if (!active && !needsRender) return;
    if (active) move(dt);
    const { eye, right, up, forward } = camera();
    const hit = active ? aim(eye, forward) : null;
    const zone = hit?.surface.dust.zone;
    const contact = hit && hit.distance <= REACH;
    if (cleaning && contact) showProgress(zone);
    const working = cleaning && contact && !zones[zone].done;
    const speed = contact && previousHit?.surface === hit.surface && dt > 0
      ? Math.min(1, Math.hypot(hit.u - previousHit.u, hit.v - previousHit.v) / (dt * 3))
      : 0;
    const removed = working ? clean(hit, LEVELS[TOOLS[tool][zones[zone].material]], dt) : 0;
    audio.update(tool, active && cleaning && (tool === 0 || !!contact), removed, speed);
    previousHit = working && active ? hit : null;
    if (needsProgress) updateProgress();
    reticle.hidden = !active;

    const hintLeft = active ? (highlightUntil - now) / 1000 : 0;
    hint.classList.toggle('active', hintLeft > 0);
    const highlight = hintLeft > 0 ? 0.68 * Math.min(1, hintLeft * 4) : 0;
    renderer.beginFrame();
    renderer.setCamera(eye, right, up, forward);
    for (const surface of roomFaces) renderer.draw(surface, highlight);

    if (active) {
      renderer.beginEquipment();
      const motion = working ? Math.sin(now * 0.014) * 0.018 : 0;
      const rightSide = Math.min(1, canvas.width / canvas.height);
      const offset = [0.42 * rightSide + motion, -0.36, -0.64];
      for (const part of equipment[tool]) renderer.draw(part, 0, offset);
    }
    needsRender = false;
  }

  resetRoom();
  requestAnimationFrame(frame);
})();
