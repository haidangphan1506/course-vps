import { request } from "./request";

export const authService = {
  login: (email: string, password: string) =>
    request({ method: "post", url: "/auth/login", data: { email, password } }),
  register: (data: { email: string; password: string; firstName: string; lastName: string }) =>
    request({ method: "post", url: "/auth/register", data }),
};
