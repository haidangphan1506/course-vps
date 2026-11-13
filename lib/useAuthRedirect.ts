"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { AuthState } from "@/app/login/actions";
import { useAppDispatch } from "@/store/hooks";
import { setAuth } from "@/store/authSlice";

/** Khi action trả về user: lưu vào redux rồi chuyển về trang chủ. */
export function useAuthRedirect(state: AuthState) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  useEffect(() => {
    if (state?.user) {
      dispatch(setAuth({ user: state.user, tokens: state.tokens }));
      router.replace("/");
    }
  }, [state, dispatch, router]);
}
