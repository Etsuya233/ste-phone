import { mountPhone } from "../../src/frontend/host/mount-phone.tsx";

const options = new URLSearchParams(window.location.search);
mountPhone({
  responsive: options.get("responsive") === "1",
  draggable: options.get("draggable") === "1",
});
