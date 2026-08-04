"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

interface Toast {
  id: number;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 2500;

/**
 * Root-level toast/snackbar system. Before this existed, every "Copied!"-
 * style confirmation (referral-card.tsx, wrapped/share-button.tsx, ...)
 * reinvented its own local `copied` state + conditional button label --
 * fine in isolation, but it meant there was no single place to change how
 * a confirmation looks or behaves, and every new one had to be built from
 * scratch. useToast() is the one shared way to surface a brief,
 * non-blocking confirmation from anywhere in the client tree.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((message: string) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message }]);
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="toast-enter pointer-events-auto rounded-[var(--radius-md)] border border-border bg-surface-raised px-4 py-2 text-sm text-foreground shadow-lg"
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Falls back to a no-op (rather than throwing) outside a ToastProvider --
 * mirrors this codebase's existing convention for optional infra (Sentry,
 * PostHog, Resend all no-op without config) so a component using this
 * hook never has to know or care whether it's mounted under the provider.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  return ctx ?? { showToast: () => {} };
}
