import { useEffect, useRef } from "react";
import { startPanel } from "./engine/panel.js";

/** /panel：拡張機能「スワイプくんパネル」のサイドパネルの中で開く細い画面 */
export default function Panel() {
  const ref = useRef(null);
  useEffect(() => { startPanel(ref.current); }, []);
  return <div ref={ref} style={{ height: "100%" }} />;
}
