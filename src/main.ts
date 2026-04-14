import bingoConfig from "./bingo-fields.json";

type BingoState = {
  dateKey: string;
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

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app container.");
}

const CARD_SIZE = bingoConfig.cardSize;
const REQUIRED_ENTRY_COUNT = CARD_SIZE * CARD_SIZE;
const STORAGE_PREFIX = "wingo-bingo";

if (bingoConfig.entries.length < REQUIRED_ENTRY_COUNT) {
  throw new Error(
    `Expected at least ${REQUIRED_ENTRY_COUNT} bingo entries, received ${bingoConfig.entries.length}.`,
  );
}

const todayKey = getDateKey(new Date());
const displayDate = formatDateForDisplay(todayKey);

app.innerHTML = `
  <main class="shell">
    <section class="hero">
      <p class="eyebrow">GitHub Pages Bingo</p>
      <h1>${escapeHtml(bingoConfig.title)}</h1>
      <p class="intro">${escapeHtml(bingoConfig.subtitle)}</p>
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
          <span class="label">Today's seed date</span>
          <strong id="date-label">${displayDate}</strong>
          <span class="muted">Same text + same day = same card.</span>
        </div>
        <div class="actions">
          <button class="button button--primary" type="submit">Generate card</button>
          <button class="button button--ghost" id="clear-progress" type="button">Clear progress</button>
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
            <strong id="marked-count">0 / ${REQUIRED_ENTRY_COUNT}</strong>
          </div>
          <div class="stat">
            <span class="label">Bingos</span>
            <strong id="bingo-count">0</strong>
          </div>
        </div>
      </div>
      <p class="helper" id="helper-text">
        Your selection is saved in this browser for the current name and day.
      </p>
      <div class="board" id="board" aria-live="polite"></div>
    </section>
  </main>
`;

const form = document.querySelector<HTMLFormElement>("#generator-form");
const nameInput = document.querySelector<HTMLInputElement>("#name-input");
const dateLabel = document.querySelector<HTMLElement>("#date-label");
const cardTitle = document.querySelector<HTMLElement>("#card-title");
const helperText = document.querySelector<HTMLElement>("#helper-text");
const markedCount = document.querySelector<HTMLElement>("#marked-count");
const bingoCount = document.querySelector<HTMLElement>("#bingo-count");
const board = document.querySelector<HTMLDivElement>("#board");
const clearProgressButton =
  document.querySelector<HTMLButtonElement>("#clear-progress");

if (
  !form ||
  !nameInput ||
  !dateLabel ||
  !cardTitle ||
  !helperText ||
  !markedCount ||
  !bingoCount ||
  !board ||
  !clearProgressButton
) {
  throw new Error("Missing required DOM elements.");
}

dateLabel.textContent = displayDate;
applyTheme(getPreferredTheme());

let currentState: BingoState | null = null;
let resizeFrame = 0;
const themeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const rawName = nameInput.value.trim();
  const normalizedName = normalizeName(rawName);

  if (!normalizedName) {
    renderEmptyState("Enter a name or string to generate today's bingo card.");
    return;
  }

  const nextState = buildState(rawName, normalizedName, todayKey);
  persistLastName(rawName);
  currentState = nextState;
  renderState();
});

clearProgressButton.addEventListener("click", () => {
  if (!currentState) {
    return;
  }

  currentState.selectedIds.clear();
  persistSelections(currentState);
  renderState();
});

themeMediaQuery.addEventListener("change", (event) => {
  applyTheme(event.matches ? "dark" : "light");
});

window.addEventListener("resize", scheduleBoardSizing);

const rememberedName = loadLastName();

if (rememberedName) {
  nameInput.value = rememberedName;
  currentState = buildState(rememberedName, normalizeName(rememberedName), todayKey);
  renderState();
} else {
  renderEmptyState("Enter a name or string to generate today's bingo card.");
}

function buildState(
  rawName: string,
  normalizedName: string,
  dateKey: string,
): BingoState {
  const shuffledEntries = getDailyEntries(normalizedName, dateKey);
  const selectedIds = loadSelections(normalizedName, dateKey, shuffledEntries);

  return {
    dateKey,
    entries: shuffledEntries,
    normalizedName,
    rawName,
    selectedIds,
  };
}

function getDailyEntries(normalizedName: string, dateKey: string): BingoEntry[] {
  const seed = hashString(`${normalizedName}::${dateKey}`);
  const random = mulberry32(seed);
  const entries = bingoConfig.entries.map((text, index) => ({
    id: `entry-${index}`,
    text,
  }));

  shuffle(entries, random);

  return entries.slice(0, REQUIRED_ENTRY_COUNT);
}

function renderState(): void {
  if (!currentState) {
    renderEmptyState("Enter a name or string to generate today's bingo card.");
    return;
  }

  const summary = getBingoSummary(currentState.entries, currentState.selectedIds);

  cardTitle.textContent = `${currentState.rawName || currentState.normalizedName} • ${formatDateForDisplay(currentState.dateKey)}`;
  helperText.textContent =
    "Click a field to mark it. Progress stays saved locally for this exact name and date.";
  markedCount.textContent = `${currentState.selectedIds.size} / ${REQUIRED_ENTRY_COUNT}`;
  bingoCount.textContent = `${summary.count}`;

  board.innerHTML = "";

  currentState.entries.forEach((entry) => {
    const isSelected = currentState.selectedIds.has(entry.id);
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

    board.appendChild(cell);
  });

  scheduleBoardSizing();
}

function renderEmptyState(message: string): void {
  currentState = null;
  cardTitle.textContent = "Enter a name to start";
  helperText.textContent = message;
  markedCount.textContent = `0 / ${REQUIRED_ENTRY_COUNT}`;
  bingoCount.textContent = "0";
  board.innerHTML = `
    <div class="empty-state">
      <p>Today's card appears here after you enter a name or string.</p>
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
  const isBoardVisible = board.children.length > 0 && !board.querySelector(".empty-state");

  if (!isBoardVisible) {
    board.style.removeProperty("--board-size");
    board.style.removeProperty("--cell-font-size");
    return;
  }

  const viewportHeight = window.innerHeight;
  const parentWidth = board.parentElement?.clientWidth ?? board.clientWidth ?? window.innerWidth;
  const horizontalPadding = window.innerWidth <= 820 ? 0 : 8;
  const availableWidth = Math.floor(parentWidth - horizontalPadding);
  const preferredHeight = Math.floor(
    viewportHeight * (window.innerWidth <= 820 ? 0.56 : 0.72),
  );
  const maxBoardSize = window.innerWidth <= 820 ? availableWidth : 820;

  if (availableWidth <= 0) {
    board.style.removeProperty("--board-size");
    board.style.removeProperty("--cell-font-size");
    return;
  }

  const boardSize = Math.min(availableWidth, preferredHeight, maxBoardSize);
  const cellFontSize = Math.max(12, Math.min(18, Math.floor(boardSize / 13)));

  board.style.setProperty("--board-size", `${boardSize}px`);
  board.style.setProperty("--cell-font-size", `${cellFontSize}px`);
}

function getPreferredTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: "light" | "dark"): void {
  document.documentElement.dataset.theme = theme;
  document.body.dataset.theme = theme;
}

function getBingoSummary(
  entries: BingoEntry[],
  selectedIds: Set<string>,
): BingoSummary {
  const lines = getWinningLines(entries);
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

function getWinningLines(entries: BingoEntry[]): BingoEntry[][] {
  const lines: BingoEntry[][] = [];

  for (let row = 0; row < CARD_SIZE; row += 1) {
    const rowEntries: BingoEntry[] = [];

    for (let column = 0; column < CARD_SIZE; column += 1) {
      rowEntries.push(entries[row * CARD_SIZE + column]);
    }

    lines.push(rowEntries);
  }

  for (let column = 0; column < CARD_SIZE; column += 1) {
    const columnEntries: BingoEntry[] = [];

    for (let row = 0; row < CARD_SIZE; row += 1) {
      columnEntries.push(entries[row * CARD_SIZE + column]);
    }

    lines.push(columnEntries);
  }

  const leftDiagonal: BingoEntry[] = [];
  const rightDiagonal: BingoEntry[] = [];

  for (let index = 0; index < CARD_SIZE; index += 1) {
    leftDiagonal.push(entries[index * CARD_SIZE + index]);
    rightDiagonal.push(entries[index * CARD_SIZE + (CARD_SIZE - 1 - index)]);
  }

  lines.push(leftDiagonal, rightDiagonal);

  return lines;
}

function loadSelections(
  normalizedName: string,
  dateKey: string,
  entries: BingoEntry[],
): Set<string> {
  const stored = localStorage.getItem(getSelectionStorageKey(normalizedName, dateKey));

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
    getSelectionStorageKey(state.normalizedName, state.dateKey),
    JSON.stringify([...state.selectedIds]),
  );
}

function persistLastName(rawName: string): void {
  localStorage.setItem(`${STORAGE_PREFIX}:last-name`, rawName);
}

function loadLastName(): string {
  return localStorage.getItem(`${STORAGE_PREFIX}:last-name`) ?? "";
}

function getSelectionStorageKey(normalizedName: string, dateKey: string): string {
  return `${STORAGE_PREFIX}:selections:${dateKey}:${normalizedName}`;
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDateForDisplay(dateKey: string): string {
  const [year, month, day] = dateKey.split("-");

  if (!year || !month || !day) {
    return dateKey;
  }

  return `${day}-${month}-${year}`;
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
