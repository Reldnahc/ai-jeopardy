// hooks/useNavigationBlocker.ts
import { useEffect, useState } from "react";
import { useBlocker } from "react-router-dom";

interface UseNavigationBlockerProps {
  shouldBlock: boolean;
  onLeave?: () => void;
  confirmMessage?: string;
}

// useNavigationBlocker.ts
export const useNavigationBlocker = ({
  shouldBlock,
  onLeave,
  confirmMessage,
}: UseNavigationBlockerProps) => {
  const [isLeavingPage, setIsLeavingPage] = useState(false);

  // Handle router navigation
  useBlocker(({ currentLocation, nextLocation }) => {
    if (currentLocation.pathname !== nextLocation.pathname && shouldBlock && !isLeavingPage) {
      const confirmLeave = window.confirm(confirmMessage);
      if (confirmLeave) {
        onLeave?.();
        setIsLeavingPage(true);
        return false;
      }
      return true;
    }
    return false;
  });

  // Handle only browser/tab closing
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (shouldBlock && !isLeavingPage) {
        e.preventDefault();
        e.returnValue = "";
        onLeave?.();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [shouldBlock, isLeavingPage, onLeave]);

  return { setIsLeavingPage };
};
