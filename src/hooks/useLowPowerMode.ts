"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "sophia-low-power-mode";

export function useLowPowerMode() {
  const [isLowPower, setIsLowPower] = useState<boolean>(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const htmlHasClass = document.documentElement.classList.contains("low-power");
      
      if (stored === "on" || (stored !== "off" && htmlHasClass)) {
        setIsLowPower(true);
        document.documentElement.classList.add("low-power");
      } else {
        setIsLowPower(false);
        document.documentElement.classList.remove("low-power");
      }
    } catch {
      // Storage unavailable
    }
  }, []);

  const toggleLowPower = () => {
    setIsLowPower((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
        if (next) {
          document.documentElement.classList.add("low-power");
        } else {
          document.documentElement.classList.remove("low-power");
        }
      } catch {
        // Storage unavailable
      }
      return next;
    });
  };

  return { isLowPower, toggleLowPower };
}
