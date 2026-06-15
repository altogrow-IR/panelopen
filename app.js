const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 760;
const IMAGE_MARGIN = 24;
const ALPHA_THRESHOLD = 24;
const BOUNDARY_WIDTH = 7;
const MIN_PANEL_PIXELS = 40;
const PROJECT_FILE_VERSION = 1;
const AUTOSAVE_DB_NAME = "panel-opener-autosave";
const AUTOSAVE_STORE_NAME = "projects";
const AUTOSAVE_KEY = "latest";

const canvas = document.getElementById("mainCanvas");
const ctx = canvas.getContext("2d");
const stage = document.querySelector(".stage");
const inlineTextEditor = document.getElementById("inlineTextEditor");
const statusText = document.getElementById("statusText");
const controlsDetails = document.querySelector(".controls-details");
const imageInput = document.getElementById("imageInput");
const importProjectInput = document.getElementById("importProjectInput");
const exportProjectButton = document.getElementById("exportProjectButton");
const undoButton = document.getElementById("undoButton");
const showLinesInput = document.getElementById("showLinesInput");
const silhouetteColorSelect = document.getElementById("silhouetteColorSelect");
const boundaryColorSelect = document.getElementById("boundaryColorSelect");
const backgroundColorSelect = document.getElementById("backgroundColorSelect");
const backgroundImageInput = document.getElementById("backgroundImageInput");
const clearBackgroundImageButton = document.getElementById("clearBackgroundImageButton");
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
const saveImagePanel = document.getElementById("saveImagePanel");
const saveImagePreview = document.getElementById("saveImagePreview");
const closeSaveImagePanelButton = document.getElementById("closeSaveImagePanelButton");

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
  originalImageDataUrl: "",
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
  backgroundColor: "#ffffff",
  backgroundImage: null,
  backgroundImageDataUrl: "",
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
  longPressTimer: null,
  autosaveTimer: null,
  restoringProject: false,
  undoSnapshot: null,
  overlayInputUndoCaptured: false,
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

function openAutosaveDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(AUTOSAVE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(AUTOSAVE_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("自動保存データベースを開けませんでした。"));
  });
}

async function saveAutosaveProject() {
  if (!state.originalImageDataUrl || state.restoringProject) return;

  const db = await openAutosaveDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(AUTOSAVE_STORE_NAME, "readwrite");
    transaction.objectStore(AUTOSAVE_STORE_NAME).put(buildProjectData(), AUTOSAVE_KEY);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("自動保存に失敗しました。"));
  });
  db.close();
}

function scheduleAutosave() {
  if (!state.originalImageDataUrl || state.restoringProject) return;
  if (state.autosaveTimer) window.clearTimeout(state.autosaveTimer);
  state.autosaveTimer = window.setTimeout(() => {
    state.autosaveTimer = null;
    saveAutosaveProject().catch((error) => {
      console.warn(error);
    });
  }, 800);
}

async function loadAutosaveProject() {
  const db = await openAutosaveDb();
  const project = await new Promise((resolve, reject) => {
    const transaction = db.transaction(AUTOSAVE_STORE_NAME, "readonly");
    const request = transaction.objectStore(AUTOSAVE_STORE_NAME).get(AUTOSAVE_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("自動保存データを読み込めませんでした。"));
  });
  db.close();
  return project;
}

async function restoreAutosaveOnStartup() {
  try {
    const project = await loadAutosaveProject();
    if (!project) return;
    if (!confirm("前回の自動保存データがあります。復元しますか？")) return;
    await applyProjectData(project, { confirmReplace: false });
  } catch (error) {
    console.warn(error);
  }
}

function drawBackground(targetCtx, width = CANVAS_WIDTH, height = CANVAS_HEIGHT) {
  targetCtx.fillStyle = state.backgroundColor;
  targetCtx.fillRect(0, 0, width, height);

  if (!state.backgroundImage) return;

  const scale = Math.max(width / state.backgroundImage.naturalWidth, height / state.backgroundImage.naturalHeight);
  const imageW = state.backgroundImage.naturalWidth * scale;
  const imageH = state.backgroundImage.naturalHeight * scale;
  const x = (width - imageW) / 2;
  const y = (height - imageH) / 2;
  targetCtx.drawImage(state.backgroundImage, x, y, imageW, imageH);
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
    alert("先に立ち絵/一枚絵画像を読み込んでください。");
    return;
  }

  const text = overlayTextInput.value.trim();
  if (!text) {
    alert("追加する文字を入力してください。");
    return;
  }

  const selected = selectedOverlayObject();
  if (selected && selected.type === "text") {
    captureUndoSnapshot();
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
    x: CANVAS_WIDTH / 2,
    y: CANVAS_HEIGHT / 2,
  };
  captureUndoSnapshot();
  state.nextOverlayId += 1;
  state.overlayObjects.push(object);
  state.selectedOverlayId = object.id;
  syncOverlayControls();
  updateOverlayList();
  redraw();
}

function addImageOverlay(image, name, dataUrl) {
  if (!state.displayCanvas) {
    alert("先に立ち絵/一枚絵画像を読み込んでください。");
    return;
  }

  const object = {
    id: state.nextOverlayId,
    type: "image",
    image,
    name,
    dataUrl,
    size: Number(overlayImageSizeInput.value),
    x: CANVAS_WIDTH / 2,
    y: CANVAS_HEIGHT / 2,
  };
  captureUndoSnapshot();
  state.nextOverlayId += 1;
  state.overlayObjects.push(object);
  state.selectedOverlayId = object.id;
  syncOverlayControls();
  updateOverlayList();
  redraw();
}

function removeSelectedOverlay() {
  if (state.selectedOverlayId === null) return;
  captureUndoSnapshot();
  state.overlayObjects = state.overlayObjects.filter((object) => object.id !== state.selectedOverlayId);
  state.selectedOverlayId = state.overlayObjects.length > 0 ? state.overlayObjects[state.overlayObjects.length - 1].id : null;
  syncOverlayControls();
  updateOverlayList();
  redraw();
}

function serializeOverlayObject(object) {
  if (object.type === "text") {
    return {
      id: object.id,
      type: "text",
      text: object.text,
      color: object.color,
      font: object.font || state.overlayTextFont,
      size: object.size,
      x: object.x,
      y: object.y,
    };
  }

  return {
    id: object.id,
    type: "image",
    name: object.name,
    dataUrl: object.dataUrl,
    size: object.size,
    x: object.x,
    y: object.y,
  };
}

function buildProjectData() {
  return {
    app: "web-panel-opener",
    version: PROJECT_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    canvas: {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
    },
    originalImage: {
      dataUrl: state.originalImageDataUrl,
    },
    settings: {
      showLines: showLinesInput.checked,
      backgroundColor: state.backgroundColor,
      backgroundImageDataUrl: state.backgroundImageDataUrl,
      silhouetteColor: state.silhouetteColor,
      boundaryColor: state.boundaryColor,
      overlayTextColor: state.overlayTextColor,
      overlayTextFont: state.overlayTextFont,
      overlayTextSize: state.overlayTextSize,
      overlayImageSize: state.overlayImageSize,
      mode: state.mode,
    },
    boundaryLines: state.boundaryLines,
    openedPanels: [...state.openedPanels],
    overlayCoordinateSpace: "canvas",
    overlayObjects: state.overlayObjects.map(serializeOverlayObject),
    nextOverlayId: state.nextOverlayId,
  };
}

function cloneProjectData(project) {
  return JSON.parse(JSON.stringify(project));
}

function updateUndoButton() {
  undoButton.disabled = !state.undoSnapshot;
}

function captureUndoSnapshot() {
  if (!state.originalImageDataUrl || state.restoringProject) return;
  state.undoSnapshot = cloneProjectData(buildProjectData());
  updateUndoButton();
}

async function undoLastOperation() {
  if (!state.undoSnapshot) return;

  const snapshot = state.undoSnapshot;
  await applyProjectData(snapshot, {
    confirmReplace: false,
    saveUndo: false,
  });
  state.undoSnapshot = null;
  updateUndoButton();
}

function exportProject() {
  if (!state.originalImageDataUrl) {
    alert("先に立ち絵/一枚絵画像を読み込んでください。");
    return;
  }

  if (state.inlineEditing) {
    commitInlineTextEdit();
  }

  const json = JSON.stringify(buildProjectData(), null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  link.href = url;
  link.download = `panel-opener-project-${date}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function applyImportedSettings(settings = {}) {
  state.backgroundColor = settings.backgroundColor || "#ffffff";
  state.backgroundImageDataUrl = settings.backgroundImageDataUrl || "";
  state.silhouetteColor = settings.silhouetteColor || "#111820";
  state.boundaryColor = settings.boundaryColor || "#42d9c8";
  state.overlayTextColor = settings.overlayTextColor || "#ffffff";
  state.overlayTextFont = settings.overlayTextFont || TEXT_FONTS[0].value;
  state.overlayTextSize = Number(settings.overlayTextSize || 42);
  state.overlayImageSize = Number(settings.overlayImageSize || 38);
  state.mode = settings.mode === "line" ? "line" : "open";

  backgroundColorSelect.value = state.backgroundColor;
  silhouetteColorSelect.value = state.silhouetteColor;
  boundaryColorSelect.value = state.boundaryColor;
  overlayTextColorSelect.value = state.overlayTextColor;
  overlayTextFontSelect.value = state.overlayTextFont;
  overlayTextSizeInput.value = String(state.overlayTextSize);
  overlayImageSizeInput.value = String(state.overlayImageSize);
  showLinesInput.checked = settings.showLines !== false;

  document.querySelectorAll('input[name="mode"]').forEach((input) => {
    input.checked = input.value === state.mode;
  });
}

async function applyImportedBackground() {
  if (!state.backgroundImageDataUrl) {
    state.backgroundImage = null;
    return;
  }

  state.backgroundImage = await loadImageElement(state.backgroundImageDataUrl);
}

function numberOrFallback(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sanitizeBoundaryLines(lines) {
  if (!Array.isArray(lines)) return [];
  return lines
    .map((line) => ({
      start: {
        x: numberOrFallback(line?.start?.x, 0),
        y: numberOrFallback(line?.start?.y, 0),
      },
      end: {
        x: numberOrFallback(line?.end?.x, 0),
        y: numberOrFallback(line?.end?.y, 0),
      },
    }))
    .filter((line) => {
      return (
        line.start.x >= 0 &&
        line.start.x < state.imageW &&
        line.start.y >= 0 &&
        line.start.y < state.imageH &&
        line.end.x >= 0 &&
        line.end.x < state.imageW &&
        line.end.y >= 0 &&
        line.end.y < state.imageH
      );
    });
}

async function deserializeOverlayObject(object, coordinateSpace = "image") {
  if (!object || typeof object !== "object") return null;
  const offsetX = coordinateSpace === "canvas" ? 0 : state.imageX;
  const offsetY = coordinateSpace === "canvas" ? 0 : state.imageY;

  if (object.type === "text") {
    return {
      id: Number(object.id) || state.nextOverlayId,
      type: "text",
      text: String(object.text || ""),
      color: object.color || state.overlayTextColor,
      font: object.font || state.overlayTextFont,
      size: Number(object.size || state.overlayTextSize),
      x: numberOrFallback(object.x, state.imageW / 2) + offsetX,
      y: numberOrFallback(object.y, state.imageH / 2) + offsetY,
    };
  }

  if (object.type === "image") {
    const image = await loadImageElement(object.dataUrl);
    return {
      id: Number(object.id) || state.nextOverlayId,
      type: "image",
      image,
      name: String(object.name || "image"),
      dataUrl: object.dataUrl,
      size: Number(object.size || state.overlayImageSize),
      x: numberOrFallback(object.x, state.imageW / 2) + offsetX,
      y: numberOrFallback(object.y, state.imageH / 2) + offsetY,
    };
  }

  return null;
}

async function importProjectFromFile(file) {
  try {
    const text = await readFileAsText(file);
    const project = JSON.parse(text);
    await applyProjectData(project, { confirmReplace: true });
  } catch (error) {
    alert(error.message || "設定ファイルを読み込めませんでした。");
  }
}

async function applyProjectData(project, options = {}) {
  const shouldConfirm = options.confirmReplace !== false;
  if (shouldConfirm && state.displayCanvas && !confirm("現在の設定を置き換えてインポートします。続行しますか？")) {
    return;
  }

  if (!project || project.app !== "web-panel-opener" || !project.originalImage?.dataUrl) {
    throw new Error("対応していない設定ファイルです。");
  }

  if (options.saveUndo !== false) {
    captureUndoSnapshot();
  }

  state.restoringProject = true;
  try {
    const originalImage = await loadImageElement(project.originalImage.dataUrl);
    state.originalImage = originalImage;
    state.originalImageDataUrl = project.originalImage.dataUrl;
    applyImportedSettings(project.settings);
    await applyImportedBackground();
    prepareDisplayImages();

    state.boundaryLines = sanitizeBoundaryLines(project.boundaryLines);
    state.pendingLineStart = null;
    state.selectedOverlayId = null;
    state.dragOverlay = null;
    state.inlineEditing = null;
    state.openedPanels = new Set();
    state.overlayObjects = [];
    state.nextOverlayId = Number(project.nextOverlayId || 1);

    const importedObjects = [];
    const sourceObjects = Array.isArray(project.overlayObjects) ? project.overlayObjects : [];
    const coordinateSpace = project.overlayCoordinateSpace === "canvas" ? "canvas" : "image";
    for (const object of sourceObjects) {
      const imported = await deserializeOverlayObject(object, coordinateSpace);
      if (imported) importedObjects.push(imported);
    }
    state.overlayObjects = importedObjects;
    const maxOverlayId = importedObjects.reduce((max, object) => Math.max(max, object.id), 0);
    state.nextOverlayId = Math.max(state.nextOverlayId, maxOverlayId + 1);
    state.overlayObjects.forEach(clampOverlayPosition);

    rebuildPanels();
    const openedPanels = Array.isArray(project.openedPanels) ? project.openedPanels : [];
    state.openedPanels = new Set(openedPanels.filter((index) => Number.isInteger(index) && index >= 0 && index < state.panelMasks.length));
    syncOverlayControls();
    updateOverlayList();
    redraw();
  } finally {
    state.restoringProject = false;
    scheduleAutosave();
  }
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
    undoSnapshot: state.originalImageDataUrl ? cloneProjectData(buildProjectData()) : null,
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
  const left = canvasRect.left - stageRect.left + rect.x * scaleX;
  const top = canvasRect.top - stageRect.top + rect.y * scaleY;
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
    if (text && text !== state.inlineEditing.originalText && state.inlineEditing.undoSnapshot) {
      state.undoSnapshot = state.inlineEditing.undoSnapshot;
      updateUndoButton();
    }
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
  state.overlayInputUndoCaptured = false;
  inlineTextEditor.classList.remove("is-active");
  inlineTextEditor.value = "";
  updateOverlayList();
  redraw();
}

function drawEmptyState() {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  drawBackground(ctx);
  ctx.fillStyle = "#60717b";
  ctx.font = "700 18px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("立ち絵/一枚絵画像を読み込んでください。", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
}

function updateStatus() {
  if (!state.displayCanvas) {
    statusText.textContent = "立ち絵/一枚絵画像を読み込んでください。";
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
  drawBackground(ctx);

  if (!state.displayCanvas) {
    drawEmptyState();
    updateStatus();
    return;
  }

  const composed = composeRevealCanvas();
  ctx.drawImage(composed, state.imageX, state.imageY);
  drawOverlayObjects(ctx);

  if (showLinesInput.checked) {
    drawBoundaryLines();
  }
  drawPendingLine();
  drawSelectedOverlayGuide();

  updateStatus();
  scheduleAutosave();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("ファイルを読み込めませんでした。"));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("ファイルを読み込めませんでした。"));
    reader.readAsText(file, "utf-8");
  });
}

function loadImageElement(dataUrl) {
  return new Promise((resolve, reject) => {
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
      reject(new Error("画像データの形式が正しくありません。"));
      return;
    }

    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("画像を読み込めませんでした。"));
    image.src = dataUrl;
  });
}

async function loadImageFromFile(file) {
  try {
    const dataUrl = await readFileAsDataUrl(file);
    const image = await loadImageElement(dataUrl);
    captureUndoSnapshot();
    state.originalImage = image;
    state.originalImageDataUrl = dataUrl;
    prepareDisplayImages();
    resetBoundaries();
  } catch (error) {
    alert(error.message || "画像を読み込めませんでした。");
  }
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
  captureUndoSnapshot();
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
  if (state.pendingLineStart || state.boundaryLines.length > 0) captureUndoSnapshot();
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
  captureUndoSnapshot();
  state.openedPanels = new Set(state.panelMasks.map((_, index) => index));
  redraw();
}

function closeAllPanels() {
  captureUndoSnapshot();
  state.openedPanels = new Set();
  redraw();
}

function showSaveImagePreview() {
  if (state.inlineEditing) {
    commitInlineTextEdit();
  }
  redraw();
  saveImagePreview.src = canvas.toDataURL("image/png");
  saveImagePanel.hidden = false;
}

function startLongPressTimer() {
  clearLongPressTimer();
  state.longPressTimer = window.setTimeout(() => {
    state.longPressTimer = null;
    showSaveImagePreview();
  }, 700);
}

function clearLongPressTimer() {
  if (!state.longPressTimer) return;
  window.clearTimeout(state.longPressTimer);
  state.longPressTimer = null;
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
    drawLocalBackground(fullReveal.getContext("2d"));
    fullReveal.getContext("2d").drawImage(state.displayCanvas, 0, 0);
    return fullReveal;
  }

  const output = document.createElement("canvas");
  output.width = state.imageW;
  output.height = state.imageH;
  const outputCtx = output.getContext("2d");
  drawLocalBackground(outputCtx);
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
  drawLocalBackground(finalCtx);
  finalCtx.drawImage(state.silhouetteCanvas, 0, 0);
  finalCtx.drawImage(output, 0, 0);
  return finalCanvas;
}

function drawLocalBackground(targetCtx) {
  targetCtx.fillStyle = state.backgroundColor;
  targetCtx.fillRect(0, 0, state.imageW, state.imageH);

  if (!state.backgroundImage) return;

  const scale = Math.max(CANVAS_WIDTH / state.backgroundImage.naturalWidth, CANVAS_HEIGHT / state.backgroundImage.naturalHeight);
  const imageW = state.backgroundImage.naturalWidth * scale;
  const imageH = state.backgroundImage.naturalHeight * scale;
  const x = (CANVAS_WIDTH - imageW) / 2 - state.imageX;
  const y = (CANVAS_HEIGHT - imageH) / 2 - state.imageY;
  targetCtx.drawImage(state.backgroundImage, x, y, imageW, imageH);
}

function drawOverlayObjects(targetCtx) {
  if (state.overlayObjects.length === 0) return;

  const overlay = document.createElement("canvas");
  overlay.width = CANVAS_WIDTH;
  overlay.height = CANVAS_HEIGHT;
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

  targetCtx.drawImage(overlay, 0, 0);
}

function overlayTextInfo(object) {
  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");
  const maxWidth = CANVAS_WIDTH * 0.9;
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

  const maxSide = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT) * (object.size / 100);
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
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
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

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = CANVAS_WIDTH / rect.width;
  const scaleY = CANVAS_HEIGHT / rect.height;
  const x = Math.floor((event.clientX - rect.left) * scaleX);
  const y = Math.floor((event.clientY - rect.top) * scaleY);
  if (x < 0 || x >= CANVAS_WIDTH || y < 0 || y >= CANVAS_HEIGHT) return null;
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
    if (panelIndex !== null && !state.openedPanels.has(panelIndex)) {
      captureUndoSnapshot();
      state.openedPanels.add(panelIndex);
    }
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
    captureUndoSnapshot();
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
  object.x = Math.min(Math.max(object.x, halfW), CANVAS_WIDTH - halfW);
  object.y = Math.min(Math.max(object.y, halfH), CANVAS_HEIGHT - halfH);
}

function handleCanvasPointerDown(event) {
  event.preventDefault();
  if (!state.displayCanvas) return;
  if (state.inlineEditing) {
    commitInlineTextEdit();
  }

  const canvasPoint = getCanvasPoint(event);
  if (!canvasPoint) {
    clearSelectedOverlay();
    if (state.mode === "line") handleCanvasTap(event);
    return;
  }

  const overlayObject = overlayObjectAt(canvasPoint.x, canvasPoint.y);
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
      offsetX: canvasPoint.x - overlayObject.x,
      offsetY: canvasPoint.y - overlayObject.y,
      startX: overlayObject.x,
      startY: overlayObject.y,
      undoCaptured: false,
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

  const point = getCanvasPoint(event);
  const selected = selectedOverlayObject();
  if (!point || !selected) return;

  const nextX = point.x - state.dragOverlay.offsetX;
  const nextY = point.y - state.dragOverlay.offsetY;
  if (
    !state.dragOverlay.undoCaptured &&
    (Math.abs(nextX - state.dragOverlay.startX) > 1 || Math.abs(nextY - state.dragOverlay.startY) > 1)
  ) {
    captureUndoSnapshot();
    state.dragOverlay.undoCaptured = true;
  }

  selected.x = nextX;
  selected.y = nextY;
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
undoButton.addEventListener("click", () => {
  undoLastOperation().catch((error) => {
    alert(error.message || "1つ前の状態に戻せませんでした。");
  });
});
showLinesInput.addEventListener("change", () => {
  const nextChecked = showLinesInput.checked;
  showLinesInput.checked = !nextChecked;
  captureUndoSnapshot();
  showLinesInput.checked = nextChecked;
  redraw();
});

setupColorSelect(silhouetteColorSelect, state.silhouetteColor);
setupColorSelect(boundaryColorSelect, state.boundaryColor);
setupColorSelect(backgroundColorSelect, state.backgroundColor);
setupColorSelect(overlayTextColorSelect, state.overlayTextColor);
setupFontSelect(overlayTextFontSelect, state.overlayTextFont);

backgroundColorSelect.addEventListener("change", () => {
  captureUndoSnapshot();
  state.backgroundColor = backgroundColorSelect.value;
  redraw();
});
backgroundImageInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (!file) return;

  readFileAsDataUrl(file)
    .then((dataUrl) => Promise.all([loadImageElement(dataUrl), Promise.resolve(dataUrl)]))
    .then(([image, dataUrl]) => {
      captureUndoSnapshot();
      state.backgroundImage = image;
      state.backgroundImageDataUrl = dataUrl;
      backgroundImageInput.value = "";
      redraw();
    })
    .catch((error) => {
      alert(error.message || "背景画像を読み込めませんでした。");
      backgroundImageInput.value = "";
    });
});
clearBackgroundImageButton.addEventListener("click", () => {
  if (state.backgroundImageDataUrl) captureUndoSnapshot();
  state.backgroundImage = null;
  state.backgroundImageDataUrl = "";
  backgroundImageInput.value = "";
  redraw();
});
silhouetteColorSelect.addEventListener("change", () => {
  captureUndoSnapshot();
  state.silhouetteColor = silhouetteColorSelect.value;
  if (state.characterMask) {
    state.silhouetteCanvas = makeSilhouetteCanvas(state.characterMask);
  }
  redraw();
});
boundaryColorSelect.addEventListener("change", () => {
  captureUndoSnapshot();
  state.boundaryColor = boundaryColorSelect.value;
  redraw();
});
overlayTextColorSelect.addEventListener("change", () => {
  captureUndoSnapshot();
  state.overlayTextColor = overlayTextColorSelect.value;
  const selected = selectedOverlayObject();
  if (selected && selected.type === "text") {
    selected.color = overlayTextColorSelect.value;
  }
  redraw();
});
overlayTextFontSelect.addEventListener("change", () => {
  captureUndoSnapshot();
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
    if (!state.overlayInputUndoCaptured) {
      captureUndoSnapshot();
      state.overlayInputUndoCaptured = true;
    }
    selected.text = overlayTextInput.value.trim();
    updateOverlayList();
  }
  redraw();
});
overlayTextInput.addEventListener("focus", () => {
  state.overlayInputUndoCaptured = false;
});
overlayTextInput.addEventListener("blur", () => {
  state.overlayInputUndoCaptured = false;
});
overlayTextSizeInput.addEventListener("input", () => {
  captureUndoSnapshot();
  state.overlayTextSize = Number(overlayTextSizeInput.value);
  const selected = selectedOverlayObject();
  if (selected && selected.type === "text") {
    selected.size = Number(overlayTextSizeInput.value);
    clampOverlayPosition(selected);
  }
  redraw();
});
overlayImageSizeInput.addEventListener("input", () => {
  captureUndoSnapshot();
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

  readFileAsDataUrl(file)
    .then((dataUrl) => Promise.all([loadImageElement(dataUrl), Promise.resolve(dataUrl)]))
    .then(([image, dataUrl]) => {
      addImageOverlay(image, file.name, dataUrl);
      overlayImageInput.value = "";
    })
    .catch((error) => {
      alert(error.message || "重ねる画像を読み込めませんでした。");
      overlayImageInput.value = "";
    });
});
exportProjectButton.addEventListener("click", exportProject);
importProjectInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) {
    importProjectFromFile(file).finally(() => {
      importProjectInput.value = "";
    });
  }
});
removeSelectedOverlayButton.addEventListener("click", removeSelectedOverlay);

document.querySelectorAll('input[name="mode"]').forEach((input) => {
  input.addEventListener("change", () => {
    captureUndoSnapshot();
    state.mode = input.value;
    updateStatus();
  });
});

canvas.addEventListener("pointerdown", handleCanvasPointerDown);
canvas.addEventListener("touchstart", startLongPressTimer, { passive: true });
canvas.addEventListener("touchend", clearLongPressTimer);
canvas.addEventListener("touchmove", clearLongPressTimer);
canvas.addEventListener("touchcancel", clearLongPressTimer);
canvas.addEventListener("pointermove", handleCanvasPointerMove);
canvas.addEventListener("pointerup", handleCanvasPointerUp);
canvas.addEventListener("pointercancel", handleCanvasPointerUp);
inlineTextEditor.addEventListener("pointerdown", (event) => {
  event.stopPropagation();
});
closeSaveImagePanelButton.addEventListener("click", () => {
  saveImagePanel.hidden = true;
  saveImagePreview.removeAttribute("src");
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
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    saveAutosaveProject().catch((error) => console.warn(error));
  }
});
window.addEventListener("pagehide", () => {
  saveAutosaveProject().catch((error) => console.warn(error));
});
setupResponsiveControls();
updateUndoButton();
updateOverlayList();
drawEmptyState();
updateStatus();
restoreAutosaveOnStartup();
