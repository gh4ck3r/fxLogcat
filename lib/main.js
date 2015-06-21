"use strict";

const {Cc, Cu, Ci, Cr} = require("chrome");
require("adb/shell.js");

const {Devices} = Cu.import("resource://gre/modules/devtools/Devices.jsm");

/* Example code for Browser Console */
function shell(aCmd){
  clear();
  const {Devices} = Cu.import("resource://gre/modules/devtools/Devices.jsm");
  const adb = Devices.getByName(Devices.available());

  adb.shell(aCmd, inputStream => {
      let arrayBuffer = new ArrayBuffer(inputStream.available());
      inputStream.readArrayBuffer(arrayBuffer.byteLength, arrayBuffer);

      let text = new TextDecoder().decode(new Uint8Array(arrayBuffer));
      console.log(text);
    }).then(()=>console.log("done"));
}

let {ActionButton} = require("ui/ActionButton");
ActionButton.on("click", state => {
    const adb = Devices.getByName(Devices.available());
    adb.shell("ls /proc/[0-9]*/stat", inputStream => {
      console.log(inputStream.read(inputStream.available()));
    }).then(aCmd => console.log(`${aCmd} is done`));
  });
