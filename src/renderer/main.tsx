import React from "react";
import ReactDOM from "react-dom/client";
import "highlight.js/styles/github-dark-dimmed.css";
import App from "./App";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Graphite could not find its renderer root.");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
