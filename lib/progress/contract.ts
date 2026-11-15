// Kiểu dữ liệu tiến độ khoá học dùng chung giữa UI và service. Validate và lưu DB nằm ở gateway/tutor-service.

export type HistEntry = { l: string; s: number; n: number; t: number };

/** Kết quả học tập gửi lên gateway (không gồm trạng thái UI như tab, thứ tự câu hỏi). */
export type ProgressSnapshot = {
  labs: Record<string, boolean[]>;
  quiz: Record<string, Record<number, number>>;
  debugs: Record<string, boolean>;
  hist: HistEntry[];
  wrong: Record<string, Record<number, number>>;
  flag: Record<string, Record<number, boolean>>;
  /** debugId → lessonId (module) chứa bài debug đó. */
  debugModule: Record<string, string>;
};

export type ModuleResult = {
  lessonId: string;
  quizAttempts: number;
  quizBest: { score: number; total: number } | null;
  quizLastAt: number | null;
  wrongTotal: number;
  flagged: number;
  labsPassed: number;
  labsTotal: number;
  debugsSolved: number;
};

export type TestRow = {
  moduleId: string;
  kind: "quiz" | "lab" | "debug";
  itemKey: string;
  score: number | null;
  total: number | null;
  passed: boolean;
  at: number;
};

export type ResultsSummary = {
  modules: ModuleResult[];
  tests: TestRow[];
  syncedAt: number | null;
};

/** Một dòng kết quả check route trên tab API Route Checklist. */
export type ApiRouteResultsDto = {
  routeId: string;
  status: string;
  doc: Record<string, unknown>;
  updatedBy: string | null;
  updatedAt: string;
};

/** Danh mục route của trang checklist: meta của lần quét + danh sách item. */
export type ApiCatalogDto = {
  scanId: string;
  scannedAt: string;
  commits: Record<string, string>;
  branches: Record<string, string>;
  services: Record<string, unknown>;
  sends: unknown[];
  order: string[];
  items: Record<string, unknown>[];
};
