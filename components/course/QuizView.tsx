"use client";

import { useStore } from "react-redux";
import { orderOf, shuffle } from "@/lib/course/progress";
import type { Lesson } from "@/lib/course/types";
import { answerQuiz, resetQuiz, retryWrong, toggleFlag } from "@/store/courseSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import type { RootState } from "@/store";
import Quiz, { type QuizFilter } from "./Quiz";

type Props = { lesson: Lesson; filter: QuizFilter; onFilter: (f: QuizFilter) => void };

export default function QuizView({ lesson, filter, onFilter }: Props) {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const p = useAppSelector((s) => s.course);
  const lid = lesson.id;
  const key = lesson.quiz.map((q) => q.ans);

  return (
    <Quiz
      questions={lesson.quiz}
      order={orderOf(p.qord[lid], lesson.quiz.length)}
      answers={p.quiz[lid] ?? {}}
      wrong={p.wrong[lid]}
      flags={p.flag[lid]}
      filter={filter}
      onFilter={onFilter}
      onAnswer={(qi, oi) => dispatch(answerQuiz({ lid, qi, oi, key, t: Date.now() }))}
      onToggleFlag={(qi) => dispatch(toggleFlag({ lid, qi }))}
      onReset={() => dispatch(resetQuiz({ lid, order: shuffle(lesson.quiz.length) }))}
      onRetryWrong={() => {
        if (store.getState().course.quiz[lid]) dispatch(retryWrong({ lid, key }));
      }}
    />
  );
}
