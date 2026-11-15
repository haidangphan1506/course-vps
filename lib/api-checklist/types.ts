// Kiểu dữ liệu của trang API Route Checklist (danh mục route + kết quả test).

export type ItemType = "HTTP" | "RPC" | "EVENT" | "WS" | "UI";
export type Status = "todo" | "pass" | "fail" | "blocked" | "skip";
export type CaseResult = "pass" | "fail";
export type Severity = "Critical" | "Major" | "Minor";
export type Part = "api" | "ui";
/** grp: feature › module › request · mod: module (gộp các repo) › request. */
export type View = "grp" | "mod";

/** Case cần kiểm tra của một request (đọc từ mã nguồn hoặc sinh mẫu từ metadata route). */
export type TestCase = { id: string; t: string; i?: string; e: string; gen?: boolean };

/** Một route/handler/thao tác UI trong danh mục quét từ mã nguồn. */
export type Item = {
  id: string;
  key: string;
  svc: string;
  type: ItemType;
  method: string;
  path: string;
  title?: string;
  summary?: string;
  module: string;
  handler: string;
  file: string;
  line?: number;
  auth?: string;
  dto?: string;
  pattern?: string;
  q?: string;
  chain?: string[];
  http?: string;
  pairedTo?: string;
  callers?: string[];
  flags?: string[];
  dev?: boolean;
  isNew?: boolean;
  removed?: string;
  changedIn?: string;
  tc?: TestCase[];
};

export type Catalog = {
  scanId: string;
  scannedAt: string;
  commits: Record<string, string>;
  branches: Record<string, string>;
  services: Record<string, { queue: string | null; modules?: number; dev?: string[] }>;
  sends: [string, string, string | null, string | null, string, number][];
  order: string[];
  items: Item[];
};

/** Item đã gán nhóm: gnm = tên module theo domain, gown = service sở hữu domain. */
export type Row = Item & { gnm: string; gown: string };

export type FailCase = {
  id: string;
  input: string;
  expected: string;
  actual: string;
  severity: Severity;
  at: string;
  editedAt?: string;
};

export type HistoryEntry = { at: string; by: string | null; status: Status; checks: Record<string, boolean> };

/** Kết quả test của một item (lưu ở `doc` của gateway). */
export type Doc = {
  key: string;
  status: Status;
  checks: Record<string, boolean>;
  tcs: Record<string, CaseResult>;
  cases: FailCase[];
  note: string;
  noteAt: string | null;
  testedAt: string | null;
  testerId: string | null;
  ackChange: string | null;
  history: HistoryEntry[];
};

export type Docs = Record<string, Doc>;

/** Phần thay đổi khi lưu một item. */
export type Patch = Partial<Pick<Doc, "status" | "checks" | "tcs" | "cases" | "note" | "ackChange">>;

export type Counts = { pass: number; fail: number; blocked: number; skip: number; todo: number; total: number };
export type ReqCounts = { pass: number; total: number; http: [number, number]; rpc: [number, number] };
export type CaseCounts = ReqCounts;

export type Filters = {
  part: Part;
  view: View;
  svc: string;
  mod: string;
  type: string;
  status: string;
  q: string;
  dev: boolean;
  extra: boolean;
  mstat: string;
};
