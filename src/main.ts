import {
  type SubjectCadence,
  type SubjectConfig,
  type SubjectTheme,
  validateSubjectConfig,
} from "./subject-schema";

type SubjectManifestEntry = {
  id: string;
  path: string;
};

type SubjectRecord = {
  id: string;
  path: string;
  config: SubjectConfig;
};

type BingoState = {
  subjectId: string;
  periodKey: string;
  entries: BingoEntry[];
  normalizedName: string;
  rawName: string;
  selectedIds: Set<string>;
};

type BingoEntry = {
  id: string;
  text: string;
};

type BingoSummary = {
  count: number;
  winningIds: Set<string>;
};

type ThemeMode = "light" | "dark";

type UiRefs = {
  form: HTMLFormElement;
  nameInput: HTMLInputElement;
  heroTitle: HTMLElement;
  heroSubtitle: HTMLElement;
  subjectMeta: HTMLElement;
  seedLabel: HTMLElement;
  seedHint: HTMLElement;
  dateLabel: HTMLElement;
  cardTitle: HTMLElement;
  helperText: HTMLElement;
  markedCount: HTMLElement;
  bingoCount: HTMLElement;
  board: HTMLDivElement;
  clearProgressButton: HTMLButtonElement;
  downloadImageButton: HTMLButtonElement;
  copyImageButton: HTMLButtonElement;
  subjectButtons: HTMLButtonElement[];
};

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app container.");
}

const STORAGE_PREFIX = "wingo-bingo";
const DEFAULT_SUBTITLE = "A configurable bingo board for the class";
const MANIFEST_URL = new URL("./subjects/index.json", import.meta.url).toString();
const THEME_VARIABLES = [
  { key: "bg", cssVariable: "--bg" },
  { key: "bgAccent", cssVariable: "--bg-accent" },
  { key: "panel", cssVariable: "--panel" },
  { key: "panelStrong", cssVariable: "--panel-strong" },
  { key: "text", cssVariable: "--text" },
  { key: "muted", cssVariable: "--muted" },
  { key: "primary", cssVariable: "--primary" },
  { key: "primaryStrong", cssVariable: "--primary-strong" },
  { key: "accent", cssVariable: "--accent" },
  { key: "border", cssVariable: "--border" },
  { key: "shadow", cssVariable: "--shadow" },
  { key: "selectedBorder", cssVariable: "--selected-border" },
  { key: "selectedTop", cssVariable: "--selected-top" },
  { key: "selectedBottom", cssVariable: "--selected-bottom" },
  { key: "winningBorder", cssVariable: "--winning-border" },
  { key: "winningTop", cssVariable: "--winning-top" },
  { key: "winningBottom", cssVariable: "--winning-bottom" },
] as const;

let subjects: SubjectRecord[] = [];
let subjectMap = new Map<string, SubjectRecord>();
let activeSubjectId = "";
let currentState: BingoState | null = null;
let resizeFrame = 0;
let ui: UiRefs | null = null;

const themeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

renderLoadingState();
void init();

async function init(): Promise<void> {
  try {
    subjects = await loadSubjects();
    subjectMap = new Map(subjects.map((subject) => [subject.id, subject]));

    if (subjects.length === 0) {
      throw new Error("No subject JSON files were found.");
    }

    activeSubjectId = loadLastSubjectId(subjects[0].id);
    renderShell();
    ui = getUiRefs();
    wireEvents();
    applyTheme(getPreferredTheme());
    syncSubjectUi();

    const rememberedName = loadLastName();

    if (rememberedName) {
      ui.nameInput.value = rememberedName;
      currentState = buildState(
        rememberedName,
        normalizeName(rememberedName),
        getCurrentSubject(),
      );
      renderState();
      return;
    }

    renderEmptyState(getEmptyMessage(getCurrentSubject().config));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load bingo subjects.";
    renderFatalState(message);
  }
}

async function loadSubjects(): Promise<SubjectRecord[]> {
  const manifest = await fetchJson(MANIFEST_URL);

  if (!Array.isArray(manifest)) {
    throw new Error("Subject manifest must be an array.");
  }

  const loadedSubjects = await Promise.all(
    manifest.map(async (entry, index) => {
      validateManifestEntry(entry, index);

      const configUrl = new URL(entry.path, import.meta.url).toString();
      const config = await fetchJson(configUrl);

      validateSubjectConfig(config, `Subject file "${entry.id}"`);

      return {
        id: entry.id,
        path: entry.path,
        config,
      };
    }),
  );

  return loadedSubjects.sort((left, right) => {
    return left.config.title.localeCompare(right.config.title, undefined, {
      sensitivity: "base",
    });
  });
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load ${url} (${response.status}).`);
  }

  return response.json();
}

function validateManifestEntry(entry: unknown, index: number): asserts entry is SubjectManifestEntry {
  if (!isRecord(entry)) {
    throw new Error(`Manifest entry ${index + 1} must be an object.`);
  }

  if (typeof entry.id !== "string" || entry.id.trim().length === 0) {
    throw new Error(`Manifest entry ${index + 1} needs a non-empty "id".`);
  }

  if (typeof entry.path !== "string" || entry.path.trim().length === 0) {
    throw new Error(`Manifest entry ${index + 1} needs a non-empty "path".`);
  }
}

function renderLoadingState(): void {
  app.innerHTML = `
    <main class="shell">
      <section class="hero">
        <p class="eyebrow">GitHub Pages Bingo</p>
        <h1>Loading bingos</h1>
        <p class="intro">Reading the available subject JSON files...</p>
      </section>
      <section class="board-panel">
        <div class="empty-state">
          <p>Your available bingo subjects are loading.</p>
        </div>
      </section>
    </main>
  `;
}

function renderFatalState(message: string): void {
  app.innerHTML = `
    <main class="shell">
      <section class="hero">
        <p class="eyebrow">GitHub Pages Bingo</p>
        <h1>Config error</h1>
        <p class="intro">The app could not finish loading the subject data.</p>
      </section>
      <section class="board-panel">
        <div class="empty-state">
          <p>${escapeHtml(message)}</p>
        </div>
      </section>
    </main>
  `;
}

function renderShell(): void {
  const initialSubject = getCurrentSubject();
  const currentPeriodKey = getPeriodKey(initialSubject.config.cadence, new Date());

  app.innerHTML = `
    <main class="shell">
      <section class="hero">
        <p class="eyebrow">GitHub Pages Bingo</p>
        <div class="hero-topline">
          <div>
            <h1 id="hero-title">${escapeHtml(initialSubject.config.title)}</h1>
            <p class="intro" id="hero-subtitle">${escapeHtml(getSubtitle(initialSubject.config))}</p>
            <p class="subject-meta" id="subject-meta">${escapeHtml(formatSubjectMeta(initialSubject.config))}</p>
          </div>
        </div>
        <div class="subject-switch" role="tablist" aria-label="Bingo subjects">
          ${subjects
            .map((subject) => {
              const isSelected = subject.id === activeSubjectId;

              return `
                <button
                  class="subject-pill${isSelected ? " is-active" : ""}"
                  type="button"
                  role="tab"
                  aria-selected="${String(isSelected)}"
                  data-subject-id="${escapeHtml(subject.id)}"
                >
                  <span class="subject-pill__title">${escapeHtml(subject.config.title)}</span>
                  <span class="subject-pill__meta">${escapeHtml(formatSubjectMeta(subject.config))}</span>
                </button>
              `;
            })
            .join("")}
        </div>
        <form class="controls" id="generator-form">
          <label class="control-card">
            <span class="label">Name or string</span>
            <input
              id="name-input"
              name="name"
              type="text"
              maxlength="80"
              placeholder="z.B. Alex, momo, Team Rocket..."
              autocomplete="off"
            />
          </label>
          <div class="control-card control-card--date">
            <span class="label" id="seed-label">${escapeHtml(getSeedLabel(initialSubject.config.cadence))}</span>
            <strong id="date-label">${escapeHtml(formatPeriodForDisplay(initialSubject.config.cadence, currentPeriodKey))}</strong>
            <span class="muted" id="seed-hint">${escapeHtml(getResetHint(initialSubject.config.cadence))}</span>
          </div>
          <div class="actions">
            <button class="button button--primary" type="submit">Generate card</button>
            <button class="button button--ghost" id="clear-progress" type="button">Clear progress</button>
            <button class="button button--ghost" id="download-image" type="button">Download image</button>
            <button class="button button--ghost" id="copy-image" type="button">Copy image</button>
          </div>
        </form>
      </section>

      <section class="board-panel">
        <div class="board-header">
          <div>
            <p class="label">Current card</p>
            <h2 id="card-title">Enter a name to start</h2>
          </div>
          <div class="stats">
            <div class="stat">
              <span class="label">Marked fields</span>
              <strong id="marked-count">0 / ${getRequiredEntryCount(initialSubject.config)}</strong>
            </div>
            <div class="stat">
              <span class="label">Bingos</span>
              <strong id="bingo-count">0</strong>
            </div>
          </div>
        </div>
        <p class="helper" id="helper-text">${escapeHtml(getProgressMessage(initialSubject.config))}</p>
        <div class="board" id="board" aria-live="polite"></div>
      </section>
    </main>
  `;
}

function getUiRefs(): UiRefs {
  const form = document.querySelector<HTMLFormElement>("#generator-form");
  const nameInput = document.querySelector<HTMLInputElement>("#name-input");
  const heroTitle = document.querySelector<HTMLElement>("#hero-title");
  const heroSubtitle = document.querySelector<HTMLElement>("#hero-subtitle");
  const subjectMeta = document.querySelector<HTMLElement>("#subject-meta");
  const seedLabel = document.querySelector<HTMLElement>("#seed-label");
  const seedHint = document.querySelector<HTMLElement>("#seed-hint");
  const dateLabel = document.querySelector<HTMLElement>("#date-label");
  const cardTitle = document.querySelector<HTMLElement>("#card-title");
  const helperText = document.querySelector<HTMLElement>("#helper-text");
  const markedCount = document.querySelector<HTMLElement>("#marked-count");
  const bingoCount = document.querySelector<HTMLElement>("#bingo-count");
  const board = document.querySelector<HTMLDivElement>("#board");
  const clearProgressButton =
    document.querySelector<HTMLButtonElement>("#clear-progress");
  const downloadImageButton =
    document.querySelector<HTMLButtonElement>("#download-image");
  const copyImageButton =
    document.querySelector<HTMLButtonElement>("#copy-image");
  const subjectButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-subject-id]"),
  );

  if (
    !form ||
    !nameInput ||
    !heroTitle ||
    !heroSubtitle ||
    !subjectMeta ||
    !seedLabel ||
    !seedHint ||
    !dateLabel ||
    !cardTitle ||
    !helperText ||
    !markedCount ||
    !bingoCount ||
    !board ||
    !clearProgressButton ||
    !downloadImageButton ||
    !copyImageButton
  ) {
    throw new Error("Missing required DOM elements.");
  }

  return {
    form,
    nameInput,
    heroTitle,
    heroSubtitle,
    subjectMeta,
    seedLabel,
    seedHint,
    dateLabel,
    cardTitle,
    helperText,
    markedCount,
    bingoCount,
    board,
    clearProgressButton,
    downloadImageButton,
    copyImageButton,
    subjectButtons,
  };
}

function wireEvents(): void {
  if (!ui) {
    return;
  }

  ui.form.addEventListener("submit", (event) => {
    event.preventDefault();

    const rawName = ui?.nameInput.value.trim() ?? "";
    const normalizedName = normalizeName(rawName);

    if (!normalizedName) {
      renderEmptyState(getEmptyMessage(getCurrentSubject().config));
      return;
    }

    currentState = buildState(rawName, normalizedName, getCurrentSubject());
    persistLastName(rawName);
    renderState();
  });

  ui.clearProgressButton.addEventListener("click", () => {
    if (!currentState) {
      return;
    }

    currentState.selectedIds.clear();
    persistSelections(currentState);
    renderState();
  });

  ui.downloadImageButton.addEventListener("click", () => {
    void handleDownloadImage();
  });

  ui.copyImageButton.addEventListener("click", () => {
    void handleCopyImage();
  });

  ui.subjectButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const nextSubjectId = button.dataset.subjectId;

      if (!nextSubjectId || nextSubjectId === activeSubjectId) {
        return;
      }

      setActiveSubject(nextSubjectId);
    });
  });

  themeMediaQuery.addEventListener("change", (event) => {
    applyTheme(event.matches ? "dark" : "light");
  });

  window.addEventListener("resize", scheduleBoardSizing);
}

function getCurrentSubject(): SubjectRecord {
  const subject = subjectMap.get(activeSubjectId);

  if (!subject) {
    throw new Error(`Unknown subject "${activeSubjectId}".`);
  }

  return subject;
}

function setActiveSubject(subjectId: string): void {
  if (!subjectMap.has(subjectId)) {
    return;
  }

  activeSubjectId = subjectId;
  persistLastSubjectId(subjectId);
  syncSubjectUi();

  const rawName = ui?.nameInput.value.trim() ?? "";
  const normalizedName = normalizeName(rawName);

  if (!normalizedName) {
    renderEmptyState(getEmptyMessage(getCurrentSubject().config));
    return;
  }

  currentState = buildState(rawName, normalizedName, getCurrentSubject());
  renderState();
}

function syncSubjectUi(): void {
  if (!ui) {
    return;
  }

  const subject = getCurrentSubject();
  const periodKey = getPeriodKey(subject.config.cadence, new Date());

  ui.heroTitle.textContent = subject.config.title;
  ui.heroSubtitle.textContent = getSubtitle(subject.config);
  ui.subjectMeta.textContent = formatSubjectMeta(subject.config);
  ui.seedLabel.textContent = getSeedLabel(subject.config.cadence);
  ui.seedHint.textContent = getResetHint(subject.config.cadence);
  ui.dateLabel.textContent = formatPeriodForDisplay(subject.config.cadence, periodKey);
  ui.helperText.textContent = getProgressMessage(subject.config);
  ui.markedCount.textContent = `0 / ${getRequiredEntryCount(subject.config)}`;
  ui.board.style.setProperty("--board-columns", String(subject.config.cardSize));
  updateExportButtonState();

  ui.subjectButtons.forEach((button) => {
    const isActive = button.dataset.subjectId === subject.id;

    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  applySubjectTheme(subject.config.theme, getPreferredTheme());
}

function buildState(
  rawName: string,
  normalizedName: string,
  subject: SubjectRecord,
): BingoState {
  const periodKey = getPeriodKey(subject.config.cadence, new Date());
  const shuffledEntries = getEntriesForPeriod(subject, normalizedName, periodKey);
  const selectedIds = loadSelections(subject.id, normalizedName, periodKey, shuffledEntries);

  return {
    subjectId: subject.id,
    periodKey,
    entries: shuffledEntries,
    normalizedName,
    rawName,
    selectedIds,
  };
}

function getEntriesForPeriod(
  subject: SubjectRecord,
  normalizedName: string,
  periodKey: string,
): BingoEntry[] {
  const seed = hashString(`${subject.id}::${normalizedName}::${periodKey}`);
  const random = mulberry32(seed);
  const entries = subject.config.entries.map((text, index) => ({
    id: `entry-${index}`,
    text,
  }));

  shuffle(entries, random);

  return entries.slice(0, getRequiredEntryCount(subject.config));
}

function renderState(): void {
  if (!ui) {
    return;
  }

  if (!currentState) {
    renderEmptyState(getEmptyMessage(getCurrentSubject().config));
    return;
  }

  const subject = subjectMap.get(currentState.subjectId);

  if (!subject) {
    renderEmptyState("This subject could not be loaded.");
    return;
  }

  const summary = getBingoSummary(
    currentState.entries,
    currentState.selectedIds,
    subject.config.cardSize,
  );

  ui.cardTitle.textContent =
    `${currentState.rawName || currentState.normalizedName} • ${subject.config.title} • ${formatPeriodForDisplay(subject.config.cadence, currentState.periodKey)}`;
  ui.helperText.textContent = getProgressMessage(subject.config);
  ui.markedCount.textContent =
    `${currentState.selectedIds.size} / ${getRequiredEntryCount(subject.config)}`;
  ui.bingoCount.textContent = `${summary.count}`;
  ui.board.style.setProperty("--board-columns", String(subject.config.cardSize));
  ui.board.innerHTML = "";
  updateExportButtonState();

  currentState.entries.forEach((entry) => {
    const isSelected = currentState?.selectedIds.has(entry.id) ?? false;
    const isWinning = summary.winningIds.has(entry.id);
    const cell = document.createElement("button");

    cell.type = "button";
    cell.className = "cell";
    cell.dataset.id = entry.id;
    cell.setAttribute("aria-pressed", String(isSelected));

    if (isSelected) {
      cell.classList.add("is-selected");
    }

    if (isWinning) {
      cell.classList.add("is-winning");
    }

    cell.innerHTML = `
      <span class="cell-text">${escapeHtml(entry.text)}</span>
    `;

    cell.addEventListener("click", () => {
      if (!currentState) {
        return;
      }

      if (currentState.selectedIds.has(entry.id)) {
        currentState.selectedIds.delete(entry.id);
      } else {
        currentState.selectedIds.add(entry.id);
      }

      persistSelections(currentState);
      renderState();
    });

    ui?.board.appendChild(cell);
  });

  scheduleBoardSizing();
}

function renderEmptyState(message: string): void {
  if (!ui) {
    return;
  }

  currentState = null;
  syncSubjectUi();
  ui.cardTitle.textContent = "Enter a name to start";
  ui.helperText.textContent = message;
  ui.bingoCount.textContent = "0";
  updateExportButtonState();
  ui.board.innerHTML = `
    <div class="empty-state">
      <p>Your bingo board appears here after you enter a name or string.</p>
    </div>
  `;

  scheduleBoardSizing();
}

function scheduleBoardSizing(): void {
  if (resizeFrame !== 0) {
    cancelAnimationFrame(resizeFrame);
  }

  resizeFrame = window.requestAnimationFrame(() => {
    resizeFrame = 0;
    updateBoardSizing();
  });
}

function updateBoardSizing(): void {
  if (!ui) {
    return;
  }

  const isBoardVisible =
    ui.board.children.length > 0 && !ui.board.querySelector(".empty-state");
  const cardSize = currentState
    ? subjectMap.get(currentState.subjectId)?.config.cardSize ?? getCurrentSubject().config.cardSize
    : getCurrentSubject().config.cardSize;

  if (!isBoardVisible) {
    ui.board.style.removeProperty("--board-size");
    ui.board.style.removeProperty("--cell-font-size");
    ui.board.style.setProperty("--board-columns", String(cardSize));
    return;
  }

  const viewportHeight = window.innerHeight;
  const parentWidth =
    ui.board.parentElement?.clientWidth ?? ui.board.clientWidth ?? window.innerWidth;
  const horizontalPadding = window.innerWidth <= 820 ? 0 : 8;
  const availableWidth = Math.floor(parentWidth - horizontalPadding);
  const preferredHeight = Math.floor(
    viewportHeight * (window.innerWidth <= 820 ? 0.56 : 0.72),
  );
  const maxBoardSize = window.innerWidth <= 820 ? availableWidth : 820;

  if (availableWidth <= 0) {
    ui.board.style.removeProperty("--board-size");
    ui.board.style.removeProperty("--cell-font-size");
    ui.board.style.setProperty("--board-columns", String(cardSize));
    return;
  }

  const boardSize = Math.min(availableWidth, preferredHeight, maxBoardSize);
  const mobileDivisor = Math.max(13, cardSize * 5);
  const desktopDivisor = Math.max(9, cardSize * 3.25);
  const cellFontSize =
    window.innerWidth <= 820
      ? Math.max(9, Math.min(15, Math.floor(boardSize / mobileDivisor)))
      : Math.max(12, Math.min(22, Math.floor(boardSize / desktopDivisor)));

  ui.board.style.setProperty("--board-size", `${boardSize}px`);
  ui.board.style.setProperty("--cell-font-size", `${cellFontSize}px`);
  ui.board.style.setProperty("--board-columns", String(cardSize));
}

function getPreferredTheme(): ThemeMode {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: ThemeMode): void {
  document.documentElement.dataset.theme = theme;
  document.body.dataset.theme = theme;

  if (subjects.length > 0) {
    applySubjectTheme(getCurrentSubject().config.theme, theme);
  }
}

function applySubjectTheme(theme: SubjectTheme | undefined, mode: ThemeMode): void {
  const root = document.documentElement;
  const palette = theme?.[mode];

  for (const { key, cssVariable } of THEME_VARIABLES) {
    const value = palette?.[key];

    if (typeof value === "string" && value.trim().length > 0) {
      root.style.setProperty(cssVariable, value);
    } else {
      root.style.removeProperty(cssVariable);
    }
  }
}

function updateExportButtonState(): void {
  if (!ui) {
    return;
  }

  const hasCard = currentState !== null;

  ui.downloadImageButton.disabled = !hasCard;
  ui.copyImageButton.disabled = !hasCard || !supportsClipboardImageCopy();
}

async function handleDownloadImage(): Promise<void> {
  const exportAsset = await buildExportAsset();

  if (!exportAsset) {
    return;
  }

  downloadBlob(exportAsset.blob, exportAsset.filename);
}

async function handleCopyImage(): Promise<void> {
  if (!ui || !supportsClipboardImageCopy()) {
    return;
  }

  const exportAsset = await buildExportAsset();

  if (!exportAsset) {
    return;
  }

  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "image/png": exportAsset.blob,
      }),
    ]);
    flashButtonLabel(ui.copyImageButton, "Copied!");
  } catch {
    flashButtonLabel(ui.copyImageButton, "Copy failed");
  }
}

async function buildExportAsset(): Promise<{ blob: Blob; filename: string } | null> {
  if (!currentState) {
    return null;
  }

  const subject = subjectMap.get(currentState.subjectId);

  if (!subject) {
    return null;
  }

  const summary = getBingoSummary(
    currentState.entries,
    currentState.selectedIds,
    subject.config.cardSize,
  );
  const blob = await createExportImage(currentState, subject, summary);
  const filename = `${slugify(subject.config.title)}-${slugify(
    currentState.rawName || currentState.normalizedName || "card",
  )}-${currentState.periodKey}.png`;

  return { blob, filename };
}

async function createExportImage(
  state: BingoState,
  subject: SubjectRecord,
  summary: BingoSummary,
): Promise<Blob> {
  const cardSize = subject.config.cardSize;
  const boardPixels = cardSize === 3 ? 1040 : 1120;
  const canvas = document.createElement("canvas");
  const width = 1400;
  const height = 1720;
  const padding = 72;
  const boardX = Math.round((width - boardPixels) / 2);
  const boardY = 470;
  const gap = 20;
  const cellSize = Math.floor((boardPixels - gap * (cardSize - 1)) / cardSize);
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas rendering is not available.");
  }

  canvas.width = width;
  canvas.height = height;

  const colors = getResolvedThemeColors();

  drawBackground(ctx, width, height, colors);
  drawPanel(ctx, 44, 36, width - 88, height - 72, 30, colors.panel, colors.shadow);

  ctx.fillStyle = colors.accent;
  ctx.font = "700 22px 'Avenir Next', 'Segoe UI', sans-serif";
  ctx.fillText("GitHub Pages Bingo", padding, 96);

  ctx.fillStyle = colors.text;
  ctx.font = "700 62px Georgia, 'Times New Roman', serif";
  drawSingleLineText(ctx, subject.config.title, padding, 166, width - padding * 2);

  ctx.fillStyle = colors.muted;
  ctx.font = "500 28px 'Avenir Next', 'Segoe UI', sans-serif";
  drawWrappedText(
    ctx,
    `${getSubtitle(subject.config)}\n${currentStateLabel(state, subject)}`,
    padding,
    222,
    width - padding * 2,
    38,
    3,
  );

  drawStatPill(ctx, padding, 308, 290, 92, "Marked fields", `${state.selectedIds.size} / ${getRequiredEntryCount(subject.config)}`, colors);
  drawStatPill(ctx, padding + 314, 308, 190, 92, "Bingos", `${summary.count}`, colors);
  drawStatPill(
    ctx,
    width - padding - 304,
    308,
    304,
    92,
    "Cadence / size",
    formatSubjectMeta(subject.config),
    colors,
  );

  for (let index = 0; index < state.entries.length; index += 1) {
    const entry = state.entries[index];
    const row = Math.floor(index / cardSize);
    const column = index % cardSize;
    const x = boardX + column * (cellSize + gap);
    const y = boardY + row * (cellSize + gap);
    const isSelected = state.selectedIds.has(entry.id);
    const isWinning = summary.winningIds.has(entry.id);
    const fill = isWinning
      ? colors.winningTop
      : isSelected
        ? colors.selectedTop
        : colors.panelStrong;
    const border = isWinning
      ? colors.winningBorder
      : isSelected
        ? colors.selectedBorder
        : colors.border;

    drawRoundedRect(ctx, x, y, cellSize, cellSize, 24, fill, border, 3);
    drawCellText(
      ctx,
      entry.text,
      x + 20,
      y + 28,
      cellSize - 40,
      cellSize - 56,
      cardSize,
      colors.text,
    );
  }

  ctx.fillStyle = colors.muted;
  ctx.font = "500 22px 'Avenir Next', 'Segoe UI', sans-serif";
  ctx.fillText("Generated from the current bingo card state", padding, height - 70);

  return canvasToBlob(canvas);
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  colors: ResolvedThemeColors,
): void {
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, width, height);

  const topLeft = ctx.createRadialGradient(210, 140, 20, 210, 140, 320);
  topLeft.addColorStop(0, colors.bgAccent);
  topLeft.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = topLeft;
  ctx.fillRect(0, 0, width, height);

  const topRight = ctx.createRadialGradient(width - 180, 180, 20, width - 180, 180, 260);
  topRight.addColorStop(0, colors.accentSoft);
  topRight.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = topRight;
  ctx.fillRect(0, 0, width, height);
}

function drawPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string,
  shadow: string,
): void {
  ctx.save();
  ctx.shadowColor = shadow;
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  drawRoundedRect(ctx, x, y, width, height, radius, fill);
  ctx.restore();
}

function drawStatPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  value: string,
  colors: ResolvedThemeColors,
): void {
  drawRoundedRect(ctx, x, y, width, height, 22, colors.panelStrong, colors.border, 2);
  ctx.fillStyle = colors.muted;
  ctx.font = "700 16px 'Avenir Next', 'Segoe UI', sans-serif";
  ctx.fillText(label.toUpperCase(), x + 24, y + 30);
  ctx.fillStyle = colors.text;
  ctx.font = "700 34px Georgia, 'Times New Roman', serif";
  drawSingleLineText(ctx, value, x + 24, y + 70, width - 48);
}

function drawCellText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
  cardSize: number,
  color: string,
): void {
  const fontSize = cardSize === 3 ? 36 : 28;
  const lineHeight = cardSize === 3 ? 42 : 34;
  const maxLines = Math.max(3, Math.floor(maxHeight / lineHeight));

  ctx.fillStyle = color;
  ctx.font = `600 ${fontSize}px 'Avenir Next', 'Segoe UI', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const lines = wrapText(ctx, text, maxWidth, maxLines);
  const totalHeight = lines.length * lineHeight;
  const startY = y + Math.max(0, (maxHeight - totalHeight) / 2);

  lines.forEach((line, index) => {
    ctx.fillText(line, x + maxWidth / 2, startY + index * lineHeight);
  });

  ctx.textAlign = "start";
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): void {
  const allLines = text
    .split("\n")
    .flatMap((line) => wrapText(ctx, line, maxWidth, maxLines))
    .slice(0, maxLines);

  allLines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });
}

function drawSingleLineText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
): void {
  const lines = wrapText(ctx, text, maxWidth, 1);
  ctx.fillText(lines[0] ?? text, x, y);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return [""];
  }

  const lines: string[] = [];
  let currentLine = words[0] ?? "";

  for (let index = 1; index < words.length; index += 1) {
    const word = words[index] ?? "";
    const nextLine = `${currentLine} ${word}`;

    if (ctx.measureText(nextLine).width <= maxWidth) {
      currentLine = nextLine;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;

    if (lines.length === maxLines - 1) {
      break;
    }
  }

  const consumedWords = lines.join(" ").split(/\s+/).filter(Boolean).length;
  const remainder = words.slice(consumedWords);

  if (remainder.length > 0) {
    currentLine = remainder.join(" ");
  }

  lines.push(currentLine);

  if (lines.length > maxLines) {
    lines.length = maxLines;
  }

  const truncated = lines.some((line) => ctx.measureText(line).width > maxWidth) ||
    lines.join(" ").split(/\s+/).filter(Boolean).length < words.length;

  if (truncated) {
    lines[lines.length - 1] = fitTextWithEllipsis(
      ctx,
      lines[lines.length - 1] ?? "",
      maxWidth,
    );
  }

  return lines;
}

function fitTextWithEllipsis(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  const ellipsis = "...";

  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }

  let trimmed = text;

  while (trimmed.length > 0 && ctx.measureText(`${trimmed}${ellipsis}`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1).trimEnd();
  }

  return `${trimmed}${ellipsis}`;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string,
  stroke?: string,
  strokeWidth = 1,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }
}

function getResolvedThemeColors(): ResolvedThemeColors {
  const styles = getComputedStyle(document.documentElement);

  return {
    bg: readCssVariable(styles, "--bg", "#f5efe2"),
    bgAccent: readCssVariable(styles, "--bg-accent", "rgba(197, 126, 58, 0.18)"),
    panel: readCssVariable(styles, "--panel", "rgba(255, 251, 245, 0.85)"),
    panelStrong: readCssVariable(styles, "--panel-strong", "rgba(255, 248, 238, 0.98)"),
    text: readCssVariable(styles, "--text", "#1f2933"),
    muted: readCssVariable(styles, "--muted", "#5d6b78"),
    primary: readCssVariable(styles, "--primary", "#0f766e"),
    accent: readCssVariable(styles, "--accent", "#d97706"),
    border: readCssVariable(styles, "--border", "rgba(31, 41, 51, 0.12)"),
    shadow: extractShadowColor(readCssVariable(styles, "--shadow", "rgba(51, 65, 85, 0.16)")),
    selectedBorder: readCssVariable(styles, "--selected-border", "rgba(15, 118, 110, 0.45)"),
    selectedTop: readCssVariable(styles, "--selected-top", "rgba(224, 247, 243, 0.98)"),
    winningBorder: readCssVariable(styles, "--winning-border", "rgba(217, 119, 6, 0.45)"),
    winningTop: readCssVariable(styles, "--winning-top", "rgba(255, 242, 214, 0.98)"),
    accentSoft: "rgba(217, 119, 6, 0.18)",
  };
}

function readCssVariable(
  styles: CSSStyleDeclaration,
  name: string,
  fallback: string,
): string {
  const value = styles.getPropertyValue(name).trim();
  return value || fallback;
}

function extractShadowColor(value: string): string {
  const match = value.match(/(rgba?\([^)]+\)|#[0-9a-fA-F]+)$/);
  return match?.[1] ?? "rgba(51, 65, 85, 0.16)";
}

function currentStateLabel(state: BingoState, subject: SubjectRecord): string {
  return `${state.rawName || state.normalizedName} • ${formatPeriodForDisplay(
    subject.config.cadence,
    state.periodKey,
  )}`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error("Failed to create image blob."));
    }, "image/png");
  });
}

function supportsClipboardImageCopy(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.clipboard &&
    typeof navigator.clipboard.write === "function" &&
    typeof ClipboardItem !== "undefined"
  );
}

function flashButtonLabel(button: HTMLButtonElement, text: string): void {
  const original = button.textContent || "";

  button.textContent = text;

  window.setTimeout(() => {
    button.textContent = original;
  }, 1400);
}

function slugify(value: string): string {
  const normalized = value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "bingo-card";
}

type ResolvedThemeColors = {
  bg: string;
  bgAccent: string;
  panel: string;
  panelStrong: string;
  text: string;
  muted: string;
  primary: string;
  accent: string;
  border: string;
  shadow: string;
  selectedBorder: string;
  selectedTop: string;
  winningBorder: string;
  winningTop: string;
  accentSoft: string;
};

function getBingoSummary(
  entries: BingoEntry[],
  selectedIds: Set<string>,
  cardSize: number,
): BingoSummary {
  const lines = getWinningLines(entries, cardSize);
  const winningIds = new Set<string>();
  let count = 0;

  for (const line of lines) {
    const isComplete = line.every((entry) => selectedIds.has(entry.id));

    if (!isComplete) {
      continue;
    }

    count += 1;

    for (const entry of line) {
      winningIds.add(entry.id);
    }
  }

  return { count, winningIds };
}

function getWinningLines(entries: BingoEntry[], cardSize: number): BingoEntry[][] {
  const lines: BingoEntry[][] = [];

  for (let row = 0; row < cardSize; row += 1) {
    const rowEntries: BingoEntry[] = [];

    for (let column = 0; column < cardSize; column += 1) {
      rowEntries.push(entries[row * cardSize + column]);
    }

    lines.push(rowEntries);
  }

  for (let column = 0; column < cardSize; column += 1) {
    const columnEntries: BingoEntry[] = [];

    for (let row = 0; row < cardSize; row += 1) {
      columnEntries.push(entries[row * cardSize + column]);
    }

    lines.push(columnEntries);
  }

  const leftDiagonal: BingoEntry[] = [];
  const rightDiagonal: BingoEntry[] = [];

  for (let index = 0; index < cardSize; index += 1) {
    leftDiagonal.push(entries[index * cardSize + index]);
    rightDiagonal.push(entries[index * cardSize + (cardSize - 1 - index)]);
  }

  lines.push(leftDiagonal, rightDiagonal);

  return lines;
}

function loadSelections(
  subjectId: string,
  normalizedName: string,
  periodKey: string,
  entries: BingoEntry[],
): Set<string> {
  const stored = localStorage.getItem(
    getSelectionStorageKey(subjectId, normalizedName, periodKey),
  );

  if (!stored) {
    return new Set<string>();
  }

  try {
    const parsed = JSON.parse(stored);
    const validIds = new Set(entries.map((entry) => entry.id));

    if (!Array.isArray(parsed)) {
      return new Set<string>();
    }

    return new Set(
      parsed.filter((value): value is string => {
        return typeof value === "string" && validIds.has(value);
      }),
    );
  } catch {
    return new Set<string>();
  }
}

function persistSelections(state: BingoState): void {
  localStorage.setItem(
    getSelectionStorageKey(state.subjectId, state.normalizedName, state.periodKey),
    JSON.stringify([...state.selectedIds]),
  );
}

function persistLastName(rawName: string): void {
  localStorage.setItem(`${STORAGE_PREFIX}:last-name`, rawName);
}

function loadLastName(): string {
  return localStorage.getItem(`${STORAGE_PREFIX}:last-name`) ?? "";
}

function persistLastSubjectId(subjectId: string): void {
  localStorage.setItem(`${STORAGE_PREFIX}:last-subject`, subjectId);
}

function loadLastSubjectId(fallbackId: string): string {
  const stored = localStorage.getItem(`${STORAGE_PREFIX}:last-subject`);

  return stored && subjectMap.has(stored) ? stored : fallbackId;
}

function getSelectionStorageKey(
  subjectId: string,
  normalizedName: string,
  periodKey: string,
): string {
  return `${STORAGE_PREFIX}:selections:${subjectId}:${periodKey}:${normalizedName}`;
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function getRequiredEntryCount(config: SubjectConfig): number {
  return config.cardSize * config.cardSize;
}

function getSubtitle(config: SubjectConfig): string {
  return config.subtitle?.trim() || DEFAULT_SUBTITLE;
}

function formatSubjectMeta(config: SubjectConfig): string {
  return `${config.cadence === "daily" ? "Daily" : "Weekly"} • ${config.cardSize}x${config.cardSize}`;
}

function getSeedLabel(cadence: SubjectCadence): string {
  return cadence === "weekly" ? "Current seed week" : "Today's seed date";
}

function getResetHint(cadence: SubjectCadence): string {
  return cadence === "weekly"
    ? "Same text + same week = same card."
    : "Same text + same day = same card.";
}

function getEmptyMessage(config: SubjectConfig): string {
  return config.cadence === "weekly"
    ? "Enter a name or string to generate this week's bingo card."
    : "Enter a name or string to generate today's bingo card.";
}

function getProgressMessage(config: SubjectConfig): string {
  return config.cadence === "weekly"
    ? "Click a field to mark it. Progress stays saved locally for this exact name and week."
    : "Click a field to mark it. Progress stays saved locally for this exact name and day.";
}

function getPeriodKey(cadence: SubjectCadence, date: Date): string {
  if (cadence === "weekly") {
    return getIsoWeekKey(date);
  }

  return getDateKey(date);
}

function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatPeriodForDisplay(cadence: SubjectCadence, periodKey: string): string {
  if (cadence === "weekly") {
    const match = /^(\d{4})-W(\d{2})$/.exec(periodKey);

    if (!match) {
      return periodKey;
    }

    return `Week ${match[2]}, ${match[1]}`;
  }

  const [year, month, day] = periodKey.split("-");

  if (!year || !month || !day) {
    return periodKey;
  }

  return `${day}-${month}-${year}`;
}

function getIsoWeekKey(date: Date): string {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utcDate.getUTCDay() || 7;

  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);

  return `${utcDate.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;

  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let result = Math.imul(value ^ (value >>> 15), value | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);

    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): void {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = items[index];

    items[index] = items[swapIndex];
    items[swapIndex] = current;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function isRecord(value: unknown): value is Record<string, string> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
