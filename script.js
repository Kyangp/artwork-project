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
   PLACE PAGE LOGIC
========================= */

(function initPlacePage() {
  const tierRow = document.getElementById("tier-row");
  const continueBtn = document.getElementById("continueBtn");
  const confirm = document.getElementById("confirm");

  const colorPicker = document.getElementById("color-picker");
  const swatches = colorPicker ? Array.from(colorPicker.querySelectorAll(".color-swatch")) : [];
  const tiers = tierRow ? Array.from(tierRow.querySelectorAll(".tier")) : [];

  // Only run if we are on place.html (elements exist)
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

  // On continue, store choices and go to canvas.html
  continueBtn.addEventListener("click", () => {
    if (!confirm.checked) return;

    localStorage.setItem("omm_tier", selectedTier);
    localStorage.setItem("omm_color", selectedColor);

    window.location.href = "canvas.html";
  });
})();

/* =========================
   CANVAS PAGE LOGIC
========================= */

(function initCanvasPage() {
  const canvas = document.getElementById("art-canvas");
  if (!canvas) return; // not on canvas page

  const ctx = canvas.getContext("2d");
  const cellSize = 20;

  const marksCountEl = document.getElementById("marks-count");
  const statusTextEl = document.getElementById("status-text");
  const coordsTextEl = document.getElementById("coords-text");

  // load selected color from place page (fallback to white)
  let chosenColor = localStorage.getItem("omm_color") || "#f2f2f2";

  let hoverCell = null;
  const marks = new Map();
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

  function drawHoverPreview() {
    if (!hoverCell) return;
    if (hasPlacedMyMark) return;

    const key = `${hoverCell.x},${hoverCell.y}`;
    if (marks.has(key)) return;

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

  function placeMark() {
    if (hasPlacedMyMark) return;
    if (!hoverCell) return;

    const key = `${hoverCell.x},${hoverCell.y}`;
    if (marks.has(key)) return;

    marks.set(key, chosenColor);
    hasPlacedMyMark = true;

    const placedX = hoverCell.x;
    const placedY = hoverCell.y;

    hoverCell = null;
    updateCounter();
    render();

    if (statusTextEl) statusTextEl.textContent = "Your mark is now part of the artwork.";
    if (coordsTextEl) coordsTextEl.textContent = `Location: (${placedX}, ${placedY})`;

    console.log(`Placed mark at ${key} with color ${chosenColor}`);
  }

  canvas.addEventListener("mousemove", updateHoverCell);
  canvas.addEventListener("mouseleave", () => {
    hoverCell = null;
    render();
  });
  canvas.addEventListener("click", placeMark);

  resizeCanvas();
  updateCounter();
  render();

  window.addEventListener("resize", () => {
    resizeCanvas();
    render();
  });
})();
