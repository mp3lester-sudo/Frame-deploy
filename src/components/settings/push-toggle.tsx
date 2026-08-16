"use client";

import { useEffect, useState, useTransition } from "react";
import { subscribeToPush, unsubscribeFromPush } from "@/lib/actions/push";
import { cn } from "@/lib/utils";

// Web Push's applicationServerKey wants a Uint8Array, but the VAPID public
// key is handed out (and stored in env vars) as a URL-safe base64 string --
// this is the standard conversion every Web Push guide uses.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

type Status = "unsupported" | "checking" | "off" | "on" | "denied";

// Support/permission are readable synchronously (no async browser API
// involved), so this runs once as a lazy useState initializer during the
// first render rather than a setState call inside an effect body -- the
// react-hooks/set-state-in-effect rule flags the latter as an avoidable
// cascading render for exactly this kind of "compute once on mount" case.
function getInitialStatus(): Status {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  return "checking";
}

export function PushToggle() {
  const [status, setStatus] = useState<Status>(getInitialStatus);
  const [isPending, startTransition] = useTransition();

  // Only the genuinely-async part (asking the service worker for any
  // existing subscription) lives in an effect -- setState here happens
  // inside a .then() callback responding to an external system, not
  // synchronously in the effect body.
  useEffect(() => {
    if (status !== "checking") return;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((sub) => setStatus(sub ? "on" : "off"))
      .catch(() => setStatus("off"));
  }, [status]);

  function enable() {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      setStatus("unsupported"); // not configured server-side yet
      return;
    }
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setStatus(permission === "denied" ? "denied" : "off");
          return;
        }
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
        });
        const json = subscription.toJSON();
        if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("Incomplete subscription");
        await subscribeToPush({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        });
        setStatus("on");
      } catch {
        setStatus("off");
      }
    });
  }

  function disable() {
    startTransition(async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          const endpoint = subscription.endpoint;
          await subscription.unsubscribe();
          await unsubscribeFromPush({ endpoint });
        }
        setStatus("off");
      } catch {
        setStatus("on");
      }
    });
  }

  if (status === "unsupported") return null;

  return (
    <div>
      <label className="mb-1 block text-[11px] uppercase tracking-wider text-foreground-muted">
        Push notifications
      </label>
      {status === "denied" ? (
        <p className="text-xs text-foreground-muted">
          Blocked in your browser settings — re-enable notifications for this site to turn these back on.
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs text-foreground-muted">
            Get notified on this device for follows, comments, and Movie Night, even when Slate isn&apos;t open.
          </p>
          <button
            type="button"
            disabled={status === "checking" || isPending}
            onClick={status === "on" ? disable : enable}
            className={cn(
              "rounded-[var(--radius-md)] border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50",
              status === "on"
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border text-foreground-muted hover:border-border-strong hover:text-foreground"
            )}
          >
            {status === "on" ? "Enabled — tap to turn off" : "Turn on"}
          </button>
        </>
      )}
    </div>
  );
}
