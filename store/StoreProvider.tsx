"use client";

import { createContext, useContext, useState } from "react";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import type { Persistor } from "redux-persist";
import { makePersistor, makeStore } from "./index";

const PersistorContext = createContext<Persistor | null>(null);

/**
 * Không chặn render con bằng PersistGate ở đây: trên server PersistGate không bao giờ "bootstrapped",
 * nên mọi trang sẽ bị bỏ khỏi prerender. Nơi nào cần dữ liệu đã khôi phục thì dùng <WaitForPersist>.
 */
export default function StoreProvider({ children }: { children: React.ReactNode }) {
  const [{ store, persistor }] = useState(() => {
    const store = makeStore();
    return { store, persistor: makePersistor(store) };
  });
  return (
    <Provider store={store}>
      <PersistorContext.Provider value={persistor}>{children}</PersistorContext.Provider>
    </Provider>
  );
}

/** Chỉ hiển thị con sau khi dữ liệu persist đã được khôi phục (ở trình duyệt). */
export function WaitForPersist({ children, loading = null }: { children: React.ReactNode; loading?: React.ReactNode }) {
  const persistor = useContext(PersistorContext);
  if (!persistor) return <>{children}</>;
  return (
    <PersistGate persistor={persistor} loading={loading}>
      {children}
    </PersistGate>
  );
}
