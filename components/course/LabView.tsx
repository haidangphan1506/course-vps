"use client";

import { useMemo, useState } from "react";
import { useStore } from "react-redux";
import { gradeLab } from "@/lib/course/grade";
import { orderOf, shuffle } from "@/lib/course/progress";
import { dropShell, getShell } from "@/lib/course/sessions";
import type { Engine, Lesson } from "@/lib/course/types";
import type { RootState } from "@/store";
import { labPassed, resetLab, setLabSel, toggleLabSel } from "@/store/courseSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import Lab from "./Lab";
import ShellTerminal from "./ShellTerminal";

export default function LabView({ engine, lesson }: { engine: Engine; lesson: Lesson }) {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const p = useAppSelector((s) => s.course);
  const [nonce, setNonce] = useState(0);
  const [selDone, setSelDone] = useState(false);
  const lid = lesson.id;
  const key = `lab:${lid}`;

  const sh = useMemo(
    () => getShell(engine, key, { host: lesson.lab.host, user: lesson.lab.user, setup: lesson.lab.setup }),
    // nonce: tạo lại shell sau khi đặt lại
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, key, nonce],
  );

  const passed = p.labs[lid] ?? [];
  const sel = p.labSel[lid] ?? {};
  const rows = orderOf(p.labOrd[lid], lesson.lab.items.length).map((i) => ({
    index: i,
    text: lesson.lab.items[i].text,
    hint: lesson.lab.items[i].hint,
    done: !!passed[i],
    selected: !!sel[i] && !passed[i],
  }));

  const rebuild = () => {
    dropShell(key);
    setNonce((n) => n + 1);
  };

  const onRun = () => {
    const st = store.getState().course;
    const { newly, selDone: finished } = gradeLab(engine, lesson, sh, st.labs[lid] ?? [], st.labSel[lid] ?? {});
    if (newly.length || finished) {
      dispatch(labPassed({ lid, indices: newly, clearSel: finished }));
      if (finished) setSelDone(true);
    }
  };

  return (
    <Lab
      rows={rows}
      selectionFinished={selDone}
      onToggleSelect={(i) => dispatch(toggleLabSel({ lid, i }))}
      onSelectAll={() =>
        dispatch(
          setLabSel({
            lid,
            sel: Object.fromEntries(lesson.lab.items.flatMap((_, i) => (passed[i] ? [] : [[i, true]]))),
          }),
        )
      }
      onClearSelection={() => dispatch(setLabSel({ lid, sel: {} }))}
      onReset={() => {
        dispatch(resetLab({ lid, order: shuffle(lesson.lab.items.length) }));
        setSelDone(false);
        rebuild();
      }}
      terminal={
        <ShellTerminal
          key={nonce}
          engine={engine}
          shell={sh}
          persistKey={key}
          host={lesson.lab.host}
          user={lesson.lab.user}
          onRun={onRun}
          onReset={rebuild}
        />
      }
    />
  );
}
