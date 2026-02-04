import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// ============================================================================
// CONSTANTS
// ============================================================================

/** Minimum Jaccard similarity score for fuzzy address matching */
const FUZZY_MATCH_THRESHOLD = 0.45;

/** Higher threshold for search results to reduce noise */
const SEARCH_MATCH_THRESHOLD = 0.7;

/** Maximum files to display per parcel (performance guard) */
const MAX_FILES_DISPLAY = 300;

/** Height of each parcel row for virtual scrolling */
const PARCEL_ROW_HEIGHT = 72;

/** Number of items to render above/below viewport */
const VIRTUAL_OVERSCAN = 5;

/** LocalStorage key for saved searches */
const SAVED_SEARCHES_KEY = "hawk_saved_searches";

/** LocalStorage key for tagged comparables */
const COMPARABLES_KEY = "hawk_comparables";

// ============================================================================
// ADDRESS NORMALIZATION MAPS
// ============================================================================

const SUFFIX_MAP: Record<string, string> = {
  ST: "STREET",
  "ST.": "STREET",
  AVE: "AVENUE",
  "AVE.": "AVENUE",
  BLVD: "BOULEVARD",
  "BLVD.": "BOULEVARD",
  RD: "ROAD",
  "RD.": "ROAD",
  DR: "DRIVE",
  "DR.": "DRIVE",
  LN: "LANE",
  "LN.": "LANE",
  PKWY: "PARKWAY",
  PL: "PLACE",
  "PL.": "PLACE",
  TER: "TERRACE",
  "TER.": "TERRACE",
  HWY: "HIGHWAY",
  CTR: "CENTER",
  CIR: "CIRCLE",
  WAY: "WAY",
  TRL: "TRAIL",
  TRAIL: "TRAIL",
  SQ: "SQUARE",
};

const DIR_MAP: Record<string, string> = {
  N: "NORTH",
  "N.": "NORTH",
  S: "SOUTH",
  "S.": "SOUTH",
  E: "EAST",
  "E.": "EAST",
  W: "WEST",
  "W.": "WEST",
};

const punctRegex = /[^A-Z0-9]+/g;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/** CRE-specific property metadata */
interface ParcelProperties {
  // Core identifiers
  Address?: string;
  SITUS?: string;
  SITE_ADDR?: string;
  APN?: string;
  PARCEL_ID?: string;

  // Physical characteristics
  SQFT?: number;
  LOT_SIZE?: number;
  YEAR_BUILT?: number;
  STORIES?: number;
  UNITS?: number;

  // Zoning & use
  ZONING?: string;
  LAND_USE?: string;
  PROPERTY_TYPE?: string;

  // Ownership
  OWNER?: string;
  OWNER_NAME?: string;
  INVESTOR?: string;

  // Sale info
  LAST_SALE_DATE?: string;
  LAST_SALE_PRICE?: number;
  ASSESSED_VALUE?: number;

  // Allow additional properties
  [key: string]: unknown;
}

interface ParcelFeature extends GeoJSON.Feature {
  properties: ParcelProperties | null;
}

interface IndexFileRecord {
  path: string;
  ext?: string;
  size?: number;
  mtime?: string;
  summary?: string;
}

interface AddressBucket {
  files?: IndexFileRecord[];
  [k: string]: unknown;
}

interface AddressIndex {
  addresses: Record<string, AddressBucket | IndexFileRecord[]>;
}

interface SavedSearch {
  id: string;
  name: string;
  query: string;
  createdAt: string;
}

interface LoadError {
  type: "parcels" | "index";
  message: string;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Normalize a string into comparable tokens.
 * Expands abbreviations for street suffixes and directions.
 */
function normTokens(s: string | null | undefined): string[] {
  if (!s) return [];
  const u = s.toUpperCase().replace(punctRegex, " ").trim();
  if (!u) return [];
  return u
    .split(/\s+/)
    .map((t) => DIR_MAP[t] || SUFFIX_MAP[t] || t)
    .filter(Boolean);
}

/**
 * Check if all needle tokens exist in the hay set
 */
function tokenSubsetMatch(needle: string[], hay: string[]): boolean {
  const h = new Set(hay);
  return needle.every((t) => h.has(t));
}

/**
 * Calculate Jaccard similarity coefficient between two strings.
 * Returns a value between 0 (no overlap) and 1 (identical token sets).
 */
function jaccardSimilarity(a: string, b: string): number {
  const A = new Set(normTokens(a));
  const B = new Set(normTokens(b));
  const intersection = new Set([...A].filter((x) => B.has(x))).size;
  const union = new Set([...A, ...B]).size || 1;
  return intersection / union;
}

function isFeatureCollection(x: unknown): x is GeoJSON.FeatureCollection {
  return (
    x !== null &&
    typeof x === "object" &&
    (x as Record<string, unknown>).type === "FeatureCollection" &&
    Array.isArray((x as Record<string, unknown>).features)
  );
}

function sanitizeFeatures(x: unknown): ParcelFeature[] {
  if (!Array.isArray(x)) return [];
  return x.filter(
    (f): f is ParcelFeature =>
      f !== null &&
      typeof f === "object" &&
      (f as Record<string, unknown>).type === "Feature" &&
      (f as Record<string, unknown>).geometry !== null
  );
}

/**
 * Extract address from parcel properties, checking common field names
 */
function getAddress(props: ParcelProperties | null): string {
  if (!props) return "";
  return String(
    props.Address ?? props.SITUS ?? props.SITE_ADDR ?? ""
  );
}

/**
 * Extract APN from parcel properties, checking common field names
 */
function getAPN(props: ParcelProperties | null): string {
  if (!props) return "";
  return String(props.APN ?? props.PARCEL_ID ?? "");
}

/**
 * Find files linked to a parcel address from the index
 */
function filesForParcel(
  indexData: AddressIndex | null,
  addrText: string
): IndexFileRecord[] {
  try {
    if (!indexData) return [];
    const buckets = indexData.addresses || {};

    // Try exact match first
    const exact = buckets[addrText];
    if (Array.isArray(exact)) return exact as IndexFileRecord[];
    if (exact && Array.isArray((exact as AddressBucket).files)) {
      return (exact as AddressBucket).files as IndexFileRecord[];
    }

    // Try uppercase exact match
    const upper = (addrText || "").toUpperCase();
    const exactUpper = buckets[upper];
    if (Array.isArray(exactUpper)) return exactUpper as IndexFileRecord[];
    if (exactUpper && Array.isArray((exactUpper as AddressBucket).files)) {
      return (exactUpper as AddressBucket).files as IndexFileRecord[];
    }

    // Fuzzy match using Jaccard similarity
    const keys = Object.keys(buckets);
    const candidates = keys
      .map((k) => ({ k, score: jaccardSimilarity(addrText, k) }))
      .filter((x) => x.score >= FUZZY_MATCH_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    const out: IndexFileRecord[] = [];
    for (const c of candidates) {
      const bucket = buckets[c.k];
      if (Array.isArray(bucket)) {
        out.push(...(bucket as IndexFileRecord[]));
      } else if (bucket && Array.isArray((bucket as AddressBucket).files)) {
        out.push(...((bucket as AddressBucket).files as IndexFileRecord[]));
      }
    }

    return out;
  } catch {
    return [];
  }
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return "?";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format currency value
 */
function formatCurrency(value: number | undefined): string {
  if (value === undefined) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format square footage
 */
function formatSqft(value: number | undefined): string {
  if (value === undefined) return "-";
  return new Intl.NumberFormat("en-US").format(value) + " SF";
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ============================================================================
// CUSTOM HOOKS
// ============================================================================

/**
 * Hook for managing localStorage-backed state
 */
function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T) => {
      try {
        setStoredValue(value);
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        console.error(`Error saving to localStorage:`, error);
      }
    },
    [key]
  );

  return [storedValue, setValue];
}

/**
 * Simple virtual list hook for rendering large lists efficiently
 */
function useVirtualList(
  containerRef: React.RefObject<HTMLDivElement>,
  itemCount: number,
  itemHeight: number,
  overscan: number = VIRTUAL_OVERSCAN
) {
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => setScrollTop(container.scrollTop);
    const handleResize = () => setContainerHeight(container.clientHeight);

    handleResize();
    container.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);

    return () => {
      container.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, [containerRef]);

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    itemCount,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
  );

  return {
    virtualItems: Array.from({ length: endIndex - startIndex }, (_, i) => ({
      index: startIndex + i,
      offsetTop: (startIndex + i) * itemHeight,
    })),
    totalHeight: itemCount * itemHeight,
    startIndex,
    endIndex,
  };
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

/** Error banner component */
function ErrorBanner({
  error,
  onDismiss,
}: {
  error: LoadError;
  onDismiss: () => void;
}) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <svg
          className="w-5 h-5 text-red-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span className="text-red-700 text-sm">
          <strong>
            {error.type === "parcels" ? "Parcel file" : "Index file"} error:
          </strong>{" "}
          {error.message}
        </span>
      </div>
      <button
        onClick={onDismiss}
        className="text-red-500 hover:text-red-700 p-1"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

/** Loading spinner */
function Spinner({ size = "sm" }: { size?: "sm" | "md" }) {
  const sizeClass = size === "sm" ? "w-4 h-4" : "w-6 h-6";
  return (
    <svg
      className={`${sizeClass} animate-spin text-blue-500`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

/** Comparable tag badge */
function ComparableBadge({ onClick }: { onClick?: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors"
    >
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
      COMP
    </button>
  );
}

/** Property details section */
function PropertyDetails({
  props,
  isComp,
  onToggleComp,
}: {
  props: ParcelProperties;
  isComp: boolean;
  onToggleComp: () => void;
}) {
  const address = getAddress(props);
  const apn = getAPN(props);

  return (
    <div className="p-4 border-b space-y-4">
      {/* Header with comp toggle */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
            Address
          </div>
          <div className="font-semibold text-slate-900 break-words">
            {address || "(no address)"}
          </div>
        </div>
        <button
          onClick={onToggleComp}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            isComp
              ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <svg
            className={`w-4 h-4 ${isComp ? "fill-amber-500" : "fill-none stroke-current"}`}
            viewBox="0 0 20 20"
            strokeWidth={isComp ? 0 : 1.5}
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
          {isComp ? "Comp" : "Mark as Comp"}
        </button>
      </div>

      {/* Core info grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <span className="text-slate-500">APN:</span>{" "}
          <span className="font-medium text-slate-700">{apn || "-"}</span>
        </div>
        <div>
          <span className="text-slate-500">Zoning:</span>{" "}
          <span className="font-medium text-slate-700">
            {props.ZONING || props.LAND_USE || "-"}
          </span>
        </div>
        <div>
          <span className="text-slate-500">Type:</span>{" "}
          <span className="font-medium text-slate-700">
            {props.PROPERTY_TYPE || "-"}
          </span>
        </div>
        <div>
          <span className="text-slate-500">Year Built:</span>{" "}
          <span className="font-medium text-slate-700">
            {props.YEAR_BUILT || "-"}
          </span>
        </div>
      </div>

      {/* Size info */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <div className="text-xs text-slate-500 mb-1">Building SF</div>
          <div className="font-semibold text-slate-900">
            {formatSqft(props.SQFT)}
          </div>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <div className="text-xs text-slate-500 mb-1">Lot Size</div>
          <div className="font-semibold text-slate-900">
            {formatSqft(props.LOT_SIZE)}
          </div>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <div className="text-xs text-slate-500 mb-1">Units</div>
          <div className="font-semibold text-slate-900">
            {props.UNITS ?? props.STORIES ?? "-"}
          </div>
        </div>
      </div>

      {/* Ownership & value */}
      <div className="border-t pt-3 space-y-2">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">
          Ownership & Value
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <span className="text-slate-500">Owner:</span>{" "}
            <span className="font-medium text-slate-700">
              {props.OWNER || props.OWNER_NAME || props.INVESTOR || "-"}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Assessed:</span>{" "}
            <span className="font-medium text-slate-700">
              {formatCurrency(props.ASSESSED_VALUE)}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Last Sale:</span>{" "}
            <span className="font-medium text-slate-700">
              {props.LAST_SALE_DATE || "-"}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Sale Price:</span>{" "}
            <span className="font-medium text-slate-700">
              {formatCurrency(props.LAST_SALE_PRICE)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** File preview modal */
function FilePreviewModal({
  file,
  onClose,
}: {
  file: IndexFileRecord;
  onClose: () => void;
}) {
  const ext = (file.ext || "").toLowerCase();
  const isImage = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"].includes(ext);
  const isPdf = ext === ".pdf";
  const isText = [".txt", ".md", ".csv", ".json"].includes(ext);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-slate-900 truncate">{file.path}</div>
            <div className="text-xs text-slate-500">
              {file.ext} · {formatBytes(file.size)} · {file.mtime || ""}
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-3 p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {isImage && (
            <div className="flex items-center justify-center h-full">
              <img
                src={file.path}
                alt={file.path}
                className="max-w-full max-h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <div className="text-slate-500 text-sm">
                Image preview (if file is accessible)
              </div>
            </div>
          )}
          {isPdf && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <svg className="w-16 h-16 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4zm-2.5 9.5a.5.5 0 01.5-.5h2a.5.5 0 010 1h-2a.5.5 0 01-.5-.5zm0 2a.5.5 0 01.5-.5h4a.5.5 0 010 1h-4a.5.5 0 01-.5-.5z" />
              </svg>
              <div className="text-slate-700 font-medium">PDF Document</div>
              <a
                href={file.path}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Open PDF
              </a>
            </div>
          )}
          {isText && file.summary && (
            <pre className="text-sm text-slate-700 whitespace-pre-wrap font-mono bg-slate-50 p-4 rounded-lg">
              {file.summary}
            </pre>
          )}
          {!isImage && !isPdf && !isText && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <svg className="w-16 h-16 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div className="text-slate-700">File: {file.path}</div>
              {file.summary && (
                <div className="text-sm text-slate-500 max-w-md text-center">
                  {file.summary}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Saved searches dropdown */
function SavedSearches({
  searches,
  onSelect,
  onDelete,
  onSave,
  currentQuery,
}: {
  searches: SavedSearch[];
  onSelect: (query: string) => void;
  onDelete: (id: string) => void;
  onSave: (name: string) => void;
  currentQuery: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [newName, setNewName] = useState("");

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
        Saved ({searches.length})
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white border rounded-lg shadow-lg z-20">
          {/* Save current search */}
          {currentQuery && (
            <div className="p-2 border-b">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Save current search as..."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="flex-1 text-sm border rounded px-2 py-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newName.trim()) {
                      onSave(newName.trim());
                      setNewName("");
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (newName.trim()) {
                      onSave(newName.trim());
                      setNewName("");
                    }
                  }}
                  className="px-2 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {/* Saved searches list */}
          <div className="max-h-48 overflow-auto">
            {searches.length === 0 ? (
              <div className="p-3 text-sm text-slate-500 text-center">
                No saved searches yet
              </div>
            ) : (
              searches.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 group"
                >
                  <button
                    onClick={() => {
                      onSelect(s.query);
                      setIsOpen(false);
                    }}
                    className="flex-1 text-left text-sm truncate"
                  >
                    <div className="font-medium text-slate-700">{s.name}</div>
                    <div className="text-xs text-slate-500 truncate">{s.query}</div>
                  </button>
                  <button
                    onClick={() => onDelete(s.id)}
                    className="p-1 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// EXPORT FUNCTIONS
// ============================================================================

/**
 * Export parcels to CSV format
 */
function exportToCSV(features: ParcelFeature[], filename: string): void {
  if (features.length === 0) return;

  // Collect all unique property keys
  const allKeys = new Set<string>();
  features.forEach((f) => {
    if (f.properties) {
      Object.keys(f.properties).forEach((k) => allKeys.add(k));
    }
  });
  const headers = Array.from(allKeys);

  // Build CSV content
  const escapeCSV = (val: unknown): string => {
    const str = String(val ?? "");
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = features.map((f) => {
    const props = f.properties || {};
    return headers.map((h) => escapeCSV(props[h])).join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");
  downloadFile(csv, filename, "text/csv");
}

/**
 * Export parcels to GeoJSON format
 */
function exportToGeoJSON(features: ParcelFeature[], filename: string): void {
  const fc: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: features as GeoJSON.Feature[],
  };
  const json = JSON.stringify(fc, null, 2);
  downloadFile(json, filename, "application/geo+json");
}

/**
 * Trigger browser download
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ParcelExplorer() {
  // Data state
  const [geojson, setGeojson] = useState<unknown>(null);
  const [indexData, setIndexData] = useState<AddressIndex | null>(null);
  const [errors, setErrors] = useState<LoadError[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // UI state
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [selectedFeature, setSelectedFeature] = useState<ParcelFeature | null>(null);
  const [previewFile, setPreviewFile] = useState<IndexFileRecord | null>(null);
  const [showCompsOnly, setShowCompsOnly] = useState(false);

  // Persisted state
  const [savedSearches, setSavedSearches] = useLocalStorage<SavedSearch[]>(
    SAVED_SEARCHES_KEY,
    []
  );
  const [comparables, setComparables] = useLocalStorage<string[]>(
    COMPARABLES_KEY,
    []
  );

  // Virtual list ref
  const listRef = useRef<HTMLDivElement>(null);

  // Parse uploaded GeoJSON into FeatureCollection
  const uploadedFeatureCollection: GeoJSON.FeatureCollection = useMemo(() => {
    if (!geojson) return EMPTY_FC;
    if (isFeatureCollection(geojson)) {
      return {
        type: "FeatureCollection",
        features: sanitizeFeatures(geojson.features),
      };
    }
    if (Array.isArray(geojson)) {
      return {
        type: "FeatureCollection",
        features: sanitizeFeatures(geojson),
      };
    }
    const g = geojson as Record<string, unknown>;
    if (g && Array.isArray(g.features)) {
      return {
        type: "FeatureCollection",
        features: sanitizeFeatures(g.features),
      };
    }
    return EMPTY_FC;
  }, [geojson]);

  // Filter features based on search query
  const filteredFeatures: ParcelFeature[] = useMemo(() => {
    const feats = uploadedFeatureCollection.features as ParcelFeature[];
    const q = (deferredSearch || "").trim();

    let result = feats;

    // Apply search filter
    if (q) {
      const nt = normTokens(q);
      result = feats.filter((f) => {
        const props = f.properties || {};
        const addr = getAddress(props);
        const apn = getAPN(props);

        const addrHit = tokenSubsetMatch(nt, normTokens(addr));
        const apnHit = apn && apn.toUpperCase().includes(q.toUpperCase());
        return addrHit || apnHit || jaccardSimilarity(q, addr) >= SEARCH_MATCH_THRESHOLD;
      });
    }

    // Apply comps filter
    if (showCompsOnly) {
      result = result.filter((f) => {
        const addr = getAddress(f.properties);
        return comparables.includes(addr);
      });
    }

    return result;
  }, [uploadedFeatureCollection, deferredSearch, showCompsOnly, comparables]);

  // Virtual list setup
  const { virtualItems, totalHeight } = useVirtualList(
    listRef as React.RefObject<HTMLDivElement>,
    filteredFeatures.length,
    PARCEL_ROW_HEIGHT
  );

  // Selected parcel details
  const selectedProps = selectedFeature?.properties || {};
  const selectedAddr = getAddress(selectedProps);
  const selectedFiles = useMemo(
    () => filesForParcel(indexData, selectedAddr),
    [selectedAddr, indexData]
  );
  const isSelectedComp = comparables.includes(selectedAddr);

  // Auto-select first result
  useEffect(() => {
    if (!selectedFeature && filteredFeatures.length > 0) {
      setSelectedFeature(filteredFeatures[0]);
    }
  }, [filteredFeatures, selectedFeature]);

  // Handlers
  const handleParcelFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    setIsLoading(true);
    try {
      const txt = await f.text();
      const parsed = JSON.parse(txt);
      setGeojson(parsed);
      setSelectedFeature(null);
      setErrors((prev) => prev.filter((err) => err.type !== "parcels"));
    } catch (err) {
      setGeojson(EMPTY_FC);
      setSelectedFeature(null);
      setErrors((prev) => [
        ...prev.filter((e) => e.type !== "parcels"),
        {
          type: "parcels",
          message: err instanceof Error ? err.message : "Failed to parse file",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleIndexFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    setIsLoading(true);
    try {
      const txt = await f.text();
      const parsed = JSON.parse(txt);
      setIndexData(parsed as AddressIndex);
      setErrors((prev) => prev.filter((err) => err.type !== "index"));
    } catch (err) {
      setIndexData(null);
      setErrors((prev) => [
        ...prev.filter((e) => e.type !== "index"),
        {
          type: "index",
          message: err instanceof Error ? err.message : "Failed to parse file",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSearch = (name: string) => {
    if (!search.trim()) return;
    const newSearch: SavedSearch = {
      id: generateId(),
      name,
      query: search,
      createdAt: new Date().toISOString(),
    };
    setSavedSearches([newSearch, ...savedSearches]);
  };

  const handleDeleteSearch = (id: string) => {
    setSavedSearches(savedSearches.filter((s) => s.id !== id));
  };

  const toggleComparable = (addr: string) => {
    if (!addr) return;
    if (comparables.includes(addr)) {
      setComparables(comparables.filter((a) => a !== addr));
    } else {
      setComparables([...comparables, addr]);
    }
  };

  const isSearchPending = search !== deferredSearch;

  return (
    <div className="w-full h-full bg-slate-50">
      <div className="max-w-7xl mx-auto p-4 space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900">
              BuildingHawk Parcel Explorer
            </h1>
            {isLoading && <Spinner />}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportToCSV(filteredFeatures, "parcels.csv")}
              disabled={filteredFeatures.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              CSV
            </button>
            <button
              onClick={() => exportToGeoJSON(filteredFeatures, "parcels.geojson")}
              disabled={filteredFeatures.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              GeoJSON
            </button>
          </div>
        </div>

        {/* Errors */}
        {errors.map((err, i) => (
          <ErrorBanner
            key={`${err.type}-${i}`}
            error={err}
            onDismiss={() => setErrors(errors.filter((_, j) => j !== i))}
          />
        ))}

        {/* Controls */}
        <div className="bg-white rounded-xl border p-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            {/* File uploads */}
            <div className="md:col-span-4">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Parcels (.geojson)
              </label>
              <input
                type="file"
                accept=".json,.geojson,application/geo+json,application/json"
                onChange={handleParcelFileUpload}
                className="w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Address Index (.json)
              </label>
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleIndexFileUpload}
                className="w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
              />
            </div>

            {/* Search */}
            <div className="md:col-span-5">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Search
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    className="w-full border rounded-lg px-3 py-2 pr-8 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Address, APN, owner..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {isSearchPending && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <Spinner size="sm" />
                    </div>
                  )}
                </div>
                <SavedSearches
                  searches={savedSearches}
                  onSelect={setSearch}
                  onDelete={handleDeleteSearch}
                  onSave={handleSaveSearch}
                  currentQuery={search}
                />
              </div>
            </div>
          </div>

          {/* Filter toggles */}
          <div className="mt-3 pt-3 border-t flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={showCompsOnly}
                onChange={(e) => setShowCompsOnly(e.target.checked)}
                className="rounded border-slate-300 text-amber-500 focus:ring-amber-500"
              />
              <span className="text-slate-700">Show comps only</span>
              <span className="text-slate-400">({comparables.length})</span>
            </label>
          </div>
        </div>

        {/* Main content */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100vh-280px)]">
          {/* Parcel list */}
          <div className="lg:col-span-5 bg-white border rounded-xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">
                Parcels ({filteredFeatures.length.toLocaleString()})
              </span>
              {comparables.length > 0 && (
                <span className="text-xs text-amber-600 font-medium">
                  {comparables.length} comps tagged
                </span>
              )}
            </div>

            <div ref={listRef} className="flex-1 overflow-auto">
              {filteredFeatures.length === 0 ? (
                <div className="p-6 text-center text-slate-500">
                  <svg
                    className="w-12 h-12 mx-auto mb-3 text-slate-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                    />
                  </svg>
                  {geojson ? "No parcels match your search" : "Upload a GeoJSON file to begin"}
                </div>
              ) : (
                <div style={{ height: totalHeight, position: "relative" }}>
                  {virtualItems.map(({ index, offsetTop }) => {
                    const f = filteredFeatures[index];
                    const props = f.properties || {};
                    const addr = getAddress(props);
                    const apn = getAPN(props);
                    const isSel = selectedFeature === f;
                    const isComp = comparables.includes(addr);

                    return (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setSelectedFeature(f)}
                        style={{
                          position: "absolute",
                          top: offsetTop,
                          left: 0,
                          right: 0,
                          height: PARCEL_ROW_HEIGHT,
                        }}
                        className={`w-full text-left px-4 py-2 border-b transition-colors ${
                          isSel
                            ? "bg-blue-50 border-l-4 border-l-blue-500"
                            : "hover:bg-slate-50 border-l-4 border-l-transparent"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-slate-900 truncate">
                              {addr || "(no address)"}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              APN: {apn || "-"}
                            </div>
                          </div>
                          {isComp && <ComparableBadge />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Details panel */}
          <div className="lg:col-span-7 bg-white border rounded-xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b bg-slate-50">
              <span className="text-sm font-medium text-slate-700">
                Property Details & Linked Files
              </span>
            </div>

            {selectedFeature ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                <PropertyDetails
                  props={selectedProps as ParcelProperties}
                  isComp={isSelectedComp}
                  onToggleComp={() => toggleComparable(selectedAddr)}
                />

                {/* Files section */}
                <div className="px-4 py-2 border-b bg-slate-50 flex items-center justify-between">
                  <span className="text-sm text-slate-600">
                    {selectedFiles.length} linked file(s)
                  </span>
                </div>

                <div className="flex-1 overflow-auto p-4">
                  {selectedFiles.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <svg
                        className="w-10 h-10 mx-auto mb-2 text-slate-300"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"
                        />
                      </svg>
                      No files matched in the index for this parcel
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {selectedFiles.slice(0, MAX_FILES_DISPLAY).map((rec, i) => (
                        <button
                          key={i}
                          onClick={() => setPreviewFile(rec)}
                          className="text-left border rounded-lg p-3 hover:bg-slate-50 hover:border-blue-300 transition-colors group"
                        >
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-slate-100 rounded-lg group-hover:bg-blue-100 transition-colors">
                              <svg
                                className="w-5 h-5 text-slate-500 group-hover:text-blue-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-slate-900 break-all text-sm">
                                {rec.path}
                              </div>
                              <div className="text-xs text-slate-500 mt-1">
                                {rec.ext || "file"} · {formatBytes(rec.size)} ·{" "}
                                {rec.mtime || ""}
                              </div>
                              {rec.summary && (
                                <div className="mt-2 text-xs text-slate-600 line-clamp-2">
                                  {rec.summary}
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                      {selectedFiles.length > MAX_FILES_DISPLAY && (
                        <div className="text-center text-sm text-slate-500 py-2">
                          Showing {MAX_FILES_DISPLAY} of {selectedFiles.length} files
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-500 p-8">
                <div className="text-center">
                  <svg
                    className="w-16 h-16 mx-auto mb-4 text-slate-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                  </svg>
                  <p className="text-lg font-medium text-slate-700 mb-1">
                    Select a Parcel
                  </p>
                  <p className="text-sm">
                    Choose a parcel from the list to view details and linked files
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* File preview modal */}
      {previewFile && (
        <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      )}
    </div>
  );
}
