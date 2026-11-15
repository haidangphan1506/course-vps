"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { AuthState } from "@/app/login/actions";
import { useAppDispatch } from "@/store/hooks";
import { setUser } from "@/store/authSlice";

/** Khi action trả về user: lưu vào redux rồi chuyển về trang chủ. */
export function useAuthRedirect(state: AuthState) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  useEffect(() => {
    if (state?.user) {
      dispatch(setUser(state.user));
      router.replace("/");
    }
  }, [state, dispatch, router]);
}
