export const WRIST_COACH_BLOB_PREFIX = "wrist-coach:";

export function wristCoachBlobKey(userId: string) {
  return `${WRIST_COACH_BLOB_PREFIX}${userId}`;
}

export const WRIST_CALL_KINDS = ["pitch", "location", "offense", "defense"] as const;
export type WristCallKind = (typeof WRIST_CALL_KINDS)[number];

export function kindLabel(kind: WristCallKind | string) {
  if (kind === "location") return "Location";
  if (kind === "offense") return "Offense";
  if (kind === "defense") return "Defense";
  return "Pitch";
}

export const WRIST_COLORS = ["clear", "white", "black", "red", "blue", "green", "orange"] as const;
export type WristColor = (typeof WRIST_COLORS)[number];

export const WRIST_COLOR_HEX: Record<WristColor, string> = {
  clear: "transparent",
  white: "#ffffff",
  black: "#111827",
  red: "#b91c1c",
  blue: "#1d4ed8",
  green: "#15803d",
  orange: "#ea580c",
};

export function isWristColor(value: unknown): value is WristColor {
  return typeof value === "string" && (WRIST_COLORS as readonly string[]).includes(value);
}

export function normalizeColor(value: unknown, fallback: WristColor = "clear"): WristColor {
  return isWristColor(value) ? value : fallback;
}

export function callColors(call?: Pick<WristCall, "fill" | "ink"> | null) {
  const fill = normalizeColor(call?.fill);
  const ink = normalizeColor(call?.ink);
  const background = fill === "clear" ? "#ffffff" : WRIST_COLOR_HEX[fill];
  let color = "#000000";
  if (ink === "clear") {
    color = fill === "clear" || fill === "white" ? "#000000" : "#ffffff";
  } else if (ink === "white") {
    color = "#ffffff";
  } else {
    color = WRIST_COLOR_HEX[ink];
  }
  return { background, color };
}

export const CARD_SIZE_PRESETS = {
  band: { widthIn: 4, heightIn: 2 },
  play: { widthIn: 3.5, heightIn: 2 },
  softball: { widthIn: 3.5, heightIn: 2.25 },
  wrist: { widthIn: 3.25, heightIn: 2 },
  /** 5 × 3 also fits an adult triple-window panel. */
  large: { widthIn: 5, heightIn: 3 },
  /** Small sleeve Gabe asked for. Wider than the 4.5 × 2.25 playmaker insert. */
  youth: { widthIn: 4.5, heightIn: 2.5 },
  /** Champro youth triple window. */
  tripleYouth: { widthIn: 3.5, heightIn: 2.75 },
  /** Champro pee wee triple window. */
  triplePeewee: { widthIn: 2.75, heightIn: 2.15 },
  /** FieldSage youth triple panel. */
  triplePanel: { widthIn: 4.75, heightIn: 2.25 },
} as const;

/**
 * Letter print sheet. The same numbers are copied in content/apps/wrist-coach.html
 * so a card's CSS inches stay a physical inch when the dialog is at 100%.
 */
export const LETTER_SHEET = {
  widthIn: 8.5,
  heightIn: 11,
  marginIn: 0.4,
  calibrateIn: 1,
  calibrateGapIn: 0.16,
  /** Crop marks stick out 9pt past the card. */
  markOutIn: 9 / 72,
  /** Left padding so the left crop marks stay on the page. */
  markPadIn: 11 / 72,
} as const;

/** Clear border on each side when Laminate is on. The cut line sits outside the print. */
export const LAMINATE_BLEED_IN = 0.125;

/**
 * Laminate keeps the printed card at width × height and moves the cut line
 * one bleed outside it on every side. Off leaves the cut line on the card edge.
 */
export function laminateCutInches(widthIn: number, heightIn: number, on: boolean) {
  const bleed = on ? LAMINATE_BLEED_IN : 0;
  return {
    bleedIn: bleed,
    contentWidthIn: widthIn,
    contentHeightIn: heightIn,
    cutWidthIn: Math.round((widthIn + bleed * 2) * 1000) / 1000,
    cutHeightIn: Math.round((heightIn + bleed * 2) * 1000) / 1000,
  };
}

export function letterSheetFit(
  widthIn: number,
  heightIn: number,
  gapIn: number,
  options?: { reserveIn?: number; sidePadIn?: number },
) {
  const contentW = LETTER_SHEET.widthIn - LETTER_SHEET.marginIn * 2;
  const contentH = LETTER_SHEET.heightIn - LETTER_SHEET.marginIn * 2;
  const reserve = options?.reserveIn ?? LETTER_SHEET.calibrateIn + LETTER_SHEET.calibrateGapIn;
  const side = options?.sidePadIn ?? 0;
  const usableW = contentW - side;
  const usableH = contentH - reserve;
  const cols = Math.max(1, Math.floor((usableW + gapIn) / (widthIn + gapIn)));
  const rows = Math.max(1, Math.floor((usableH + gapIn) / (heightIn + gapIn)));
  return { cols, rows, count: cols * rows };
}

export function letterBlockFits(
  widthIn: number,
  heightIn: number,
  cols: number,
  rows: number,
  gapIn: number,
  options?: { reserveIn?: number; sidePadIn?: number },
) {
  const contentW = LETTER_SHEET.widthIn - LETTER_SHEET.marginIn * 2;
  const contentH = LETTER_SHEET.heightIn - LETTER_SHEET.marginIn * 2;
  const reserve = options?.reserveIn ?? LETTER_SHEET.calibrateIn + LETTER_SHEET.calibrateGapIn;
  const side = options?.sidePadIn ?? 0;
  const blockW = cols * widthIn + Math.max(0, cols - 1) * gapIn + side;
  const blockH = reserve + rows * heightIn + Math.max(0, rows - 1) * gapIn;
  return blockW <= contentW + 1e-6 && blockH <= contentH + 1e-6;
}

export type NamedCardSizePreset = keyof typeof CARD_SIZE_PRESETS;
export type CardSizePreset = NamedCardSizePreset | "custom";

export type WristCardSize = {
  preset: CardSizePreset;
  widthIn: number;
  heightIn: number;
};

export function defaultCardSize(): WristCardSize {
  return { preset: "wrist", ...CARD_SIZE_PRESETS.wrist };
}

/** Largest card that still prints at 100% on Letter, with the calibration row and crop marks. */
export function maxCardInches(): { widthIn: number; heightIn: number } {
  const contentW = LETTER_SHEET.widthIn - LETTER_SHEET.marginIn * 2;
  const contentH = LETTER_SHEET.heightIn - LETTER_SHEET.marginIn * 2;
  const side = LETTER_SHEET.markPadIn + LETTER_SHEET.markOutIn;
  const reserve = LETTER_SHEET.calibrateIn + LETTER_SHEET.calibrateGapIn + LETTER_SHEET.markOutIn;
  return {
    widthIn: Math.floor((contentW - side) * 100) / 100,
    heightIn: Math.floor((contentH - reserve) * 100) / 100,
  };
}

function isNamedCardPreset(value: unknown): value is NamedCardSizePreset {
  return typeof value === "string" && value in CARD_SIZE_PRESETS;
}

function clampInches(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
}

export function normalizeCardSize(raw: unknown): WristCardSize {
  const item = asRecord(raw);
  const preset = item?.preset;
  if (isNamedCardPreset(preset)) {
    return { preset, ...CARD_SIZE_PRESETS[preset] };
  }
  const limits = maxCardInches();
  if (preset === "custom" || item?.widthIn != null || item?.heightIn != null) {
    return {
      preset: "custom",
      widthIn: clampInches(item?.widthIn, CARD_SIZE_PRESETS.softball.widthIn, 1, limits.widthIn),
      heightIn: clampInches(item?.heightIn, CARD_SIZE_PRESETS.softball.heightIn, 1, limits.heightIn),
    };
  }
  return defaultCardSize();
}

/**
 * Equal boxes on a landscape card. Every cell is widthIn/colSlots by heightIn/rowSlots.
 * Six blocks are three across the top and three across the bottom.
 */
export function cardGridMetrics(
  size: { widthIn: number; heightIn: number },
  layout: { grids: number; cols: number; rows: number },
) {
  const topCount = blocksAcross(layout.grids);
  const bottomCount = Math.max(0, layout.grids - topCount);
  const halves = bottomCount > 0 ? 2 : 1;
  const maxAcross = Math.max(topCount, bottomCount, 1);
  const colSlots = maxAcross * (layout.cols + 1);
  const rowSlots = halves * (layout.rows + 1) + 1;
  return {
    topCount,
    bottomCount,
    halves,
    maxAcross,
    colSlots,
    rowSlots,
    cellW: size.widthIn / colSlots,
    cellH: size.heightIn / rowSlots,
  };
}

export type WristCall = {
  id: string;
  kind: WristCallKind;
  name: string;
  short: string;
  fill: WristColor;
  ink: WristColor;
  count: number;
  /** 0 keeps the box count. 1 is rare and fills one or two cells. A higher weight fills more. */
  weight?: number;
};

export type WristCell = {
  grid: number;
  row: number;
  col: number;
  code: string;
  callId: string;
};

export type WristTheme = {
  band: string;
  ink: string;
  highlight: string;
};

export type WristLayout = {
  grids: number;
  rows: number;
  cols: number;
  signStart: number;
  rowStart: number;
};

export type WristKindTitles = {
  offense: string;
  defense: string;
};

export type WristKindThemes = {
  offense: WristTheme;
  defense: WristTheme;
};

export type WristBlockSize = {
  rows: number;
  cols: number;
};

export type WristKindLayouts = {
  offense: WristBlockSize;
  defense: WristBlockSize;
};

export type WristVersion = {
  id: string;
  name: string;
  titles: WristKindTitles;
  themes: WristKindThemes;
  createdAt: number;
  locked: boolean;
  /** @deprecated Legacy alias of offenseCells for older saved books. */
  cells: WristCell[];
  offenseCells: WristCell[];
  defenseCells: WristCell[];
};

export function playCardKind(kind?: WristCallKind | string): "offense" | "defense" {
  return kind === "defense" ? "defense" : "offense";
}

export function cloneCells(cells: WristCell[] | null | undefined): WristCell[] {
  return (cells || []).map((cell) => ({ ...cell }));
}

export function versionCells(
  version:
    | Pick<WristVersion, "offenseCells" | "defenseCells" | "cells">
    | null
    | undefined,
  kind?: WristCallKind | string,
): WristCell[] {
  if (!version) return [];
  if (playCardKind(kind) === "defense") return version.defenseCells || [];
  return version.offenseCells || version.cells || [];
}

export function withVersionCells(
  version: WristVersion,
  kind: WristCallKind | string,
  cells: WristCell[],
): WristVersion {
  const next = cloneCells(cells);
  const offense = cloneCells(version.offenseCells || version.cells);
  const defense = cloneCells(version.defenseCells);
  if (playCardKind(kind) === "defense") {
    return { ...version, defenseCells: next, offenseCells: offense, cells: offense };
  }
  return { ...version, offenseCells: next, defenseCells: defense, cells: next };
}

export const SHEET_SIZE_PRESETS = {
  card: { widthIn: 3.5, heightIn: 5.5 },
  letter: { widthIn: 8.5, heightIn: 11 },
  half: { widthIn: 8.5, heightIn: 5.5 },
  index: { widthIn: 5, heightIn: 8 },
} as const;

export type NamedSheetSizePreset = keyof typeof SHEET_SIZE_PRESETS;
export type SheetSizePreset = NamedSheetSizePreset | "custom";

function isNamedSheetPreset(value: unknown): value is NamedSheetSizePreset {
  return typeof value === "string" && value in SHEET_SIZE_PRESETS;
}

export type WristSheet = {
  cols: number;
  rows: number;
  preset: SheetSizePreset;
  widthIn: number;
  heightIn: number;
};

export type WristBook = {
  version: 1;
  userId: string;
  title: string;
  bandKind: WristCallKind;
  rows: number;
  cols: number;
  grids: number;
  signStart: number;
  rowStart: number;
  /** Block size for each set. Offense is 5×5 and defense is 4×4 unless a saved book says otherwise. */
  kindLayouts: WristKindLayouts;
  theme: WristTheme;
  sheet: WristSheet;
  cardSize: WristCardSize;
  /** How column and row numbers are printed. Standard keeps the block numbers. */
  numbering: WristNumbering;
  library: WristCall[];
  versions: WristVersion[];
  activeVersionId: string;
  updatedAt: number;
};

type WristShuffleBook = Pick<
  WristBook,
  "grids" | "rows" | "cols" | "signStart" | "rowStart" | "bandKind" | "library" | "versions"
> & { title?: string; theme?: WristTheme; kindLayouts?: WristKindLayouts; numbering?: WristNumbering };

/** New cards use 6 blocks. A saved 2-block card stays 2 so it can match the reference samples. */
export const DEFAULT_GRIDS = 6;

/**
 * Blocks across a landscape card. The red 5×5 reference is 3.5in wide by 2in tall:
 * six blocks sit three across the top and three across the bottom, not in one vertical column.
 */
export function blocksAcross(grids: number): number {
  const count = Math.max(1, Math.round(Number(grids)) || 1);
  if (count <= 3) return count;
  return Math.ceil(count / 2);
}

/**
 * Side inset for card type, in points.
 * Two- and three-block cards keep the 0.9pt gap from the reference samples.
 * A 6-block cell is about 13pt wide, so that fixed gap is eased toward 0.35pt
 * and the one shared type size can grow. Cells at least 20pt wide keep 0.9pt.
 */
export function sidePadPt(cellW: number, grids: number): number {
  if (!Number.isFinite(cellW) || cellW <= 0) return 0.9;
  if (!Number.isFinite(grids) || grids <= 3) return 0.9;
  const wide = 20;
  const tight = 14;
  if (cellW >= wide) return 0.9;
  if (cellW <= tight) return 0.35;
  const t = (cellW - tight) / (wide - tight);
  return Math.round((0.35 + (0.9 - 0.35) * t) * 1000) / 1000;
}

/** White knockout behind dark type. Reference sizes (about 16pt and up) stay at 0.4pt. */
export function knockoutPt(sizePt: number): number {
  if (!Number.isFinite(sizePt) || sizePt >= 15.5) return 0.4;
  return Math.round(Math.max(0.22, sizePt * (0.4 / 15.9)) * 1000) / 1000;
}

export const DEFAULT_ROWS = 5;
export const DEFAULT_COLS = 5;
export const DEFAULT_DEFENSE_ROWS = 4;
export const DEFAULT_DEFENSE_COLS = 4;
export const OFFENSE_BAND = "#ff0000";
export const DEFENSE_BAND = "#f7bad1";
export const DEFAULT_SIGN_START = 1;
export const DEFAULT_ROW_START = 1;
export const DEFAULT_SHEET_COLS = 15;
export const DEFAULT_SHEET_ROWS = 1;

export function defaultSheet(): WristSheet {
  return {
    cols: DEFAULT_SHEET_COLS,
    rows: DEFAULT_SHEET_ROWS,
    preset: "card",
    ...SHEET_SIZE_PRESETS.card,
  };
}

export function normalizeSheet(raw: unknown): WristSheet {
  const item = asRecord(raw) || {};
  const cols = clampInt(item.cols, DEFAULT_SHEET_COLS, 4, 20);
  const rows = clampInt(item.rows, DEFAULT_SHEET_ROWS, 1, 8);
  const preset = item.preset;
  if (isNamedSheetPreset(preset)) {
    return { cols, rows, preset, ...SHEET_SIZE_PRESETS[preset] };
  }
  if (preset === "custom" || item.widthIn != null || item.heightIn != null) {
    return {
      cols,
      rows,
      preset: "custom",
      widthIn: clampInches(item.widthIn, SHEET_SIZE_PRESETS.card.widthIn, 2, 8.5),
      heightIn: clampInches(item.heightIn, SHEET_SIZE_PRESETS.card.heightIn, 2, 11),
    };
  }
  return { cols, rows, preset: "card", ...SHEET_SIZE_PRESETS.card };
}

export function defaultTheme(): WristTheme {
  return { band: "#7e22ce", ink: "#ffffff", highlight: "#ffffff" };
}

export function normalizeHex(value: unknown, fallback: string) {
  const raw = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    const h = raw.slice(1).toLowerCase();
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  }
  return fallback;
}

export function defaultKindTitles(fallback?: string): WristKindTitles {
  const base = String(fallback || "").trim();
  return {
    offense: base || "Offense",
    defense: base || "Defense",
  };
}

export function normalizeKindTitles(raw: unknown, fallback?: string): WristKindTitles {
  const item = asRecord(raw);
  const defaults = defaultKindTitles(fallback);
  return {
    offense: String(item?.offense || "").trim() || defaults.offense,
    defense: String(item?.defense || "").trim() || defaults.defense,
  };
}

export function kindTitle(
  version: Pick<WristVersion, "titles"> | null | undefined,
  kind: WristCallKind | string,
  fallback?: string,
) {
  const titles = version?.titles
    ? normalizeKindTitles(version.titles, fallback)
    : defaultKindTitles(fallback);
  return kind === "defense" ? titles.defense : titles.offense;
}

export function defaultKindThemes(fallback?: WristTheme): WristKindThemes {
  const theme = normalizeTheme(fallback);
  return {
    offense: { ...theme },
    defense: { ...theme },
  };
}

export function defaultSetThemes(): WristKindThemes {
  const white = "#ffffff";
  const ink = "#000000";
  return {
    offense: { band: OFFENSE_BAND, ink, highlight: white },
    defense: { band: DEFENSE_BAND, ink, highlight: white },
  };
}

export function defaultKindLayouts(
  rows = DEFAULT_ROWS,
  cols = DEFAULT_COLS,
): WristKindLayouts {
  return {
    offense: { rows, cols },
    defense: { rows: DEFAULT_DEFENSE_ROWS, cols: DEFAULT_DEFENSE_COLS },
  };
}

export function normalizeKindLayouts(
  raw: unknown,
  fallbackRows: number,
  fallbackCols: number,
): WristKindLayouts {
  const item = asRecord(raw);
  const rows = clampInt(fallbackRows, DEFAULT_ROWS, 3, 8);
  const cols = clampInt(fallbackCols, DEFAULT_COLS, 3, 8);
  if (!item) {
    return {
      offense: { rows, cols },
      defense: { rows, cols },
    };
  }
  const offense = asRecord(item.offense);
  const defense = asRecord(item.defense);
  return {
    offense: {
      rows: clampInt(offense?.rows, rows, 3, 8),
      cols: clampInt(offense?.cols, cols, 3, 8),
    },
    defense: {
      rows: clampInt(defense?.rows, defense ? DEFAULT_DEFENSE_ROWS : rows, 3, 8),
      cols: clampInt(defense?.cols, defense ? DEFAULT_DEFENSE_COLS : cols, 3, 8),
    },
  };
}

export function normalizeKindThemes(raw: unknown, fallback?: WristTheme): WristKindThemes {
  const item = asRecord(raw);
  const defaults = defaultKindThemes(fallback);
  return {
    offense: item?.offense != null ? normalizeTheme(item.offense) : defaults.offense,
    defense: item?.defense != null ? normalizeTheme(item.defense) : defaults.defense,
  };
}

export function kindTheme(
  version: Pick<WristVersion, "themes"> | null | undefined,
  kind: WristCallKind | string,
  fallback?: WristTheme,
) {
  const themes = version?.themes
    ? normalizeKindThemes(version.themes, fallback)
    : defaultKindThemes(fallback);
  return kind === "defense" ? themes.defense : themes.offense;
}

export function normalizeTheme(raw: unknown): WristTheme {
  const fallback = defaultTheme();
  const item = asRecord(raw);
  return {
    band: normalizeHex(item?.band ?? item?.wristband, fallback.band),
    ink: normalizeHex(item?.ink ?? item?.text, fallback.ink),
    highlight: normalizeHex(item?.highlight ?? item?.cell, fallback.highlight),
  };
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function normalizeLayout(raw: unknown): WristLayout {
  const item = asRecord(raw) || {};
  const legacySingle = item.grids == null && Number(item.rows) === 6 && Number(item.cols) === 5;
  if (legacySingle) {
    return {
      grids: DEFAULT_GRIDS,
      rows: DEFAULT_ROWS,
      cols: DEFAULT_COLS,
      signStart: DEFAULT_SIGN_START,
      rowStart: DEFAULT_ROW_START,
    };
  }
  return {
    grids: clampInt(item.grids, DEFAULT_GRIDS, 1, 8),
    rows: clampInt(item.rows, DEFAULT_ROWS, 3, 8),
    cols: clampInt(item.cols, DEFAULT_COLS, 3, 8),
    signStart: clampInt(item.signStart, DEFAULT_SIGN_START, 0, 9),
    rowStart: clampInt(item.rowStart, DEFAULT_ROW_START, 0, 9),
  };
}

export function layoutFor(
  book: Pick<WristBook, "grids" | "rows" | "cols" | "signStart" | "rowStart"> & {
    kindLayouts?: WristKindLayouts;
    bandKind?: string;
  },
  kind?: WristCallKind | string,
): WristLayout {
  const which = playCardKind(kind || book.bandKind);
  const block = book.kindLayouts?.[which];
  return {
    grids: clampInt(book.grids, DEFAULT_GRIDS, 1, 8),
    rows: clampInt(block?.rows ?? book.rows, DEFAULT_ROWS, 3, 8),
    cols: clampInt(block?.cols ?? book.cols, DEFAULT_COLS, 3, 8),
    signStart: clampInt(book.signStart, DEFAULT_SIGN_START, 0, 9),
    rowStart: clampInt(book.rowStart, DEFAULT_ROW_START, 0, 9),
  };
}

export function layoutOf(
  book: Pick<WristBook, "grids" | "rows" | "cols" | "signStart" | "rowStart"> & {
    kindLayouts?: WristKindLayouts;
    bandKind?: string;
  },
): WristLayout {
  return layoutFor(book, book.bandKind);
}

export function cellCount(layout: WristLayout) {
  return layout.grids * layout.rows * layout.cols;
}

export function columnCode(grid: number, col: number, signStart = DEFAULT_SIGN_START) {
  return String(grid * 10 + signStart + col).padStart(2, "0");
}

export function rowCode(row: number, rowStart = DEFAULT_ROW_START) {
  return String(rowStart + row);
}

export function callCode(
  grid: number,
  row: number,
  col: number,
  signStart = DEFAULT_SIGN_START,
  rowStart = DEFAULT_ROW_START,
) {
  return `${columnCode(grid, col, signStart)}-${rowCode(row, rowStart)}`;
}

export function sheetCode(
  grid: number,
  row: number,
  col: number,
  signStart = DEFAULT_SIGN_START,
  rowStart = DEFAULT_ROW_START,
) {
  return `${columnCode(grid, col, signStart)}${rowCode(row, rowStart)}`;
}

export type WristNumbering = "standard" | "ordered" | "oneHand";

export function normalizeNumbering(value: unknown): WristNumbering {
  if (value === "ordered" || value === "oneHand") return value;
  return "standard";
}

/** Bijective base 5, written with the digits 1–5. 1 is "1", 6 is "11", 30 is "55". */
export function oneHandDigits(value: number) {
  let n = Math.max(1, Math.round(value));
  const digits: string[] = [];
  while (n > 0) {
    const rem = (n - 1) % 5;
    digits.push(String(rem + 1));
    n = Math.floor((n - 1) / 5);
  }
  return digits.reverse().join("");
}

export function columnLabel(
  grid: number,
  col: number,
  cols: number,
  numbering: WristNumbering = "standard",
  signStart = DEFAULT_SIGN_START,
) {
  const across = grid * Math.max(1, cols) + col + 1;
  if (numbering === "ordered") return String(across);
  if (numbering === "oneHand") return oneHandDigits(across);
  return columnCode(grid, col, signStart);
}

export function rowLabel(
  row: number,
  numbering: WristNumbering = "standard",
  rowStart = DEFAULT_ROW_START,
) {
  if (numbering === "ordered") return String(row + 1);
  if (numbering === "oneHand") return oneHandDigits(row + 1);
  return rowCode(row, rowStart);
}

export function signalCallCode(
  grid: number,
  row: number,
  col: number,
  cols: number,
  numbering: WristNumbering = "standard",
  signStart = DEFAULT_SIGN_START,
  rowStart = DEFAULT_ROW_START,
) {
  if (numbering === "standard") return callCode(grid, row, col, signStart, rowStart);
  return `${columnLabel(grid, col, cols, numbering, signStart)}-${rowLabel(row, numbering, rowStart)}`;
}

export function signalSheetCode(
  grid: number,
  row: number,
  col: number,
  cols: number,
  numbering: WristNumbering = "standard",
  signStart = DEFAULT_SIGN_START,
  rowStart = DEFAULT_ROW_START,
) {
  if (numbering === "standard") return sheetCode(grid, row, col, signStart, rowStart);
  return `${columnLabel(grid, col, cols, numbering, signStart)}-${rowLabel(row, numbering, rowStart)}`;
}

function largestRemainder(weights: number[], total: number) {
  const counts = weights.map(() => 0);
  if (total <= 0 || !weights.length) return counts;
  const sum = weights.reduce((totalWeight, weight) => totalWeight + weight, 0) || weights.length;
  const exact = weights.map((weight) => (total * weight) / sum);
  for (let i = 0; i < weights.length; i += 1) counts[i] = Math.floor(exact[i]);
  let left = total - counts.reduce((sumCounts, count) => sumCounts + count, 0);
  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value), weight: weights[index] }))
    .sort((a, b) => b.frac - a.frac || b.weight - a.weight || a.index - b.index);
  for (const item of order) {
    if (left <= 0) break;
    counts[item.index] += 1;
    left -= 1;
  }
  return counts;
}

export function allocateCallCounts(
  calls: Array<{ id: string; weight: number; rare?: boolean }>,
  total: number,
) {
  const counts: Record<string, number> = {};
  for (const call of calls) counts[call.id] = 0;
  if (total <= 0 || !calls.length) return counts;
  const rare = calls.filter((call) => call.rare);
  const common = calls.filter((call) => !call.rare);
  const weightOf = new Map(calls.map((call) => [call.id, Math.max(1, Math.round(call.weight) || 1)]));
  const give = (group: Array<{ id: string }>, amount: number) => {
    if (!group.length || amount <= 0) return;
    const share = largestRemainder(group.map((call) => weightOf.get(call.id) || 1), amount);
    group.forEach((call, index) => {
      counts[call.id] += share[index];
    });
  };
  if (!rare.length) {
    give(calls, total);
    return counts;
  }
  if (!common.length) {
    let left = Math.min(total, rare.length * 2);
    for (const call of rare) {
      if (left <= 0) break;
      counts[call.id] = 1;
      left -= 1;
    }
    for (const call of rare) {
      if (left <= 0) break;
      counts[call.id] += 1;
      left -= 1;
    }
    return counts;
  }
  if (total < calls.length) {
    give(common, total);
    return counts;
  }
  for (const call of calls) counts[call.id] = 1;
  give(common, total - calls.length);
  for (const call of rare) {
    const donor = common.reduce((best, item) => (counts[item.id] > counts[best.id] ? item : best));
    if (counts[donor.id] >= 4 && counts[call.id] < 2) {
      counts[donor.id] -= 1;
      counts[call.id] += 1;
    }
  }
  return counts;
}

export type WristSheetGroup = {
  callId: string;
  name: string;
  short: string;
  codes: string[];
};

export function sheetGroups(book: WristBook, version: WristVersion | null): WristSheetGroup[] {
  if (!version) return [];
  const kind = playCardKind(book.bandKind);
  const layout = layoutFor(book, kind);
  const byCall = new Map<string, string[]>();
  for (const cell of versionCells(version, kind)) {
    if (!cell.callId) continue;
    const call = callById(book, cell.callId);
    if (!call || call.kind !== kind) continue;
    const list = byCall.get(call.id) || [];
    list.push(
      signalSheetCode(
        cell.grid,
        cell.row,
        cell.col,
        layout.cols,
        book.numbering,
        layout.signStart,
        layout.rowStart,
      ),
    );
    byCall.set(call.id, list);
  }
  return book.library
    .filter((call) => call.kind === kind && byCall.has(call.id))
    .map((call) => ({
      callId: call.id,
      name: call.name,
      short: call.short,
      codes: (byCall.get(call.id) || []).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    }));
}

export function cardCounts(
  version: WristVersion | null,
  kind?: WristCallKind | string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const cell of versionCells(version, kind)) {
    if (!cell.callId) continue;
    counts[cell.callId] = (counts[cell.callId] || 0) + 1;
  }
  return counts;
}

export function materializeKindCounts(
  library: WristCall[],
  kind: WristCallKind,
  counts: Record<string, number>,
): WristCall[] {
  return library.map((call) =>
    call.kind === kind ? { ...call, count: counts[call.id] || 0 } : call,
  );
}

export function moveLibraryCall(
  library: WristCall[],
  id: string,
  direction: -1 | 1,
): WristCall[] {
  const call = library.find((item) => item.id === id);
  if (!call) return library;
  const kindItems = library.filter((item) => item.kind === call.kind);
  const from = kindItems.findIndex((item) => item.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= kindItems.length) return library;
  const reordered = kindItems.slice();
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved);
  let i = 0;
  return library.map((item) => (item.kind === call.kind ? reordered[i++] : item));
}

export function rebalanceCounts(
  library: WristCall[],
  sourceId: string,
  otherId: string,
  nextSourceCount: number,
): WristCall[] | null {
  const source = library.find((item) => item.id === sourceId);
  const other = library.find((item) => item.id === otherId);
  if (!source || !other || source.id === other.id || source.kind !== other.kind) return null;
  const next = Math.max(0, Math.round(Number(nextSourceCount) || 0));
  const delta = next - source.count;
  if (delta === 0) return library;
  const otherNext = other.count - delta;
  if (otherNext < 0) return null;
  return library.map((item) => {
    if (item.id === sourceId) return { ...item, count: next };
    if (item.id === otherId) return { ...item, count: otherNext };
    return item;
  });
}

const DEFAULT_PITCHES: Array<[string, string, string]> = [
  ["pitch-fb", "Fastball", "FB"],
  ["pitch-ch", "Change", "CH"],
  ["pitch-rs", "Rise", "RS"],
  ["pitch-dr", "Drop", "DR"],
  ["pitch-cv", "Curve", "CV"],
  ["pitch-sc", "Screw", "SC"],
  ["pitch-dc", "Drop curve", "DC"],
  ["pitch-rc", "Rise curve", "RC"],
  ["pitch-pl", "Peel", "PL"],
];

const DEFAULT_LOCATIONS: Array<[string, string, string]> = [
  ["loc-in", "Inside", "IN"],
  ["loc-out", "Outside", "OUT"],
  ["loc-up", "Up", "UP"],
  ["loc-dn", "Down", "DN"],
  ["loc-ui", "Up and in", "UI"],
  ["loc-ua", "Up and away", "UA"],
  ["loc-di", "Down and in", "DI"],
  ["loc-da", "Down and away", "DA"],
  ["loc-mid", "Middle", "MID"],
];

const DEFAULT_OFFENSE: Array<[string, string, string, number?]> = [
  ["play-br", "Bunt + run", "B+R", 15],
  ["play-b1", "Bunt to 1st", "B1", 15],
  ["play-b3", "Bunt to 3rd", "B3", 15],
  ["play-des", "Delayed steal", "DES", 13],
  ["play-fbh", "Fake bunt + hit", "FBH", 11],
  ["play-fbs", "Fake bunt + steal", "FBS", 10],
  ["play-fbt", "Fake bunt + take", "FBT", 10],
  ["play-hr", "Hit and run", "H+R", 10],
  ["play-ssq", "Safety squeeze", "SAS", 7],
  ["play-stl", "Steal", "S", 15],
  ["play-sus", "Suicide squeeze", "SUS", 7],
  ["play-tke", "Take", "T", 7],
  ["play-x", "X", "X", 15],
  ["play-ha", "Hit away", "HA"],
  ["play-bnt", "Bunt", "BNT"],
  ["play-slp", "Slap", "SLP"],
  ["play-sqz", "Squeeze", "SQZ"],
  ["play-swg", "Swing", "SWG"],
  ["play-dly", "Delay steal", "DLY"],
  ["play-fbn", "Fake bunt", "FBN"],
  ["play-sac", "Sacrifice", "SAC"],
  ["play-slh", "Slash", "SLH"],
  ["play-dbl", "Double steal", "DBL"],
  ["play-s2", "Steal second", "S2"],
  ["play-s3", "Steal third", "S3"],
  ["play-bfh", "Bunt for hit", "BFH"],
];

const DEFAULT_DEFENSE: Array<[string, string, string]> = [
  ["def-hld", "Hold", "HLD"],
  ["def-thr", "Throw through", "THR"],
  ["def-cut", "Cut", "CUT"],
  ["def-pk", "Pickoff", "PK"],
  ["def-ibb", "Intentional walk", "IBB"],
  ["def-ifi", "Infield in", "IFI"],
  ["def-ifb", "Infield back", "IFB"],
  ["def-cin", "Corners in", "CIN"],
  ["def-po", "Pitch out", "PO"],
  ["def-bnd", "Bunt defense", "BND"],
  ["def-plt", "Play at plate", "PLT"],
  ["def-p2", "Play at two", "P2"],
  ["def-c2", "Cut 2", "C2"],
  ["def-13", "1st and 3rd", "13"],
  ["def-ns", "No steal", "NS"],
];

const LOCATION_PITCH_IDS = new Set(["pitch-in", "pitch-out", "pitch-up", "pitch-dn"]);
const LOCATION_SHORTS = new Set(["IN", "OUT", "UP", "DN", "UI", "UA", "DI", "DA", "MID"]);

function slugCall(kind: WristCallKind, name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return `${kind}-${base || "call"}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newCallId(kind: WristCallKind, name: string) {
  return slugCall(kind, name);
}

function rowsToCalls(
  kind: WristCallKind,
  rows: Array<[string, string, string] | [string, string, string, number?]>,
): WristCall[] {
  return rows.map((row) => ({
    id: row[0],
    kind,
    name: row[1],
    short: row[2],
    fill: "clear",
    ink: "clear",
    count: clampInt(row[3], 0, 0, 300),
  }));
}

export function defaultLibrary(): WristCall[] {
  return [
    ...rowsToCalls("pitch", DEFAULT_PITCHES),
    ...rowsToCalls("location", DEFAULT_LOCATIONS),
    ...rowsToCalls("offense", DEFAULT_OFFENSE),
    ...rowsToCalls("defense", DEFAULT_DEFENSE),
  ];
}

function callKey(call: Pick<WristCall, "id" | "name" | "short">) {
  return [
    String(call.id || "").toLowerCase(),
    String(call.short || "").toUpperCase(),
    String(call.name || "").trim().toLowerCase(),
  ].filter(Boolean);
}

function libraryHas(list: WristCall[], candidate: WristCall) {
  const keys = new Set(list.flatMap(callKey));
  return callKey(candidate).some((key) => keys.has(key));
}

function reclassifyLocations(list: WristCall[]) {
  return list.map((call) => {
    const short = call.short.toUpperCase();
    if (
      call.kind === "pitch" &&
      (LOCATION_PITCH_IDS.has(call.id) || LOCATION_SHORTS.has(short))
    ) {
      return { ...call, kind: "location" as const };
    }
    return call;
  });
}

export function isLegacyTwoGroupLibrary(list: WristCall[]) {
  const kinds = new Set(list.map((item) => item.kind));
  return !kinds.has("defense") && !kinds.has("location");
}

export function upgradeLibrary(list: WristCall[]) {
  const next = reclassifyLocations(list);
  if (!isLegacyTwoGroupLibrary(list)) return next;
  const extras = [
    ...rowsToCalls("location", DEFAULT_LOCATIONS),
    ...rowsToCalls("offense", DEFAULT_OFFENSE),
    ...rowsToCalls("defense", DEFAULT_DEFENSE),
  ];
  for (const call of extras) {
    if (!libraryHas(next, call)) next.push(call);
  }
  return next;
}

export function nextVersionName(existing: WristVersion[]) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const used = new Set(existing.map((item) => item.name.trim().toUpperCase()));
  for (const letter of letters) {
    const name = `Version ${letter}`;
    if (!used.has(name.toUpperCase())) return name;
  }
  return `Version ${existing.length + 1}`;
}

function shuffleInPlace<T>(list: T[]) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export function signBag(
  library: WristCall[],
  kind: WristCallKind,
  total: number,
  prefer?: "weight" | "count",
) {
  if (total <= 0) return [];
  const signs = library.filter((item) => item.kind === kind && item.id);
  if (!signs.length) return Array.from({ length: total }, () => "");
  const useWeight = prefer !== "count" && signs.some((item) => (item.weight || 0) > 0);
  const bag: string[] = [];
  if (useWeight) {
    const active = signs.filter((item) => (item.weight || 0) > 0 || (item.count || 0) > 0);
    const counts = allocateCallCounts(
      active.map((item) => ({
        id: item.id,
        weight: (item.weight || 0) > 0 ? item.weight || 1 : item.count,
        rare: item.weight === 1,
      })),
      total,
    );
    for (const sign of active) {
      const n = counts[sign.id] || 0;
      for (let i = 0; i < n; i += 1) bag.push(sign.id);
    }
    while (bag.length < total) bag.push("");
    return shuffleInPlace(bag);
  }
  const specified = signs.some((item) => (item.count || 0) > 0);
  if (specified) {
    for (const sign of signs) {
      const n = Math.max(0, Math.round(Number(sign.count) || 0));
      for (let i = 0; i < n; i += 1) bag.push(sign.id);
    }
  } else {
    const base = Math.floor(total / signs.length);
    let extra = total % signs.length;
    for (const sign of signs) {
      const n = base + (extra > 0 ? 1 : 0);
      extra -= extra > 0 ? 1 : 0;
      for (let i = 0; i < n; i += 1) bag.push(sign.id);
    }
  }
  if (!bag.length) return Array.from({ length: total }, () => "");
  if (bag.length < total) {
    const pad = bag.slice();
    while (bag.length < total) bag.push(pad[bag.length % pad.length]);
  }
  return shuffleInPlace(bag.slice(0, total));
}

export function bookLayout(
  book: Pick<WristBook, "grids" | "rows" | "cols" | "signStart" | "rowStart"> & {
    kindLayouts?: WristKindLayouts;
    bandKind?: string;
  },
  kind?: WristCallKind | string,
): WristLayout {
  return layoutFor(book, kind);
}

export function buildKindCells(
  book: Pick<WristBook, "grids" | "rows" | "cols" | "signStart" | "rowStart" | "library"> & {
    kindLayouts?: WristKindLayouts;
    bandKind?: string;
    numbering?: WristNumbering;
  },
  kind: WristCallKind | string,
): WristCell[] {
  const layout = layoutFor(book, kind);
  const cardKind = playCardKind(kind);
  const assigned = signBag(book.library, cardKind, cellCount(layout));
  const cells: WristCell[] = [];
  let i = 0;
  for (let grid = 0; grid < layout.grids; grid += 1) {
    for (let row = 0; row < layout.rows; row += 1) {
      for (let col = 0; col < layout.cols; col += 1) {
        cells.push({
          grid,
          row,
          col,
          code: signalCallCode(
            grid,
            row,
            col,
            layout.cols,
            book.numbering || "standard",
            layout.signStart,
            layout.rowStart,
          ),
          callId: assigned[i] || "",
        });
        i += 1;
      }
    }
  }
  return cells;
}

function cellsMatchLayout(cells: WristCell[] | null | undefined, layout: WristLayout) {
  return Array.isArray(cells) && cells.length === cellCount(layout);
}

export function inferPlayCardKind(
  cells: WristCell[] | null | undefined,
  library: WristCall[],
): "offense" | "defense" | null {
  if (!cells?.length) return null;
  const byId = new Map(library.map((call) => [call.id, call]));
  let offense = 0;
  let defense = 0;
  for (const cell of cells) {
    const call = byId.get(cell.callId);
    if (call?.kind === "offense") offense += 1;
    else if (call?.kind === "defense") defense += 1;
  }
  if (defense > offense) return "defense";
  if (offense > 0) return "offense";
  return null;
}

export function shuffleVersion(
  book: WristShuffleBook,
  name?: string,
  titles?: WristKindTitles,
  themes?: WristKindThemes,
): WristVersion {
  const offenseCells = buildKindCells(book, "offense");
  const defenseCells = buildKindCells(book, "defense");
  return {
    id: `ver-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: name?.trim() || nextVersionName(book.versions),
    titles: normalizeKindTitles(titles, book.title),
    themes: normalizeKindThemes(themes, book.theme),
    createdAt: Date.now(),
    locked: false,
    cells: offenseCells,
    offenseCells,
    defenseCells,
  };
}

export function copyCurrentVersion(
  book: Pick<WristBook, "versions">,
  version: WristVersion,
): WristVersion {
  const offenseCells = cloneCells(version.offenseCells || version.cells);
  const defenseCells = cloneCells(version.defenseCells);
  return {
    id: `ver-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: nextVersionName(book.versions),
    titles: normalizeKindTitles(version.titles),
    themes: normalizeKindThemes(version.themes),
    createdAt: Date.now(),
    locked: false,
    cells: offenseCells,
    offenseCells,
    defenseCells,
  };
}

export function shuffleCurrentVersion(
  book: WristShuffleBook,
  version: WristVersion,
  kind?: WristCallKind | string,
): WristVersion | null {
  if (version.locked) return null;
  const cardKind = playCardKind(kind || book.bandKind);
  return withVersionCells(version, cardKind, buildKindCells(book, cardKind));
}

export function refillVersionCards(
  book: WristShuffleBook,
  version: WristVersion,
): WristVersion | null {
  if (version.locked) return null;
  const next = shuffleVersion(book, version.name, version.titles, version.themes);
  return {
    ...next,
    id: version.id,
    createdAt: version.createdAt,
    locked: false,
    titles: normalizeKindTitles(version.titles, book.title),
    themes: normalizeKindThemes(version.themes, book.theme),
  };
}

export function setVersionLocked(version: WristVersion, locked: boolean): WristVersion {
  return { ...version, locked: Boolean(locked) };
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeKind(value: unknown): WristCallKind {
  if (value === "location" || value === "offense" || value === "defense" || value === "pitch") {
    return value;
  }
  return "pitch";
}

function normalizeCall(raw: unknown, index: number): WristCall | null {
  const item = asRecord(raw);
  if (!item) return null;
  const kind = normalizeKind(item.kind);
  const name = String(item.name || "").trim();
  const short = String(item.short || "").trim().slice(0, 4).toUpperCase();
  if (!name && !short) return null;
  return {
    id: String(item.id || `call-${kind}-${index}`),
    kind,
    name: name || short || kindLabel(kind),
    short: short || (name || "XX").slice(0, 3).toUpperCase(),
    fill: normalizeColor(item.fill),
    ink: normalizeColor(item.ink),
    count: clampInt(item.count, 0, 0, 300),
    weight: clampInt(item.weight, 0, 0, 30),
  };
}

function normalizeCell(raw: unknown, layout: WristLayout, numbering: WristNumbering = "standard"): WristCell | null {
  const item = asRecord(raw);
  if (!item) return null;
  const row = Number(item.row);
  const col = Number(item.col);
  if (!Number.isFinite(row) || !Number.isFinite(col)) return null;
  const grid = Number.isFinite(Number(item.grid)) ? Number(item.grid) : 0;
  if (grid < 0 || grid >= layout.grids || row < 0 || row >= layout.rows || col < 0 || col >= layout.cols) {
    return null;
  }
  return {
    grid,
    row,
    col,
    code: signalCallCode(grid, row, col, layout.cols, numbering, layout.signStart, layout.rowStart),
    callId: String(item.callId || ""),
  };
}

function parseCells(raw: unknown, layout: WristLayout, numbering: WristNumbering): WristCell[] {
  return (Array.isArray(raw) ? raw : [])
    .map((cell) => normalizeCell(cell, layout, numbering))
    .filter((cell): cell is WristCell => Boolean(cell));
}

function normalizeVersion(
  raw: unknown,
  index: number,
  offenseLayout: WristLayout,
  defenseLayout: WristLayout,
  library: WristCall[],
  kindLayouts: WristKindLayouts,
  fallbackTitle?: string,
  fallbackTheme?: WristTheme,
  numbering: WristNumbering = "standard",
): WristVersion | null {
  const item = asRecord(raw);
  if (!item) return null;
  const legacyOffense = parseCells(item.cells, offenseLayout, numbering);
  const legacyDefense = parseCells(item.cells, defenseLayout, numbering);
  let offenseCells = parseCells(item.offenseCells, offenseLayout, numbering);
  let defenseCells = parseCells(item.defenseCells, defenseLayout, numbering);
  const draft = {
    grids: offenseLayout.grids,
    rows: offenseLayout.rows,
    cols: offenseLayout.cols,
    signStart: offenseLayout.signStart,
    rowStart: offenseLayout.rowStart,
    kindLayouts,
    library,
    numbering,
  };

  if (!cellsMatchLayout(offenseCells, offenseLayout) && cellsMatchLayout(legacyOffense, offenseLayout)) {
    const legacyIsDefense =
      inferPlayCardKind(legacyOffense, library) === "defense" &&
      !cellsMatchLayout(defenseCells, defenseLayout) &&
      cellCount(offenseLayout) === cellCount(defenseLayout);
    if (!legacyIsDefense) offenseCells = cloneCells(legacyOffense);
  }
  if (
    !cellsMatchLayout(defenseCells, defenseLayout) &&
    cellsMatchLayout(legacyDefense, defenseLayout) &&
    inferPlayCardKind(legacyDefense, library) === "defense"
  ) {
    defenseCells = cloneCells(legacyDefense);
  }
  if (!cellsMatchLayout(offenseCells, offenseLayout)) offenseCells = buildKindCells(draft, "offense");
  if (!cellsMatchLayout(defenseCells, defenseLayout)) defenseCells = buildKindCells(draft, "defense");

  return {
    id: String(item.id || `ver-${index}`),
    name: String(item.name || `Version ${index + 1}`).trim() || `Version ${index + 1}`,
    titles: normalizeKindTitles(item.titles, fallbackTitle),
    themes: normalizeKindThemes(item.themes, fallbackTheme),
    createdAt: Number(item.createdAt) || Date.now(),
    locked: Boolean(item.locked),
    cells: offenseCells,
    offenseCells,
    defenseCells,
  };
}

function bookDraft(
  userId: string,
  title: string,
  extra: Partial<WristBook> = {},
): WristBook {
  const rows = extra.rows ?? DEFAULT_ROWS;
  const cols = extra.cols ?? DEFAULT_COLS;
  const grids = extra.grids ?? DEFAULT_GRIDS;
  const signStart = extra.signStart ?? DEFAULT_SIGN_START;
  const rowStart = extra.rowStart ?? DEFAULT_ROW_START;
  const kindLayouts =
    extra.kindLayouts ||
    ({
      offense: { rows, cols },
      defense: { rows, cols },
    } satisfies WristKindLayouts);
  return {
    version: 1,
    userId,
    title,
    bandKind: extra.bandKind || "offense",
    rows,
    cols,
    grids,
    signStart,
    rowStart,
    kindLayouts,
    theme: extra.theme || defaultTheme(),
    sheet: extra.sheet || defaultSheet(),
    cardSize: extra.cardSize || defaultCardSize(),
    numbering: extra.numbering || "standard",
    library: extra.library || defaultLibrary(),
    versions: extra.versions || [],
    activeVersionId: extra.activeVersionId || "",
    updatedAt: extra.updatedAt || Date.now(),
  };
}

export function emptyBook(userId: string, title?: string): WristBook {
  const draft = bookDraft(userId, title?.trim() || "My signs");
  draft.kindLayouts = defaultKindLayouts();
  draft.theme = defaultSetThemes().offense;
  const first = shuffleVersion(draft, "Version A", defaultKindTitles(draft.title), defaultSetThemes());
  draft.versions = [first];
  draft.activeVersionId = first.id;
  return draft;
}

export function normalizeBook(raw: unknown, userId: string, title?: string): WristBook {
  const item = asRecord(raw);
  if (!item) return emptyBook(userId, title);
  const layout = normalizeLayout(item);
  const kindLayouts = normalizeKindLayouts(item.kindLayouts, layout.rows, layout.cols);
  const library = (Array.isArray(item.library) ? item.library : [])
    .map(normalizeCall)
    .filter((call): call is WristCall => Boolean(call));
  const book = bookDraft(userId, String(item.title || "").trim() || title?.trim() || "My signs", {
    bandKind: normalizeKind(item.bandKind || item.kind || "offense"),
    ...layout,
    kindLayouts,
    theme: normalizeTheme(item.theme),
    sheet: normalizeSheet(item.sheet || { cols: item.sheetCols, rows: item.sheetRows }),
    cardSize: normalizeCardSize(item.cardSize),
    numbering: normalizeNumbering(item.numbering),
    library: library.length ? upgradeLibrary(library) : defaultLibrary(),
    updatedAt: Number(item.updatedAt) || Date.now(),
  });
  const offenseLayout = layoutFor(book, "offense");
  const defenseLayout = layoutFor(book, "defense");
  book.versions = (Array.isArray(item.versions) ? item.versions : [])
    .map((version, index) =>
      normalizeVersion(
        version,
        index,
        offenseLayout,
        defenseLayout,
        book.library,
        book.kindLayouts,
        book.title,
        book.theme,
        book.numbering,
      ),
    )
    .filter((version): version is WristVersion => Boolean(version));
  if (!book.versions.length) {
    const first = shuffleVersion(book, "Version A");
    book.versions = [first];
  }
  const active = String(item.activeVersionId || "");
  book.activeVersionId = book.versions.some((version) => version.id === active)
    ? active
    : book.versions[0].id;
  return book;
}

export function callById(book: WristBook, callId: string) {
  return book.library.find((item) => item.id === callId) || null;
}

export function activeVersion(book: WristBook) {
  return book.versions.find((item) => item.id === book.activeVersionId) || book.versions[0] || null;
}
