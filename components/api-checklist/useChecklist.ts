"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCatalog, fetchResults, loadLocalDocs, putResult, saveLocalDocs } from "@/lib/api-checklist/client";
import {
  buildDoc,
  buildModel,
  casePatch,
  casesLeft,
  casesOf,
  checkPatch,
  newId,
  pathOf,
  SEVERITIES,
  type Model,
} from "@/lib/api-checklist/model";
import type { Catalog, Docs, FailCase, Patch, Row, Severity, Status } from "@/lib/api-checklist/types";

export type CaseDraft = {
  mode: "fail" | "add" | "edit";
  caseId: string | null;
  f: { input: string; expected: string; actual: string; severity: "" | Severity };
  bad: boolean;
};

const MAX_CASES = 30;

/** State + thao tác ghi kết quả của checklist. Lưu qua gateway; không có phiên API thì lưu cục bộ trên trình duyệt. */
export function useChecklist() {
  const [model, setModel] = useState<Model | null>(null);
  const [docs, setDocs] = useState<Docs>({});
  const [mode, setMode] = useState<"loading" | "api" | "local">("loading");
  const [notice, setNotice] = useState("");
  const [drafts, setDrafts] = useState<Record<string, CaseDraft>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const docsRef = useRef<Docs>({});
  const modeRef = useRef(mode);

  const commit = useCallback((next: Docs) => {
    docsRef.current = next;
    setDocs(next);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const cat = (await fetchCatalog()) ?? ((await import("@/lib/api-checklist/catalog.json")).default as unknown as Catalog);
      const saved = await fetchResults();
      if (!alive) return;
      setModel(buildModel(cat));
      if (saved) {
        modeRef.current = "api";
        setMode("api");
        commit(saved);
      } else {
        modeRef.current = "local";
        setMode("local");
        commit(loadLocalDocs());
        setNotice("Chưa có phiên API: kết quả tick đang lưu cục bộ trên trình duyệt này (không đồng bộ sang máy khác). Đăng nhập bằng tài khoản hệ thống để đồng bộ.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [commit]);

  const save = useCallback(
    async (it: Row, patch: Patch): Promise<boolean> => {
      const prev = docsRef.current[it.id];
      const d = buildDoc(docsRef.current, it, patch, null);
      commit({ ...docsRef.current, [it.id]: d });
      if (modeRef.current === "local") {
        saveLocalDocs(docsRef.current);
        return true;
      }
      try {
        await putResult(it.id, d);
        return true;
      } catch (e) {
        const next = { ...docsRef.current };
        if (prev) next[it.id] = prev;
        else delete next[it.id];
        commit(next);
        setNotice(`Không lưu được: ${e instanceof Error ? e.message : "lỗi không rõ"}. Thử lại sau.`);
        return false;
      }
    },
    [commit],
  );

  const expand = useCallback((id: string, on?: boolean) => {
    setExpanded((s) => {
      const n = new Set(s);
      if (on === undefined ? !n.has(id) : on) n.add(id);
      else n.delete(id);
      return n;
    });
  }, []);
  const setDraft = useCallback((id: string, d: CaseDraft | null) => {
    setDrafts((s) => {
      const n = { ...s };
      if (d) n[id] = d;
      else delete n[id];
      return n;
    });
  }, []);

  const setCheck = (it: Row, k: "http" | "rpc", val: boolean) => save(it, checkPatch(docsRef.current, it, k, val));

  /** Tick Pass/Fail một case. Chọn Fail thì mở form ghi case lỗi với input/mong đợi điền sẵn. */
  const setCase = async (it: Row, caseId: string, val: "pass" | "fail") => {
    const toggledOff = docsRef.current[it.id]?.tcs?.[caseId] === val;
    await save(it, casePatch(docsRef.current, it, caseId, val));
    if (val === "fail" && !toggledOff) {
      const c = casesOf(it).find((x) => x.id === caseId);
      const d = docsRef.current[it.id];
      expand(it.id, true);
      setDraft(it.id, {
        mode: d?.status === "fail" && d.cases.length ? "add" : "fail",
        caseId: null,
        f: { input: c?.i ?? "", expected: c?.e ?? "", actual: "", severity: "" },
        bad: false,
      });
    }
  };

  /** Đổi trạng thái request. Pass bị chặn khi còn case chưa Pass; Fail cần ghi ít nhất 1 case lỗi. */
  const setStatus = (it: Row, v: Status) => {
    if (v === "pass" && casesLeft(docsRef.current, it)) {
      setNotice(`Chưa thể Pass "${pathOf(it)}": còn ${casesLeft(docsRef.current, it)}/${casesOf(it).length} case chưa Pass. Mở dòng và tick Pass từng case.`);
      expand(it.id, true);
      return;
    }
    if (v === "pass") setNotice("");
    if (v === "fail" && !docsRef.current[it.id]?.cases?.length) {
      expand(it.id, true);
      setDraft(it.id, { mode: "fail", caseId: null, f: { input: "", expected: "", actual: "", severity: "" }, bad: false });
      return;
    }
    return save(it, { status: v });
  };

  const submitCase = async (it: Row, dr: CaseDraft) => {
    const f = dr.f;
    if (!f.input.trim() || !f.expected.trim() || !f.actual.trim() || !SEVERITIES.includes(f.severity as Severity)) {
      setDraft(it.id, { ...dr, bad: true });
      return;
    }
    const d = docsRef.current[it.id];
    const t = new Date().toISOString();
    let cases: FailCase[] = (d?.cases ?? []).slice();
    const c: FailCase = { id: dr.caseId ?? newId(), input: f.input.trim(), expected: f.expected.trim(), actual: f.actual.trim(), severity: f.severity as Severity, at: t };
    if (dr.caseId) cases = cases.map((x) => (x.id === dr.caseId ? { ...x, ...c, at: x.at, editedAt: t } : x));
    else cases.push(c);
    if (cases.length > MAX_CASES) {
      setNotice(`Tối đa ${MAX_CASES} case cho một item.`);
      return;
    }
    setDraft(it.id, null);
    await save(it, { cases, status: dr.mode === "fail" ? "fail" : d?.status || "fail" });
  };

  const deleteCase = (it: Row, caseId: string) => {
    const d = docsRef.current[it.id];
    if (!d) return;
    if (d.status === "fail" && d.cases.length <= 1) {
      setNotice("Item đang Fail phải có ít nhất 1 case. Đổi trạng thái nếu muốn gỡ.");
      return;
    }
    return save(it, { cases: d.cases.filter((x) => x.id !== caseId) });
  };

  /** Đặt hàng loạt. Pass chỉ áp dụng cho request đã Pass hết case con. */
  const bulkSet = async (items: Row[], status: Status) => {
    const ok = status === "pass" ? items.filter((it) => !casesLeft(docsRef.current, it)) : items;
    const skipped = items.length - ok.length;
    if (ok.length) setNotice(`Đang lưu ${ok.length} mục…`);
    await Promise.all(ok.map((it) => save(it, { status })));
    setNotice(skipped ? `${skipped} mục còn case chưa Pass nên không được đặt Pass.` : "");
  };

  return {
    model,
    docs,
    mode,
    notice,
    setNotice,
    drafts,
    setDraft,
    expanded,
    expand,
    save,
    setCheck,
    setCase,
    setStatus,
    submitCase,
    deleteCase,
    bulkSet,
  };
}

export type Checklist = ReturnType<typeof useChecklist>;
