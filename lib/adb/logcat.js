"use strict";

const {Cc, Cu, Ci, CC} = require("chrome");

const {Devices} = Cu.import("resource://gre/modules/devtools/Devices.jsm");
const assert = (function() {
  const {Assert} = Cu.import("resource://specialpowers/Assert.jsm");
  return new Assert();
})();

const nsIBinaryInputStream = CC("@mozilla.org/binaryinputstream;1",
                                "nsIBinaryInputStream",
                                "setInputStream");

const decode = (function() {
  const {TextDecoder} = require('sdk/io/buffer');
  const decoder = new TextDecoder();
  return decoder.decode.bind(decoder);
})();

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
  aDevice.logcat = function(aCallback) {
    aDevice.shell("logcat -B", Parser(aCallback));
  }
}

function Parser(aCallback) {
  var logMessage = null;

  const kStateParseHeader = 0;
  const kStateParseMessage = 1;
  var state = kStateParseHeader;

  return function (aInputStream) {
    let inputStream = nsIBinaryInputStream(aInputStream);

    function readArrayBuffer(aLength) {
      let buffer = new ArrayBuffer(aLength);
      inputStream.readArrayBuffer(aLength, buffer);
      return buffer;
    }

    function commitMessage() {
      aCallback(logMessage);
      logMessage = null;
    }

    let keepIteration = true;
     while(keepIteration) {
      let available = aInputStream.available();
      switch(state) {
        case kStateParseHeader:
          if (!available || available < 20) {
            keepIteration = false;
          } else {
            // https://android.googlesource.com/platform/system/core/+/master/include/log/logger.h
            // struct logger_entry {
            //     uint16_t    len;    /* length of the payload */
            //     uint16_t    __pad;  /* no matter what, we get 2 bytes of padding */
            //     int32_t     pid;    /* generating process's pid */
            //     int32_t     tid;    /* generating process's tid */
            //     int32_t     sec;    /* seconds since Epoch */
            //     int32_t     nsec;   /* nanoseconds */
            //     char        msg[0]; /* the entry's payload */
            // } __attribute__((__packed__));
            let [len, __pad]          = new Uint16Array(readArrayBuffer(4));
            let [pid, tid, sec, nsec] = new Uint32Array(readArrayBuffer(16));
            assert.equal(__pad, 0, `Parse Error : Unhandled version of adb log header version is detected : ${__pad}`);

            logMessage = {
              header: {len, __pad, pid, tid, sec, nsec},
              message: null
            }

            state = kStateParseMessage;
          }
          break;
        case kStateParseMessage:
          let messageLen = logMessage.header.len;
          if (!available || available < messageLen) {
            keepIteration = false;
          } else {
            // For main, radio and system logs msg field is interpreted as follows (source):
            //   priority: 1 byte
            //   tag: 0 or more bytes
            //   literal \0 as separator
            //   message: 0 or more bytes
            //   literal \0 as terminator

            // If this message is truncated, the trailing \0 may be missing.
            let rawMessage = new Uint8Array(readArrayBuffer(messageLen));
            let priority = ["UNKNOWN",
                            "DEFAULT",
                            "VERBOSE",
                            "DEBUG",
                            "INFO",
                            "WARN",
                            "ERROR",
                            "FATAL",
                            "SILENT"][rawMessage[0]];
            assert.ok(priority, `Parse Error : Unknown priority : ${rawMessage[0]}`);

            const tagIdx = rawMessage.findIndex((elem, idx) => idx && elem === 0);

            const decodeText = (beginIdx, endIdx) =>
              decode(rawMessage.subarray(beginIdx, endIdx)).trim();

            logMessage.message = {
              priority,
              tag     : decodeText(1, tagIdx),
              message : decodeText(tagIdx + 1, messageLen - 1)
            };

            commitMessage();

            state = kStateParseHeader;
          }
          break;
        default:
          assert.ok(false, `Unknown state: ${state}`);
          break;
      }
    }
  }
}
