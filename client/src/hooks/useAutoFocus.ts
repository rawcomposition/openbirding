import { useEffect, useRef } from "react";

export const useAutoFocus = (delay: number = 50) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return inputRef;
};
