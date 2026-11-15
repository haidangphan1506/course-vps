// Logic thuần của API Route Checklist: nhóm feature/module, case, đếm request, quy tắc Pass, flow UI → HTTP → RPC, xuất Fail.
// Không phụ thuộc React hay DOM để dễ test.

import type {
  CaseCounts,
  Catalog,
  Counts,
  Doc,
  Docs,
  Filters,
  Item,
  Part,
  Patch,
  ReqCounts,
  Row,
  Status,
  TestCase,
  View,
} from "./types";

export const STATUS: [Status, string][] = [
  ["todo", "Chưa test"],
  ["pass", "Pass"],
  ["fail", "Fail"],
  ["blocked", "Blocked"],
  ["skip", "Bỏ qua"],
];
export const S_LABEL = Object.fromEntries(STATUS) as Record<Status, string>;
export const SEVERITIES = ["Critical", "Major", "Minor"] as const;
export const SVC_LABEL: Record<string, string> = {
  gateway: "Gateway",
  user: "User",
  tutor: "Tutor",
  third: "Third",
  ui: "UI (thao tác)",
};
export const CK_LABEL = { http: "HTTP", rpc: "RPC" } as const;
export const CK_TIP = {
  http: "Request HTTP gọi trực tiếp vào service",
  rpc: "Message RabbitMQ do service khác gọi tới (RPC/EVENT)",
} as const;
export type CheckKey = keyof typeof CK_LABEL;

/* ---------- feature → module liên quan ---------- */

/** Feature → các module liên quan (theo domain nghiệp vụ). Mỗi module gồm: ① gateway HTTP, ② RPC/EVENT, ③ HTTP trực tiếp. */
export const FEATURES: { key: string; label: string; modules: string[] }[] = [
  { key: "auth", label: "Auth · xác thực & tài khoản", modules: ["auth", "user"] },
  { key: "admin", label: "Admin · quản trị gia sư, học sinh", modules: ["admin", "student"] },
  { key: "class", label: "Lớp học · buổi học, lịch, điểm danh", modules: ["class", "session", "schedule", "attendance"] },
  { key: "content", label: "Giáo trình & bài tập", modules: ["curriculum", "chapter", "lesson", "exercise", "courseprogress"] },
  { key: "finance", label: "Báo cáo & học phí", modules: ["report", "tuition", "dashboard"] },
  { key: "ai", label: "AI & chat", modules: ["ai", "agents", "chat"] },
  { key: "notify", label: "Thông báo & email", modules: ["notification", "email"] },
  {
    key: "system",
    label: "Hệ thống · upload, log, redis, health",
    modules: ["upload", "log", "redis", "kafka", "health", "app", "apiroutes", "testscenario"],
  },
];
export const FEAT_KEYS = [...FEATURES.map((f) => f.key), "other"];
export const FEAT_LABEL: Record<string, string> = {
  ...Object.fromEntries(FEATURES.map((f) => [f.key, f.label])),
  other: "Khác",
};
const featOf = (name: string) => {
  const n = name.toLowerCase();
  return FEATURES.find((f) => f.modules.includes(n))?.key ?? "other";
};

/** Thứ tự màn hình UI theo flow: đăng nhập → quản trị → nghiệp vụ → công cụ. */
const UI_FLOW = ["login", "register", "forgot-password", "reset-password", "(global)", "", "users", "tutors", "students", "classes", "curriculum", "sessions", "schedule", "grades", "fees", "reports", "notifications", "discussions", "ai-chat", "settings", "logger", "test-monitor"];

export function modRank(svc: string, name: string): number {
  if (svc === "all") {
    const i = FEATURES.flatMap((f) => f.modules).indexOf(name.toLowerCase());
    return i < 0 ? 999 : i;
  }
  const feat = FEATURES.find((f) => f.key === svc);
  if (feat) {
    const k = feat.modules.indexOf(name.toLowerCase());
    return k < 0 ? 999 : k;
  }
  const i = svc === "ui" ? UI_FLOW.indexOf(name.replace(/^\//, "").split("/")[0]) : -1;
  return i < 0 ? 999 : i;
}

/* ---------- model ---------- */

export type Model = {
  cat: Catalog;
  rows: Row[];
  byId: Map<string, Row>;
  /** `svc|pattern` → handler RPC/EVENT. */
  rpc: Map<string, Row>;
  /** `svc|pattern` → các route gateway gửi tới pattern đó. */
  gw: Map<string, Row[]>;
  /** gateway id → các thao tác UI gọi tới. */
  ui: Map<string, Row[]>;
  /** UI id → route gateway tương ứng. */
  uiGateway: Map<string, Row>;
};

const CHAIN_RE = /^(send|emit) ([\w.\-]+) → (\w+?)_queue(.*)$/;
export type Hop = { kind?: string; pattern?: string; svc?: string; raw: string };

export function parseChain(r: Item): Hop[] {
  return (r.chain ?? []).map((raw) => {
    const m = CHAIN_RE.exec(raw);
    return m ? { kind: m[1], pattern: m[2], svc: m[3], raw } : { raw };
  });
}

const normPath = (p: string) =>
  p
    .split("?")[0]
    .replace(/:\w+|\$\{[^}]*\}|\[\w+\]/g, "{}")
    .replace(/\/+$/, "");

/** Gán nhóm domain (auth, admin, student…) và dựng các bảng tra flow UI → HTTP → RPC. */
export function buildModel(cat: Catalog): Model {
  const owner = new Map<string, { svc: string; name: string }>();
  const rows: Row[] = cat.items.map((i) => ({ ...i, gown: i.svc, gnm: String(i.module || "").toLowerCase() }));

  for (const r of rows) {
    if (r.type === "RPC" || r.type === "EVENT") {
      r.gnm = r.path.split(".")[0];
      if (!owner.has(r.gnm.toLowerCase())) owner.set(r.gnm.toLowerCase(), { svc: r.svc, name: r.gnm });
    } else if (r.svc === "gateway" && r.type === "HTTP" && r.chain?.length) {
      const m = /^(?:send|emit) ([\w.\-]+) → (\w+?)_queue/.exec(r.chain[0]);
      if (m) {
        r.gnm = m[1].split(".")[0];
        r.gown = m[2];
      }
    }
  }
  // Route gateway tự xử lý (không qua queue) gộp vào domain cùng tên của service sở hữu (vd. auth).
  for (const r of rows) {
    if (r.svc === "gateway" && r.type === "HTTP" && r.gown === "gateway") {
      const o = owner.get(r.gnm);
      if (o) {
        r.gnm = o.name;
        r.gown = o.svc;
      }
    }
  }
  // Gộp khác biệt hoa/thường (courseProgress / courseprogress).
  const canon = new Map<string, string>();
  for (const r of rows) {
    if (r.svc === "ui") continue;
    const k = r.gnm.toLowerCase();
    const cur = canon.get(k);
    if (!cur || (/[A-Z]/.test(r.gnm) && !/[A-Z]/.test(cur))) canon.set(k, r.gnm);
  }
  for (const r of rows) if (r.svc !== "ui") r.gnm = canon.get(r.gnm.toLowerCase())!;

  const byId = new Map(rows.map((r) => [r.id, r]));
  const rpc = new Map<string, Row>();
  const gw = new Map<string, Row[]>();
  const gwp = new Map<string, Row>();
  const ui = new Map<string, Row[]>();
  const uiGateway = new Map<string, Row>();
  for (const r of rows) {
    if (r.type === "RPC" || r.type === "EVENT") rpc.set(`${r.svc}|${r.path}`, r);
    if (r.svc === "gateway" && r.type === "HTTP") {
      gwp.set(`${r.method} ${normPath(r.path)}`, r);
      for (const h of parseChain(r)) {
        if (!h.pattern) continue;
        const k = `${h.svc}|${h.pattern}`;
        gw.set(k, [...(gw.get(k) ?? []), r]);
      }
    }
  }
  for (const r of rows) {
    if (r.svc !== "ui") continue;
    const method = String(r.path || "").split(" ")[0];
    const g = gwp.get(`${method} ${normPath(String(r.path).slice(method.length + 1))}`);
    if (g) {
      uiGateway.set(r.id, g);
      ui.set(g.id, [...(ui.get(g.id) ?? []), r]);
    }
  }
  return { cat, rows, byId, rpc, gw, ui, uiGateway };
}

/* ---------- case ---------- */

const AUTH_OPEN = ["Public", "Nội bộ (RMQ)", "Mọi vai trò"];
const ROLE_RE = /ADMIN|TUTOR|STUDENT|PARENT/;

/** Case mẫu sinh từ metadata route khi route chưa có case đọc từ mã nguồn (đánh dấu "mẫu"). */
function genCases(r: Item): TestCase[] {
  if (!["HTTP", "RPC", "EVENT", "WS"].includes(r.type)) return [];
  const out: TestCase[] = [];
  let n = 1;
  const add = (id: string, t: string, i: string, e: string) => out.push({ id, t, i, e, gen: true });
  const E = (t: string, i: string, e: string) => add("E" + n++, t, i, e);
  const isRpc = r.type === "RPC" || r.type === "EVENT";
  if (r.type === "EVENT") add("S1", "Nhận và xử lý event", "publish " + r.path, `Handler ${r.handler || ""} xử lý xong, ack message, không ném lỗi`);
  else if (r.type === "WS") add("S1", "Kết nối hợp lệ", "handshake có token hợp lệ", "Kết nối thành công, nhận được sự kiện");
  else add("S1", "Gọi thành công", "dữ liệu hợp lệ" + (r.dto ? ` (${r.dto})` : ""), `Trả đúng kết quả của ${r.handler || r.path}`);
  const auth = r.auth || "";
  if (r.type === "WS") E("Không có token", "handshake không kèm token", "Từ chối kết nối");
  else if (r.type === "HTTP" && auth && !AUTH_OPEN.includes(auth)) E("Không có token", "không gửi Authorization", "401 Unauthorized");
  if (r.type === "HTTP" && ROLE_RE.test(auth)) E("Sai vai trò", "token thuộc vai trò không được phép", "403 Forbidden");
  if (r.dto && (r.type === "HTTP" || isRpc))
    E("Payload sai", "thiếu trường bắt buộc hoặc sai kiểu", r.type === "HTTP" ? "400 Bad Request (ValidationPipe)" : "Lỗi validation, không ghi dữ liệu");
  if (r.type === "HTTP" && r.path.includes(":")) E("Không tồn tại", "tham số id không có trong dữ liệu", "404 Not Found");
  return out;
}

const genCache = new WeakMap<Item, TestCase[]>();
export function casesOf(r: Item): TestCase[] {
  if (r.tc?.length) return r.tc;
  let c = genCache.get(r);
  if (!c) genCache.set(r, (c = genCases(r)));
  return c;
}

/* ---------- trạng thái ---------- */

export const appKeys = (r: Item): CheckKey[] =>
  r.svc === "gateway" || r.svc === "ui"
    ? []
    : r.type === "RPC" || r.type === "EVENT"
      ? r.http
        ? ["http", "rpc"]
        : ["rpc"]
      : r.type === "HTTP" && !r.pairedTo
        ? ["http"]
        : [];

const inScope = (r: Item) =>
  r.svc === "gateway"
    ? r.type === "HTTP"
    : r.svc === "ui"
      ? r.type === "UI"
      : r.type === "RPC" || r.type === "EVENT" || (r.type === "HTTP" && !r.pairedTo);

export const inPart = (part: Part, r: Item) => (part === "ui" ? r.svc === "ui" : r.svc !== "ui");

export function scopedFor(m: Model, part: Part, f: Pick<Filters, "dev" | "extra">): Row[] {
  return m.rows.filter((r) => inPart(part, r) && (f.dev || !r.dev) && (f.extra ? inScope(r) || r.type === "WS" : inScope(r)));
}

export const active = <T extends Item>(rows: T[]) => rows.filter((r) => !r.removed);
export const tcOf = (docs: Docs, r: Item) => docs[r.id]?.tcs ?? {};
/** Số case con chưa Pass của một request. Request chỉ được Pass khi = 0. */
export const casesLeft = (docs: Docs, r: Item) => {
  const t = tcOf(docs, r);
  return casesOf(r).filter((c) => t[c.id] !== "pass").length;
};
export const stOf = (docs: Docs, r: Item): Status => {
  const s = docs[r.id]?.status ?? "todo";
  return s === "pass" && casesLeft(docs, r) ? "todo" : s;
};
export const isChanged = (docs: Docs, r: Item) => !!r.changedIn && !r.removed && docs[r.id]?.ackChange !== r.changedIn;
export const needsVerify = (r: Item) => (r.flags ?? []).some((f) => f.startsWith("cần xác minh"));

export function counts(docs: Docs, rows: Item[]): Counts {
  const s: Counts = { pass: 0, fail: 0, blocked: 0, skip: 0, todo: 0, total: 0 };
  for (const r of active(rows)) {
    s[stOf(docs, r)]++;
    s.total++;
  }
  return s;
}

/** Đếm theo request: route service có cặp HTTP+RPC tính 2 request, các mục khác 1. Pass cần mọi case con Pass. */
export function reqCounts(docs: Docs, rows: Item[]): ReqCounts {
  const o: ReqCounts = { pass: 0, total: 0, http: [0, 0], rpc: [0, 0] };
  for (const r of active(rows)) {
    const ks = appKeys(r);
    const ck = docs[r.id]?.checks ?? {};
    const st = stOf(docs, r);
    if (!ks.length) {
      o.total++;
      if (st === "pass") o.pass++;
      continue;
    }
    for (const k of ks) {
      const ok = (st === "pass" || !!ck[k]) && !casesLeft(docs, r);
      o.total++;
      o[k][1]++;
      if (ok) {
        o.pass++;
        o[k][0]++;
      }
    }
  }
  return o;
}

/** Đếm case con: HTTP (route HTTP) và RPC (RPC/EVENT). */
export function caseCounts(docs: Docs, rows: Item[]): CaseCounts {
  const o: CaseCounts = { pass: 0, total: 0, http: [0, 0], rpc: [0, 0] };
  for (const r of active(rows)) {
    const k = r.type === "RPC" || r.type === "EVENT" ? "rpc" : r.type === "HTTP" ? "http" : null;
    const t = tcOf(docs, r);
    for (const c of casesOf(r)) {
      const ok = t[c.id] === "pass";
      o.total++;
      if (ok) o.pass++;
      if (k) {
        o[k][1]++;
        if (ok) o[k][0]++;
      }
    }
  }
  return o;
}

const part = (a: [number, number], l: string) => (a[1] ? ` · ${l} ${a[0]}/${a[1]}` : "");
/** Dòng đếm request + case (HTTP/RPC) dùng cho thẻ module và tiêu đề nhóm. */
export function cntText(docs: Docs, rows: Item[]): string {
  const q = reqCounts(docs, rows);
  const c = caseCounts(docs, rows);
  return `Request ${q.pass}/${q.total}${part(q.http, "HTTP")}${part(q.rpc, "RPC")} · Case ${c.pass}/${c.total}${part(c.http, "HTTP")}${part(c.rpc, "RPC")}`;
}

export type ModStatus = "skip" | "fail" | "pass" | "blocked" | "doing" | "todo";
const MOD_LABEL: Record<ModStatus, string> = { skip: "Bỏ qua", fail: "Fail", pass: "Pass", blocked: "Blocked", doing: "Đang test", todo: "Chưa test" };
/** Module chỉ Pass khi mọi request trong module Pass. */
export function modStatus(docs: Docs, rows: Item[]): [ModStatus, string] {
  const s = active(rows).filter((r) => stOf(docs, r) !== "skip").map((r) => stOf(docs, r));
  const st: ModStatus = !s.length
    ? "skip"
    : s.includes("fail")
      ? "fail"
      : s.every((x) => x === "pass")
        ? "pass"
        : s.includes("blocked")
          ? "blocked"
          : s.some((x) => x !== "todo")
            ? "doing"
            : "todo";
  return [st, MOD_LABEL[st]];
}

export const pct = (s: Counts) => {
  const d = s.total - s.skip;
  return d > 0 ? Math.round((s.pass / d) * 100) : null;
};

/* ---------- nhóm & lọc ---------- */

export const mpOf = (r: Item) => (r.type === "RPC" || r.type === "EVENT" ? r.path : r.method);
export const pathOf = (r: Item) => (r.type === "RPC" || r.type === "EVENT" ? r.q || "" : r.type === "UI" ? r.title || "" : r.path);

/** Chế độ nhóm: feature → module → request. Chế độ module: một nhóm duy nhất (svc "all") → module (gộp các repo). */
export const gOf = (r: Row, view: View) =>
  view === "grp" ? { svc: r.svc === "ui" ? "ui" : featOf(r.gnm), name: r.gnm } : { svc: "all", name: r.gnm };
export const groupKey = (svc: string, name: string) => `${svc}|${name}`;
export const svcRank = (m: Model, s: string) => {
  const i = FEAT_KEYS.indexOf(s);
  return i >= 0 ? i : 100 + m.cat.order.indexOf(s);
};

export function visible(m: Model, docs: Docs, f: Filters): Row[] {
  const q = f.q.toLowerCase();
  return scopedFor(m, f.part, f).filter((r) => {
    const g = gOf(r, f.view);
    if (f.svc && r.svc !== f.svc) return false;
    if (f.mod && groupKey(g.svc, g.name) !== f.mod) return false;
    if (f.type && r.type !== f.type) return false;
    const s = stOf(docs, r);
    switch (f.status) {
      case "":
        break;
      case "open":
        if (r.removed || s === "pass" || s === "skip") return false;
        break;
      case "todo":
      case "pass":
      case "fail":
      case "blocked":
      case "skip":
        if (r.removed || s !== f.status) return false;
        break;
      case "new":
        if (!r.isNew || r.removed) return false;
        break;
      case "chg":
        if (!isChanged(docs, r)) return false;
        break;
      case "gone":
        if (!r.removed) return false;
        break;
      case "vf":
        if (!needsVerify(r)) return false;
        break;
    }
    if (q && ![r.path, r.title, r.method, r.handler, r.file, r.module, r.q, r.summary, r.pattern, docs[r.id]?.note].join(" ").toLowerCase().includes(q)) return false;
    return true;
  });
}

export type ModuleGroup = { key: string; svc: string; name: string; rows: Row[] };
/** Gom các request đang hiển thị theo nhóm cha (feature/service) → module. */
export function groupRows(rows: Row[], view: View): Map<string, Map<string, Row[]>> {
  const by = new Map<string, Map<string, Row[]>>();
  for (const r of rows) {
    const g = gOf(r, view);
    if (!by.has(g.svc)) by.set(g.svc, new Map());
    const mm = by.get(g.svc)!;
    mm.set(g.name, [...(mm.get(g.name) ?? []), r]);
  }
  return by;
}

/** Danh sách module (cho thẻ module và ô chọn module) theo thứ tự flow. */
export function allMods(m: Model, docs: Docs, rows: Row[], view: View): (ModuleGroup & { st: ModStatus; stl: string })[] {
  const map = new Map<string, ModuleGroup>();
  for (const r of rows) {
    const g = gOf(r, view);
    const key = groupKey(g.svc, g.name);
    if (!map.has(key)) map.set(key, { key, svc: g.svc, name: g.name, rows: [] });
    map.get(key)!.rows.push(r);
  }
  return [...map.values()]
    .map((x) => {
      const [st, stl] = modStatus(docs, x.rows);
      return { ...x, st, stl };
    })
    .sort((a, b) => svcRank(m, a.svc) - svcRank(m, b.svc) || modRank(a.svc, a.name) - modRank(b.svc, b.name) || a.name.localeCompare(b.name));
}

/** Bước trong module: ① gateway HTTP, ② RPC/EVENT, ③ HTTP trực tiếp/WS. */
export const stepOf = (r: Item) => (r.svc === "gateway" && r.type === "HTTP" ? 0 : r.type === "RPC" || r.type === "EVENT" ? 1 : 2);

/* ---------- ghi kết quả ---------- */

const now = () => new Date().toISOString();
export const newId = () => "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Tạo doc mới từ doc hiện tại + patch. Ghi lịch sử mỗi lần đổi trạng thái hoặc tick (giữ 50 mục gần nhất). */
export function buildDoc(docs: Docs, it: Row, patch: Patch, me: string | null): Doc {
  const b: Doc = docs[it.id] ?? { key: it.key, status: "todo", checks: {}, tcs: {}, cases: [], note: "", noteAt: null, testedAt: null, testerId: null, ackChange: null, history: [] };
  const t = now();
  const d: Doc = {
    key: it.key,
    status: b.status || "todo",
    checks: b.checks ?? {},
    tcs: b.tcs ?? {},
    cases: b.cases ?? [],
    note: b.note ?? "",
    noteAt: b.noteAt ?? null,
    testedAt: b.testedAt ?? null,
    testerId: b.testerId ?? null,
    ackChange: b.ackChange ?? null,
    history: [],
  };
  if (patch.status) d.status = patch.status;
  if (patch.checks) d.checks = patch.checks;
  if (patch.tcs) d.tcs = patch.tcs;
  if (patch.cases) d.cases = patch.cases;
  if (patch.note !== undefined) {
    d.note = patch.note;
    d.noteAt = t;
  }
  if (patch.ackChange !== undefined) d.ackChange = patch.ackChange;
  if (patch.status && patch.status !== b.status) {
    d.testedAt = patch.status === "todo" ? null : t;
    d.testerId = patch.status === "todo" ? null : me;
  }
  if (patch.status && it.changedIn) d.ackChange = it.changedIn;
  if (patch.status === "pass" && !patch.checks) d.checks = Object.fromEntries(appKeys(it).map((k) => [k, true]));
  if (patch.status === "todo" && !patch.checks) d.checks = {};
  const hist = (b.history ?? []).slice();
  if ((patch.status && patch.status !== b.status) || (patch.checks && JSON.stringify(d.checks) !== JSON.stringify(b.checks ?? {}))) {
    hist.push({ at: t, by: me, status: d.status, checks: { ...d.checks } });
  }
  d.history = hist.slice(-50);
  return d;
}

/** Patch khi tick HTTP/RPC: tick đủ + mọi case Pass thì tự Pass; bỏ tick thì rút Pass về Chưa test. */
export function checkPatch(docs: Docs, it: Row, k: CheckKey, val: boolean): Patch {
  const checks = { ...(docs[it.id]?.checks ?? {}), [k]: val };
  const keys = appKeys(it);
  const all = keys.length > 0 && keys.every((x) => checks[x]) && !casesLeft(docs, it);
  const st = stOf(docs, it);
  const patch: Patch = { checks };
  if (all && st !== "skip") patch.status = "pass";
  else if (!val && st === "pass") patch.status = "todo";
  return patch;
}

/** Patch khi tick Pass/Fail một case: mọi case Pass (và đủ tick HTTP/RPC) thì request tự Pass; ngược lại rút về Chưa test. */
export function casePatch(docs: Docs, it: Row, caseId: string, val: "pass" | "fail"): Patch {
  const t = { ...tcOf(docs, it) };
  if (t[caseId] === val) delete t[caseId];
  else t[caseId] = val;
  const left = casesOf(it).filter((c) => t[c.id] !== "pass").length;
  const st = stOf(docs, it);
  const ck = docs[it.id]?.checks ?? {};
  const patch: Patch = { tcs: t };
  if (!left && appKeys(it).every((k) => ck[k]) && (st === "todo" || st === "blocked")) {
    patch.status = "pass";
    patch.checks = ck;
  } else if (left && st === "pass") {
    patch.status = "todo";
    patch.checks = ck;
  }
  return patch;
}

/* ---------- xuất danh sách Fail ---------- */

export function failList(m: Model, docs: Docs, f: Pick<Filters, "part" | "dev" | "extra">): [Row, Doc][] {
  return scopedFor(m, f.part, f)
    .filter((r) => !r.removed && stOf(docs, r) === "fail")
    .map((r): [Row, Doc] => [r, docs[r.id]])
    .sort((a, b) => a[0].svc.localeCompare(b[0].svc) || a[0].module.localeCompare(b[0].module) || String(a[0].path).localeCompare(String(b[0].path)));
}

const csvCell = (v: unknown) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
};
const p2 = (n: number) => String(n).padStart(2, "0");
export const fmtD = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(+d) ? "" : `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
};
export const fmtDT = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(+d) ? "" : `${fmtD(iso)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

export function buildExport(list: [Row, Doc][], fmt: "md" | "csv", who: (d: Doc) => string): string {
  const where = (r: Row) => (r.line ? `${r.file}:${r.line}` : r.file);
  if (fmt === "csv") {
    const head = ["Service", "Module", "Type", "Method/Pattern", "Path/Routing key", "Handler", "File:line", "Mức độ", "Case (input/payload)", "Mong đợi", "Thực tế", "Người test", "Ngày test", "Ghi chú"];
    const rows: unknown[][] = [head];
    for (const [r, d] of list)
      for (const c of d.cases ?? [])
        rows.push([r.svc, r.module, r.type, mpOf(r), pathOf(r), r.handler, where(r), c.severity, c.input, c.expected, c.actual, who(d), fmtD(d.testedAt), d.note]);
    return "﻿" + rows.map((x) => x.map(csvCell).join(",")).join("\r\n");
  }
  const one = (s: string) => s.replace(/\n/g, " ");
  const L = [`# Danh sách Fail — ${fmtD(now())}`, "", `Tổng ${list.length} item fail, ${list.reduce((n, [, d]) => n + (d.cases ?? []).length, 0)} case.`, ""];
  let ps = "";
  let pm = "";
  for (const [r, d] of list) {
    if (r.svc !== ps) {
      L.push("## " + (SVC_LABEL[r.svc] ?? r.svc), "");
      ps = r.svc;
      pm = "";
    }
    if (r.module !== pm) {
      L.push("### " + r.module, "");
      pm = r.module;
    }
    L.push(`#### [${r.type}] ${mpOf(r)} ${r.type === "RPC" || r.type === "EVENT" ? `(${r.q})` : r.type === "UI" ? r.title : r.path}`);
    L.push(`- Handler: \`${r.handler}\`${r.line ? " — " + where(r) : ""}`);
    L.push(`- Người test: ${who(d) || "—"}${d.testedAt ? " · " + fmtD(d.testedAt) : ""}`);
    if (d.note) L.push(`- Ghi chú: ${one(d.note)}`);
    (d.cases ?? []).forEach((c, i) => {
      L.push(`- Case ${i + 1} [${c.severity}]`, `  - Input: \`${one(c.input).replace(/`/g, "'")}\``, `  - Mong đợi: ${one(c.expected)}`, `  - Thực tế: ${one(c.actual)}`);
    });
    L.push("");
  }
  if (!list.length) L.push("Không có item nào đang Fail.");
  return L.join("\n");
}
