const {Cc, Cu, Ci, Cr} = require("chrome");

const {Devices} = Cu.import("resource://gre/modules/devtools/Devices.jsm");

const registeredDevices = new WeakSet();


if (Devices.helperAddonInstalled) registerDevices();
Devices.on("register", registerDevices);

function registerDevices() {
  for (let name of Devices.available()) {
    let device = Devices.getByName(name);

    if (!registeredDevices.has(device)) {
      decorate(device);
      registeredDevices.add(device);
    }
  }
}

function decorate(aDevice) {
  console.log("new device :", aDevice);
  // TODO : add async shell function to aDevice
}
