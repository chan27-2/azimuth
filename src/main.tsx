import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@xyflow/react/dist/style.css";
import "./index.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}>
    <App />
  </MotionConfig>,
);
