import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

type AuthState = { user: string | null };

const authSlice = createSlice({
  name: "auth",
  initialState: { user: null } as AuthState,
  reducers: {
    setUser: (state, action: PayloadAction<string>) => {
      state.user = action.payload;
    },
    clearUser: (state) => {
      state.user = null;
    },
  },
});

export const { setUser, clearUser } = authSlice.actions;
export default authSlice.reducer;
