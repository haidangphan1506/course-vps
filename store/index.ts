import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { FLUSH, PAUSE, PERSIST, persistReducer, persistStore, PURGE, REGISTER, REHYDRATE } from "redux-persist";
import auth from "./authSlice";
import course from "./courseSlice";
import { storage } from "./storage";

const rootReducer = combineReducers({ auth, course });

const persisted = persistReducer({ key: "root", storage, whitelist: ["auth", "course"] }, rootReducer);

// Các middleware kiểm tra (chỉ có ở dev) gọi Date.now(), Next không cho phép khi prerender ở server.
const onServer = typeof window === "undefined";

export const makeStore = () =>
  configureStore({
    reducer: persisted,
    middleware: (getDefault) =>
      getDefault({
        immutableCheck: !onServer,
        serializableCheck: onServer
          ? false
          : { ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER] },
      }),
  });

export const makePersistor = (store: AppStore) => persistStore(store);

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = AppStore["dispatch"];
