const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 760;
const IMAGE_MARGIN = 24;
const ALPHA_THRESHOLD = 24;
const BOUNDARY_WIDTH = 7;
const MIN_PANEL_PIXELS = 40;

const canvas = document.getElementById("mainCanvas");
const ctx = canvas.getContext("2d");
const stage = document.querySelector(".stage");
const inlineTextEditor = document.getElementById("inlineTextEditor");
const statusText = document.getElementById("statusText");
const controlsDetails = document.querySelector(".controls-details");
const imageInput = document.getElementById("imageInput");
const showLinesInput = document.getElementById("showLinesInput");
const silhouetteColorSelect = document.getElementById("silhouetteColorSelect");
const boundaryColorSelect = document.getElementById("boundaryColorSelect");
const overlayTextInput = document.getElementById("overlayTextInput");
const overlayTextColorSelect = document.getElementById("overlayTextColorSelect");
const overlayTextFontSelect = document.getElementById("overlayTextFontSelect");
const overlayTextSizeInput = document.getElementById("overlayTextSizeInput");
const addOverlayTextButton = document.getElementById("addOverlayTextButton");
const overlayImageInput = document.getElementById("overlayImageInput");
const overlayImageSizeInput = document.getElementById("overlayImageSizeInput");
const overlayList = document.getElementById("overlayList");
const overlayGroup = document.querySelector(".overlay-group");
const removeSelectedOverlayButton = document.getElementById("removeSelectedOverlayButton");

const COLOR_PALETTE = [
  { name: "黒", value: "#111820" },
  { name: "白", value: "#ffffff" },
  { name: "グレー", value: "#6b7280" },
  { name: "赤", value: "#ef4444" },
  { name: "ピンク", value: "#ec4899" },
  { name: "紫", value: "#8b5cf6" },
  { name: "青", value: "#3b82f6" },
  { name: "水色", value: "#06b6d4" },
  { name: "緑", value: "#22c55e" },
  { name: "黄緑", value: "#84cc16" },
  { name: "黄色", value: "#facc15" },
  { name: "オレンジ", value: "#f97316" },
  { name: "茶色", value: "#8b5a2b" },
  { name: "金", value: "#d4af37" },
  { name: "ミント", value: "#42d9c8" },
  { name: "紺", value: "#1e3a8a" },
  { name: "ワイン", value: "#9f1239" },
  { name: "羊皮紙", value: "#f3e5ab" },
];

const TEXT_FONTS = [
  { name: "標準", value: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  { name: "明朝", value: "'Yu Mincho', 'Hiragino Mincho ProN', serif" },
  { name: "ゴシック", value: "'Yu Gothic', 'Hiragino Kaku Gothic ProN', sans-serif" },
  { name: "丸ゴシック", value: "'Yu Gothic UI', 'Meiryo', sans-serif" },
  { name: "手書き風", value: "'Comic Sans MS', 'Yu Gothic', cursive" },
  { name: "太字見出し", value: "Impact, 'Arial Black', sans-serif" },
  { name: "ファンタジー", value: "Papyrus, 'Yu Mincho', fantasy" },
  { name: "等幅", value: "'Cascadia Mono', Consolas, monospace" },
];

const state = {
  originalImage: null,
  displayCanvas: null,
  silhouetteCanvas: null,
  characterMask: null,
  silhouetteEdgePoints: [],
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
  boundaryColor: "#42d9c8",
  overlayTextColor: "#ffffff",
  overlayTextFont: TEXT_FONTS[0].value,
  overlayTextSize: 42,
  overlayImageSize: 38,
  overlayObjects: [],
  selectedOverlayId: null,
  nextOverlayId: 1,
  dragOverlay: null,
  inlineEditing: null,
  lastOverlayTap: null,
};

function setupColorSelect(select, selectedValue) {
  for (const color of COLOR_PALETTE) {
    const option = document.createElement("option");
    option.value = color.value;
    option.textContent = `${color.name} ${color.value}`;
    if (color.value === selectedValue) option.selected = true;
    select.appendChild(option);
  }
}

function setupFontSelect(select, selectedValue) {
  for (const font of TEXT_FONTS) {
    const option = document.createElement("option");
    option.value = font.value;
    option.textContent = font.name;
    option.style.fontFamily = font.value;
    if (font.value === selectedValue) option.selected = true;
    select.appendChild(option);
  }
}

function setupResponsiveControls() {
  if (window.matchMedia("(max-width: 780px)").matches) {
    controlsDetails.open = false;
  } else {
    controlsDetails.open = true;
  }
}

function selectedOverlayObject() {
  return state.overlayObjects.find((object) => object.id === state.selectedOverlayId) || null;
}

function syncOverlayControls() {
  const selected = selectedOverlayObject();
  if (selected && selected.type === "text") {
    overlayTextInput.value = selected.text;
    overlayTextColorSelect.value = selected.color;
    overlayTextFontSelect.value = selected.font || state.overlayTextFont;
    overlayTextSizeInput.value = String(selected.size);
    addOverlayTextButton.textContent = "選択中の文字を更新";
    return;
  }
  if (selected && selected.type === "image") {
    overlayImageSizeInput.value = String(selected.size);
  }
  addOverlayTextButton.textContent = "文字を追加";
}

function updateOverlayList() {
  overlayList.innerHTML = "";

  if (state.overlayObjects.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "文字や画像を追加すると、ここに一覧が表示されます。";
    overlayList.appendChild(empty);
    return;
  }

  state.overlayObjects.forEach((object, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = object.id === state.selectedOverlayId ? "is-selected" : "";
    button.textContent = `${index + 1}. ${overlayLabel(object)}`;
    button.addEventListener("click", () => {
      state.selectedOverlayId = object.id;
      syncOverlayControls();
      updateOverlayList();
      redraw();
    });
    overlayList.appendChild(button);
  });
}

function overlayLabel(object) {
  if (object.type === "text") return `文字: ${object.text}`;
  return `画像: ${object.name}`;
}

function addTextOverlay() {
  if (!state.displayCanvas) {
    alert("先に立ち絵画像を読み込んでください。");
    return;
  }

  const text = overlayTextInput.value.trim();
  if (!text) {
    alert("追加する文字を入力してください。");
    return;
  }

  const selected = selectedOverlayObject();
  if (selected && selected.type === "text") {
    selected.text = text;
    selected.color = overlayTextColorSelect.value;
    selected.font = overlayTextFontSelect.value;
    selected.size = Number(overlayTextSizeInput.value);
    clampOverlayPosition(selected);
    updateOverlayList();
    redraw();
    return;
  }

  const object = {
    id: state.nextOverlayId,
    type: "text",
    text,
    color: overlayTextColorSelect.value,
    font: overlayTextFontSelect.value,
    size: Number(overlayTextSizeInput.value),
    x: state.imageW ? state.imageW / 2 : CANVAS_WIDTH / 2,
    y: state.imageH ? state.imageH / 2 : CANVAS_HEIGHT / 2,
  };
  state.nextOverlayId += 1;
  state.overlayObjects.push(object);
  state.selectedOverlayId = object.id;
  syncOverlayControls();
  updateOverlayList();
  redraw();
}

function addImageOverlay(image, name) {
  if (!state.displayCanvas) {
    alert("先に立ち絵画像を読み込んでください。");
    return;
  }

  const object = {
    id: state.nextOverlayId,
    type: "image",
    image,
    name,
    size: Number(overlayImageSizeInput.value),
    x: state.imageW ? state.imageW / 2 : CANVAS_WIDTH / 2,
    y: state.imageH ? state.imageH / 2 : CANVAS_HEIGHT / 2,
  };
  state.nextOverlayId += 1;
  state.overlayObjects.push(object);
  state.selectedOverlayId = object.id;
  syncOverlayControls();
  updateOverlayList();
  redraw();
}

function removeSelectedOverlay() {
  if (state.selectedOverlayId === null) return;
  state.overlayObjects = state.overlayObjects.filter((object) => object.id !== state.selectedOverlayId);
  state.selectedOverlayId = state.overlayObjects.length > 0 ? state.overlayObjects[state.overlayObjects.length - 1].id : null;
  syncOverlayControls();
  updateOverlayList();
  redraw();
}

function clearSelectedOverlay() {
  if (state.selectedOverlayId === null) return;
  state.selectedOverlayId = null;
  state.dragOverlay = null;
  syncOverlayControls();
  updateOverlayList();
  redraw();
}

function beginInlineTextEdit(object) {
  if (!object || object.type !== "text") return;

  state.inlineEditing = {
    id: object.id,
    originalText: object.text,
  };
  state.dragOverlay = null;
  state.selectedOverlayId = object.id;
  syncOverlayControls();
  updateOverlayList();
  positionInlineTextEditor(object);
  inlineTextEditor.value = object.text;
  inlineTextEditor.classList.add("is-active");
  inlineTextEditor.focus();
  inlineTextEditor.select();
  redraw();
}

function positionInlineTextEditor(object) {
  const rect = overlayObjectRect(object);
  const canvasRect = canvas.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  const scaleX = canvasRect.width / CANVAS_WIDTH;
  const scaleY = canvasRect.height / CANVAS_HEIGHT;
  const left = canvasRect.left - stageRect.left + (state.imageX + rect.x) * scaleX;
  const top = canvasRect.top - stageRect.top + (state.imageY + rect.y) * scaleY;
  const width = Math.max(90, rect.width * scaleX + 22);
  const height = Math.max(34, rect.height * scaleY + 10);

  inlineTextEditor.style.left = `${left}px`;
  inlineTextEditor.style.top = `${top}px`;
  inlineTextEditor.style.width = `${width}px`;
  inlineTextEditor.style.height = `${height}px`;
  inlineTextEditor.style.fontSize = `${Math.max(14, object.size * scaleY)}px`;
  inlineTextEditor.style.fontFamily = object.font || state.overlayTextFont;
  inlineTextEditor.style.color = object.color;
}

function commitInlineTextEdit() {
  if (!state.inlineEditing) return;

  const object = state.overlayObjects.find((item) => item.id === state.inlineEditing.id);
  const text = inlineTextEditor.value.trim();
  if (object && object.type === "text") {
    object.text = text || state.inlineEditing.originalText;
    overlayTextInput.value = object.text;
    clampOverlayPosition(object);
  }
  finishInlineTextEdit();
}

function cancelInlineTextEdit() {
  if (!state.inlineEditing) return;

  const object = state.overlayObjects.find((item) => item.id === state.inlineEditing.id);
  if (object && object.type === "text") {
    object.text = state.inlineEditing.originalText;
    overlayTextInput.value = object.text;
  }
  finishInlineTextEdit();
}

function finishInlineTextEdit() {
  state.inlineEditing = null;
  inlineTextEditor.classList.remove("is-active");
  inlineTextEditor.value = "";
  updateOverlayList();
  redraw();
}

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
    `重ね要素: ${state.overlayObjects.length}個`,
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
  drawSelectedOverlayGuide();

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
  state.silhouetteEdgePoints = makeSilhouetteEdgePoints(state.characterMask);
  state.silhouetteCanvas = makeSilhouetteCanvas(state.characterMask);
  state.overlayObjects.forEach(clampOverlayPosition);
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

function makeSilhouetteEdgePoints(mask) {
  const points = [];
  for (let y = 0; y < state.imageH; y += 1) {
    for (let x = 0; x < state.imageW; x += 1) {
      const index = y * state.imageW + x;
      if (!mask[index]) continue;
      if (isSilhouetteEdgePixel(mask, x, y)) {
        points.push({ x, y });
      }
    }
  }
  return points;
}

function isSilhouetteEdgePixel(mask, x, y) {
  const neighbors = [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ];
  return neighbors.some(([nx, ny]) => {
    if (nx < 0 || nx >= state.imageW || ny < 0 || ny >= state.imageH) return true;
    return !mask[ny * state.imageW + nx];
  });
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
  drawSilhouetteOverlay(finalCtx);
  finalCtx.drawImage(output, 0, 0);
  return finalCanvas;
}

function drawSilhouetteOverlay(targetCtx) {
  if (state.overlayObjects.length === 0) return;

  const overlay = document.createElement("canvas");
  overlay.width = state.imageW;
  overlay.height = state.imageH;
  const overlayCtx = overlay.getContext("2d");

  for (const object of state.overlayObjects) {
    if (object.type === "image") {
      const rect = overlayObjectRect(object);
      overlayCtx.drawImage(object.image, rect.x, rect.y, rect.width, rect.height);
    } else {
      const textInfo = overlayTextInfo(object);
      overlayCtx.textAlign = "center";
      overlayCtx.textBaseline = "middle";
      overlayCtx.font = `700 ${textInfo.fontSize}px ${object.font || state.overlayTextFont}`;
      overlayCtx.lineWidth = Math.max(3, Math.round(textInfo.fontSize / 10));
      overlayCtx.strokeStyle = object.color === "#ffffff" ? "rgba(0, 0, 0, 0.75)" : "rgba(255, 255, 255, 0.7)";
      overlayCtx.fillStyle = object.color;
      overlayCtx.strokeText(object.text, object.x, object.y);
      overlayCtx.fillText(object.text, object.x, object.y);
    }
  }

  overlayCtx.globalCompositeOperation = "destination-in";
  overlayCtx.drawImage(state.silhouetteCanvas, 0, 0);
  targetCtx.drawImage(overlay, 0, 0);
}

function overlayTextInfo(object) {
  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");
  const maxWidth = state.imageW * 0.9;
  let fontSize = object.size;
  measureCtx.font = `700 ${fontSize}px ${object.font || state.overlayTextFont}`;
  while (fontSize > 14 && measureCtx.measureText(object.text).width > maxWidth) {
    fontSize -= 2;
    measureCtx.font = `700 ${fontSize}px ${object.font || state.overlayTextFont}`;
  }
  const metrics = measureCtx.measureText(object.text);
  const width = Math.max(28, metrics.width);
  const height = fontSize * 1.25;
  return { fontSize, width, height };
}

function overlayObjectRect(object) {
  if (object.type === "text") {
    const info = overlayTextInfo(object);
    return {
      x: object.x - info.width / 2,
      y: object.y - info.height / 2,
      width: info.width,
      height: info.height,
    };
  }

  const maxSide = Math.min(state.imageW, state.imageH) * (object.size / 100);
  const scale = Math.min(
    maxSide / object.image.naturalWidth,
    maxSide / object.image.naturalHeight
  );
  const width = Math.max(1, Math.floor(object.image.naturalWidth * scale));
  const height = Math.max(1, Math.floor(object.image.naturalHeight * scale));
  return {
    x: object.x - width / 2,
    y: object.y - height / 2,
    width,
    height,
  };
}

function drawSelectedOverlayGuide() {
  const selected = selectedOverlayObject();
  if (!selected || !state.displayCanvas) return;

  const rect = overlayObjectRect(selected);
  ctx.save();
  ctx.strokeStyle = "#ffd166";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(state.imageX + rect.x, state.imageY + rect.y, rect.width, rect.height);
  ctx.restore();
}

function drawBoundaryLines() {
  ctx.strokeStyle = state.boundaryColor;
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

function getRawLocalPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = CANVAS_WIDTH / rect.width;
  const scaleY = CANVAS_HEIGHT / rect.height;
  const canvasX = (event.clientX - rect.left) * scaleX;
  const canvasY = (event.clientY - rect.top) * scaleY;
  return {
    x: Math.floor(canvasX - state.imageX),
    y: Math.floor(canvasY - state.imageY),
  };
}

function linePointFromEvent(event) {
  const rawPoint = getRawLocalPoint(event);
  if (!state.characterMask) return null;
  if (
    rawPoint.x >= 0 &&
    rawPoint.x < state.imageW &&
    rawPoint.y >= 0 &&
    rawPoint.y < state.imageH &&
    state.characterMask[rawPoint.y * state.imageW + rawPoint.x]
  ) {
    return rawPoint;
  }
  return nearestSilhouetteEdgePoint(rawPoint);
}

function nearestSilhouetteEdgePoint(point) {
  if (state.silhouetteEdgePoints.length === 0) return null;

  let nearest = state.silhouetteEdgePoints[0];
  let nearestDistance = Infinity;
  for (const edgePoint of state.silhouetteEdgePoints) {
    const dx = edgePoint.x - point.x;
    const dy = edgePoint.y - point.y;
    const distance = dx * dx + dy * dy;
    if (distance < nearestDistance) {
      nearest = edgePoint;
      nearestDistance = distance;
    }
  }
  return { x: nearest.x, y: nearest.y };
}

function handleCanvasTap(event) {
  event.preventDefault();
  if (!state.displayCanvas) return;

  const point = state.mode === "line" ? linePointFromEvent(event) : getLocalPoint(event);
  if (!point) {
    clearSelectedOverlay();
    return;
  }

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

function overlayObjectAt(x, y) {
  for (let i = state.overlayObjects.length - 1; i >= 0; i -= 1) {
    const object = state.overlayObjects[i];
    const rect = overlayObjectRect(object);
    const padding = object.type === "text" ? 10 : 4;
    if (
      x >= rect.x - padding &&
      x <= rect.x + rect.width + padding &&
      y >= rect.y - padding &&
      y <= rect.y + rect.height + padding
    ) {
      return object;
    }
  }
  return null;
}

function clampOverlayPosition(object) {
  const rect = overlayObjectRect(object);
  const halfW = rect.width / 2;
  const halfH = rect.height / 2;
  object.x = Math.min(Math.max(object.x, halfW), state.imageW - halfW);
  object.y = Math.min(Math.max(object.y, halfH), state.imageH - halfH);
}

function handleCanvasPointerDown(event) {
  event.preventDefault();
  if (!state.displayCanvas) return;
  if (state.inlineEditing) {
    commitInlineTextEdit();
  }

  const point = getLocalPoint(event);
  if (!point) {
    clearSelectedOverlay();
    if (state.mode === "line") handleCanvasTap(event);
    return;
  }

  const overlayObject = overlayObjectAt(point.x, point.y);
  if (overlayObject) {
    const now = Date.now();
    const isDoubleTap =
      overlayObject.type === "text" &&
      state.lastOverlayTap &&
      state.lastOverlayTap.id === overlayObject.id &&
      now - state.lastOverlayTap.time < 450;
    state.lastOverlayTap = { id: overlayObject.id, time: now };

    state.selectedOverlayId = overlayObject.id;
    syncOverlayControls();
    updateOverlayList();

    if (isDoubleTap) {
      beginInlineTextEdit(overlayObject);
      return;
    }

    state.dragOverlay = {
      id: overlayObject.id,
      offsetX: point.x - overlayObject.x,
      offsetY: point.y - overlayObject.y,
    };
    canvas.setPointerCapture(event.pointerId);
    redraw();
    return;
  }

  clearSelectedOverlay();
  handleCanvasTap(event);
}

function handleCanvasPointerMove(event) {
  if (!state.dragOverlay) return;
  event.preventDefault();

  const point = getLocalPoint(event);
  const selected = selectedOverlayObject();
  if (!point || !selected) return;

  selected.x = point.x - state.dragOverlay.offsetX;
  selected.y = point.y - state.dragOverlay.offsetY;
  clampOverlayPosition(selected);
  redraw();
}

function handleCanvasPointerUp(event) {
  if (!state.dragOverlay) return;
  state.dragOverlay = null;
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  redraw();
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

setupColorSelect(silhouetteColorSelect, state.silhouetteColor);
setupColorSelect(boundaryColorSelect, state.boundaryColor);
setupColorSelect(overlayTextColorSelect, state.overlayTextColor);
setupFontSelect(overlayTextFontSelect, state.overlayTextFont);

silhouetteColorSelect.addEventListener("change", () => {
  state.silhouetteColor = silhouetteColorSelect.value;
  if (state.characterMask) {
    state.silhouetteCanvas = makeSilhouetteCanvas(state.characterMask);
  }
  redraw();
});
boundaryColorSelect.addEventListener("change", () => {
  state.boundaryColor = boundaryColorSelect.value;
  redraw();
});
overlayTextColorSelect.addEventListener("change", () => {
  state.overlayTextColor = overlayTextColorSelect.value;
  const selected = selectedOverlayObject();
  if (selected && selected.type === "text") {
    selected.color = overlayTextColorSelect.value;
  }
  redraw();
});
overlayTextFontSelect.addEventListener("change", () => {
  state.overlayTextFont = overlayTextFontSelect.value;
  const selected = selectedOverlayObject();
  if (selected && selected.type === "text") {
    selected.font = overlayTextFontSelect.value;
    clampOverlayPosition(selected);
    if (state.inlineEditing && state.inlineEditing.id === selected.id) {
      positionInlineTextEditor(selected);
    }
  }
  redraw();
});
overlayTextInput.addEventListener("input", () => {
  const selected = selectedOverlayObject();
  if (selected && selected.type === "text") {
    selected.text = overlayTextInput.value.trim();
    updateOverlayList();
  }
  redraw();
});
overlayTextSizeInput.addEventListener("input", () => {
  state.overlayTextSize = Number(overlayTextSizeInput.value);
  const selected = selectedOverlayObject();
  if (selected && selected.type === "text") {
    selected.size = Number(overlayTextSizeInput.value);
    clampOverlayPosition(selected);
  }
  redraw();
});
overlayImageSizeInput.addEventListener("input", () => {
  state.overlayImageSize = Number(overlayImageSizeInput.value);
  const selected = selectedOverlayObject();
  if (selected && selected.type === "image") {
    selected.size = Number(overlayImageSizeInput.value);
    clampOverlayPosition(selected);
  }
  redraw();
});
addOverlayTextButton.addEventListener("click", addTextOverlay);
overlayImageInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (!file) return;

  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(url);
    addImageOverlay(image, file.name);
    overlayImageInput.value = "";
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    alert("重ねる画像を読み込めませんでした。");
  };
  image.src = url;
});
removeSelectedOverlayButton.addEventListener("click", removeSelectedOverlay);

document.querySelectorAll('input[name="mode"]').forEach((input) => {
  input.addEventListener("change", () => {
    state.mode = input.value;
    updateStatus();
  });
});

canvas.addEventListener("pointerdown", handleCanvasPointerDown);
canvas.addEventListener("pointermove", handleCanvasPointerMove);
canvas.addEventListener("pointerup", handleCanvasPointerUp);
canvas.addEventListener("pointercancel", handleCanvasPointerUp);
inlineTextEditor.addEventListener("pointerdown", (event) => {
  event.stopPropagation();
});
inlineTextEditor.addEventListener("input", () => {
  if (!state.inlineEditing) return;
  const object = state.overlayObjects.find((item) => item.id === state.inlineEditing.id);
  if (!object || object.type !== "text") return;
  object.text = inlineTextEditor.value.trim();
  overlayTextInput.value = object.text;
  updateOverlayList();
  redraw();
  positionInlineTextEditor(object);
});
inlineTextEditor.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    commitInlineTextEdit();
  }
  if (event.key === "Escape") {
    event.preventDefault();
    cancelInlineTextEdit();
  }
});
inlineTextEditor.addEventListener("blur", () => {
  commitInlineTextEdit();
});
window.addEventListener("resize", () => {
  if (!state.inlineEditing) return;
  const object = state.overlayObjects.find((item) => item.id === state.inlineEditing.id);
  if (object) positionInlineTextEditor(object);
});
overlayGroup.addEventListener("focusout", (event) => {
  const nextFocusedElement = event.relatedTarget;
  if (!nextFocusedElement || !overlayGroup.contains(nextFocusedElement)) {
    clearSelectedOverlay();
  }
});
document.addEventListener("pointerdown", (event) => {
  if (event.target === canvas || event.target === inlineTextEditor || overlayGroup.contains(event.target)) return;
  if (state.inlineEditing) {
    commitInlineTextEdit();
  }
  clearSelectedOverlay();
});
setupResponsiveControls();
updateOverlayList();
drawEmptyState();
updateStatus();
