import axios from "axios";
import { env } from "@/lib/env";

export const http = axios.create({
  baseURL: env.apiUrl,
  timeout: 10_000,
  headers: { "Content-Type": "application/json" },
});

// Chỗ gắn interceptor dùng chung (token, logging, ...).
http.interceptors.request.use((config) => config);
http.interceptors.response.use(
  (res) => res,
  (error) => Promise.reject(error),
);
