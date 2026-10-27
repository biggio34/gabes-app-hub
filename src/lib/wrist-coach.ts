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
  return { preset: "softball", ...CARD_SIZE_PRESETS.softball };
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
 * Middle band on a card with more than three blocks, as a fraction of card height.
 * 1/13 is one cell of a 6-block 5×5, so that card's cells stay put. A 4×4 on the
 * same card uses this same band, and the two cells then share one aspect ratio.
 */
export const CARD_BAND_FRAC = 1 / 13;

/**
 * Equal boxes on a landscape card. Every cell is widthIn/colSlots by the cell height.
 * Six blocks are three across the top and three across the bottom.
 * Two- and three-block cards keep the middle band as one cell.
 * Larger block counts share one band height so a 4×4 and a 5×5 match.
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
  const contentRows = halves * (layout.rows + 1);
  const grids = Math.round(Number(layout.grids)) || 1;
  const sharedBand = grids > 3 && halves > 1;
  const footerIn = sharedBand ? size.heightIn * CARD_BAND_FRAC : size.heightIn / (contentRows + 1);
  const cellH = sharedBand ? (size.heightIn - footerIn) / contentRows : footerIn;
  const rowSlots = sharedBand ? contentRows : contentRows + 1;
  return {
    topCount,
    bottomCount,
    halves,
    maxAcross,
    colSlots,
    rowSlots,
    contentRows,
    footerIn,
    cellW: size.widthIn / colSlots,
    cellH,
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
  /** A decoy prints at the same cap height as a real code. */
  decoy?: boolean;
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
  /** Column and row numbers. Absent means contrast against the band. */
  headerInk?: string;
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
  /** Letters already given to a version, including ones the coach deleted or renamed. */
  spentVersionLetters: string[];
  /**
   * Factory defense cells used to ship with blue, orange, and green fills.
   * The first load clears only those untouched defaults. A color picked after that stays.
   */
  defenseFillMigrated: boolean;
  updatedAt: number;
};

type WristShuffleBook = Pick<
  WristBook,
  "grids" | "rows" | "cols" | "signStart" | "rowStart" | "bandKind" | "library" | "versions"
> & {
  title?: string;
  theme?: WristTheme;
  kindLayouts?: WristKindLayouts;
  numbering?: WristNumbering;
  spentVersionLetters?: string[];
};

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

/** Field-look rule. Offense and defense use this same weight. */
export const CARD_RULE_PT = 0.25;

/** Heavier outline around each block. One weight and one color on both cards. */
export const CARD_BLOCK_PT = 0.75;
export const CARD_BLOCK_STROKE = "#000000";

function outlineNum(value: number): string {
  return (Math.round(value * 1000) / 1000).toString();
}

/**
 * One heavier outline around every block. The stroke sits inside the card edge
 * and on the shared edge between blocks, at the same weight and color on both cards.
 */
export function blockOutlineSvg(
  size: { widthIn: number; heightIn: number },
  layout: { grids: number; cols: number; rows: number },
): string {
  const metrics = cardGridMetrics(size, layout);
  const cellW = metrics.cellW * 72;
  const cellH = metrics.cellH * 72;
  const footerH = metrics.footerIn * 72;
  const wPt = size.widthIn * 72;
  const hPt = size.heightIn * 72;
  const dataRows = layout.rows + 1;
  const sw = CARD_BLOCK_PT;
  let svg = "";
  for (let g = 0; g < layout.grids; g += 1) {
    const halfIndex = g < metrics.topCount ? 0 : 1;
    const acrossIndex = halfIndex === 0 ? g : g - metrics.topCount;
    const x = acrossIndex * (layout.cols + 1) * cellW;
    const y = halfIndex === 0 ? 0 : dataRows * cellH + footerH;
    const bw = (layout.cols + 1) * cellW;
    const bh = (layout.rows + 1) * cellH;
    const left = x <= 0.01 ? x + sw / 2 : x;
    const right = x + bw >= wPt - 0.01 ? x + bw - sw / 2 : x + bw;
    const top = y <= 0.01 ? y + sw / 2 : y;
    const bottom = y + bh >= hPt - 0.01 ? y + bh - sw / 2 : y + bh;
    svg +=
      '<path data-block-outline="1" d="M ' +
      outlineNum(left) +
      " " +
      outlineNum(top) +
      " H " +
      outlineNum(right) +
      " V " +
      outlineNum(bottom) +
      " H " +
      outlineNum(left) +
      ' Z" fill="none" stroke="' +
      CARD_BLOCK_STROKE +
      '" stroke-width="' +
      outlineNum(sw) +
      '"/>';
  }
  return svg;
}

/**
 * Look-alike marks on a card with more than three blocks.
 * One weight on both cards. Two- and three-block cards still scale the mark with the type.
 */
export const CARD_MARK_PT = 0.6;

/**
 * Side inset on a card with more than three blocks, as a fraction of cell width.
 * A 4×4 and a 5×5 then share one padding ratio.
 */
export const CARD_PAD_FRAC = 0.025;

/**
 * Type size as a fraction of cell height when a card has more than three blocks.
 * This is a cap. The shared text-to-cell ratio below is what both cards use.
 */
export const CARD_TYPE_RATIO = 0.68;

/**
 * Type size as a fraction of cell width on a card with more than three blocks.
 * A 4×4 and a 5×5 then put the same code in the same fraction of the cell.
 * A code that would overflow still shrinks.
 */
export const CARD_TEXT_RATIO = 0.59;

/**
 * Side inset for card type, in points.
 * Two- and three-block cards keep the 0.9pt gap from the reference samples.
 * Larger block counts use the same fraction of the cell, so 4×4 and 5×5 match.
 */
export function sidePadPt(cellW: number, grids: number): number {
  if (!Number.isFinite(cellW) || cellW <= 0) return 0.9;
  if (!Number.isFinite(grids) || grids <= 3) return 0.9;
  return Math.round(cellW * CARD_PAD_FRAC * 1000) / 1000;
}

export type CellChrome = {
  padPt: number;
  /** padPt divided by cell width. */
  padFrac: number;
  borderPt: number;
  cellWPt: number;
  cellHPt: number;
  fontPt: number;
  /** fontPt divided by cell height. */
  fontRatio: number;
  /** fontPt divided by cell width. Same on a 4×4 and a 5×5 unless a label must shrink. */
  textRatio: number;
  align: "middle";
  /** Column, row, and corner cells paint with the card band. */
  headerFill: "band";
  /** The corner cell is the band, the same shape as every other header cell. */
  cornerFill: "band";
};

/**
 * Shared box chrome for every block count. Header cells are the same size as
 * data cells. Padding, rule weight, alignment, and the type-to-cell ratio
 * follow one rule, so a 4×4 and a 5×5 are the same design at different counts.
 */
export function cellChrome(
  size: { widthIn: number; heightIn: number },
  layout: { grids: number; cols: number; rows: number },
  labelEm: number,
): CellChrome {
  const metrics = cardGridMetrics(size, layout);
  const cellWPt = metrics.cellW * 72;
  const cellHPt = metrics.cellH * 72;
  const padPt = sidePadPt(cellWPt, layout.grids);
  const innerW = Math.max(1, cellWPt - padPt * 2);
  const em = Number.isFinite(labelEm) && labelEm > 0 ? labelEm : 1;
  const grids = layout.grids;
  let fontPt: number;
  if (!Number.isFinite(grids) || grids <= 3) {
    fontPt = Math.min(cellHPt, innerW / em);
  } else {
    fontPt = cellWPt * CARD_TEXT_RATIO;
    const heightCap = cellHPt * CARD_TYPE_RATIO;
    if (fontPt > heightCap) fontPt = heightCap;
    if (fontPt * em > innerW) fontPt = innerW / em;
    if (fontPt > cellHPt) fontPt = cellHPt;
  }
  const minPt = (4 * 72) / 96;
  if (fontPt < minPt) fontPt = minPt;
  const fontRatio = cellHPt > 0 ? fontPt / cellHPt : 0;
  const textRatio = cellWPt > 0 ? fontPt / cellWPt : 0;
  return {
    padPt,
    padFrac: cellWPt > 0 ? padPt / cellWPt : 0,
    borderPt: CARD_RULE_PT,
    cellWPt,
    cellHPt,
    fontPt,
    fontRatio,
    textRatio,
    align: "middle",
    headerFill: "band",
    cornerFill: "band",
  };
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
/** Old factory wristband. Only an untouched book still on this purple migrates. */
export const LEGACY_PURPLE_BAND = "#7e22ce";
/** Last round's factory colors. Only an untouched book still on this pair migrates. */
export const PREVIOUS_OFFENSE_BAND = "#c00000";
export const PREVIOUS_DEFENSE_BAND = "#f87080";
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

export const HEADER_INK_DARK = "#111111";
export const HEADER_INK_LIGHT = "#ffffff";

/** Simple luma. Below 150 the band needs white numbers; otherwise dark numbers. */
export function hexLuma(hex: string) {
  const raw = String(hex || "").trim().replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((ch) => ch + ch).join("") : raw;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n) || full.length !== 6) return 255;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000;
}

export function autoHeaderInk(band: string) {
  return hexLuma(band) < 150 ? HEADER_INK_LIGHT : HEADER_INK_DARK;
}

/** Coach-picked header numbers, or dark on pink and white on red when none is stored. */
export function headerInkFor(theme: { band?: string; headerInk?: string } | null | undefined) {
  const band = theme?.band || "#000000";
  if (theme?.headerInk) return normalizeHex(theme.headerInk, autoHeaderInk(band));
  return autoHeaderInk(band);
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
  return {
    offense: { band: OFFENSE_BAND, ink: white, highlight: white, headerInk: autoHeaderInk(OFFENSE_BAND) },
    defense: { band: DEFENSE_BAND, ink: "#000000", highlight: white, headerInk: autoHeaderInk(DEFENSE_BAND) },
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
  const theme: WristTheme = {
    band: normalizeHex(item?.band ?? item?.wristband, fallback.band),
    ink: normalizeHex(item?.ink ?? item?.text, fallback.ink),
    highlight: normalizeHex(item?.highlight ?? item?.cell, fallback.highlight),
  };
  const picked = item?.headerInk;
  if (picked != null && String(picked).trim()) {
    theme.headerInk = normalizeHex(picked, autoHeaderInk(theme.band));
  }
  return theme;
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
  decoy?: boolean;
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
      decoy: call.decoy === true,
      codes: (byCall.get(call.id) || []).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    }));
}

export type CoachSheetBlock = {
  name: string;
  short: string;
  codes: string[];
};

export type CoachSheetFrame = {
  cols: number;
  minRows: number;
  innerH: number;
  capacity: number;
  headerIn: number;
  codeIn: number;
  codeSize: number;
  playSize: number;
  bannerSize: number;
};

/** Smallest play-name row that still reads on a packed sheet. */
export const COACH_HEADER_MIN_IN = 0.13;
/** Smallest code row that still reads on a packed sheet. */
export const COACH_CODE_MIN_IN = 0.15;
/** A leftover page may grow, but not into a banner. */
export const COACH_HEADER_CAP_IN = 0.26;
const COACH_HEADER_SCALE = 0.72;
/**
 * Barlow Condensed caps are about 0.40em, plus the 0.05em play-name tracking.
 * A little extra so a name wraps before the cell clips it.
 */
export const COACH_PLAY_CHAR_EM = 0.46;
/** Extra play-name lines use this line height. The first line stays in the packed row. */
export const COACH_PLAY_LINE = 1.25;
/** Digit width used so a code stays inside its column. */
export const COACH_CODE_CHAR_EM = 0.5;

/**
 * Letter content box for a printed coach sheet, under the 0.4in margin and the
 * 1in calibration row. A stored 5.5in sheet is shorter than this page.
 */
export const COACH_PRINT_WIDTH_IN =
  Math.round((LETTER_SHEET.widthIn - LETTER_SHEET.marginIn * 2) * 100) / 100;
export const COACH_PRINT_HEIGHT_IN =
  Math.round(
    (LETTER_SHEET.heightIn -
      LETTER_SHEET.marginIn * 2 -
      LETTER_SHEET.calibrateIn -
      LETTER_SHEET.calibrateGapIn -
      0.14) *
      100,
  ) / 100;

/** Printed coach sheet uses the real Letter page when the stored sheet is smaller. */
export function coachPrintSheet<T extends { widthIn?: number; heightIn?: number }>(sheet: T): T {
  return {
    ...sheet,
    widthIn: Math.max(Number(sheet.widthIn) || 0, COACH_PRINT_WIDTH_IN),
    heightIn: Math.max(Number(sheet.heightIn) || 0, COACH_PRINT_HEIGHT_IN),
  };
}

function coachSheetMetrics(
  sheet: { cols: number; rows?: number; widthIn?: number; heightIn: number },
  groups: number,
  capHeader: boolean,
): CoachSheetFrame {
  const cols = Math.max(1, Math.round(Number(sheet.cols)) || 1);
  const minRows = Math.max(1, Math.round(Number(sheet.rows) || 1));
  const heightIn = Number(sheet.heightIn) || 5.5;
  const widthIn = Number(sheet.widthIn) || 3.5;
  const innerH = Math.max(0.4, heightIn - 0.24);
  const innerW = Math.max(1, widthIn - 0.24);
  const count = Math.max(1, Math.round(groups) || 1);
  const headerCount = 1 + count;
  const codeCount = count * minRows;
  let codeIn = innerH / (headerCount * COACH_HEADER_SCALE + codeCount);
  let headerIn = codeIn * COACH_HEADER_SCALE;
  if (capHeader && headerIn > COACH_HEADER_CAP_IN) {
    headerIn = COACH_HEADER_CAP_IN;
    codeIn = headerIn / COACH_HEADER_SCALE;
  }
  const headerPx = headerIn * 96;
  const codePx = codeIn * 96;
  const colPx = (innerW / cols) * 96;
  const codeSize = Math.max(1, Math.min(codePx * 0.78, colPx * 0.55, Math.max(1, codePx - 1)));
  const playSize = Math.max(1, Math.min(headerPx * 0.78, 28, Math.max(1, headerPx - 1)));
  const bannerSize = Math.max(1, Math.min(headerPx * 0.72, innerW * 96 * 0.04, Math.max(1, headerPx - 1)));
  return {
    cols,
    minRows,
    innerH,
    capacity: count,
    headerIn,
    codeIn,
    codeSize,
    playSize,
    bannerSize,
  };
}

/**
 * How many calls fit when every row is at the packed size.
 * Fifteen factory defense calls fit on the 5.5in sheet. Twenty do not.
 */
export function coachSheetFrame(sheet: {
  cols: number;
  rows?: number;
  widthIn?: number;
  heightIn: number;
}): CoachSheetFrame {
  const minRows = Math.max(1, Math.round(Number(sheet.rows) || 1));
  const heightIn = Number(sheet.heightIn) || 5.5;
  const innerH = Math.max(0.4, heightIn - 0.24);
  let capacity = 1;
  for (let groups = 1; groups <= 60; groups += 1) {
    const headerCount = 1 + groups;
    const codeCount = groups * minRows;
    const codeH = innerH / (headerCount * COACH_HEADER_SCALE + codeCount);
    const headerH = codeH * COACH_HEADER_SCALE;
    if (headerH < COACH_HEADER_MIN_IN || codeH < COACH_CODE_MIN_IN) break;
    capacity = groups;
  }
  return coachSheetMetrics(sheet, capacity, false);
}

/**
 * Row size for one printed page. A page with room grows until it fills the page.
 * The play-name row stops at COACH_HEADER_CAP_IN so one leftover call stays a row.
 */
export function coachSheetPageFrame(
  sheet: { cols: number; rows?: number; widthIn?: number; heightIn: number },
  groupCount: number,
): CoachSheetFrame {
  return coachSheetMetrics(sheet, groupCount, true);
}

export type CoachSheetSpec = { cols: number; rows?: number; widthIn?: number; heightIn: number };

/** Play name as it is painted, before the uppercase style. */
export function coachPlayLabel(block: { name: string; short: string }): string {
  return `${block.name} (${block.short})`;
}

export function coachSheetInnerWidth(sheet: { widthIn?: number }): number {
  return Math.max(1, (Number(sheet.widthIn) || 3.5) - 0.24);
}

/** How many lines the uppercase play name needs at this font and sheet width. */
export function coachPlayLines(label: string, playSizePx: number, innerWIn: number): number {
  const charPx = Math.max(1, playSizePx * COACH_PLAY_CHAR_EM);
  const perLine = Math.max(1, Math.floor((innerWIn * 96 - 8) / charPx));
  const text = String(label || "").toUpperCase();
  if (!text) return 1;
  return Math.max(1, Math.ceil(text.length / perLine));
}

/** Row height for a play name. One line keeps the shared header. Wrapped lines add room. */
export function coachPlayHeaderIn(
  label: string,
  metrics: { playSize: number; headerIn: number },
  innerWIn: number,
): number {
  const lines = coachPlayLines(label, metrics.playSize, innerWIn);
  if (lines <= 1) return metrics.headerIn;
  return metrics.headerIn + ((lines - 1) * metrics.playSize * COACH_PLAY_LINE) / 96;
}

/** Code type that stays inside the column, including a 4-character code such as 30-5. */
export function coachCodeSizePx(codePx: number, colPx: number, maxChars: number, fallbackPx: number): number {
  const chars = Math.max(1, Math.round(maxChars) || 1);
  const fit = (colPx - 4) / (chars * COACH_CODE_CHAR_EM);
  return Math.max(1, Math.min(fallbackPx, fit));
}

export type CoachSheetRowLayout = {
  name: string;
  short: string;
  label: string;
  lines: number;
  headerIn: number;
  codes: string[];
  codeRows: number;
};

export type CoachSheetPageLayout = {
  innerH: number;
  innerW: number;
  cols: number;
  bannerIn: number;
  codeIn: number;
  playSize: number;
  codeSize: number;
  bannerSize: number;
  rows: CoachSheetRowLayout[];
};

type CoachPiece = { block: CoachSheetBlock; codeRows: number };

function coachPiece(block: CoachSheetBlock, cols: number, minRows: number): CoachPiece {
  return {
    block,
    codeRows: Math.max(minRows, Math.ceil(block.codes.length / cols) || 1),
  };
}

/** Fifteen short calls are the full 3.5×5.5 card at its natural type. */
const DEFENSE_SHEET_CALLS = 15;

/** Play-name size of 15 short calls on a 3.5×5.5 card. Larger sheets may start above this. */
export const DEFENSE_PLAY_MIN_PX = coachSheetPageFrame(
  { cols: 15, rows: 1, widthIn: 3.5, heightIn: 5.5 },
  DEFENSE_SHEET_CALLS,
).playSize;

/** Largest type at or under the row that keeps every name on one line. */
function defensePlaySize(items: CoachPiece[], limitPx: number, innerW: number): number {
  const start = Math.max(0.01, limitPx);
  if (!items.length) return start;
  const labels = items.map((item) => coachPlayLabel(item.block));
  const oneLine = (px: number) => labels.every((label) => coachPlayLines(label, px, innerW) <= 1);
  if (oneLine(start)) return start;
  const floor = 1 / COACH_PLAY_CHAR_EM;
  if (!oneLine(floor)) return start;
  let lo = floor;
  let hi = start;
  for (let step = 0; step < 12; step += 1) {
    const mid = (lo + hi) / 2;
    if (oneLine(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

function defenseBoxFont(boxPx: number, ratio: number, widthCap: number): number {
  return Math.min(boxPx * ratio, widthCap, Math.max(boxPx * 0.5, boxPx - 1));
}

/**
 * Every defense call stays on one page at the selected sheet size.
 * Row boxes divide that page. Type shrinks so each name and code fits in its box.
 * A book with extra code rows scales the boxes and the type down together.
 */
export function layoutDefenseCoachSheet(
  blocks: CoachSheetBlock[],
  sheet: CoachSheetSpec,
): CoachSheetPageLayout[] {
  const list = blocks || [];
  if (!list.length) return [];
  const frame = coachSheetPageFrame(sheet, list.length);
  const innerW = coachSheetInnerWidth(sheet);
  const innerH = frame.innerH;
  const cols = frame.cols;
  const minRows = frame.minRows;
  const pieces = list.map((block) => coachPiece(block, cols, minRows));
  const colPx = (innerW / cols) * 96;

  function paint(scale: number): CoachSheetPageLayout {
    const headerIn = frame.headerIn * scale;
    const codeIn = frame.codeIn * scale;
    const headerPx = headerIn * 96;
    const codePx = codeIn * 96;
    const rowFont = defenseBoxFont(headerPx, 0.78, 28);
    const playSize = Math.min(rowFont, defensePlaySize(pieces, rowFont, innerW));
    const rows: CoachSheetRowLayout[] = pieces.map((item) => {
      const label = coachPlayLabel(item.block);
      return {
        name: item.block.name,
        short: item.block.short,
        label,
        lines: coachPlayLines(label, playSize, innerW),
        headerIn: coachPlayHeaderIn(label, { playSize, headerIn }, innerW),
        codes: item.block.codes.slice(),
        codeRows: item.codeRows,
      };
    });
    let maxChars = 1;
    for (const row of rows) {
      for (const code of row.codes) maxChars = Math.max(maxChars, String(code || "").length);
    }
    const naturalCode = defenseBoxFont(codePx, 0.78, colPx * 0.55);
    const fittedCode = coachCodeSizePx(codePx, colPx, maxChars, naturalCode);
    return {
      innerH,
      innerW,
      cols: frame.cols,
      bannerIn: headerIn,
      codeIn,
      playSize,
      codeSize: Math.min(fittedCode, Math.max(0.01, codePx * 0.9)),
      bannerSize: defenseBoxFont(headerPx, 0.72, innerW * 96 * 0.04),
      rows,
    };
  }

  function pageHeight(page: CoachSheetPageLayout): number {
    let height = page.bannerIn;
    for (const row of page.rows) height += row.headerIn + row.codeRows * page.codeIn;
    return height;
  }

  function fits(scale: number): boolean {
    return pageHeight(paint(scale)) <= innerH + 1e-6;
  }

  let scale = 1;
  if (!fits(1)) {
    let lo = 0;
    let hi = 1;
    for (let step = 0; step < 16; step += 1) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
    scale = lo;
  }
  return [paint(scale)];
}

/**
 * Split an offense coach sheet so every call prints. Rows stay the full-page size.
 * A call that does not fit starts the next page. One huge play splits only
 * when it cannot fit on a page alone.
 * Defense does not use this. layoutDefenseCoachSheet keeps every defense call
 * on one page and scales the boxes and type to fit.
 */
export function paginateCoachSheet(blocks: CoachSheetBlock[], sheet: CoachSheetSpec): CoachSheetBlock[][] {
  const frame = coachSheetFrame(sheet);
  const cols = frame.cols;
  const minRows = frame.minRows;
  const innerH = frame.innerH;
  const headerIn = frame.headerIn;
  const codeIn = frame.codeIn;
  const pieces = (blocks || []).map((block) => coachPiece(block, cols, minRows));
  const heightOf = (items: CoachPiece[]) => {
    let height = headerIn;
    for (const item of items) height += headerIn + item.codeRows * codeIn;
    return height;
  };
  if (!pieces.length || heightOf(pieces) <= innerH + 1e-6) return [(blocks || []).slice()];
  const pages: CoachSheetBlock[][] = [];
  let current: CoachSheetBlock[] = [];
  let currentPieces: CoachPiece[] = [];
  for (const piece of pieces) {
    const alone = headerIn + headerIn + piece.codeRows * codeIn;
    if (current.length && heightOf(currentPieces.concat([piece])) > innerH + 1e-6) {
      pages.push(current);
      current = [];
      currentPieces = [];
    }
    if (!current.length && alone > innerH + 1e-6) {
      const roomRows = Math.max(1, Math.floor((innerH - headerIn - headerIn) / codeIn));
      const perPage = roomRows * cols;
      const codes = piece.block.codes.length ? piece.block.codes : [""];
      for (let start = 0; start < codes.length; start += perPage) {
        pages.push([{ ...piece.block, codes: codes.slice(start, start + perPage) }]);
      }
      continue;
    }
    current.push(piece.block);
    currentPieces.push(piece);
  }
  if (current.length) pages.push(current);
  return pages;
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

const DEFAULT_OFFENSE: Array<[string, string, string, number?, boolean?]> = [
  ["play-br", "Bunt + run", "B+R", 15],
  ["play-b1", "Bunt to 1st", "B1", 15],
  ["play-b3", "Bunt to 3rd", "B3", 15],
  ["play-des", "Delayed steal", "DES", 13],
  ["play-fbh", "Fake bunt + hit", "FBH", 11],
  ["play-fbs", "Fake bunt + steal", "FBS", 10],
  ["play-fbt", "Fake bunt + take", "FBT", 10],
  ["play-hr", "Hit and run", "H+R", 10],
  ["play-ssq", "Safety squeeze", "SAS", 7],
  ["play-ss3b", "Steal second and third", "SS3B", 6],
  ["play-stl", "Steal", "S", 15],
  ["play-sus", "Suicide squeeze", "SUS", 7],
  ["play-tke", "Take", "T", 7],
  ["play-x", "X", "X", 15, true],
  ["play-p", "P", "P", 8],
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
  rows: Array<[string, string, string] | [string, string, string, number?] | [string, string, string, number?, boolean?]>,
): WristCall[] {
  return rows.map((row) => {
    const call: WristCall = {
      id: row[0],
      kind,
      name: row[1],
      short: row[2],
      fill: "clear",
      ink: "clear",
      count: clampInt(row[3], 0, 0, 300),
    };
    if (row[4] === true) call.decoy = true;
    return call;
  });
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

const STARTER_OFFENSE: Array<[string, string, string, number?, boolean?]> = [
  ["play-x", "X", "X", 15, true],
  ["play-p", "P", "P", 8],
  ["play-b1", "Bunt to 1st", "B1", 15],
  ["play-fbs", "Fake bunt + steal", "FBS", 10],
  ["play-ssq", "Safety squeeze", "SAS", 7],
  ["play-hr", "Hit and run", "H+R", 10],
  ["play-ss3b", "Steal second and third", "SS3B", 6],
];

function withOffenseAliases(call: WristCall): WristCall {
  if (call.kind !== "offense") return call;
  const short = call.short.toUpperCase();
  if (short === "H&R") return { ...call, short: "H+R" };
  if (short === "X") return { ...call, decoy: true };
  return call;
}

const STARTER_NAME_BY_SHORT: Record<string, string> = Object.fromEntries(
  STARTER_OFFENSE.map((row) => [row[2].toUpperCase(), row[1]]),
);

function stripStarterTee(call: WristCall): WristCall {
  if (call.kind !== "offense") return call;
  const match = call.name.trim().match(/^t\s+(.+)$/i);
  if (!match) return call;
  const rest = match[1].trim();
  const short = call.short.toUpperCase();
  const canonical = STARTER_NAME_BY_SHORT[short];
  const restIsStarterName = Object.values(STARTER_NAME_BY_SHORT).some(
    (value) => value.toLowerCase() === rest.toLowerCase(),
  );
  if (rest.toUpperCase() !== short && !canonical && !restIsStarterName) return call;
  if (canonical && (rest.toUpperCase() === short || rest.toLowerCase() === canonical.toLowerCase())) {
    return { ...call, name: canonical };
  }
  return { ...call, name: rest };
}

function canonicalRank(call: WristCall) {
  if (STARTER_OFFENSE.some((row) => row[0] === call.id)) return 0;
  if (/^play-[a-z0-9+]+$/i.test(call.id)) return 1;
  return 2;
}

function preferCall(a: WristCall, b: WristCall): WristCall {
  const countA = a.count || 0;
  const countB = b.count || 0;
  let winner = a;
  let loser = b;
  if (countB > countA || (countB === countA && canonicalRank(b) < canonicalRank(a))) {
    winner = b;
    loser = a;
  }
  let name = winner.name;
  if (winner.short.toUpperCase() === "H+R") {
    const hit = [a, b].find((call) => call.name.trim().toLowerCase() === "hit and run");
    if (hit) name = hit.name;
  } else if (/^t\s+/i.test(name) && !/^t\s+/i.test(loser.name)) {
    name = loser.name;
  }
  return name === winner.name ? winner : { ...winner, name };
}

export function duplicateShorts(list: WristCall[]) {
  const seen = new Map<string, number>();
  const dups: string[] = [];
  for (const call of list) {
    const key = `${call.kind}:${call.short.toUpperCase()}`;
    const count = (seen.get(key) || 0) + 1;
    seen.set(key, count);
    if (count === 2) dups.push(key);
  }
  return dups;
}

export function shortInUse(
  library: WristCall[],
  kind: string,
  short: string,
  exceptId?: string,
) {
  const code = short.trim().toUpperCase();
  if (!code) return false;
  return library.some(
    (call) => call.kind === kind && call.id !== exceptId && call.short.toUpperCase() === code,
  );
}

export function dedupeLibrary(list: WristCall[]): { library: WristCall[]; alias: Record<string, string> } {
  const alias: Record<string, string> = {};
  const library: WristCall[] = [];
  const indexByKey = new Map<string, number>();
  for (const call of list) {
    const key = `${call.kind}:${call.short.toUpperCase()}`;
    const existingAt = indexByKey.get(key);
    if (existingAt == null) {
      indexByKey.set(key, library.length);
      library.push(call);
      continue;
    }
    const current = library[existingAt];
    const survivor = preferCall(current, call);
    const dropped = survivor.id === current.id ? call : current;
    library[existingAt] = survivor;
    alias[dropped.id] = survivor.id;
  }
  for (const id of Object.keys(alias)) {
    let next = alias[id];
    const seen = new Set<string>([id]);
    while (alias[next] && !seen.has(alias[next])) {
      seen.add(next);
      next = alias[next];
    }
    alias[id] = next;
  }
  return { library, alias };
}

const FACTORY_DEFENSE_FILLS = new Set<WristColor>(["blue", "orange", "green"]);

function factoryDefenseRow(id: string) {
  return DEFAULT_DEFENSE.find((row) => row[0] === id) || null;
}

/** Old factory blue, orange, and green fills on an unedited defense starter. */
export function clearUntouchedDefenseColors(list: WristCall[]): WristCall[] {
  return list.map((call) => {
    if (call.kind !== "defense") return call;
    const factory = factoryDefenseRow(call.id);
    if (!factory) return call;
    if (call.name.trim().toLowerCase() !== factory[1].trim().toLowerCase()) return call;
    if (call.short.toUpperCase() !== factory[2].toUpperCase()) return call;
    if ((call.ink || "clear") !== "clear") return call;
    if (!FACTORY_DEFENSE_FILLS.has(call.fill)) return call;
    return { ...call, fill: "clear" };
  });
}

export function migrateCalls(list: WristCall[]) {
  const next = reclassifyLocations(list).map(withOffenseAliases).map(stripStarterTee);
  if (isLegacyTwoGroupLibrary(list)) {
    const extras = [
      ...rowsToCalls("location", DEFAULT_LOCATIONS),
      ...rowsToCalls("offense", DEFAULT_OFFENSE),
      ...rowsToCalls("defense", DEFAULT_DEFENSE),
    ];
    for (const call of extras) {
      if (!libraryHas(next, call)) next.push(call);
    }
  }
  for (const call of rowsToCalls("offense", STARTER_OFFENSE)) {
    if (!libraryHas(next, call)) next.push({ ...call, count: 0 });
  }
  return dedupeLibrary(next);
}

export function upgradeLibrary(list: WristCall[]) {
  return migrateCalls(list).library;
}

/** The letter in "Version B". A custom name has none. */
export function versionLetter(name: string): string {
  const match = String(name || "").trim().match(/^version\s+([a-z])$/i);
  return match ? match[1].toUpperCase() : "";
}

export function noteSpentLetter(spent: string[] | undefined, name: string): string[] {
  const letter = versionLetter(name);
  const next = Array.isArray(spent) ? spent.slice() : [];
  if (letter && !next.includes(letter)) next.push(letter);
  return next;
}

/** Letters up to the highest one already used. A gap such as A, C means B was used too. */
export function spentThrough(letters: string[]): string[] {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let max = -1;
  for (const letter of letters) {
    const index = alphabet.indexOf(String(letter || "").trim().toUpperCase());
    if (index > max) max = index;
  }
  const spent: string[] = [];
  for (let i = 0; i <= max; i += 1) spent.push(alphabet[i]);
  return spent;
}

/**
 * Next version letter that has never been used in this book.
 * A deleted or renamed letter stays spent, so it is not handed out again.
 */
export function nextVersionName(existing: WristVersion[], spent?: string[]) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const used = new Set((existing || []).map((item) => item.name.trim().toUpperCase()));
  const spentLetters = new Set<string>();
  for (const letter of spent || []) {
    const ch = String(letter || "").trim().toUpperCase();
    if (/^[A-Z]$/.test(ch)) spentLetters.add(ch);
  }
  for (const item of existing || []) {
    const letter = versionLetter(item.name);
    if (letter) spentLetters.add(letter);
  }
  for (const letter of letters) {
    const name = `Version ${letter}`;
    if (spentLetters.has(letter) || used.has(name.toUpperCase())) continue;
    return name;
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

/** Even box counts. Remainder goes to real plays before decoys, and counts differ by at most 1. */
export function evenSpreadCounts(
  calls: Array<Pick<WristCall, "id" | "decoy">>,
  total: number,
): Record<string, number> {
  const counts: Record<string, number> = {};
  const list = calls.filter((call) => call.id);
  for (const call of list) counts[call.id] = 0;
  if (total <= 0 || !list.length) return counts;
  const base = Math.floor(total / list.length);
  let extra = total % list.length;
  const ordered = [
    ...list.filter((call) => !call.decoy),
    ...list.filter((call) => call.decoy),
  ];
  for (const call of ordered) {
    const bonus = extra > 0 ? 1 : 0;
    if (extra > 0) extra -= 1;
    counts[call.id] = base + bonus;
  }
  return counts;
}

export function spreadLibrary(library: WristCall[], kind: WristCallKind, total: number) {
  const counts = evenSpreadCounts(
    library.filter((call) => call.kind === kind),
    total,
  );
  return library.map((call) =>
    call.kind === kind ? { ...call, count: counts[call.id] ?? 0 } : call,
  );
}

/**
 * Ids a new book actually deals. signBag slices the factory counts before it
 * shuffles, so the set is the prefix of that bag (offense's 14), not every
 * catalog call and not a play that sits past the cell total.
 */
function factoryDealIds(kind: WristCallKind, total: number) {
  const seen = new Set<string>();
  let filled = 0;
  for (const call of defaultLibrary()) {
    if (call.kind !== kind || !call.id) continue;
    const n = Math.max(0, Math.round(call.count || 0));
    if (n <= 0) continue;
    const take = Math.min(n, Math.max(0, total - filled));
    if (take > 0) seen.add(call.id);
    filled += take;
    if (filled >= total) break;
  }
  return seen;
}

/**
 * Counts for Reset. Offense evens the plays a new book already deals.
 * Defense evens every factory call, which is how a new book fills defense.
 * A custom call stays only when it is already on the card.
 * Catalog calls a new book leaves off stay off. Counts differ by at most 1.
 */
export function libraryForReset(
  library: WristCall[],
  kind: WristCallKind,
  onCardIds: string[],
  total: number,
): WristCall[] {
  const factory = defaultLibrary().filter((call) => call.kind === kind);
  const factoryById = new Map(factory.map((call) => [call.id, call]));
  const onCard = new Set(onCardIds.filter(Boolean));
  const deal = kind === "offense" ? factoryDealIds(kind, total) : null;
  const keep = library.filter((call) => {
    if (call.kind !== kind || !call.id) return false;
    if (kind === "defense") {
      if (factoryById.has(call.id)) return true;
      return onCard.has(call.id);
    }
    if (deal?.has(call.id)) return true;
    if (factoryById.has(call.id)) return false;
    return onCard.has(call.id);
  });
  const spread = evenSpreadCounts(keep, total);
  return library.map((call) =>
    call.kind === kind ? { ...call, count: spread[call.id] || 0 } : call,
  );
}

/**
 * Drop one call and deal its boxes back across the calls that remain on the
 * card. The remaining counts differ by at most 1. A catalog call with no
 * boxes stays off the card.
 */
export function libraryAfterRemoval(
  library: WristCall[],
  kind: WristCallKind,
  removedId: string,
  total: number,
): WristCall[] {
  const remaining = library.filter((call) => call.id !== removedId);
  const ofKind = remaining.filter((call) => call.kind === kind && call.id);
  const onCard = ofKind.filter((call) => (call.count || 0) > 0);
  const pool = onCard.length ? onCard : ofKind;
  const spread = evenSpreadCounts(pool, total);
  return remaining.map((call) =>
    call.kind === kind ? { ...call, count: spread[call.id] || 0 } : call,
  );
}

/** Remove one version. The last version stays. Deleting the active one selects another. The letter stays spent. */
export function deleteVersion(book: WristBook, id: string): WristBook | null {
  const versions = book.versions || [];
  if (!id || versions.length < 2) return null;
  const removed = versions.find((item) => item.id === id);
  const next = versions.filter((item) => item.id !== id);
  if (next.length !== versions.length - 1) return null;
  return {
    ...book,
    versions: next,
    spentVersionLetters: noteSpentLetter(book.spentVersionLetters, removed?.name || ""),
    activeVersionId: book.activeVersionId === id ? next[0].id : book.activeVersionId,
    updatedAt: Date.now(),
  };
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
    name: name?.trim() || nextVersionName(book.versions, book.spentVersionLetters),
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
  book: Pick<WristBook, "versions"> & { spentVersionLetters?: string[] },
  version: WristVersion,
): WristVersion {
  const offenseCells = cloneCells(version.offenseCells || version.cells);
  const defenseCells = cloneCells(version.defenseCells);
  return {
    id: `ver-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: nextVersionName(book.versions, book.spentVersionLetters),
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

/**
 * Shuffle one card onto a new version and leave the previous version untouched,
 * so a coach can open it again and reprint it.
 */
export function shuffleKeepingHistory(
  book: WristShuffleBook,
  version: WristVersion,
  kind?: WristCallKind | string,
): WristVersion | null {
  if (version.locked) return null;
  const cardKind = playCardKind(kind || book.bandKind);
  const shuffled = withVersionCells(version, cardKind, buildKindCells(book, cardKind));
  return {
    ...shuffled,
    id: `ver-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: nextVersionName(book.versions, book.spentVersionLetters),
    createdAt: Date.now(),
    locked: false,
    cells: cloneCells(shuffled.cells),
    offenseCells: cloneCells(shuffled.offenseCells),
    defenseCells: cloneCells(shuffled.defenseCells),
  };
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
  const short = String(item.short || "").trim().slice(0, 5).toUpperCase();
  if (!name && !short) return null;
  const cleaned = short === "H&R" ? "H+R" : short || (name || "XX").slice(0, 3).toUpperCase();
  const decoy = item.decoy === true || (kind === "offense" && cleaned === "X");
  return {
    id: String(item.id || `call-${kind}-${index}`),
    kind,
    name: name || cleaned || kindLabel(kind),
    short: cleaned,
    fill: normalizeColor(item.fill),
    ink: normalizeColor(item.ink),
    count: clampInt(item.count, 0, 0, 300),
    weight: clampInt(item.weight, 0, 0, 30),
    ...(decoy ? { decoy: true } : {}),
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
    spentVersionLetters: Array.isArray(extra.spentVersionLetters) ? extra.spentVersionLetters.slice() : [],
    defenseFillMigrated: extra.defenseFillMigrated === true,
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
  draft.spentVersionLetters = ["A"];
  draft.defenseFillMigrated = true;
  return draft;
}

function sameHex(value: unknown, hex: string) {
  return String(value || "").trim().toLowerCase() === hex;
}

function hexText(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isFactoryBlackInk(value: unknown) {
  const ink = hexText(value);
  return ink === "#000000" || ink === "#000";
}

function isFactoryWhite(value: unknown) {
  const ink = hexText(value);
  return ink === "" || ink === "#ffffff" || ink === "#fff";
}

function paintUntouched(
  raw: unknown,
  band: string,
  ink: "black" | "any",
) {
  const paint = asRecord(raw);
  if (!paint) return false;
  if (paint.band == null || !sameHex(paint.band, band)) return false;
  if (ink === "black" && paint.ink != null && !isFactoryBlackInk(paint.ink)) return false;
  if (paint.highlight != null && !isFactoryWhite(paint.highlight)) return false;
  return true;
}

function isUntouchedFactorySide(theme: WristTheme, band: string, ink: "black" | "white") {
  if (theme.headerInk) return false;
  if (!sameHex(theme.band, band)) return false;
  if (ink === "black" && !isFactoryBlackInk(theme.ink)) return false;
  if (ink === "white" && !isFactoryWhite(theme.ink)) return false;
  if (!isFactoryWhite(theme.highlight)) return false;
  return true;
}

/** Untouched factory bands get a readable header color. A chosen header color stays. */
export function readableHeaderTheme(theme: WristTheme): WristTheme {
  if (theme.headerInk) return theme;
  const untouched =
    isUntouchedFactorySide(theme, OFFENSE_BAND, "white") ||
    isUntouchedFactorySide(theme, DEFENSE_BAND, "black") ||
    isUntouchedFactorySide(theme, PREVIOUS_OFFENSE_BAND, "black") ||
    isUntouchedFactorySide(theme, PREVIOUS_DEFENSE_BAND, "black") ||
    isUntouchedFactorySide(theme, LEGACY_PURPLE_BAND, "white");
  if (!untouched) return theme;
  return { ...theme, headerInk: autoHeaderInk(theme.band) };
}

/** Last round's red/pink factory pair, still on black ink. Custom colors return false. */
export function isUntouchedPreviousColors(raw: unknown) {
  const item = asRecord(raw);
  if (!item) return false;
  if (!paintUntouched(item.theme, PREVIOUS_OFFENSE_BAND, "black")) return false;
  const versions = Array.isArray(item.versions) ? item.versions : [];
  let sawDefense = false;
  for (const version of versions) {
    const record = asRecord(version);
    const themes = record ? asRecord(record.themes) : null;
    if (!themes) continue;
    const offense = asRecord(themes.offense);
    const defense = asRecord(themes.defense);
    if (offense && !paintUntouched(offense, PREVIOUS_OFFENSE_BAND, "black")) return false;
    if (!defense) return false;
    if (!paintUntouched(defense, PREVIOUS_DEFENSE_BAND, "black")) return false;
    sawDefense = true;
  }
  return sawDefense;
}

export function isPreviousDefaultSize(raw: unknown) {
  const item = asRecord(raw);
  const size = item ? asRecord(item.cardSize) : null;
  if (!size) return false;
  if (size.preset === "wrist") return true;
  return Number(size.widthIn) === 3.25 && Number(size.heightIn) === 2;
}

function remapVersionCells(raw: unknown, alias: Record<string, string>) {
  if (!raw || !Object.keys(alias).length) return raw;
  const item = asRecord(raw);
  if (!item) return raw;
  const mapList = (cells: unknown) => {
    if (!Array.isArray(cells)) return cells;
    return cells.map((cell) => {
      const record = asRecord(cell);
      if (!record) return cell;
      const callId = String(record.callId || "");
      const next = alias[callId];
      return next ? { ...record, callId: next } : cell;
    });
  };
  return {
    ...item,
    cells: mapList(item.cells),
    offenseCells: mapList(item.offenseCells),
    defenseCells: mapList(item.defenseCells),
  };
}

/** Purple 5×5 blocks on a 5×3 card, with no coach color or size change. */
export function isUntouchedLegacyCard(raw: unknown) {
  const item = asRecord(raw);
  if (!item) return false;
  const theme = asRecord(item.theme);
  if (!theme || !sameHex(theme.band, LEGACY_PURPLE_BAND)) return false;
  const size = asRecord(item.cardSize);
  if (!size) return false;
  const width = Number(size.widthIn);
  const height = Number(size.heightIn);
  if (size.preset !== "large" && !(width === 5 && height === 3)) return false;
  const layouts = asRecord(item.kindLayouts);
  const rows = Number(item.rows) || 5;
  const cols = Number(item.cols) || 5;
  const block = (key: string) => {
    const side = layouts ? asRecord(layouts[key]) : null;
    return {
      rows: side ? Number(side.rows) : rows,
      cols: side ? Number(side.cols) : cols,
    };
  };
  const offense = block("offense");
  const defense = block("defense");
  if (offense.rows !== 5 || offense.cols !== 5 || defense.rows !== 5 || defense.cols !== 5) return false;
  const versions = Array.isArray(item.versions) ? item.versions : [];
  for (const version of versions) {
    const record = asRecord(version);
    const themes = record ? asRecord(record.themes) : null;
    if (!themes) continue;
    for (const key of ["offense", "defense"]) {
      const paint = asRecord(themes[key]);
      if (paint && paint.band != null && !sameHex(paint.band, LEGACY_PURPLE_BAND)) return false;
    }
  }
  return true;
}

export function normalizeBook(raw: unknown, userId: string, title?: string): WristBook {
  const item = asRecord(raw);
  if (!item) return emptyBook(userId, title);
  const legacy = isUntouchedLegacyCard(item);
  const previousColors = !legacy && isUntouchedPreviousColors(item);
  const migrateColors = legacy || previousColors;
  const migrateSize = legacy || (previousColors && isPreviousDefaultSize(item));
  const layout = normalizeLayout(item);
  const kindLayouts = legacy
    ? defaultKindLayouts()
    : normalizeKindLayouts(item.kindLayouts, layout.rows, layout.cols);
  const library = (Array.isArray(item.library) ? item.library : [])
    .map(normalizeCall)
    .filter((call): call is WristCall => Boolean(call));
  const defenseFillMigrated = item.defenseFillMigrated === true;
  const prepared = !library.length || defenseFillMigrated ? library : clearUntouchedDefenseColors(library);
  const migrated = prepared.length
    ? migrateCalls(prepared)
    : { library: defaultLibrary(), alias: {} as Record<string, string> };
  const book = bookDraft(userId, String(item.title || "").trim() || title?.trim() || "My signs", {
    bandKind: normalizeKind(item.bandKind || item.kind || "offense"),
    ...layout,
    kindLayouts,
    theme: migrateColors ? defaultSetThemes().offense : normalizeTheme(item.theme),
    sheet: normalizeSheet(item.sheet || { cols: item.sheetCols, rows: item.sheetRows }),
    cardSize: migrateSize ? defaultCardSize() : normalizeCardSize(item.cardSize),
    numbering: normalizeNumbering(item.numbering),
    library: migrated.library,
    defenseFillMigrated: true,
    updatedAt: Number(item.updatedAt) || Date.now(),
  });
  const offenseLayout = layoutFor(book, "offense");
  const defenseLayout = layoutFor(book, "defense");
  book.versions = (Array.isArray(item.versions) ? item.versions : [])
    .map((version, index) =>
      normalizeVersion(
        migrateColors && asRecord(version)
          ? { ...asRecord(remapVersionCells(version, migrated.alias)), themes: defaultSetThemes() }
          : remapVersionCells(version, migrated.alias),
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
  book.theme = readableHeaderTheme(book.theme);
  book.versions = book.versions.map((version) => ({
    ...version,
    themes: {
      offense: readableHeaderTheme(version.themes.offense),
      defense: readableHeaderTheme(version.themes.defense),
    },
  }));
  const savedSpent = Array.isArray(item.spentVersionLetters) ? item.spentVersionLetters : [];
  let spent: string[] = [];
  for (const letter of savedSpent) {
    const ch = String(letter || "").trim().toUpperCase();
    if (/^[A-Z]$/.test(ch) && !spent.includes(ch)) spent.push(ch);
  }
  for (const version of book.versions) spent = noteSpentLetter(spent, version.name);
  book.spentVersionLetters = spentThrough(spent);
  book.defenseFillMigrated = true;
  return book;
}

export function callById(book: WristBook, callId: string) {
  return book.library.find((item) => item.id === callId) || null;
}

export function activeVersion(book: WristBook) {
  return book.versions.find((item) => item.id === book.activeVersionId) || book.versions[0] || null;
}
