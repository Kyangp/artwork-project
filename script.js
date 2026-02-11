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
========================= */

(async function initCanvasPage() {
  const canvas = document.getElementById("art-canvas");
  const confirmBtnEl = document.getElementById("confirm-btn");
  const beginBtnEl = document.getElementById("begin-btn");
  if (!canvas || !confirmBtnEl || !beginBtnEl) return;

  const ctx = canvas.getContext("2d");

  const BASE_CELL = 20;

  // UI
  const marksCountEl = document.getElementById("marks-count");
  const statusTextEl = document.getElementById("status-text");
  const coordsTextEl = document.getElementById("coords-text");
  const confirmNoteEl = document.getElementById("confirm-note");
  const archiveTextEl = document.getElementById("archive-text");

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
  let scale = 1;         // zoom factor relative to BASE_CELL
  let cameraX = 0;       // world coords at top-left of view
  let cameraY = 0;
  let offsetX = 0;       // pixel offset for centering (used in fit-to-view mode)
  let offsetY = 0;

  // Panning state
  let isPanning = false;
  let panStartMouse = null;
  let panStartCamera = null;

  // ---- Local persistence keys ----
  const LS_HAS = "omm_has_mark";
  const LS_X = "omm_mark_x";
  const LS_Y = "omm_mark_y";
  const LS_COLOR = "omm_mark_color";

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

  function clampCamera() {
    const cp = cellPx();
    const visibleCols = canvas.width / cp;
    const visibleRows = canvas.height / cp;

    const maxCamX = Math.max(0, GRID_COLS - visibleCols);
    const maxCamY = Math.max(0, GRID_ROWS - visibleRows);

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

  function enterPlacementMode() {
    placementMode = true;

    // Comfortable starting zoom: not extreme, but “closer than full view”
    // You can tweak this later.
    scale = Math.max(scale, 0.6);

    // Remove centering offsets; placement is camera-based.
    offsetX = 0;
    offsetY = 0;

    clampCamera();

    beginBtnEl.classList.add("disabled");
    beginBtnEl.textContent = "Placement mode";

    confirmBtnEl.classList.add("disabled");
    confirmBtnEl.style.display = "block";

    if (confirmNoteEl) confirmNoteEl.textContent = "Drag to navigate. Click a cell to choose.";
    render();
  }

  function drawBackground() {
    ctx.fillStyle = "#1e1e1e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawBorder() {
    // Only meaningful when fit-to-view is showing whole piece
    if (placementMode) return;

    const worldW = GRID_COLS * cellPx();
    const worldH = GRID_ROWS * cellPx();

    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.strokeRect(offsetX + 0.5, offsetY + 0.5, worldW - 1, worldH - 1);
  }

  function drawGrid() {
    const cp = cellPx();
    if (cp < 6) return; // too zoomed out -> don’t draw full grid

    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;

    // Grid in screen space
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

  function worldToScreen(x, y) {
    const cp = cellPx();

    if (!placementMode) {
      // Fit-to-view mode: no camera, just centered world
      return { sx: offsetX + x * cp, sy: offsetY + y * cp };
    }

    // Placement mode: camera defines top-left world cell
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

  function cellTaken(x, y) {
    return canonicalMarks.has(markKey(x, y)) || localMarks.has(markKey(x, y));
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

    if (confirmNoteEl) confirmNoteEl.textContent = "";
    if (statusTextEl) statusTextEl.textContent = "You have already placed your mark.";
    if (coordsTextEl) coordsTextEl.textContent = `Location: (${x}, ${y})`;
    if (archiveTextEl) archiveTextEl.textContent = "Archival publication is not yet enabled.";

    selectedCell = null;
    hoverCell = null;

    // If you already placed, we can still show the whole artwork view
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

    selectedCell = null;
    hoverCell = null;

    // After placing, return to the whole artwork view
    placementMode = false;
    fitToView();

    render();
  }

  // ---- PANNING (placement mode only) ----
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

    // Drag right moves world right under hand -> camera moves left
    cameraX = panStartCamera.x - dxPx / cp;
    cameraY = panStartCamera.y - dyPx / cp;

    clampCamera();
    render();
  }

  function endPan() {
    isPanning = false;
    panStartMouse = null;
    panStartCamera = null;
  }

  // ---- ZOOM (wheel, placement mode only) ----
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

    // Clamp zoom range (tweak later if you want)
    scale = clamp(scale * factor, 0.2, 5);

    // Keep the same world point under cursor AFTER zoom
    const cpAfter = cellPx();
    cameraX = worldX - mx / cpAfter;
    cameraY = worldY - my / cpAfter;

    clampCamera();
    render();
  }

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

  // Wheel zoom (needs { passive: false } to allow preventDefault)
  canvas.addEventListener("wheel", onWheelZoom, { passive: false });

  window.addEventListener("resize", () => {
    // If not in placement mode, keep fit-to-view.
    // If in placement mode, keep camera/scale but clamp.
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
  // =========================

  const DEV_MODE = new URLSearchParams(window.location.search).get("dev") === "1";

  function clearMyLocalMark() {
    localStorage.removeItem("omm_has_mark");
    localStorage.removeItem("omm_mark_x");
    localStorage.removeItem("omm_mark_y");
    localStorage.removeItem("omm_mark_color");
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
