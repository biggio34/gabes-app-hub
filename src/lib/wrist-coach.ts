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
  let color = "#0f172a";
  if (ink === "clear") {
    color = fill === "clear" || fill === "white" ? "#0f172a" : "#ffffff";
  } else if (ink === "white") {
    color = "#ffffff";
  } else {
    color = WRIST_COLOR_HEX[ink];
  }
  return { background, color };
}

export const CARD_SIZE_PRESETS = {
  softball: { widthIn: 3.5, heightIn: 2.25 },
  wrist: { widthIn: 4, heightIn: 2 },
  large: { widthIn: 5, heightIn: 3 },
} as const;

export type CardSizePreset = "softball" | "wrist" | "large" | "custom";

export type WristCardSize = {
  preset: CardSizePreset;
  widthIn: number;
  heightIn: number;
};

export function defaultCardSize(): WristCardSize {
  return { preset: "wrist", ...CARD_SIZE_PRESETS.wrist };
}

function clampInches(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
}

export function normalizeCardSize(raw: unknown): WristCardSize {
  const item = asRecord(raw);
  const preset = item?.preset;
  if (preset === "softball" || preset === "wrist" || preset === "large") {
    return { preset, ...CARD_SIZE_PRESETS[preset] };
  }
  if (preset === "custom" || item?.widthIn != null || item?.heightIn != null) {
    return {
      preset: "custom",
      widthIn: clampInches(item?.widthIn, CARD_SIZE_PRESETS.softball.widthIn, 1, 8.5),
      heightIn: clampInches(item?.heightIn, CARD_SIZE_PRESETS.softball.heightIn, 1, 11),
    };
  }
  return defaultCardSize();
}

export type WristCall = {
  id: string;
  kind: WristCallKind;
  name: string;
  short: string;
  fill: WristColor;
  ink: WristColor;
  count: number;
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

export type WristVersion = {
  id: string;
  name: string;
  titles: WristKindTitles;
  themes: WristKindThemes;
  createdAt: number;
  locked: boolean;
  cells: WristCell[];
};

export const SHEET_SIZE_PRESETS = {
  letter: { widthIn: 8.5, heightIn: 11 },
  half: { widthIn: 8.5, heightIn: 5.5 },
  index: { widthIn: 5, heightIn: 8 },
} as const;

export type SheetSizePreset = "letter" | "half" | "index" | "custom";

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
  theme: WristTheme;
  sheet: WristSheet;
  cardSize: WristCardSize;
  library: WristCall[];
  versions: WristVersion[];
  activeVersionId: string;
  updatedAt: number;
};

export const DEFAULT_GRIDS = 6;
export const DEFAULT_ROWS = 5;
export const DEFAULT_COLS = 5;
export const DEFAULT_SIGN_START = 1;
export const DEFAULT_ROW_START = 1;
export const DEFAULT_SHEET_COLS = 15;
export const DEFAULT_SHEET_ROWS = 1;

export function defaultSheet(): WristSheet {
  return {
    cols: DEFAULT_SHEET_COLS,
    rows: DEFAULT_SHEET_ROWS,
    preset: "letter",
    ...SHEET_SIZE_PRESETS.letter,
  };
}

export function normalizeSheet(raw: unknown): WristSheet {
  const item = asRecord(raw) || {};
  const cols = clampInt(item.cols, DEFAULT_SHEET_COLS, 4, 20);
  const rows = clampInt(item.rows, DEFAULT_SHEET_ROWS, 1, 8);
  const preset = item.preset;
  if (preset === "letter" || preset === "half" || preset === "index") {
    return { cols, rows, preset, ...SHEET_SIZE_PRESETS[preset] };
  }
  if (preset === "custom" || item.widthIn != null || item.heightIn != null) {
    return {
      cols,
      rows,
      preset: "custom",
      widthIn: clampInches(item.widthIn, SHEET_SIZE_PRESETS.letter.widthIn, 2, 8.5),
      heightIn: clampInches(item.heightIn, SHEET_SIZE_PRESETS.letter.heightIn, 2, 11),
    };
  }
  return { cols, rows, preset: "letter", ...SHEET_SIZE_PRESETS.letter };
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

export function layoutOf(book: Pick<WristBook, "grids" | "rows" | "cols" | "signStart" | "rowStart">): WristLayout {
  return {
    grids: book.grids,
    rows: book.rows,
    cols: book.cols,
    signStart: book.signStart,
    rowStart: book.rowStart,
  };
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

export type WristSheetGroup = {
  callId: string;
  name: string;
  short: string;
  codes: string[];
};

export function sheetGroups(book: WristBook, version: WristVersion | null): WristSheetGroup[] {
  if (!version) return [];
  const kind = book.bandKind || "offense";
  const layout = layoutOf(book);
  const byCall = new Map<string, string[]>();
  for (const cell of version.cells) {
    if (!cell.callId) continue;
    const call = callById(book, cell.callId);
    if (!call) continue;
    const list = byCall.get(call.id) || [];
    list.push(sheetCode(cell.grid, cell.row, cell.col, layout.signStart, layout.rowStart));
    byCall.set(call.id, list);
  }
  const listed = book.library.filter((call) => byCall.has(call.id));
  const preferred = listed.filter((call) => call.kind === kind);
  const rest = listed.filter((call) => call.kind !== kind);
  return [...preferred, ...rest].map((call) => ({
    callId: call.id,
    name: call.name,
    short: call.short,
    codes: (byCall.get(call.id) || []).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
  }));
}

export function cardCounts(version: WristVersion | null): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!version) return counts;
  for (const cell of version.cells) {
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
) {
  if (total <= 0) return [];
  const signs = library.filter((item) => item.kind === kind && item.id);
  if (!signs.length) return Array.from({ length: total }, () => "");
  const specified = signs.some((item) => (item.count || 0) > 0);
  const bag: string[] = [];
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

export function shuffleVersion(
  book: Pick<
    WristBook,
    "grids" | "rows" | "cols" | "signStart" | "rowStart" | "bandKind" | "library" | "versions"
  > & { title?: string; theme?: WristTheme },
  name?: string,
  titles?: WristKindTitles,
  themes?: WristKindThemes,
): WristVersion {
  const layout = layoutOf({
    grids: clampInt(book.grids, DEFAULT_GRIDS, 1, 8),
    rows: clampInt(book.rows, DEFAULT_ROWS, 3, 8),
    cols: clampInt(book.cols, DEFAULT_COLS, 3, 8),
    signStart: clampInt(book.signStart, DEFAULT_SIGN_START, 0, 9),
    rowStart: clampInt(book.rowStart, DEFAULT_ROW_START, 0, 9),
  });
  const assigned = signBag(book.library, book.bandKind || "offense", cellCount(layout));
  const cells: WristCell[] = [];
  let i = 0;
  for (let grid = 0; grid < layout.grids; grid += 1) {
    for (let row = 0; row < layout.rows; row += 1) {
      for (let col = 0; col < layout.cols; col += 1) {
        cells.push({
          grid,
          row,
          col,
          code: callCode(grid, row, col, layout.signStart, layout.rowStart),
          callId: assigned[i] || "",
        });
        i += 1;
      }
    }
  }
  return {
    id: `ver-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: name?.trim() || nextVersionName(book.versions),
    titles: normalizeKindTitles(titles, book.title),
    themes: normalizeKindThemes(themes, book.theme),
    createdAt: Date.now(),
    locked: false,
    cells,
  };
}

export function copyCurrentVersion(
  book: Pick<WristBook, "versions">,
  version: WristVersion,
): WristVersion {
  return {
    id: `ver-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: nextVersionName(book.versions),
    titles: normalizeKindTitles(version.titles),
    themes: normalizeKindThemes(version.themes),
    createdAt: Date.now(),
    locked: false,
    cells: version.cells.map((cell) => ({ ...cell })),
  };
}

export function shuffleCurrentVersion(
  book: Pick<
    WristBook,
    "grids" | "rows" | "cols" | "signStart" | "rowStart" | "bandKind" | "library" | "versions"
  > & { title?: string; theme?: WristTheme },
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
  };
}

function normalizeCell(raw: unknown, layout: WristLayout): WristCell | null {
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
    code: callCode(grid, row, col, layout.signStart, layout.rowStart),
    callId: String(item.callId || ""),
  };
}

function normalizeVersion(
  raw: unknown,
  index: number,
  layout: WristLayout,
  fallbackTitle?: string,
  fallbackTheme?: WristTheme,
): WristVersion | null {
  const item = asRecord(raw);
  if (!item) return null;
  const cells = (Array.isArray(item.cells) ? item.cells : [])
    .map((cell) => normalizeCell(cell, layout))
    .filter((cell): cell is WristCell => Boolean(cell));
  if (cells.length !== cellCount(layout)) return null;
  return {
    id: String(item.id || `ver-${index}`),
    name: String(item.name || `Version ${index + 1}`).trim() || `Version ${index + 1}`,
    titles: normalizeKindTitles(item.titles, fallbackTitle),
    themes: normalizeKindThemes(item.themes, fallbackTheme),
    createdAt: Number(item.createdAt) || Date.now(),
    locked: Boolean(item.locked),
    cells,
  };
}

function bookDraft(
  userId: string,
  title: string,
  extra: Partial<WristBook> = {},
): WristBook {
  const layout = extra.grids != null ? layoutOf(extra as WristBook) : {
    grids: DEFAULT_GRIDS,
    rows: DEFAULT_ROWS,
    cols: DEFAULT_COLS,
    signStart: DEFAULT_SIGN_START,
    rowStart: DEFAULT_ROW_START,
  };
  return {
    version: 1,
    userId,
    title,
    bandKind: extra.bandKind || "offense",
    rows: layout.rows,
    cols: layout.cols,
    grids: layout.grids,
    signStart: layout.signStart,
    rowStart: layout.rowStart,
    theme: extra.theme || defaultTheme(),
    sheet: extra.sheet || defaultSheet(),
    cardSize: extra.cardSize || defaultCardSize(),
    library: extra.library || defaultLibrary(),
    versions: extra.versions || [],
    activeVersionId: extra.activeVersionId || "",
    updatedAt: extra.updatedAt || Date.now(),
  };
}

export function emptyBook(userId: string, title?: string): WristBook {
  const draft = bookDraft(userId, title?.trim() || "My signs");
  const first = shuffleVersion(draft, "Version A");
  draft.versions = [first];
  draft.activeVersionId = first.id;
  return draft;
}

export function normalizeBook(raw: unknown, userId: string, title?: string): WristBook {
  const item = asRecord(raw);
  if (!item) return emptyBook(userId, title);
  const layout = normalizeLayout(item);
  const library = (Array.isArray(item.library) ? item.library : [])
    .map(normalizeCall)
    .filter((call): call is WristCall => Boolean(call));
  const book = bookDraft(userId, String(item.title || "").trim() || title?.trim() || "My signs", {
    bandKind: normalizeKind(item.bandKind || item.kind || "offense"),
    ...layout,
    theme: normalizeTheme(item.theme),
    sheet: normalizeSheet(item.sheet || { cols: item.sheetCols, rows: item.sheetRows }),
    cardSize: normalizeCardSize(item.cardSize),
    library: library.length ? upgradeLibrary(library) : defaultLibrary(),
    updatedAt: Number(item.updatedAt) || Date.now(),
  });
  book.versions = (Array.isArray(item.versions) ? item.versions : [])
    .map((version, index) => normalizeVersion(version, index, layout, book.title, book.theme))
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
