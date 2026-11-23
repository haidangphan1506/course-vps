import type { Block, Lesson } from "@/lib/course/types";

/** Một bài học được trình bày thành chuỗi bước: các thẻ lý thuyết, rồi Quiz, Thực hành, Fix lỗi. */
export type StepKind = "theory" | "quiz" | "lab" | "debug";
export type Step = { kind: StepKind; card: number; label: string; title: string };

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Bỏ ký hiệu markdown rút gọn (`code`, **đậm**) để hiển thị dạng chữ thường. */
export const plain = (s: string) => s.replace(/[`*]/g, "");

/** Chuỗi để so khớp tìm kiếm: chữ thường, bỏ dấu tiếng Việt. */
export const fold = (s: string) =>
  plain(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();

export function lessonSteps(l: Lesson): Step[] {
  const steps: Step[] = l.theory.map((c, i) => {
    const title = plain(c.title);
    // "ls: xem nội dung thư mục" → "ls"; tiêu đề dài thì cắt gọn cho timeline.
    const head = title.split(/[:—(]/)[0].trim() || title;
    return { kind: "theory", card: i, label: cut(head, 18), title };
  });
  if (l.quiz.length) steps.push({ kind: "quiz", card: -1, label: "Quiz", title: "Kiểm tra nhanh" });
  if (l.lab.items.length) steps.push({ kind: "lab", card: -1, label: "Thực hành", title: "Thực hành trên VPS giả lập" });
  if (l.debugs.length) steps.push({ kind: "debug", card: -1, label: "Fix lỗi", title: "Tìm và sửa sự cố" });
  return steps;
}

export type NoteBlock = Extract<Block, { note: string }>;

/**
 * Tách thẻ lý thuyết thành: đoạn mở đầu (hiện ở panel bên phải), ý chính (ghi chú đầu tiên)
 * và phần còn lại (hiện ở khung giữa).
 */
export function splitCard(body: readonly Block[]) {
  const lead = typeof body[0] === "string" ? body[0] : null;
  const keyAt = body.findIndex((b) => typeof b === "object" && "note" in b);
  const key = keyAt >= 0 ? (body[keyAt] as NoteBlock) : null;
  const rest = body.filter((_, i) => !(i === 0 && lead !== null) && i !== keyAt);
  return { lead, key, rest };
}

/** Ước lượng thời gian học (phút): đọc thẻ, trả lời quiz, làm lab, sửa lỗi. */
export const estimateMinutes = (l: Lesson) =>
  Math.max(5, Math.round((l.theory.length * 3 + l.quiz.length + l.lab.items.length * 1.5 + l.debugs.length * 5) / 5) * 5);

/** Màu thư mục cho từng nhóm bài (theo thứ tự xuất hiện). */
export const GROUP_COLORS = ["#d9b98f", "#7fc278", "#9b7fd1", "#e08a4f", "#4f8fd6", "#2a9d8f", "#d9576b", "#9aa64a", "#6b7a8f"];

export type Group = { name: string; color: string; num: string; lessons: Lesson[] };

export function groupLessons(lessons: readonly Lesson[]): Group[] {
  const out: Group[] = [];
  const by = new Map<string, Group>();
  for (const l of lessons) {
    let g = by.get(l.group);
    if (!g) {
      const i = out.length;
      g = { name: l.group, color: GROUP_COLORS[i % GROUP_COLORS.length], num: String(i + 1).padStart(2, "0"), lessons: [] };
      by.set(l.group, g);
      out.push(g);
    }
    g.lessons.push(l);
  }
  return out;
}
