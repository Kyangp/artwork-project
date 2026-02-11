console.log("script connected");

/* =========================
   Shared helpers
========================= */

function hexToRgba(hex, alpha) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

async function loadCanonicalMarks() {
  // Works on Vercel / any web server.
  // If you open files with file:// it will often fail (browser blocks fetch).
  const res = await fetch("./marks.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load marks.json (${res.status})`);
  return res.json();
}

function markKey(x, y) {
  return `${x},${y}`;
}

/* =========================
   PLACE PAGE LOGIC (place.html)
========================= */

(function initPlacePage() {
  const tierRow = document.getElementById("tier-row");
  const continueBtn = document.getElementById("continueBtn");
  const confirm = document.getElementById("confirm");

  const colorPicker = document.getElementById("color-picker");
  const swatches = colorPicker ? Array.from(colorPicker.querySelectorAll(".color-swatch")) : [];
  const tiers = tierRow ? Array.from(tierRow.querySelectorAll(".tier")) : [];

  // Only run on place page
  if (!continueBtn || !confirm || (!swatches.length && !tiers.length)) return;

  let selectedTier = "0.99";
  let selectedColor = "#f2f2f2";

  // Paint swatch backgrounds
  swatches.forEach(btn => {
    btn.style.background = btn.getAttribute("data-color");
  });

  // Tier selection
  tiers.forEach(btn => {
    btn.addEventListener("click", () => {
      tiers.forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedTier = btn.getAttribute("data-tier");
    });
  });

  // Color selection
  swatches.forEach(btn => {
    btn.addEventListener("click", () => {
      swatches.forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedColor = btn.getAttribute("data-color");
    });
  });

  // Enable Continue only if checkbox is checked
  function syncContinueState() {
    if (confirm.checked) continueBtn.classList.remove("disabled");
    else continueBtn.classList.add("disabled");
  }
  confirm.addEventListener("change", syncContinueState);
  syncContinueState();

  // Continue -> store choices -> go to canvas page
  continueBtn.addEventListener("click", () => {
    if (!confirm.checked) return;

    localStorage.setItem("omm_tier", selectedTier);
    localStorage.setItem("omm_color", selectedColor);

    window.location.href = "canvas.html";
  });
})();

/* =========================
   INDEX PREVIEW (index.html)
   View-only rendering of canonical marks (no interaction)
========================= */

/* =========================
   INDEX PREVIEW (index.html)
   Fit-to-view rendering of the FULL canonical artwork (view-only)
========================= */

(async function initIndexPreview() {
  const canvas = document.getElementById("art-canvas");
  if (!canvas) return;

  // If index has confirm UI, it's not view-only
  const confirmBtnExists = document.getElementById("confirm-btn");
  if (confirmBtnExists) return;

  const ctx = canvas.getContext("2d");
  const BASE_CELL = 20;

  const marksCountEl = document.getElementById("marks-count");

  let GRID_COLS = 1250;
  let GRID_ROWS = 800;

  let canonical = new Map();

  function resizeCanvas() {
    const parent = canvas.parentElement;
    const rect = parent.getBoundingClientRect();
    canvas.width = Math.floor(rect.width);
    canvas.height = Math.floor(rect.height);
  }

  function drawBackground() {
    ctx.fillStyle = "#1e1e1e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawBorder(offsetX, offsetY, worldW, worldH) {
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.strokeRect(offsetX + 0.5, offsetY + 0.5, worldW - 1, worldH - 1);
  }

  function drawGrid(scale, offsetX, offsetY, worldW, worldH) {
    const cellPx = BASE_CELL * scale;

    // If zoomed out far, drawing every grid line is heavy + visually noisy.
    // Only draw grid when cells are big enough to read.
    if (cellPx < 6) return;

    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;

    // Vertical lines
    for (let x = 0; x <= worldW; x += cellPx) {
      ctx.beginPath();
      ctx.moveTo(offsetX + x, offsetY);
      ctx.lineTo(offsetX + x, offsetY + worldH);
      ctx.stroke();
    }

    // Horizontal lines
    for (let y = 0; y <= worldH; y += cellPx) {
      ctx.beginPath();
      ctx.moveTo(offsetX, offsetY + y);
      ctx.lineTo(offsetX + worldW, offsetY + y);
      ctx.stroke();
    }
  }

  function drawMarks(scale, offsetX, offsetY) {
    const cellPx = BASE_CELL * scale;

    for (const [key, color] of canonical.entries()) {
      const [xStr, yStr] = key.split(",");
      const x = Number(xStr);
      const y = Number(yStr);

      const sx = offsetX + x * cellPx;
      const sy = offsetY + y * cellPx;

      // Skip if not visible
      if (sx + cellPx < 0 || sy + cellPx < 0 || sx > canvas.width || sy > canvas.height) continue;

      ctx.fillStyle = color;
      ctx.fillRect(sx, sy, cellPx, cellPx);
    }
  }

  function render() {
    resizeCanvas();
    drawBackground();

    const scale = Math.min(
      canvas.width / (GRID_COLS * BASE_CELL),
      canvas.height / (GRID_ROWS * BASE_CELL)
    );

    const worldW = GRID_COLS * BASE_CELL * scale;
    const worldH = GRID_ROWS * BASE_CELL * scale;

    const offsetX = Math.floor((canvas.width - worldW) / 2);
    const offsetY = Math.floor((canvas.height - worldH) / 2);

    drawBorder(offsetX, offsetY, worldW, worldH);
    drawGrid(scale, offsetX, offsetY, worldW, worldH);
    drawMarks(scale, offsetX, offsetY);
  }

  try {
    const data = await loadCanonicalMarks();

    if (data.grid && Number.isFinite(data.grid.cols) && Number.isFinite(data.grid.rows)) {
      GRID_COLS = data.grid.cols;
      GRID_ROWS = data.grid.rows;
    }

    canonical = new Map();
    for (const m of data.marks || []) {
      canonical.set(markKey(m.x, m.y), m.color || "#f2f2f2");
    }

    if (marksCountEl) {
      marksCountEl.textContent = `${canonical.size.toLocaleString()} / 1,000,000 marks placed`;
    }

    render();
    window.addEventListener("resize", render);
  } catch (err) {
    console.warn(err);
    render();
    window.addEventListener("resize", render);
  }
})();


/* =========================
   CANVAS PAGE LOGIC (canvas.html)
   Two-step placement + local persistence + canonical blocking
========================= */

/* =========================
   CANVAS PAGE LOGIC (canvas.html)
   Two-step placement + local persistence + canonical blocking
   + CAMERA (viewport) with click-drag panning
========================= */

/* =========================
   CANVAS PAGE (canvas.html)
   Starts fit-to-view (whole artwork).
   "Begin placement" enters interactive mode with zoom + pan + selection.
   Adds Jump to coordinates + Copy shareable URL.
   Adds dev reset mode (?dev=1).
========================= */

(async function initCanvasPage() {
  const canvas = document.getElementById("art-canvas");
  const confirmBtnEl = document.getElementById("confirm-btn");
  const beginBtnEl = document.getElementById("begin-btn");
  if (!canvas || !confirmBtnEl || !beginBtnEl) return;

  const ctx = canvas.getContext("2d");

  // UI (existing)
  const marksCountEl = document.getElementById("marks-count");
  const statusTextEl = document.getElementById("status-text");
  const coordsTextEl = document.getElementById("coords-text");
  const confirmNoteEl = document.getElementById("confirm-note");
  const archiveTextEl = document.getElementById("archive-text");

  // Jump + Share UI (new)
  const jumpXEl = document.getElementById("jump-x");
  const jumpYEl = document.getElementById("jump-y");
  const jumpBtnEl = document.getElementById("jump-btn");
  const copyLinkBtnEl = document.getElementById("copy-link-btn");
  const jumpNoteEl = document.getElementById("jump-note");

  // ---- Local persistence keys ----
  const LS_HAS = "omm_has_mark";
  const LS_X = "omm_mark_x";
  const LS_Y = "omm_mark_y";
  const LS_COLOR = "omm_mark_color";

  // Grid bounds (default until marks.json loads)
  let GRID_COLS = 1250;
  let GRID_ROWS = 800;

  // Marks
  const canonicalMarks = new Map();
  const localMarks = new Map();

  // Placement state
  let chosenColor = localStorage.getItem("omm_color") || "#f2f2f2";
  let hoverCell = null;     // world coords
  let selectedCell = null;  // world coords
  let hasPlacedMyMark = false;

  // Mode
  let placementMode = false; // false = view-only whole artwork

  // Camera + zoom
  const BASE_CELL = 20;
  let scale = 1;         // zoom factor relative to BASE_CELL
  let cameraX = 0;       // world coords at top-left of view (placement mode)
  let cameraY = 0;
  let offsetX = 0;       // pixel offset for centering (fit-to-view mode)
  let offsetY = 0;

  // Panning state
  let isPanning = false;
  let panStartMouse = null;
  let panStartCamera = null;

  // URL params (shareable)
  const params = new URLSearchParams(window.location.search);
  const urlXRaw = Number(params.get("x"));
  const urlYRaw = Number(params.get("y"));
  const urlZRaw = Number(params.get("z"));
  let startFromSharedLink = null; // set after grid is known

  // =========================
  // Helpers
  // =========================

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function cellPx() {
    return BASE_CELL * scale;
  }

  function resizeCanvas() {
    const parent = canvas.parentElement;
    const rect = parent.getBoundingClientRect();
    canvas.width = Math.floor(rect.width);
    canvas.height = Math.floor(rect.height);
  }

  function visibleCols() {
    return canvas.width / cellPx();
  }

  function visibleRows() {
    return canvas.height / cellPx();
  }

  function clampCamera() {
    const vCols = visibleCols();
    const vRows = visibleRows();

    const maxCamX = Math.max(0, GRID_COLS - vCols);
    const maxCamY = Math.max(0, GRID_ROWS - vRows);

    cameraX = clamp(cameraX, 0, maxCamX);
    cameraY = clamp(cameraY, 0, maxCamY);
  }

  function fitToView() {
    resizeCanvas();

    scale = Math.min(
      canvas.width / (GRID_COLS * BASE_CELL),
      canvas.height / (GRID_ROWS * BASE_CELL)
    );

    cameraX = 0;
    cameraY = 0;

    const worldW = GRID_COLS * cellPx();
    const worldH = GRID_ROWS * cellPx();

    offsetX = Math.floor((canvas.width - worldW) / 2);
    offsetY = Math.floor((canvas.height - worldH) / 2);
  }

  function clampWorldCoord(x, y) {
    return {
      x: clamp(x, 0, GRID_COLS - 1),
      y: clamp(y, 0, GRID_ROWS - 1),
    };
  }

  function setCameraCenteredOn(x, y) {
    cameraX = x - visibleCols() / 2;
    cameraY = y - visibleRows() / 2;
    clampCamera();
  }

  function buildShareURL(x, y, z) {
    const url = new URL(window.location.href);
    url.searchParams.set("x", String(Math.round(x)));
    url.searchParams.set("y", String(Math.round(y)));
    url.searchParams.set("z", String(Number(z).toFixed(3)));
    return url.toString();
  }

  function syncUrlToCurrentView() {
    // Keep URL quietly in sync with current placement view
    if (!placementMode) return;
    const cx = cameraX + visibleCols() / 2;
    const cy = cameraY + visibleRows() / 2;
    const newUrl = buildShareURL(cx, cy, scale);
    window.history.replaceState({}, "", newUrl);
  }

  async function copyTextToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      if (jumpNoteEl) jumpNoteEl.textContent = "Link copied.";
    } catch {
      window.prompt("Copy this link:", text);
    }
  }

  function worldToScreen(x, y) {
    const cp = cellPx();

    if (!placementMode) {
      return { sx: offsetX + x * cp, sy: offsetY + y * cp };
    }

    return { sx: (x - cameraX) * cp, sy: (y - cameraY) * cp };
  }

  function screenToWorld(mouseX, mouseY) {
    const cp = cellPx();

    if (!placementMode) {
      return {
        x: Math.floor((mouseX - offsetX) / cp),
        y: Math.floor((mouseY - offsetY) / cp),
      };
    }

    return {
      x: Math.floor(mouseX / cp + cameraX),
      y: Math.floor(mouseY / cp + cameraY),
    };
  }

  function cellTaken(x, y) {
    return canonicalMarks.has(markKey(x, y)) || localMarks.has(markKey(x, y));
  }

  function drawBackground() {
    ctx.fillStyle = "#1e1e1e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawBorder() {
    if (placementMode) return;

    const worldW = GRID_COLS * cellPx();
    const worldH = GRID_ROWS * cellPx();

    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.strokeRect(offsetX + 0.5, offsetY + 0.5, worldW - 1, worldH - 1);
  }

  function drawGrid() {
    const cp = cellPx();
    if (cp < 6) return;

    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;

    for (let x = 0; x <= canvas.width; x += cp) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += cp) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(canvas.width, y + 0.5);
      ctx.stroke();
    }
  }

  function drawMarks(map) {
    const cp = cellPx();

    for (const [key, color] of map.entries()) {
      const [xStr, yStr] = key.split(",");
      const x = Number(xStr);
      const y = Number(yStr);

      const { sx, sy } = worldToScreen(x, y);
      if (sx + cp < 0 || sy + cp < 0 || sx > canvas.width || sy > canvas.height) continue;

      ctx.fillStyle = color;
      ctx.fillRect(sx, sy, cp, cp);
    }
  }

  function drawSelectedCell() {
    if (!selectedCell) return;

    const { sx, sy } = worldToScreen(selectedCell.x, selectedCell.y);
    const cp = cellPx();

    ctx.fillStyle = hexToRgba(chosenColor, 0.35);
    ctx.fillRect(sx, sy, cp, cp);

    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 2;
    ctx.strokeRect(sx + 1, sy + 1, cp - 2, cp - 2);
    ctx.lineWidth = 1;
  }

  function drawHoverPreview() {
    if (!placementMode) return;
    if (!hoverCell) return;
    if (hasPlacedMyMark) return;

    if (hoverCell.x < 0 || hoverCell.y < 0 || hoverCell.x >= GRID_COLS || hoverCell.y >= GRID_ROWS) return;
    if (cellTaken(hoverCell.x, hoverCell.y)) return;
    if (selectedCell && hoverCell.x === selectedCell.x && hoverCell.y === selectedCell.y) return;

    const { sx, sy } = worldToScreen(hoverCell.x, hoverCell.y);
    const cp = cellPx();

    ctx.fillStyle = hexToRgba(chosenColor, 0.25);
    ctx.fillRect(sx, sy, cp, cp);

    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.strokeRect(sx + 0.5, sy + 0.5, cp - 1, cp - 1);
  }

  function render() {
    drawBackground();
    drawBorder();
    drawGrid();
    drawMarks(canonicalMarks);
    drawMarks(localMarks);
    drawSelectedCell();
    drawHoverPreview();
  }

  function updateCounter() {
    if (!marksCountEl) return;
    marksCountEl.textContent = `${canonicalMarks.size.toLocaleString()} / 1,000,000 marks placed`;
  }

  // =========================
  // Placement Mode
  // =========================

  function enterPlacementMode() {
    if (hasPlacedMyMark) return;

    placementMode = true;

    // Remove centering offsets; placement is camera-based.
    offsetX = 0;
    offsetY = 0;

    // Start at a comfortable zoom
    scale = clamp(Math.max(scale, 0.6), 0.2, 5);

    // If opened from shared link, start there
    if (startFromSharedLink) {
      if (Number.isFinite(urlZRaw)) {
        scale = clamp(urlZRaw, 0.2, 5);
      } else {
        scale = clamp(Math.max(scale, 1.2), 0.2, 5);
      }
      clampCamera();
      setCameraCenteredOn(startFromSharedLink.x, startFromSharedLink.y);

      if (jumpXEl) jumpXEl.value = String(Math.round(startFromSharedLink.x));
      if (jumpYEl) jumpYEl.value = String(Math.round(startFromSharedLink.y));
      if (jumpNoteEl) jumpNoteEl.textContent = `Viewing: (${Math.round(startFromSharedLink.x)}, ${Math.round(startFromSharedLink.y)})`;
      syncUrlToCurrentView();
    } else {
      clampCamera();
      syncUrlToCurrentView();
    }

    beginBtnEl.classList.add("disabled");
    beginBtnEl.textContent = "Placement mode";

    confirmBtnEl.classList.add("disabled");
    confirmBtnEl.style.display = "block";

    if (confirmNoteEl) confirmNoteEl.textContent = "Drag to navigate. Scroll to zoom. Click a cell to choose.";
    render();
  }

  function updateHoverCell(event) {
    if (!placementMode) return;
    if (hasPlacedMyMark) return;
    if (isPanning) return;

    const rect = canvas.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;

    hoverCell = screenToWorld(mx, my);
    render();
  }

  function selectCell() {
    if (!placementMode) return;
    if (hasPlacedMyMark) return;
    if (isPanning) return;
    if (!hoverCell) return;

    if (hoverCell.x < 0 || hoverCell.y < 0 || hoverCell.x >= GRID_COLS || hoverCell.y >= GRID_ROWS) {
      if (confirmNoteEl) confirmNoteEl.textContent = "Outside the artwork bounds.";
      return;
    }

    if (cellTaken(hoverCell.x, hoverCell.y)) {
      if (confirmNoteEl) confirmNoteEl.textContent = "That cell is already part of the artwork.";
      return;
    }

    selectedCell = { x: hoverCell.x, y: hoverCell.y };
    confirmBtnEl.classList.remove("disabled");
    if (confirmNoteEl) confirmNoteEl.textContent = "Confirm placement to make it permanent.";

    render();
  }

  function saveMyMark(x, y, color) {
    localStorage.setItem(LS_HAS, "1");
    localStorage.setItem(LS_X, String(x));
    localStorage.setItem(LS_Y, String(y));
    localStorage.setItem(LS_COLOR, color);
  }

  function loadMyMark() {
    const has = localStorage.getItem(LS_HAS);
    if (has !== "1") return;

    const x = Number(localStorage.getItem(LS_X));
    const y = Number(localStorage.getItem(LS_Y));
    const color = localStorage.getItem(LS_COLOR) || "#f2f2f2";

    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    localMarks.set(markKey(x, y), color);
    hasPlacedMyMark = true;

    beginBtnEl.classList.add("disabled");
    beginBtnEl.textContent = "Mark placed";

    confirmBtnEl.textContent = "Mark placed";
    confirmBtnEl.classList.add("disabled");
    confirmBtnEl.style.display = "none";

    if (confirmNoteEl) confirmNoteEl.textContent = "";
    if (statusTextEl) statusTextEl.textContent = "You have already placed your mark.";
    if (coordsTextEl) coordsTextEl.textContent = `Location: (${x}, ${y})`;
    if (archiveTextEl) archiveTextEl.textContent = "Archival publication is not yet enabled.";

    // Return to whole-artwork view
    placementMode = false;
    fitToView();
  }

  function confirmPlacement() {
    if (!placementMode) return;
    if (hasPlacedMyMark) return;
    if (!selectedCell) return;

    if (cellTaken(selectedCell.x, selectedCell.y)) {
      if (confirmNoteEl) confirmNoteEl.textContent = "That cell is already part of the artwork.";
      return;
    }

    const x = selectedCell.x;
    const y = selectedCell.y;

    localMarks.set(markKey(x, y), chosenColor);
    hasPlacedMyMark = true;
    saveMyMark(x, y, chosenColor);

    confirmBtnEl.textContent = "Mark placed";
    confirmBtnEl.classList.add("disabled");

    if (confirmNoteEl) confirmNoteEl.textContent = "";
    if (statusTextEl) statusTextEl.textContent = "Your mark is recorded locally.";
    if (coordsTextEl) coordsTextEl.textContent = `Location: (${x}, ${y})`;
    if (archiveTextEl) archiveTextEl.textContent = "Archival publication is not yet enabled.";

    // Update URL to your mark (quietly)
    const url = buildShareURL(x, y, 1.2);
    window.history.replaceState({}, "", url);

    selectedCell = null;
    hoverCell = null;

    // Return to whole-artwork view
    placementMode = false;
    fitToView();
    render();
  }

  // =========================
  // Panning + Zoom
  // =========================

  function beginPan(event) {
    if (!placementMode) return;
    if (event.button !== 0) return;

    isPanning = true;
    const rect = canvas.getBoundingClientRect();

    panStartMouse = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    panStartCamera = { x: cameraX, y: cameraY };
  }

  function movePan(event) {
    if (!isPanning) return;

    const rect = canvas.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;

    const dxPx = mx - panStartMouse.x;
    const dyPx = my - panStartMouse.y;

    const cp = cellPx();

    cameraX = panStartCamera.x - dxPx / cp;
    cameraY = panStartCamera.y - dyPx / cp;

    clampCamera();
    render();
  }

  function endPan() {
    if (!isPanning) return;
    isPanning = false;
    panStartMouse = null;
    panStartCamera = null;

    syncUrlToCurrentView();
  }

  function onWheelZoom(event) {
    if (!placementMode) return;
    event.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;

    // World point under cursor BEFORE zoom
    const cpBefore = cellPx();
    const worldX = cameraX + mx / cpBefore;
    const worldY = cameraY + my / cpBefore;

    const zoomIn = event.deltaY < 0;
    const factor = zoomIn ? 1.12 : 0.89;

    scale = clamp(scale * factor, 0.2, 5);

    // Keep same world point under cursor AFTER zoom
    const cpAfter = cellPx();
    cameraX = worldX - mx / cpAfter;
    cameraY = worldY - my / cpAfter;

    clampCamera();
    syncUrlToCurrentView();
    render();
  }

  // =========================
  // Jump + Share
  // =========================

  function handleJump() {
    if (!jumpXEl || !jumpYEl) return;

    const x = Number(jumpXEl.value);
    const y = Number(jumpYEl.value);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      if (jumpNoteEl) jumpNoteEl.textContent = "Enter numeric x and y.";
      return;
    }

    const target = clampWorldCoord(x, y);

    if (!placementMode && !hasPlacedMyMark) {
      enterPlacementMode();
    }

    // Ensure a workable zoom
    scale = clamp(Math.max(scale, 1), 0.2, 5);
    clampCamera();
    setCameraCenteredOn(target.x, target.y);

    const newUrl = buildShareURL(target.x, target.y, scale);
    window.history.replaceState({}, "", newUrl);

    if (jumpNoteEl) jumpNoteEl.textContent = `Viewing: (${target.x}, ${target.y})`;
    render();
  }

  function getCurrentViewForCopy() {
    if (placementMode) {
      const cx = cameraX + visibleCols() / 2;
      const cy = cameraY + visibleRows() / 2;
      return { x: cx, y: cy, z: scale };
    }

    const has = localStorage.getItem(LS_HAS) === "1";
    if (has) {
      const mx = Number(localStorage.getItem(LS_X));
      const my = Number(localStorage.getItem(LS_Y));
      if (Number.isFinite(mx) && Number.isFinite(my)) {
        return { x: mx, y: my, z: 1.2 };
      }
    }

    return { x: GRID_COLS / 2, y: GRID_ROWS / 2, z: scale };
  }

  async function handleCopyLink() {
    const v = getCurrentViewForCopy();
    const link = buildShareURL(v.x, v.y, v.z);
    await copyTextToClipboard(link);
  }

  // =========================
  // Init
  // =========================

  // Initial UI state (starts in whole-artwork view)
  confirmBtnEl.classList.add("disabled");
  confirmBtnEl.style.display = "none";
  if (confirmNoteEl) confirmNoteEl.textContent = "Begin placement to enter the artwork.";

  // Load canonical dataset (and grid size)
  try {
    const data = await loadCanonicalMarks();

    if (data.grid && Number.isFinite(data.grid.cols) && Number.isFinite(data.grid.rows)) {
      GRID_COLS = data.grid.cols;
      GRID_ROWS = data.grid.rows;
    }

    for (const m of data.marks || []) {
      canonicalMarks.set(markKey(m.x, m.y), m.color || "#f2f2f2");
    }
  } catch (err) {
    console.warn(err);
  }

  // Shared-link target (now that grid is known)
  if (Number.isFinite(urlXRaw) && Number.isFinite(urlYRaw)) {
    startFromSharedLink = clampWorldCoord(urlXRaw, urlYRaw);
  }

  // Load persisted local mark (if any)
  loadMyMark();

  // Fit-to-view startup
  fitToView();
  updateCounter();
  render();

  // Events
  beginBtnEl.addEventListener("click", () => {
    if (hasPlacedMyMark) return;
    enterPlacementMode();
  });

  canvas.addEventListener("mousemove", updateHoverCell);
  canvas.addEventListener("mouseleave", () => {
    hoverCell = null;
    render();
  });
  canvas.addEventListener("click", selectCell);

  confirmBtnEl.addEventListener("click", confirmPlacement);

  canvas.addEventListener("mousedown", beginPan);
  window.addEventListener("mousemove", movePan);
  window.addEventListener("mouseup", endPan);

  canvas.addEventListener("wheel", onWheelZoom, { passive: false });

  if (jumpBtnEl) jumpBtnEl.addEventListener("click", handleJump);
  if (copyLinkBtnEl) copyLinkBtnEl.addEventListener("click", handleCopyLink);

  // Allow pressing Enter in jump inputs
  if (jumpXEl) jumpXEl.addEventListener("keydown", (e) => { if (e.key === "Enter") handleJump(); });
  if (jumpYEl) jumpYEl.addEventListener("keydown", (e) => { if (e.key === "Enter") handleJump(); });

  window.addEventListener("resize", () => {
    resizeCanvas();
    if (!placementMode) {
      fitToView();
    } else {
      clampCamera();
    }
    render();
  });

  // =========================
  // DEV MODE (local testing only)
  // ?dev=1 shows "Reset local mark (dev)"
  // =========================

  const DEV_MODE = new URLSearchParams(window.location.search).get("dev") === "1";

  function clearMyLocalMark() {
    localStorage.removeItem(LS_HAS);
    localStorage.removeItem(LS_X);
    localStorage.removeItem(LS_Y);
    localStorage.removeItem(LS_COLOR);
  }

  if (DEV_MODE) {
    const link = document.createElement("a");
    link.href = "#";
    link.textContent = "Reset local mark (dev)";
    link.className = "link-muted";
    link.style.display = "inline-block";
    link.style.marginTop = "12px";
    link.style.fontSize = "13px";
    link.style.opacity = "0.7";

    link.addEventListener("click", (e) => {
      e.preventDefault();
      clearMyLocalMark();
      window.location.reload();
    });

    const panel = document.querySelector(".info-panel");
    if (panel) panel.appendChild(link);
  }
})();
