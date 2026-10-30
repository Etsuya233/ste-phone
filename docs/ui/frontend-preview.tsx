import { mountPhone } from "../../src/frontend/host/mount-phone.tsx";

const options = new URLSearchParams(window.location.search);
mountPhone({
  initialApp: options.get("foundation") === "1" ? "foundation" : "home",
  responsive: options.get("responsive") === "1",
  draggable: options.get("draggable") === "1",
});
