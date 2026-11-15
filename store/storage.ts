import createWebStorage from "redux-persist/lib/storage/createWebStorage";

const noopStorage = {
  getItem: async () => null,
  setItem: async (_k: string, v: string) => v,
  removeItem: async () => {},
};

// Trên server không có localStorage nên dùng storage rỗng.
export const storage = typeof window === "undefined" ? noopStorage : createWebStorage("local");
