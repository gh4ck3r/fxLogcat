"use strict";

const {Cc, Cu, Ci, Cr} = require("chrome");

const {Devices} = Cu.import("resource://gre/modules/devtools/Devices.jsm");

const registeredDevices = new WeakSet();


if (Devices.helperAddonInstalled) registerDevices();
Devices.on("register", registerDevices);

function registerDevices() {
  for (let name of Devices.available()) {
    let device = Devices.getByName(name);

    if (!registeredDevices.has(device)) {
      decorateADB(device);
      registeredDevices.add(device);
    }
  }
}

function decorateADB(aDevice) {
  aDevice.shell = function (aCmd, aAsyncCallback) {
    if (typeof(aAsyncCallback) === "function") {
      return adb_AsyncShell(aCmd, aAsyncCallback);
    } else {
      return aDevice.__proto__.shell(aCmd);
    }
  }
}

const { defer } = require('sdk/core/promise');
const OKAY = 0x59414b4f;
const ADB = require('resource://adbhelperatmozilla.org/adb.js');

function adb_AsyncShell(aCommand, aCallback) {
  let deferred = defer();
  let socket;

  function shutdown() {
    socket.close();
    deferred.reject("BAD_RESPONSE");
  }

  let pipe = Cc["@mozilla.org/pipe;1"].createInstance(Ci.nsIPipe);
  pipe.init(false, false, 0, 0xffffffff, null);

  let binStream = Cc["@mozilla.org/binaryinputstream;1"]
                     .createInstance(Ci.nsIBinaryInputStream);
  binStream.setInputStream(pipe.inputStream);

  let boutStream = Cc["@mozilla.org/binaryoutputstream;1"]
                     .createInstance(Ci.nsIBinaryOutputStream);
  boutStream.setOutputStream(pipe.outputStream);

  let state;
  function runFSM(aData) {
    let req;
    switch(state) {
      case "start":
        state = "send-transport";
        runFSM();
      break;
      case "send-transport":
        req = ADB._createRequest("host:transport-any");
        ADB.sockSend(socket, req);
        state = "wait-transport";
      break
      case "wait-transport":
        if (!ADB._checkResponse(aData, OKAY)) {
          shutdown();
          return;
        }
        state = "send-shell";
        runFSM();
      break
      case "send-shell":
        req = ADB._createRequest("shell:" + aCommand);
        ADB.sockSend(socket, req);
        state = "rec-shell";
      break
      case "rec-shell":
        if (!ADB._checkResponse(aData, OKAY)) {
          shutdown();
          return;
        }
        state = "decode-shell";
        runFSM();
      break;
      case "decode-shell":
        if (aData) {
          // *IMPORTANT* : Replace "\r\a"(0x0d 0x0a) into "\a" here.
          //   newline(0x0a) is converted into "\r\a" while transport. And it makes
          //   length in header wrong.
          let buffer = new Uint8Array(aData);
          let {byteLength} = aData;
          let notCRLF = function (v, i) {
            return v !== 0x0d || (++i < byteLength && buffer[i] !== 0x0a);
          }
          buffer = buffer.filter(notCRLF);

          boutStream.writeByteArray(buffer, buffer.byteLength);

          aCallback(binStream);
        }

      break;
      default:
        deferred.reject("UNEXPECTED_STATE");
    }
  }

  socket = ADB._connect();
  socket.onerror = function(aEvent) {
    deferred.reject("SOCKET_ERROR");
  }

  socket.onopen = function(aEvent) {
    state = "start";
    runFSM();
  }

  socket.onclose = function(aEvent) {
    deferred.resolve();
  }

  socket.ondata = function _onData(aEvent) {
    runFSM(aEvent.data);
  }

  return deferred.promise;
}

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
