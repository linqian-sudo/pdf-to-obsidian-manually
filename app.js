const PDF_WORKER =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const PDF_CMAPS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/";
const PDF_STANDARD_FONTS =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/";

const TYPE_META = {
  text: { label: "重要文字", short: "T", folder: "text", dot: "text-dot" },
  figure: { label: "图形", short: "F", folder: "figures", dot: "figure-dot" },
  table: { label: "表格", short: "B", folder: "tables", dot: "table-dot" },
  erase: { label: "删除区域", short: "X", folder: "", dot: "erase-dot" },
};

const state = {
  pdf: null,
  currentFile: null,
  pdfName: "",
  baseName: "PDF_Import",
  mode: "text",
  scale: 1.4,
  selections: [],
  pageCanvases: new Map(),
  pageTexts: new Map(),
  backendResult: null,
  activeSelectionId: null,
  counters: { text: 0, figure: 0, table: 0 },
};

const els = {
  pdfInput: document.querySelector("#pdfInput"),
  pdfViewer: document.querySelector("#pdfViewer"),
  documentStatus: document.querySelector("#documentStatus"),
  fileName: document.querySelector("#fileName"),
  processingStatus: document.querySelector("#processingStatus"),
  activeMode: document.querySelector("#activeMode"),
  selectionList: document.querySelector("#selectionList"),
  exportButton: document.querySelector("#exportButton"),
  clearButton: document.querySelector("#clearButton"),
  zoomIn: document.querySelector("#zoomIn"),
  zoomOut: document.querySelector("#zoomOut"),
  zoomValue: document.querySelector("#zoomValue"),
  textCount: document.querySelector("#textCount"),
  figureCount: document.querySelector("#figureCount"),
  tableCount: document.querySelector("#tableCount"),
  backendUrl: document.querySelector("#backendUrl"),
  backendParseButton: document.querySelector("#backendParseButton"),
  backendStatus: document.querySelector("#backendStatus"),
};

let renderToken = 0;

pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
lucide.createIcons();

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

els.pdfInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  await loadPdf(file);
});

els.zoomIn.addEventListener("click", () => changeZoom(0.15));
els.zoomOut.addEventListener("click", () => changeZoom(-0.15));
els.clearButton.addEventListener("click", clearSelections);
els.exportButton.addEventListener("click", exportObsidianPackage);
els.backendParseButton.addEventListener("click", parseWithBackend);
els.backendUrl.value =
  localStorage.getItem("pdfToObsidianBackendUrl") || els.backendUrl.value;
els.backendUrl.addEventListener("change", () => {
  localStorage.setItem("pdfToObsidianBackendUrl", els.backendUrl.value.trim());
});

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
  const meta = TYPE_META[mode];
  els.activeMode.innerHTML = `<span class="mode-dot ${meta.dot}"></span><span>${meta.label}</span>`;
  lucide.createIcons();
}

async function loadPdf(file) {
  renderToken += 1;
  const token = renderToken;
  resetDocumentState(file);
  setStatus("正在读取 PDF...");

  const buffer = await file.arrayBuffer();
  state.pdf = await pdfjsLib.getDocument({
    data: buffer,
    cMapUrl: PDF_CMAPS,
    cMapPacked: true,
    standardFontDataUrl: PDF_STANDARD_FONTS,
    useSystemFonts: true,
  }).promise;
  if (token !== renderToken) return;

  els.documentStatus.textContent = `${state.pdf.numPages} 页`;
  setStatus("正在生成预览...");
  await renderAllPages(token);
  setStatus("可以开始圈选");
  updateActions();
}

function resetDocumentState(file) {
  state.pdf = null;
  state.currentFile = file;
  state.pdfName = file.name;
  state.baseName = sanitizeName(file.name.replace(/\.pdf$/i, "")) || "PDF_Import";
  state.selections = [];
  state.pageCanvases.clear();
  state.pageTexts.clear();
  state.backendResult = null;
  state.activeSelectionId = null;
  state.counters = { text: 0, figure: 0, table: 0 };
  els.fileName.textContent = file.name;
  els.documentStatus.textContent = "读取中";
  els.backendStatus.textContent = "可调用 OpenDataLoader 后端自动解析";
  els.pdfViewer.innerHTML = "";
  renderSelectionList();
}

async function renderAllPages(token) {
  if (!state.pdf) return;
  els.pdfViewer.innerHTML = "";
  state.pageCanvases.clear();
  state.pageTexts.clear();
  els.zoomValue.value = `${Math.round(state.scale * 100)}%`;
  els.zoomValue.textContent = `${Math.round(state.scale * 100)}%`;

  for (let pageNumber = 1; pageNumber <= state.pdf.numPages; pageNumber += 1) {
    if (token !== renderToken) return;
    await renderPage(pageNumber);
  }

  drawAllSelections();
}

async function renderPage(pageNumber) {
  const page = await state.pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: state.scale });
  const pageWrap = document.createElement("div");
  pageWrap.className = "page-wrap";
  pageWrap.dataset.page = String(pageNumber);

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${canvas.width}px`;
  canvas.style.height = `${canvas.height}px`;

  const overlay = createSelectionLayer(canvas.width, canvas.height, pageNumber);

  pageWrap.append(canvas, overlay);
  els.pdfViewer.append(pageWrap);

  await page.render({ canvasContext: context, viewport }).promise;
  state.pageCanvases.set(pageNumber, canvas);

  const textContent = await page.getTextContent();
  const textItems = textContent.items
    .filter((item) => item.str.trim())
    .map((item) => mapTextItem(item, viewport, textContent.styles[item.fontName]));
  state.pageTexts.set(pageNumber, textItems);
}

function mapTextItem(item, viewport, style = {}) {
  const transform = pdfjsLib.Util.transform(viewport.transform, item.transform);
  const angle = Math.atan2(transform[1], transform[0]);
  const fontHeight =
    Math.abs(item.height * state.scale) ||
    Math.hypot(transform[2], transform[3]) ||
    Math.hypot(transform[0], transform[1]) ||
    10;
  const ascent = style.ascent ? fontHeight * style.ascent : fontHeight * 0.8;
  const width =
    Math.abs(item.width * state.scale) ||
    Math.max(item.str.length * fontHeight * 0.45, fontHeight);
  const horizontal = Math.abs(Math.sin(angle)) < 0.35;

  if (!horizontal) {
    const points = [
      [transform[4], transform[5]],
      [transform[4] + Math.cos(angle) * width, transform[5] + Math.sin(angle) * width],
      [transform[4] - Math.sin(angle) * fontHeight, transform[5] + Math.cos(angle) * fontHeight],
      [
        transform[4] + Math.cos(angle) * width - Math.sin(angle) * fontHeight,
        transform[5] + Math.sin(angle) * width + Math.cos(angle) * fontHeight,
      ],
    ];
    const xs = points.map((point) => point[0]);
    const ys = points.map((point) => point[1]);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return {
      text: item.str,
      x: left,
      y: top,
      width: Math.max(1, Math.max(...xs) - left),
      height: Math.max(1, Math.max(...ys) - top),
    };
  }

  return {
    text: item.str,
    x: transform[4],
    y: transform[5] - ascent,
    width,
    height: fontHeight,
  };
}

function createSelectionLayer(width, height, pageNumber) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "selection-layer");
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.dataset.page = String(pageNumber);

  let draft = null;

  svg.addEventListener("pointerdown", (event) => {
    if (!state.pdf || event.button !== 0) return;
    if (state.mode === "erase") return;
    const point = getSvgPoint(svg, event);
    draft = {
      startX: point.x,
      startY: point.y,
      rect: makeSelectionRect(state.mode, true),
    };
    svg.append(draft.rect);
    svg.setPointerCapture(event.pointerId);
  });

  svg.addEventListener("pointermove", (event) => {
    if (!draft) return;
    const point = getSvgPoint(svg, event);
    updateRectFromPoints(draft.rect, draft.startX, draft.startY, point.x, point.y);
  });

  svg.addEventListener("pointerup", (event) => {
    if (!draft) return;
    const point = getSvgPoint(svg, event);
    const region = selectionRegionFromPoints(draft.startX, draft.startY, point.x, point.y);
    draft.rect.remove();
    draft = null;

    if (region.width < 16 || region.height < 16) return;
    addSelection(pageNumber, region);
  });

  svg.addEventListener("pointercancel", () => {
    draft?.rect.remove();
    draft = null;
  });

  return svg;
}

function getSvgPoint(svg, event) {
  const rect = svg.getBoundingClientRect();
  const scaleX = Number(svg.getAttribute("width")) / rect.width;
  const scaleY = Number(svg.getAttribute("height")) / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function selectionRegionFromPoints(x1, y1, x2, y2) {
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);
  return {
    x: left,
    y: top,
    width,
    height,
    cx: left + width / 2,
    cy: top + height / 2,
    rx: width / 2,
    ry: height / 2,
  };
}

function updateRectFromPoints(rect, x1, y1, x2, y2) {
  const region = selectionRegionFromPoints(x1, y1, x2, y2);
  rect.setAttribute("x", region.x);
  rect.setAttribute("y", region.y);
  rect.setAttribute("width", region.width);
  rect.setAttribute("height", region.height);
}

function makeSelectionRect(type, isDraft = false) {
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("class", `selection-rect ${type}${isDraft ? " active" : ""}`);
  return rect;
}

function addSelection(pageNumber, region) {
  state.counters[state.mode] += 1;
  const order = state.counters[state.mode];
  const id = crypto.randomUUID();
  state.selections.push({
    id,
    type: state.mode,
    order,
    pageNumber,
    ...region,
  });
  state.activeSelectionId = id;
  drawAllSelections();
  renderSelectionList();
  updateActions();
}

function drawAllSelections() {
  document.querySelectorAll(".selection-layer").forEach((layer) => {
    layer
      .querySelectorAll(".selection-rect, .selection-ellipse, .selection-label")
      .forEach((node) => node.remove());
  });

  state.selections.forEach((selection) => {
    const layer = document.querySelector(
      `.selection-layer[data-page="${selection.pageNumber}"]`,
    );
    if (!layer) return;

    const rect = makeSelectionRect(selection.type);
    rect.dataset.id = selection.id;
    rect.setAttribute("x", selection.x);
    rect.setAttribute("y", selection.y);
    rect.setAttribute("width", selection.width);
    rect.setAttribute("height", selection.height);
    rect.classList.toggle("active", selection.id === state.activeSelectionId);
    rect.addEventListener("click", (event) => {
      event.stopPropagation();
      if (state.mode === "erase") {
        deleteSelection(selection.id);
        return;
      }
      selectRegion(selection.id);
    });

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("class", "selection-label");
    label.setAttribute("x", selection.cx);
    label.setAttribute("y", Math.max(18, selection.y + 18));
    label.setAttribute("text-anchor", "middle");
    label.textContent = selectionCode(selection);

    layer.append(rect, label);
  });
}

function renderSelectionList() {
  const counts = countByType();
  els.textCount.textContent = counts.text;
  els.figureCount.textContent = counts.figure;
  els.tableCount.textContent = counts.table;

  if (state.selections.length === 0) {
    els.selectionList.innerHTML = `<div class="list-empty">暂无圈选</div>`;
    return;
  }

  const items = [...state.selections].sort(selectionSort);
  els.selectionList.innerHTML = items
    .map((selection) => {
      const meta = TYPE_META[selection.type];
      return `
        <div class="selection-item ${selection.id === state.activeSelectionId ? "active" : ""}" data-id="${selection.id}">
          <button class="selection-badge ${selection.type}" type="button" title="${meta.label}">${selectionCode(selection)}</button>
          <div class="selection-meta">
            <strong>${meta.label}</strong>
            <span>第 ${selection.pageNumber} 页 · ${Math.round(selection.width)} × ${Math.round(selection.height)}</span>
          </div>
          <button class="delete-selection" type="button" data-delete="${selection.id}" title="删除">
            <i data-lucide="x"></i>
          </button>
        </div>
      `;
    })
    .join("");

  els.selectionList.querySelectorAll(".selection-item").forEach((item) => {
    item.addEventListener("click", () => selectRegion(item.dataset.id));
  });
  els.selectionList.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteSelection(button.dataset.delete);
    });
  });
  lucide.createIcons();
}

function selectRegion(id) {
  state.activeSelectionId = id;
  const selection = state.selections.find((item) => item.id === id);
  if (selection) {
    const page = document.querySelector(`.page-wrap[data-page="${selection.pageNumber}"]`);
    page?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  drawAllSelections();
  renderSelectionList();
}

function deleteSelection(id) {
  state.selections = state.selections.filter((selection) => selection.id !== id);
  if (state.activeSelectionId === id) state.activeSelectionId = null;
  renumberSelections();
  drawAllSelections();
  renderSelectionList();
  updateActions();
}

function clearSelections() {
  state.selections = [];
  state.activeSelectionId = null;
  state.counters = { text: 0, figure: 0, table: 0 };
  drawAllSelections();
  renderSelectionList();
  updateActions();
}

function renumberSelections() {
  state.counters = { text: 0, figure: 0, table: 0 };
  [...state.selections].sort(selectionSort).forEach((selection) => {
    state.counters[selection.type] += 1;
    selection.order = state.counters[selection.type];
  });
}

function countByType() {
  return state.selections.reduce(
    (counts, selection) => {
      counts[selection.type] += 1;
      return counts;
    },
    { text: 0, figure: 0, table: 0 },
  );
}

function selectionCode(selection) {
  return `${TYPE_META[selection.type].short}${String(selection.order).padStart(2, "0")}`;
}

function selectionSort(a, b) {
  return (
    a.pageNumber - b.pageNumber ||
    a.y - b.y ||
    a.x - b.x ||
    a.type.localeCompare(b.type)
  );
}

function changeZoom(delta) {
  if (!state.pdf) return;
  state.scale = Math.min(2.4, Math.max(0.8, Number((state.scale + delta).toFixed(2))));
  renderToken += 1;
  setStatus("正在刷新预览...");
  renderAllPages(renderToken).then(() => setStatus("可以继续圈选"));
}

function updateActions() {
  const hasPdf = Boolean(state.pdf);
  const hasSelections = state.selections.length > 0;
  els.exportButton.disabled = !hasPdf || (!hasSelections && !state.backendResult);
  els.clearButton.disabled = !hasSelections;
  els.backendParseButton.disabled = !hasPdf || !state.currentFile;
}

async function parseWithBackend() {
  if (!state.currentFile) return;

  const backendUrl = els.backendUrl.value.trim().replace(/\/+$/, "");
  if (!backendUrl) {
    els.backendStatus.textContent = "请先填写后端地址";
    return;
  }

  localStorage.setItem("pdfToObsidianBackendUrl", backendUrl);
  els.backendParseButton.disabled = true;
  els.backendStatus.textContent = "正在调用 OpenDataLoader PDF...";
  setStatus("后端正在解析整份 PDF...");

  try {
    const formData = new FormData();
    formData.append("pdf", state.currentFile, state.currentFile.name);
    formData.append("format", "markdown,json");
    formData.append("imageOutput", "embedded");
    formData.append("tableMethod", "cluster");

    const response = await fetch(`${backendUrl}/api/parse`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `后端返回 ${response.status}`);
    }

    state.backendResult = await response.json();
    const markdownLength = state.backendResult.markdown?.length || 0;
    const elementCount = Array.isArray(state.backendResult.json)
      ? state.backendResult.json.length
      : 0;
    els.backendStatus.textContent = `已解析：${markdownLength} 字符 Markdown，${elementCount} 个结构元素`;
    setStatus("OpenDataLoader 解析完成，可继续手动框选补充");
  } catch (error) {
    console.error(error);
    els.backendStatus.textContent = error.message || "后端解析失败";
    setStatus("后端解析失败，可继续手动框选");
  } finally {
    updateActions();
  }
}

async function exportObsidianPackage() {
  if (!state.pdf || state.selections.length === 0) return;

  setStatus("正在整理 Markdown 与图片...");
  const zip = new JSZip();
  const root = zip.folder(state.baseName);
  const assets = root.folder("assets");
  assets.folder("figures");
  assets.folder("tables");
  assets.folder("text");

  const ordered = [...state.selections].sort(selectionSort);
  const markdownParts = [
    "---",
    `source_pdf: ${state.pdfName}`,
    `created: ${new Date().toISOString()}`,
    "type: pdf-import",
    "---",
    "",
    `# ${state.baseName}`,
    "",
  ];

  if (state.backendResult?.markdown) {
    markdownParts.push("## OpenDataLoader PDF 自动解析");
    markdownParts.push("");
    markdownParts.push(state.backendResult.markdown.trim());
    markdownParts.push("");
    markdownParts.push("---");
    markdownParts.push("");
    markdownParts.push("## 手动框选补充");
    markdownParts.push("");
  }

  for (const selection of ordered) {
    const code = selectionCode(selection);
    const meta = TYPE_META[selection.type];
    markdownParts.push(`## ${code} ${meta.label}`);
    markdownParts.push(`page: ${selection.pageNumber}`);
    markdownParts.push("");

    if (selection.type === "text") {
      const extracted = await extractTextWithFallback(selection, code);
      if (extracted.text) {
        markdownParts.push(extracted.text);
        if (extracted.method === "ocr") {
          markdownParts.push("");
          markdownParts.push("> OCR 识别结果，请按原文复核。");
        }
      } else {
        const path = `assets/text/${code}.png`;
        root.file(path, extracted.imageBase64 || (await cropSelection(selection)), {
          base64: true,
        });
        markdownParts.push("未检测到 PDF 文本层，已保留原区域截图。");
        markdownParts.push("");
        markdownParts.push(`![[${path}]]`);
      }
    }

    if (selection.type === "figure") {
      const path = `assets/figures/${code}.png`;
      root.file(path, await cropSelection(selection), { base64: true });
      markdownParts.push(`![[${path}]]`);
    }

    if (selection.type === "table") {
      const path = `assets/tables/${code}.png`;
      root.file(path, await cropSelection(selection), { base64: true });
      markdownParts.push(`![[${path}]]`);
      markdownParts.push("");
      markdownParts.push("| 字段 | 内容 |");
      markdownParts.push("| --- | --- |");
      markdownParts.push("|  |  |");
    }

    markdownParts.push("");
  }

  root.file(`${state.baseName}.md`, markdownParts.join("\n"));
  if (state.backendResult?.json) {
    root.file(
      `${state.baseName}.opendataloader.json`,
      JSON.stringify(state.backendResult.json, null, 2),
    );
  }
  root.file(
    "manifest.json",
    JSON.stringify(
      {
        sourcePdf: state.pdfName,
        exportedAt: new Date().toISOString(),
        selections: ordered.map(({ id, ...selection }) => selection),
      },
      null,
      2,
    ),
  );

  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, `${state.baseName}-obsidian.zip`);
  setStatus("导出完成");
}

function extractText(selection) {
  const items = state.pageTexts.get(selection.pageNumber) || [];
  const picked = items.filter((item) => rectanglesOverlap(item, selection, 12));

  if (picked.length === 0) return "";

  picked.sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  let currentLine = [];
  let currentY = null;

  picked.forEach((item) => {
    if (currentY === null || Math.abs(item.y - currentY) <= 8) {
      currentLine.push(item);
      currentY = currentY === null ? item.y : (currentY + item.y) / 2;
      return;
    }
    lines.push(currentLine);
    currentLine = [item];
    currentY = item.y;
  });

  if (currentLine.length) lines.push(currentLine);

  return lines
    .map((line) => joinTextLine(line.sort((a, b) => a.x - b.x)))
    .filter(Boolean)
    .join("\n");
}

async function extractTextWithFallback(selection, code) {
  const pdfText = extractText(selection);
  if (pdfText) {
    return { text: pdfText, method: "pdf", imageBase64: null };
  }

  const imageBase64 = await cropSelection(selection);
  const ocrText = await recognizeText(imageBase64, code);
  return {
    text: ocrText,
    method: ocrText ? "ocr" : "image",
    imageBase64,
  };
}

async function recognizeText(imageBase64, code) {
  if (!window.Tesseract?.recognize) return "";

  try {
    setStatus(`正在 OCR 识别 ${code}...`);
    const result = await window.Tesseract.recognize(
      `data:image/png;base64,${imageBase64}`,
      "chi_sim+eng",
    );
    return result.data.text
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } catch (error) {
    console.warn("OCR failed", error);
    return "";
  }
}

function joinTextLine(line) {
  let output = "";
  let previous = null;

  line.forEach((item) => {
    const text = item.text.trim();
    if (!text) return;

    if (previous) {
      const gap = item.x - (previous.x + previous.width);
      const needsSpace =
        gap > Math.max(3, Math.min(item.height, previous.height) * 0.25) &&
        /[A-Za-z0-9)]$/.test(previous.text.trim()) &&
        /^[A-Za-z0-9(]/.test(text);
      if (needsSpace) output += " ";
    }

    output += text;
    previous = item;
  });

  return output.replace(/\s+/g, " ").trim();
}

function rectanglesOverlap(a, b, padding = 0) {
  return !(
    a.x + a.width < b.x - padding ||
    a.x > b.x + b.width + padding ||
    a.y + a.height < b.y - padding ||
    a.y > b.y + b.height + padding
  );
}

function cropSelection(selection) {
  const source = state.pageCanvases.get(selection.pageNumber);
  const padding = 4;
  const sx = Math.max(0, Math.floor(selection.x - padding));
  const sy = Math.max(0, Math.floor(selection.y - padding));
  const sw = Math.min(source.width - sx, Math.ceil(selection.width + padding * 2));
  const sh = Math.min(source.height - sy, Math.ceil(selection.height + padding * 2));

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, sw, sh);
  context.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.readAsDataURL(blob);
    }, "image/png");
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function sanitizeName(name) {
  return name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function setStatus(message) {
  els.processingStatus.textContent = message;
}
