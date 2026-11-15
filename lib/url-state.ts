/** Đọc/ghi trạng thái điều hướng trên query string để reload lại đúng chỗ đang xem. */

export function getParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

/** Cập nhật các param (null/"" = xoá), giữ nguyên param và hash khác; dùng replace nên không làm đầy history. */
export function setParams(patch: Record<string, string | null | undefined>) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(patch)) {
    if (v) url.searchParams.set(k, v);
    else url.searchParams.delete(k);
  }
  const next = url.pathname + url.search + url.hash;
  if (next !== window.location.pathname + window.location.search + window.location.hash) {
    window.history.replaceState(null, "", next);
  }
}
