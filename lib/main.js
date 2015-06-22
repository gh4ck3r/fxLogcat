"use strict";

const {Cc, Cu, Ci, CC} = require("chrome");

require("adb/shell.js");
require("adb/logcat.js");

const {Devices} = Cu.import("resource://gre/modules/devtools/Devices.jsm");
const assert = (function() {
  const {Assert} = Cu.import("resource://specialpowers/Assert.jsm");
  return new Assert();
})();

let {button} = require("ui/Launcher");
button.on("click", state => {
    const adb = Devices.getByName(Devices.available());
    adb.logcat(aMessage => {
      const {message: {tag, message}} = aMessage;
      console.log(`[${tag}] ${message}`);
    });
});
