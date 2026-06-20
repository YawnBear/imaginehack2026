"use client";

// Minimal toast system — Level-2 elevation chips, bottom-center. Used for the
// "Run scan" result and review confirmations.

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastKind = "info" | "success" | "error";

interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastValue {
  toast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

const KIND_COLOR: Record<ToastKind, string> = {
  info: "#065FD4",
  success: "#2BA640",
  error: "#FF0000",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const toast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[80] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="gg-fade-up pointer-events-auto flex max-w-[90vw] items-center gap-2.5 rounded-full bg-[#0F0F0F] px-4 py-2.5 text-[13px] font-medium text-white shadow-[var(--shadow-e2)]"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: KIND_COLOR[t.kind] }}
            />
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
