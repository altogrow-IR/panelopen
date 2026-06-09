const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 760;
const IMAGE_MARGIN = 24;
const ALPHA_THRESHOLD = 24;
const BOUNDARY_WIDTH = 7;
const MIN_PANEL_PIXELS = 40;

const canvas = document.getElementById("mainCanvas");
const ctx = canvas.getContext("2d");
const statusText = document.getElementById("statusText");
const imageInput = document.getElementById("imageInput");
const showLinesInput = document.getElementById("showLinesInput");
const silhouetteColorInput = document.getElementById("silhouetteColorInput");

const state = {
  originalImage: null,
  displayCanvas: null,
  silhouetteCanvas: null,
  characterMask: null,
  panelIds: null,
  panelMasks: [],
  imageX: 0,
  imageY: 0,
  imageW: 0,
  imageH: 0,
  boundaryLines: [],
  pendingLineStart: null,
  openedPanels: new Set(),
  mode: "open",
  silhouetteColor: "#111820",
};

function drawEmptyState() {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.fillStyle = "#f8fafb";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.fillStyle = "#60717b";
  ctx.font = "700 18px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("立ち絵画像を読み込んでください。", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
}

function updateStatus() {
  if (!state.displayCanvas) {
    statusText.textContent = "立ち絵画像を読み込んでください。";
    return;
  }

  const modeText = state.mode === "line" ? "境界線を引く" : "パネルを開ける";
  const pending = state.pendingLineStart ? "あり" : "なし";
  statusText.textContent = [
    `モード: ${modeText}`,
    `開いたパネル: ${state.openedPanels.size}/${state.panelMasks.length}`,
    `境界線: ${state.boundaryLines.length}本`,
    `線の始点選択: ${pending}`,
  ].join("\n");
}

function redraw() {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.fillStyle = "#f8fafb";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  if (!state.displayCanvas) {
    drawEmptyState();
    updateStatus();
    return;
  }

  const composed = composeRevealCanvas();
  ctx.drawImage(composed, state.imageX, state.imageY);

  if (showLinesInput.checked) {
    drawBoundaryLines();
  }
  drawPendingLine();

  if (state.panelMasks.length > 0 && state.openedPanels.size === state.panelMasks.length) {
    ctx.fillStyle = "rgba(16, 24, 32, 0.72)";
    ctx.fillRect(state.imageX, state.imageY + state.imageH - 48, state.imageW, 48);
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 22px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("全パネルオープン", state.imageX + state.imageW / 2, state.imageY + state.imageH - 24);
  }

  updateStatus();
}

function loadImageFromFile(file) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(url);
    state.originalImage = image;
    prepareDisplayImages();
    resetBoundaries();
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    alert("画像を読み込めませんでした。");
  };
  image.src = url;
}

function prepareDisplayImages() {
  const maxW = CANVAS_WIDTH - IMAGE_MARGIN * 2;
  const maxH = CANVAS_HEIGHT - IMAGE_MARGIN * 2;
  const scale = Math.min(maxW / state.originalImage.naturalWidth, maxH / state.originalImage.naturalHeight, 1);
  state.imageW = Math.max(1, Math.floor(state.originalImage.naturalWidth * scale));
  state.imageH = Math.max(1, Math.floor(state.originalImage.naturalHeight * scale));
  state.imageX = Math.floor((CANVAS_WIDTH - state.imageW) / 2);
  state.imageY = Math.floor((CANVAS_HEIGHT - state.imageH) / 2);

  state.displayCanvas = document.createElement("canvas");
  state.displayCanvas.width = state.imageW;
  state.displayCanvas.height = state.imageH;
  const displayCtx = state.displayCanvas.getContext("2d");
  displayCtx.clearRect(0, 0, state.imageW, state.imageH);
  displayCtx.drawImage(state.originalImage, 0, 0, state.imageW, state.imageH);

  const imageData = displayCtx.getImageData(0, 0, state.imageW, state.imageH);
  state.characterMask = makeCharacterMask(imageData);
  state.silhouetteCanvas = makeSilhouetteCanvas(state.characterMask);
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function makeCharacterMask(imageData) {
  const mask = new Uint8Array(state.imageW * state.imageH);
  for (let i = 0, p = 0; i < imageData.data.length; i += 4, p += 1) {
    mask[p] = imageData.data[i + 3] >= ALPHA_THRESHOLD ? 1 : 0;
  }
  return mask;
}

function makeSilhouetteCanvas(mask) {
  const output = document.createElement("canvas");
  output.width = state.imageW;
  output.height = state.imageH;
  const outputCtx = output.getContext("2d");
  const imageData = outputCtx.createImageData(state.imageW, state.imageH);
  const color = hexToRgb(state.silhouetteColor);

  for (let p = 0, i = 0; p < mask.length; p += 1, i += 4) {
    imageData.data[i] = color.r;
    imageData.data[i + 1] = color.g;
    imageData.data[i + 2] = color.b;
    imageData.data[i + 3] = mask[p] ? 255 : 0;
  }

  outputCtx.putImageData(imageData, 0, 0);
  return output;
}

function resetBoundaries() {
  state.boundaryLines = [];
  state.pendingLineStart = null;
  state.openedPanels = new Set();
  rebuildPanels();
  redraw();
}

function cancelCurrentLine() {
  state.pendingLineStart = null;
  redraw();
}

function removeLastLine() {
  if (state.pendingLineStart) {
    state.pendingLineStart = null;
  } else if (state.boundaryLines.length > 0) {
    state.boundaryLines.pop();
  }
  state.openedPanels = new Set();
  rebuildPanels();
  redraw();
}

function openAllPanels() {
  state.openedPanels = new Set(state.panelMasks.map((_, index) => index));
  redraw();
}

function closeAllPanels() {
  state.openedPanels = new Set();
  redraw();
}

function rebuildPanels() {
  if (!state.characterMask) return;

  const total = state.imageW * state.imageH;
  const walkable = new Uint8Array(state.characterMask);
  const boundaryMask = makeBoundaryMask();
  for (let i = 0; i < total; i += 1) {
    if (boundaryMask[i]) walkable[i] = 0;
  }

  const visited = new Uint8Array(total);
  const panelIds = new Uint16Array(total);
  const panels = [];
  let nextId = 1;

  for (let start = 0; start < total; start += 1) {
    if (!walkable[start] || visited[start]) continue;

    const points = [];
    const queue = [start];
    let head = 0;
    visited[start] = 1;

    while (head < queue.length) {
      const current = queue[head];
      head += 1;
      points.push(current);
      const x = current % state.imageW;
      const y = Math.floor(current / state.imageW);
      addNeighbor(queue, visited, walkable, x - 1, y);
      addNeighbor(queue, visited, walkable, x + 1, y);
      addNeighbor(queue, visited, walkable, x, y - 1);
      addNeighbor(queue, visited, walkable, x, y + 1);
    }

    if (points.length < MIN_PANEL_PIXELS) continue;

    const mask = new Uint8Array(total);
    for (const point of points) {
      mask[point] = 1;
      panelIds[point] = nextId;
    }
    panels.push(mask);
    nextId += 1;
  }

  state.panelMasks = panels;
  state.panelIds = panelIds;
  assignBoundaryPixelsToNearestPanel();
  state.openedPanels = new Set([...state.openedPanels].filter((index) => index < panels.length));
}

function assignBoundaryPixelsToNearestPanel() {
  if (!state.characterMask || !state.panelIds || state.panelMasks.length === 0) return;

  for (let y = 0; y < state.imageH; y += 1) {
    for (let x = 0; x < state.imageW; x += 1) {
      const index = y * state.imageW + x;
      if (!state.characterMask[index] || state.panelIds[index] > 0) continue;

      const nearestPanelId = nearestPanelIdAt(x, y, BOUNDARY_WIDTH + 2);
      if (nearestPanelId > 0) {
        state.panelIds[index] = nearestPanelId;
        state.panelMasks[nearestPanelId - 1][index] = 1;
      }
    }
  }
}

function nearestPanelIdAt(x, y, maxRadius) {
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= state.imageW || ny < 0 || ny >= state.imageH) continue;
        const panelId = state.panelIds[ny * state.imageW + nx];
        if (panelId > 0) return panelId;
      }
    }
  }
  return 0;
}

function addNeighbor(queue, visited, walkable, x, y) {
  if (x < 0 || x >= state.imageW || y < 0 || y >= state.imageH) return;
  const index = y * state.imageW + x;
  if (walkable[index] && !visited[index]) {
    visited[index] = 1;
    queue.push(index);
  }
}

function makeBoundaryMask() {
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = state.imageW;
  maskCanvas.height = state.imageH;
  const maskCtx = maskCanvas.getContext("2d");
  maskCtx.strokeStyle = "#ffffff";
  maskCtx.lineWidth = BOUNDARY_WIDTH;
  maskCtx.lineCap = "round";

  for (const line of state.boundaryLines) {
    maskCtx.beginPath();
    maskCtx.moveTo(line.start.x, line.start.y);
    maskCtx.lineTo(line.end.x, line.end.y);
    maskCtx.stroke();
  }

  const imageData = maskCtx.getImageData(0, 0, state.imageW, state.imageH);
  const mask = new Uint8Array(state.imageW * state.imageH);
  for (let i = 0, p = 0; i < imageData.data.length; i += 4, p += 1) {
    mask[p] = imageData.data[i + 3] > 0 ? 1 : 0;
  }
  return mask;
}

function composeRevealCanvas() {
  if (state.panelMasks.length > 0 && state.openedPanels.size === state.panelMasks.length) {
    const fullReveal = document.createElement("canvas");
    fullReveal.width = state.imageW;
    fullReveal.height = state.imageH;
    fullReveal.getContext("2d").drawImage(state.displayCanvas, 0, 0);
    return fullReveal;
  }

  const output = document.createElement("canvas");
  output.width = state.imageW;
  output.height = state.imageH;
  const outputCtx = output.getContext("2d");
  outputCtx.drawImage(state.silhouetteCanvas, 0, 0);

  const reveal = document.createElement("canvas");
  reveal.width = state.imageW;
  reveal.height = state.imageH;
  const revealCtx = reveal.getContext("2d");
  const revealData = revealCtx.createImageData(state.imageW, state.imageH);

  for (const panelIndex of state.openedPanels) {
    const mask = state.panelMasks[panelIndex];
    if (!mask) continue;
    for (let p = 0, i = 3; p < mask.length; p += 1, i += 4) {
      if (mask[p]) revealData.data[i] = 255;
    }
  }

  revealCtx.putImageData(revealData, 0, 0);
  outputCtx.drawImage(state.displayCanvas, 0, 0);
  outputCtx.globalCompositeOperation = "destination-in";
  outputCtx.drawImage(reveal, 0, 0);

  const finalCanvas = document.createElement("canvas");
  finalCanvas.width = state.imageW;
  finalCanvas.height = state.imageH;
  const finalCtx = finalCanvas.getContext("2d");
  finalCtx.drawImage(state.silhouetteCanvas, 0, 0);
  finalCtx.drawImage(output, 0, 0);
  return finalCanvas;
}

function drawBoundaryLines() {
  ctx.strokeStyle = "#42d9c8";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  for (const line of state.boundaryLines) {
    ctx.beginPath();
    ctx.moveTo(state.imageX + line.start.x, state.imageY + line.start.y);
    ctx.lineTo(state.imageX + line.end.x, state.imageY + line.end.y);
    ctx.stroke();
  }
}

function drawPendingLine() {
  if (!state.pendingLineStart) return;
  ctx.fillStyle = "#ff6b6b";
  ctx.beginPath();
  ctx.arc(state.imageX + state.pendingLineStart.x, state.imageY + state.pendingLineStart.y, 6, 0, Math.PI * 2);
  ctx.fill();
}

function getLocalPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = CANVAS_WIDTH / rect.width;
  const scaleY = CANVAS_HEIGHT / rect.height;
  const canvasX = (event.clientX - rect.left) * scaleX;
  const canvasY = (event.clientY - rect.top) * scaleY;
  const x = Math.floor(canvasX - state.imageX);
  const y = Math.floor(canvasY - state.imageY);
  if (x < 0 || x >= state.imageW || y < 0 || y >= state.imageH) return null;
  return { x, y };
}

function handleCanvasTap(event) {
  event.preventDefault();
  if (!state.displayCanvas) return;

  const point = getLocalPoint(event);
  if (!point) return;

  if (state.mode === "line") {
    handleLineTap(point);
  } else {
    const panelIndex = panelIndexAt(point.x, point.y);
    if (panelIndex !== null) state.openedPanels.add(panelIndex);
  }
  redraw();
}

function handleLineTap(point) {
  if (!state.pendingLineStart) {
    state.pendingLineStart = point;
    return;
  }

  const start = state.pendingLineStart;
  const distance = Math.abs(start.x - point.x) + Math.abs(start.y - point.y);
  if (distance > 8) {
    state.boundaryLines.push({ start, end: point });
    state.openedPanels = new Set();
    rebuildPanels();
  }
  state.pendingLineStart = null;
}

function panelIndexAt(x, y) {
  if (!state.panelIds) return null;
  const direct = state.panelIds[y * state.imageW + x];
  if (direct > 0) return direct - 1;

  for (let radius = 1; radius <= 7; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= state.imageW || ny < 0 || ny >= state.imageH) continue;
        const panelId = state.panelIds[ny * state.imageW + nx];
        if (panelId > 0) return panelId - 1;
      }
    }
  }
  return null;
}

imageInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) loadImageFromFile(file);
});

document.getElementById("resetButton").addEventListener("click", resetBoundaries);
document.getElementById("cancelLineButton").addEventListener("click", cancelCurrentLine);
document.getElementById("removeLineButton").addEventListener("click", removeLastLine);
document.getElementById("openAllButton").addEventListener("click", openAllPanels);
document.getElementById("closeAllButton").addEventListener("click", closeAllPanels);
showLinesInput.addEventListener("change", redraw);
silhouetteColorInput.addEventListener("input", () => {
  state.silhouetteColor = silhouetteColorInput.value;
  if (state.characterMask) {
    state.silhouetteCanvas = makeSilhouetteCanvas(state.characterMask);
  }
  redraw();
});

document.querySelectorAll('input[name="mode"]').forEach((input) => {
  input.addEventListener("change", () => {
    state.mode = input.value;
    updateStatus();
  });
});

canvas.addEventListener("pointerdown", handleCanvasTap);
drawEmptyState();
updateStatus();
