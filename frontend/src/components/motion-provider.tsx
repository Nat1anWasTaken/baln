import { type ReactNode, useEffect } from "react";
import { domMax, LazyMotion, MotionConfig } from "motion/react";

function setInputModality(modality: "keyboard" | "pointer") {
  document.documentElement.dataset.inputModality = modality;
}

export function AppMotionProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.altKey || event.ctrlKey) return;
      setInputModality("keyboard");
    };
    const onPointerDown = () => setInputModality("pointer");

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      delete document.documentElement.dataset.inputModality;
    };
  }, []);

  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
