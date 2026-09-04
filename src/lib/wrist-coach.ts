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
  large: { widthIn: 5, heightIn: 3 },
} as const;

export type CardSizePreset = "softball" | "large" | "custom";

export type WristCardSize = {
  preset: CardSizePreset;
  widthIn: number;
  heightIn: number;
};

export function defaultCardSize(): WristCardSize {
  return { preset: "softball", ...CARD_SIZE_PRESETS.softball };
}

function clampInches(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
}

export function normalizeCardSize(raw: unknown): WristCardSize {
  const item = asRecord(raw);
  const preset = item?.preset;
  if (preset === "softball" || preset === "large") {
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
};

export type WristCell = {
  row: number;
  col: number;
  code: string;
  callId: string;
};

export type WristVersion = {
  id: string;
  name: string;
  createdAt: number;
  cells: WristCell[];
};

export type WristBook = {
  version: 1;
  userId: string;
  title: string;
  rows: number;
  cols: number;
  cardSize: WristCardSize;
  library: WristCall[];
  versions: WristVersion[];
  activeVersionId: string;
  updatedAt: number;
};

export const DEFAULT_ROWS = 6;
export const DEFAULT_COLS = 5;

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

const DEFAULT_OFFENSE: Array<[string, string, string]> = [
  ["play-ha", "Hit away", "HA"],
  ["play-bnt", "Bunt", "BNT"],
  ["play-slp", "Slap", "SLP"],
  ["play-stl", "Steal", "STL"],
  ["play-hr", "Hit and run", "H&R"],
  ["play-sqz", "Squeeze", "SQZ"],
  ["play-tke", "Take", "TKE"],
  ["play-swg", "Swing", "SWG"],
  ["play-dly", "Delay steal", "DLY"],
  ["play-fbn", "Fake bunt", "FBN"],
  ["play-ssq", "Safety squeeze", "SSQ"],
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

function rowsToCalls(kind: WristCallKind, rows: Array<[string, string, string]>): WristCall[] {
  return rows.map(([id, name, short]) => ({
    id,
    kind,
    name,
    short,
    fill: "clear",
    ink: "clear",
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

function uniqueCodes(count: number, used: Set<string> = new Set()) {
  const codes: string[] = [];
  const pool: string[] = [];
  for (let n = 10; n <= 99; n += 1) pool.push(String(n));
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  for (const code of pool) {
    if (used.has(code)) continue;
    codes.push(code);
    if (codes.length === count) return codes;
  }
  let extra = 100;
  while (codes.length < count) {
    const code = String(extra);
    extra += 1;
    if (used.has(code)) continue;
    codes.push(code);
  }
  return codes;
}

function assignCalls(callIds: string[], cellCount: number) {
  if (cellCount <= 0) return [];
  if (!callIds.length) return Array.from({ length: cellCount }, () => "");
  const bag = [...callIds];
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  const assigned: string[] = [];
  for (let i = 0; i < cellCount; i += 1) {
    if (i < bag.length) {
      assigned.push(bag[i]);
    } else {
      assigned.push(callIds[Math.floor(Math.random() * callIds.length)]);
    }
  }
  for (let i = assigned.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [assigned[i], assigned[j]] = [assigned[j], assigned[i]];
  }
  return assigned;
}

export function shuffleVersion(
  book: Pick<WristBook, "rows" | "cols" | "library" | "versions">,
  name?: string,
): WristVersion {
  const rows = clampSize(book.rows, DEFAULT_ROWS);
  const cols = clampSize(book.cols, DEFAULT_COLS);
  const callIds = book.library.map((item) => item.id).filter(Boolean);
  const codes = uniqueCodes(rows * cols);
  const assigned = assignCalls(callIds, rows * cols);
  const cells: WristCell[] = [];
  let i = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      cells.push({
        row,
        col,
        code: codes[i],
        callId: assigned[i] || "",
      });
      i += 1;
    }
  }
  return {
    id: `ver-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: name?.trim() || nextVersionName(book.versions),
    createdAt: Date.now(),
    cells,
  };
}

function clampSize(value: unknown, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(8, Math.max(3, Math.round(n)));
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
  };
}

function normalizeCell(raw: unknown): WristCell | null {
  const item = asRecord(raw);
  if (!item) return null;
  const row = Number(item.row);
  const col = Number(item.col);
  if (!Number.isFinite(row) || !Number.isFinite(col)) return null;
  return {
    row,
    col,
    code: String(item.code || "").trim() || "00",
    callId: String(item.callId || ""),
  };
}

function normalizeVersion(raw: unknown, index: number, rows: number, cols: number): WristVersion | null {
  const item = asRecord(raw);
  if (!item) return null;
  const cells = (Array.isArray(item.cells) ? item.cells : [])
    .map(normalizeCell)
    .filter((cell): cell is WristCell => Boolean(cell));
  if (!cells.length) return null;
  return {
    id: String(item.id || `ver-${index}`),
    name: String(item.name || `Version ${index + 1}`).trim() || `Version ${index + 1}`,
    createdAt: Number(item.createdAt) || Date.now(),
    cells: cells.filter((cell) => cell.row < rows && cell.col < cols),
  };
}

export function emptyBook(userId: string, title?: string): WristBook {
  const library = defaultLibrary();
  const draft: WristBook = {
    version: 1,
    userId,
    title: title?.trim() || "My signs",
    rows: DEFAULT_ROWS,
    cols: DEFAULT_COLS,
    cardSize: defaultCardSize(),
    library,
    versions: [],
    activeVersionId: "",
    updatedAt: Date.now(),
  };
  const first = shuffleVersion(draft, "Version A");
  draft.versions = [first];
  draft.activeVersionId = first.id;
  return draft;
}

export function normalizeBook(raw: unknown, userId: string, title?: string): WristBook {
  const item = asRecord(raw);
  if (!item) return emptyBook(userId, title);
  const rows = clampSize(item.rows, DEFAULT_ROWS);
  const cols = clampSize(item.cols, DEFAULT_COLS);
  const library = (Array.isArray(item.library) ? item.library : [])
    .map(normalizeCall)
    .filter((call): call is WristCall => Boolean(call));
  const book: WristBook = {
    version: 1,
    userId,
    title: String(item.title || "").trim() || title?.trim() || "My signs",
    rows,
    cols,
    cardSize: normalizeCardSize(item.cardSize),
    library: library.length ? upgradeLibrary(library) : defaultLibrary(),
    versions: [],
    activeVersionId: "",
    updatedAt: Number(item.updatedAt) || Date.now(),
  };
  book.versions = (Array.isArray(item.versions) ? item.versions : [])
    .map((version, index) => normalizeVersion(version, index, rows, cols))
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
