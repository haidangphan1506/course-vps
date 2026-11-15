export const env = {
  apiUrl: process.env.API_URL,
  authUser: process.env.AUTH_USER,
  authPassword: process.env.AUTH_PASSWORD,
  isProd: process.env.NODE_ENV === "production",
};
