import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthGuard } from "shia2n-core";
import { APP_ID, APP_NAME } from "./constants.js";
import App from "./App.jsx";
import Panel from "./Panel.jsx";

// /panel は拡張機能のサイドパネルの細い画面
const isPanel = /^\/panel\/?$/.test(location.pathname);
import "./engine/styles.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthGuard appId={APP_ID} appName={APP_NAME}>
      {isPanel ? <Panel /> : <App />}
    </AuthGuard>
  </StrictMode>
);
