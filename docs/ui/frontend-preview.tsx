import { mountPhone } from "../../src/frontend/host/mount-phone.tsx";
import { BackgroundDataSource } from "../../src/features/background/index.ts";
import { createPreviewProvider } from "./data-source-fixture.ts";

const options = new URLSearchParams(window.location.search);
mountPhone({
  dataSource: new BackgroundDataSource(createPreviewProvider(options.get("data-state"))),
  initialApp:
    options.get("data-source") === "1"
      ? "data-source"
      : options.get("foundation") === "1"
        ? "foundation"
        : "home",
  responsive: options.get("responsive") === "1",
  draggable: options.get("draggable") === "1",
});
