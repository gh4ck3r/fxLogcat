"use strict";

const {Cc, Cu, Ci, Cr} = require("chrome");
const {Devices} = Cu.import("resource://gre/modules/devtools/Devices.jsm");

let {ActionButton} = require("sdk/ui/button/action");

let button = ActionButton({
  id: "id-button-fxlogcat",
  label: "Launch fxLogcat",
  icon: "./icon-64.png",
  badge: Devices.available().length
});

Devices.on("addon-status-updated", v => button.disabled = !v);
function updateBadge() {
  button.badge = Devices.available().length;
  button.disabled = button.badge <= 0 || !Devices.helperAddonInstalled;
}

Devices.on("register", updateBadge);
Devices.on("unregister", updateBadge);

exports.ActionButton = button;
