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

(async function initIndexPreview() {
  const canvas = document.getElementById("art-canvas");
  if (!canvas) return; // index might not have a canvas

  // If index also has confirm UI, it's not view-only. (We assume it doesn't.)
  const confirmBtnExists = document.getElementById("confirm-btn");
  if (confirmBtnExists) return;

  const ctx = canvas.getContext("2d");
  const cellSize = 20;

  const marksCountEl = document.getElementById("marks-count");

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

  function drawGrid() {
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;

    for (let x = 0; x <= canvas.width; x += cellSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += cellSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }

  function drawMarks(markMap) {
    for (const [key, color] of markMap.entries()) {
      const [xStr, yStr] = key.split(",");
      const x = Number(xStr);
      const y = Number(yStr);

      // Only draw marks that fall into the visible region
      const px = x * cellSize;
      const py = y * cellSize;
      if (px < 0 || py < 0 || px > canvas.width || py > canvas.height) continue;

      ctx.fillStyle = color;
      ctx.fillRect(px, py, cellSize, cellSize);
    }
  }

  try {
    const data = await loadCanonicalMarks();
    const canonical = new Map();
    for (const m of data.marks || []) {
      canonical.set(markKey(m.x, m.y), m.color || "#f2f2f2");
    }

    resizeCanvas();
    drawBackground();
    drawGrid();
    drawMarks(canonical);

    if (marksCountEl) {
      marksCountEl.textContent = `${canonical.size.toLocaleString()} / 1,000,000 marks placed`;
    }

    window.addEventListener("resize", () => {
      resizeCanvas();
      drawBackground();
      drawGrid();
      drawMarks(canonical);
    });
  } catch (err) {
    console.warn(err);
    // If marks.json can't load, we still show an empty grid.
    resizeCanvas();
    drawBackground();
    drawGrid();
  }
})();

/* =========================
   CANVAS PAGE LOGIC (canvas.html)
   Two-step placement + local persistence + canonical blocking
========================= */

(async function initCanvasPage() {
  const canvas = document.getElementById("art-canvas");
  const confirmBtnEl = document.getElementById("confirm-btn");
  if (!canvas || !confirmBtnEl) return; // Only run on canvas.html

  const ctx = canvas.getContext("2d");
  const cellSize = 20;

  // UI
  const marksCountEl = document.getElementById("marks-count");
  const statusTextEl = document.getElementById("status-text");
  const coordsTextEl = document.getElementById("coords-text");
  const confirmNoteEl = document.getElementById("confirm-note");
  const archiveTextEl = document.getElementById("archive-text");

  // Load color chosen on place page (fallback white)
  let chosenColor = localStorage.getItem("omm_color") || "#f2f2f2";

  // Local state
  let hoverCell = null;
  let selectedCell = null;
  let hasPlacedMyMark = false;

  // Marks:
  // - canonicalMarks = read-only, loaded from marks.json
  // - localMarks = your personal placed mark (persisted)
  const canonicalMarks = new Map();
  const localMarks = new Map();

  // ---- Local persistence keys ----
  const LS_HAS = "omm_has_mark";
  const LS_X = "omm_mark_x";
  const LS_Y = "omm_mark_y";
  const LS_COLOR = "omm_mark_color";

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

  function drawGrid() {
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;

    for (let x = 0; x <= canvas.width; x += cellSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += cellSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }

  function drawMarks(map) {
    for (const [key, color] of map.entries()) {
      const [xStr, yStr] = key.split(",");
      const x = Number(xStr);
      const y = Number(yStr);

      ctx.fillStyle = color;
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }

  function drawSelectedCell() {
    if (!selectedCell) return;

    const x = selectedCell.x * cellSize;
    const y = selectedCell.y * cellSize;

    ctx.fillStyle = hexToRgba(chosenColor, 0.35);
    ctx.fillRect(x, y, cellSize, cellSize);

    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
    ctx.lineWidth = 1;
  }

  function cellTaken(x, y) {
    const key = markKey(x, y);
    return canonicalMarks.has(key) || localMarks.has(key);
  }

  function drawHoverPreview() {
    if (!hoverCell) return;
    if (hasPlacedMyMark) return;

    if (cellTaken(hoverCell.x, hoverCell.y)) return;
    if (selectedCell && hoverCell.x === selectedCell.x && hoverCell.y === selectedCell.y) return;

    const x = hoverCell.x * cellSize;
    const y = hoverCell.y * cellSize;

    ctx.fillStyle = hexToRgba(chosenColor, 0.25);
    ctx.fillRect(x, y, cellSize, cellSize);

    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
  }

  function render() {
    drawBackground();
    drawGrid();
    drawMarks(canonicalMarks);
    drawMarks(localMarks);
    drawSelectedCell();
    drawHoverPreview();
  }

  function updateCounter() {
    if (!marksCountEl) return;

    // Only canonical marks count as "published" for now
    const publishedCount = canonicalMarks.size;
    marksCountEl.textContent = `${publishedCount.toLocaleString()} / 1,000,000 marks placed`;
  }

  function updateHoverCell(event) {
    if (hasPlacedMyMark) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    hoverCell = {
      x: Math.floor(mouseX / cellSize),
      y: Math.floor(mouseY / cellSize),
    };

    render();
  }

  function selectCell() {
    if (hasPlacedMyMark) return;
    if (!hoverCell) return;

    if (cellTaken(hoverCell.x, hoverCell.y)) {
      // optional: tiny feedback
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

    confirmBtnEl.textContent = "Mark placed";
    confirmBtnEl.classList.add("disabled");
    if (confirmNoteEl) confirmNoteEl.textContent = "";

    if (statusTextEl) statusTextEl.textContent = "You have already placed your mark.";
    if (coordsTextEl) coordsTextEl.textContent = `Location: (${x}, ${y})`;
    if (archiveTextEl) archiveTextEl.textContent = "Archival publication is not yet enabled.";

    selectedCell = null;
    hoverCell = null;
  }

  function confirmPlacement() {
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

    updateCounter();
    render();
  }

  // Initial UI state
  confirmBtnEl.classList.add("disabled");
  if (confirmNoteEl) confirmNoteEl.textContent = "Click a cell to choose your location.";

  // Load canonical dataset first
  try {
    const data = await loadCanonicalMarks();
    for (const m of data.marks || []) {
      canonicalMarks.set(markKey(m.x, m.y), m.color || "#f2f2f2");
    }
  } catch (err) {
    console.warn(err);
    // If it fails, canvas still works, but without canonical blocking.
  }

  // Load your persisted local mark (if any)
  loadMyMark();

  // Events
  canvas.addEventListener("mousemove", updateHoverCell);
  canvas.addEventListener("mouseleave", () => {
    hoverCell = null;
    render();
  });
  canvas.addEventListener("click", selectCell);
  confirmBtnEl.addEventListener("click", confirmPlacement);

  // Init render
  resizeCanvas();
  updateCounter();
  render();

  window.addEventListener("resize", () => {
    resizeCanvas();
    render();
  });
})();
