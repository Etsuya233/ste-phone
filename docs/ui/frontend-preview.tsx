import { mountPhone } from "../../src/frontend/host/mount-phone.tsx";
import { BackgroundDataSource } from "../../src/features/background/index.ts";
import { createPreviewProvider } from "./data-source-fixture.ts";

import { PhoneDatabaseService } from "../../src/features/database/index.ts";
import { DatabaseWorkerClient } from "../../src/infrastructure/sqlite/worker-client.ts";

const options = new URLSearchParams(window.location.search);
const dataSource = new BackgroundDataSource(createPreviewProvider(options.get("data-state")));
const database = new PhoneDatabaseService(dataSource, new DatabaseWorkerClient());
mountPhone({
  dataSource,
  database,
  initialApp:
    options.get("database") === "1"
      ? "database"
      : options.get("data-source") === "1"
        ? "data-source"
        : options.get("foundation") === "1"
          ? "foundation"
          : "home",
  responsive: options.get("responsive") === "1",
  draggable: options.get("draggable") === "1",
});
