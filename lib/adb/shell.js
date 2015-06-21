"use strict";

const {Cc, Cu, Ci, CC} = require("chrome");

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

const Pipe         = CC("@mozilla.org/pipe;1",
                        "nsIPipe",
                        "init");
const OutputStream = CC("@mozilla.org/binaryoutputstream;1",
                        "nsIBinaryOutputStream",
                        "setOutputStream");


function adb_AsyncShell(aCommand, aCallback) {
  let deferred = defer();
  let socket;

  function shutdown() {
    socket.close();
    deferred.reject("BAD_RESPONSE");
  }

  const pipe = Pipe(false, false, 0, 0xffffffff, null);
  const outputStream = OutputStream(pipe.outputStream);

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

          outputStream.writeByteArray(buffer, buffer.byteLength);

          aCallback(pipe.inputStream);
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
    deferred.resolve(aCommand);
  }

  socket.ondata = function _onData(aEvent) {
    runFSM(aEvent.data);
  }

  return deferred.promise;
}
