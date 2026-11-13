export type Block =
  | string
  | { pre: string[]; cap?: string }
  | { tbl: string[][] }
  | { ul: string[] }
  | { note: string; kind?: string };

export type TheoryCard = { tag: string; title: string; body: Block[] };

export type QuizItem = { q: string; ans: number; opts: string[]; why: string };

export type ShellRun = { out: string; code: number; clear?: boolean; needMore?: boolean };

export type Shell = {
  run(text: string): ShellRun;
  prompt(): string;
  complete(line: string): { word: string; matches: string[] } | null;
  cmdLog?: { t: string; out: string; code: number }[];
};

export type ShellSetup = (sh: unknown, ...rest: unknown[]) => void;

export type LabItem = { text: string; hint: string; check(sh: Shell): boolean };

export type Debug = {
  id: string;
  title: string;
  hard?: boolean;
  host: string;
  user: string;
  symptom: string[];
  story: string;
  goal: string;
  hints: string[];
  fix: string[];
  cause: string;
  setup?: ShellSetup;
  check(sh: Shell): boolean;
};

export type Lesson = {
  id: string;
  group: string;
  short: string;
  title: string;
  dek: string;
  theory: TheoryCard[];
  quiz: QuizItem[];
  lab: { host: string; user: string; setup?: ShellSetup; items: LabItem[] };
  debugs: Debug[];
};

export type ShellOptions = { host: string; user: string; setup?: ShellSetup };

export type Engine = {
  lessons: Lesson[];
  ip: string;
  createShell(opts: ShellOptions): Shell;
  equiv?(lesson: Lesson, sh: Shell, item: LabItem, budget: { t0: number; ms: number }): boolean;
};

export type CourseTab = "theory" | "quiz" | "lab" | "debug";
