import { useEffect, useRef } from "react";

export const useUnsavedChangesWarning = (
  hasUnsavedChanges: boolean,
  isEnabled: boolean = true,
  onConfirm?: () => void
) => {
  const originalPushState = useRef<typeof window.history.pushState>();
  const originalReplaceState = useRef<typeof window.history.replaceState>();

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
        return "You have unsaved changes. Are you sure you want to leave?";
      }
    };

    const handlePopState = (e: PopStateEvent) => {
      if (hasUnsavedChanges) {
        const confirmed = window.confirm("You have unsaved changes. Are you sure you want to leave?");
        if (!confirmed) {
          e.preventDefault();
          window.history.pushState(null, "", window.location.href);
        }
      }
    };

    if (isEnabled && hasUnsavedChanges) {
      // Store original methods
      originalPushState.current = window.history.pushState;
      originalReplaceState.current = window.history.replaceState;

      // Override pushState to intercept React Router navigation
      window.history.pushState = function (...args) {
        if (hasUnsavedChanges) {
          const confirmed = window.confirm("You have unsaved changes. Are you sure you want to leave?");
          if (!confirmed) {
            return;
          }
          onConfirm?.();
        }
        return originalPushState.current!.apply(this, args);
      };

      // Override replaceState to intercept React Router navigation
      window.history.replaceState = function (...args) {
        if (hasUnsavedChanges) {
          const confirmed = window.confirm("You have unsaved changes. Are you sure you want to leave?");
          if (!confirmed) {
            return;
          }
          onConfirm?.();
        }
        return originalReplaceState.current!.apply(this, args);
      };

      window.addEventListener("beforeunload", handleBeforeUnload);
      window.addEventListener("popstate", handlePopState);
    }

    return () => {
      // Restore original methods
      if (originalPushState.current) {
        window.history.pushState = originalPushState.current;
      }
      if (originalReplaceState.current) {
        window.history.replaceState = originalReplaceState.current;
      }

      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [hasUnsavedChanges, isEnabled]);
};
