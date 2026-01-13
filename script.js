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
   CANVAS PAGE LOGIC (canvas.html)
   Two-step placement:
   - Click canvas to SELECT a cell
   - Click "Confirm placement" to place the mark
========================= */

(function initCanvasPage() {
  const canvas = document.getElementById("art-canvas");
  if (!canvas) return; // Not on canvas page

  const ctx = canvas.getContext("2d");
  const cellSize = 20;

  // UI
  const marksCountEl = document.getElementById("marks-count");
  const statusTextEl = document.getElementById("status-text");
  const coordsTextEl = document.getElementById("coords-text");
  const confirmBtnEl = document.getElementById("confirm-btn");
  const confirmNoteEl = document.getElementById("confirm-note");

  // Load color chosen on place page (fallback white)
  let chosenColor = localStorage.getItem("omm_color") || "#f2f2f2";

  // State
  let hoverCell = null;      // {x,y}
  let selectedCell = null;   // {x,y}
  const marks = new Map();   // key "x,y" -> color
  let hasPlacedMyMark = false;

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

  function drawMarks() {
    for (const [key, color] of marks.entries()) {
      const [xStr, yStr] = key.split(",");
      const x = Number(xStr);
      const y = Number(yStr);

      ctx.fillStyle = color;
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }

  // Highlight selected cell (stronger than hover preview)
  function drawSelectedCell() {
    if (!selectedCell) return;

    const x = selectedCell.x * cellSize;
    const y = selectedCell.y * cellSize;

    ctx.fillStyle = hexToRgba(chosenColor, 0.35);
    ctx.fillRect(x, y, cellSize, cellSize);

    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);

    // Reset lineWidth so grid stays thin after this
    ctx.lineWidth = 1;
  }

  function drawHoverPreview() {
    if (!hoverCell) return;
    if (hasPlacedMyMark) return;

    const key = `${hoverCell.x},${hoverCell.y}`;
    if (marks.has(key)) return;

    // Don't draw preview on top of selected cell
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
    drawMarks();
    drawSelectedCell();
    drawHoverPreview();
  }

  function updateCounter() {
    if (!marksCountEl) return;
    marksCountEl.textContent = `${marks.size.toLocaleString()} / 1,000,000 marks placed`;
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

  // First click: choose a cell
  function selectCell() {
    if (hasPlacedMyMark) return;
    if (!hoverCell) return;

    const key = `${hoverCell.x},${hoverCell.y}`;
    if (marks.has(key)) return; // can't select a filled cell

    selectedCell = { x: hoverCell.x, y: hoverCell.y };

    // Enable confirm UI
    if (confirmBtnEl) confirmBtnEl.classList.remove("disabled");
    if (confirmNoteEl) confirmNoteEl.textContent = "Confirm placement to make it permanent.";

    render();
  }

  // Second step: confirm button places it
  function confirmPlacement() {
    if (hasPlacedMyMark) return;
    if (!selectedCell) return;

    const key = `${selectedCell.x},${selectedCell.y}`;
    if (marks.has(key)) return;

    marks.set(key, chosenColor);
    hasPlacedMyMark = true;

    const placedX = selectedCell.x;
    const placedY = selectedCell.y;

    // Clear selection + hover
    selectedCell = null;
    hoverCell = null;

    // Lock confirm UI
    if (confirmBtnEl) {
      confirmBtnEl.textContent = "Mark placed";
      confirmBtnEl.classList.add("disabled");
    }
    if (confirmNoteEl) confirmNoteEl.textContent = "";

    updateCounter();
    render();

    if (statusTextEl) statusTextEl.textContent = "Your mark is now part of the artwork.";
    if (coordsTextEl) coordsTextEl.textContent = `Location: (${placedX}, ${placedY})`;

    console.log(`Placed mark at ${key} with color ${chosenColor}`);
  }

  // If confirm button exists, start it disabled with a hint
  if (confirmBtnEl) confirmBtnEl.classList.add("disabled");
  if (confirmNoteEl) confirmNoteEl.textContent = "Click a cell to choose your location.";

  // Events
  canvas.addEventListener("mousemove", updateHoverCell);
  canvas.addEventListener("mouseleave", () => {
    hoverCell = null;
    render();
  });
  canvas.addEventListener("click", selectCell);

  if (confirmBtnEl) {
    confirmBtnEl.addEventListener("click", confirmPlacement);
  }

  // Init
  resizeCanvas();
  updateCounter();
  render();

  window.addEventListener("resize", () => {
    resizeCanvas();
    render();
  });
})();

