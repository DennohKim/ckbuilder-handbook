import React from "react";
import { createRoot } from "react-dom/client";
import { ccc } from "@ckb-ccc/connector-react";
import { App } from "./App";
import { createDevnetClient } from "./ckb/client";
import "./styles.css";

const client = createDevnetClient();

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");

createRoot(root).render(
  <React.StrictMode>
    <ccc.Provider defaultClient={client} name="CKB Escrow (devnet)">
      <App />
    </ccc.Provider>
  </React.StrictMode>,
);
