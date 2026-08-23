import {
  useReducedMotion,
  type TargetAndTransition,
  type Transition,
} from "motion/react";
import {
  createContext,
  createElement,
  useContext,
  type ReactNode,
} from "react";

export type PressFeedback =
  "control" | "icon" | "prominent" | "surface" | "navigation" | "none";

/** Native event names that overlap with Motion gesture callback names. */
export type MotionSafeProps<Props> = Omit<
  Props,
  "onAnimationStart" | "onDrag" | "onDragEnd" | "onDragStart"
>;

export const motionSpring = {
  press: {
    type: "spring",
    stiffness: 900,
    damping: 55,
    mass: 0.55,
  },
  release: {
    type: "spring",
    stiffness: 560,
    damping: 38,
    mass: 0.7,
  },
  layout: {
    type: "spring",
    stiffness: 500,
    damping: 40,
    mass: 0.8,
  },
  sheet: {
    type: "spring",
    stiffness: 420,
    damping: 38,
    mass: 0.9,
  },
  navigation: {
    type: "spring",
    stiffness: 460,
    damping: 42,
    mass: 0.9,
  },
  edgeReturn: {
    type: "spring",
    stiffness: 540,
    damping: 42,
    mass: 0.8,
  },
} satisfies Record<string, Transition>;

const pressTargets = {
  control: { opacity: 0.82, scale: 0.97, y: 1 },
  icon: { opacity: 0.72, scale: 0.92 },
  prominent: { opacity: 0.86, scale: 0.96, y: 1 },
  surface: { opacity: 0.94, scale: 0.985 },
  navigation: { opacity: 0.72, scale: 0.92 },
  none: undefined,
} satisfies Record<PressFeedback, TargetAndTransition | undefined>;

const pressRestTarget = { opacity: 1, scale: 1, y: 0 };

const PressMotionOwnerContext = createContext(false);

export function PressMotionBoundary({ children }: { children: ReactNode }) {
  return createElement(
    PressMotionOwnerContext.Provider,
    { value: true },
    children,
  );
}

export function usePressMotionOwnership() {
  return !useContext(PressMotionOwnerContext);
}

export function pressStateMotionProps(
  feedback: PressFeedback,
  pressed: boolean,
  disabled = false,
) {
  const target = pressTargets[feedback];
  if (disabled || !target) return {};
  return {
    animate: pressed ? target : pressRestTarget,
    transition: pressed ? motionSpring.press : motionSpring.release,
  };
}

export function pressMotionProps(feedback: PressFeedback, disabled = false) {
  const target = pressTargets[feedback];
  if (disabled || !target) return {};
  return {
    transition: motionSpring.release,
    whileTap: {
      ...target,
      transition: motionSpring.press,
    },
  };
}

export function useOwnedPressStateMotionProps(
  feedback: PressFeedback,
  pressed: boolean,
  disabled = false,
) {
  const ownsPressMotion = usePressMotionOwnership();
  return ownsPressMotion
    ? pressStateMotionProps(feedback, pressed, disabled)
    : {};
}

export function useOwnedPressMotionProps(
  feedback: PressFeedback,
  disabled = false,
) {
  const ownsPressMotion = usePressMotionOwnership();
  return ownsPressMotion ? pressMotionProps(feedback, disabled) : {};
}

export const floatingMotion = {
  initial: { opacity: 0, scale: 0.96, y: -6 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.96, y: -4 },
  transition: motionSpring.release,
  exitTransition: {
    duration: 0.14,
    ease: [0.4, 0, 1, 1],
  } satisfies Transition,
};

export const modalMotion = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
  transition: motionSpring.release,
  exitTransition: {
    duration: 0.16,
    ease: [0.4, 0, 1, 1],
  } satisfies Transition,
};

export function useInstantMotion() {
  const shouldReduceMotion = useReducedMotion();
  return shouldReduceMotion || import.meta.env.MODE === "test";
}
