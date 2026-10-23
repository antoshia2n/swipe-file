import { useEffect, useRef } from "react";
import { startApp } from "./engine/app.js";

/**
 * ログインの内側。画面そのものは engine/app.js が 1 つの関数で描く
 * （デモ 8 と同じ作りのまま本物のデータにつないだため、React は入口だけに使う）。
 */
export default function App() {
  const ref = useRef(null);
  useEffect(() => startApp(ref.current), []);
  return <div ref={ref} style={{ height: "100%" }} />;
}
