/**
 * Threadify
 *
 * NodeJS module allowing to execute methods of a class in a thread
 * Works with Electron too.
 *
 * Only works on Class and Object defined in a separate module
 *
 * All methods threadified send Promise as return value
 * Check Promise documentation for more information about how to deal with them
 *
 */
let fork, path;
const {SerializeForProcess, UnserializeFromProcess, ExecuteSerializedFunction, CopyArguments} = require('./util.js');

let electron, ipc = null;

var threads = null;
var isElectron = false;
var ipcSenders = {};
var osNumberOfCPUs = 1;

function Log(level) {
    var args = CopyArguments(arguments);
    args.shift();
    if (Config.logLevel >= level) {
        console.log(...args);
    }
}

///////////////////////////////
// Electron specific code
///////////////////////////////

try {
    require.resolve("electron");
    isElectron = true;

    electron = require('electron');
    ipc = electron.ipcMain || electron.ipcRenderer;

    // We are on the main process, so we set up IPC to receive request
    if (electron.ipcMain) {
        ipc.sendTo = function(id, name, args) {
            var sender = ipcSenders[id];
            sender.send(name, args);
        };
        ipc.on("threadify-request", function(event, tq) {
            tq.electronSenderId = event.sender.id; // We save the sender id so we can send to the correct sender the response
            ipcSenders[event.sender.id] = event.sender;
            if (!SendThreadRequest(tq)) {
                // Queing request in Main IPC, because in Renderer, a passthrough is done
                Log(1, "[Threadify]", "Queing request", tq.id, ": No threads available")
                PendingThreadRequests.push(tq);
            }
        });
    } else { // We are on a renderer process, we set up IPC to receive message
        ipc.on("threadify-message", function(event, o) {
            ParseMessageFromThread(o);
        });
    }
} catch(e) {
    // Nothing to be done here, we are not in an Electron app
}

///////////////////////////////
// Getting fork and path module
// Only for NodeJS classic app or Electron
///////////////////////////////

if (!isElectron || electron.ipcMain) {
    let child_process = require('child_process');
    let os = require('os');
    fork = child_process.fork;
    path = require('path');
    threads = [];

    osNumberOfCPUs = os.cpus().length;
}

/**
 * Messages from the thread
 */
var ThreadMessage = new function() {

    /**
     * Log sended
     */
    this["thread-log"] = function() {
        var args = CopyArguments(arguments);
        Log(...args);
    };

    /**
     * Request rejected (Promise function)
     */
    this["thread-function-reject"] = function(o) {
        //console.log("Must reject: "+o.id);
        var id = o.id;
        var result = o.result;
        var request = ExecuteRequests[o.id];

        request.reject.apply(request.promise, result);
        delete ExecuteRequests[o.id];
    };
    /**
     * Request resolved
     */
    this["thread-function-resolve"] = function(o) {
        //console.log("Must resolve: "+o.id);
        var id = o.id;
        var result = o.result;
        var request = ExecuteRequests[o.id];
        request.resolve.apply(request.promise, result);
        delete ExecuteRequests[o.id];
    };

    /**
     * Call of a function passed in the arguments of the class or the method
     */
    this["thread-execute-remote-function"] = function(o) {
        var id = o.id;
        var args = o.args;
        ExecuteSerializedFunction(id, args);
    };

    /**
     * Thread has executed all the requests
     */
    this["thread-no-pending-requests"] = function(o) {
        var threadObject = null;
        var index = -1;
        for (var i = 0; i < threads.length; i++) {
            if (threads[i].id == o.threadId) {
                threadObject = threads[i];
                index = i;
            }
        }
        if (threadObject) {
            threadObject.inactive = true;
            CheckPendingThreadRequests(); // We check pending request so we don't have to kill it and recreate it
            if (Config.killThreadsWhenInactive && threadObject.inactive) { // Always inactive after checking pending requests
                threads.splice(index, 1);
                threadObject.thread.kill();
                Log(2, "[Threadify]", "Thread", threadObject.id, "killed.");
            } else if (threadObject.inactive) {
                Log(2, "[Threadify]", "Thread", threadObject.id, "inactive.");
            }

        } else {
            console.error("[Threadify] Error: inactive thread not listed.");
        }
    };
};

/**
 * Parse the message from the thread or just passthrough to the Electron Renderer Process concerned
 */
function ParseMessageFromThread(o) {
    var o = UnserializeFromProcess(o);
    if (typeof(o) == "object" && o.name && o.args) {

        // Process response from the thread
        // Electron: If we are in the Main Process, and it is not a global message, we executed it too
        if (!isElectron || electron.ipcRenderer || !o.electronSenderId) {
            var args = o.args;
            var name = o.name;
            ThreadMessage[name].apply(ThreadMessage, args);
        } else {
            // Electron: Send the message to the correct window
            var electronSenderId = o.electronSenderId;
            ipc.sendTo(electronSenderId, "threadify-message", o);
        }
    }
}

// Panding Thread Requests, waiting for a thread to be inactive
var PendingThreadRequests = [];

/**
 * Check if there is a request waiting and execute it on an inactive thread available
 */
function CheckPendingThreadRequests() {
    while (PendingThreadRequests.length) {
        var tq = PendingThreadRequests.shift();
        if (!SendThreadRequest(tq)) {
            // No available thread, we queue the request, again
            PendingThreadRequests.unshift(tq);
            break;
        }
    }
}

/**
 * Send a thread request to an available thread
 * Electron: if it is the Renderer Process, we passthrough it to the main process
 */
function SendThreadRequest(tq) {
    if (!isElectron || electron.ipcMain) { // NodeJS classic process OR NodeJS Electron Process
        var threadId = tq.threadId;
        var scriptFilepath = path.join(path.dirname(module.filename), "thread.js");
        var thread = null;
        var threadObject = null;

        // Anonymous thread
        if (threadId == 0) { // On a free thread, or wait
            for (var i = 0; i < threads.length; i++) {
                threadObject = threads[i];
                if (threadObject.inactive && threadObject.anonymous) {
                    threadObject.inactive = false;
                    thread = threadObject.thread;
                    break;
                } else {
                    Log(3, "[Threadify]", "Thread", threadObject.id, "busy. Checking if others available");
                }
            }

            if (!thread && threads.length < Config.maxThreads) {
                threadObject = {anonymous: true, id: "anonymous"+threads.length, thread: null, inactive: false};
                threads.push(threadObject);
                thread = fork(scriptFilepath);
                thread.on("message", ParseMessageFromThread);
                tq.threadId = threadObject.id;
                threadObject.thread = thread;
            }
        } else {
            // Defined ID thread, we give the request to the correct thread
            var inactiveThreadObject = null;
            var indexInactiveThreadObject = -1;
            for (var i = 0; i < threads.length; i++) {
                threadObject = threads[i];
                if (threadObject.id == threadId) {
					if (threadObject.inactive) {
						threadObject.inactive = false;
						thread = threadObject.thread;
					} else {
						return false; // Directly returning false, because thread is active and we can't surcharge him (Windows crash)
					}
                }
                else if (threadObject.inactive) {
                    // We check for inactive thread, in case the max number of thread is used
                    inactiveThreadObject = threadObject;
                    indexInactiveThreadObject = i;
                }
            }
            if (!thread) {
                // We kill an inactive one for adding this specific thread, or we add one if we are on below
                if (threads.length < Config.maxThreads || inactiveThreadObject) {
                    if (inactiveThreadObject) {
                        inactiveThreadObject.inactive = false;
                        inactiveThreadObject.thread.kill();
                    }
                    threads.splice(indexInactiveThreadObject, 1);
                    threadObject = {anonymous: false, id: threadId, thread: null, inactive: false};
                    threads.push(threadObject);
                    thread = fork(scriptFilepath);
                    thread.on("message", ParseMessageFromThread);
                    threadObject.thread = thread;
                }
            }
        }
        if (!thread) {
            // No threads available
            return false;
        } else {
            Log(1, "[Threadify]", "Sending request", tq.id, "to thread", threadObject.id)
            thread.send(tq);
            return true;
        }
    } else { // Electron Window Process
        // We have to passthrough the request to the ipc, always return true, we don't keep a record of pending request here
        ipc.send("threadify-request", tq);
        return true;
    }
};

// All the requests queud or executing
// We don't keep the executed ones
var ExecuteRequests = {};

/**
 * The main part of the Threadify
 *
 * Threadify on a Class/Function
 * - We create a new class so when a new object is created, a proxy is sent
 * - The original constructor is called before the proxy
 *
 * Threadify on an object
 * - We send a proxy object
 *
 * Important notice:
 * We can't change directly a Class constructor, so we have
 * to create a new class
 * For objects, to avoid butterfly effects, we create also another object.
 *
 * We can't check if a function is a class or a simple function, so all functions are
 * considered Class
 *
 * To Threadify a function, Threadify the object containing the function or create one
 */
function ThreadifyAll(sup, options) {

    var baseProxy = {
      get: function(obj, prop) {
          if (typeof(obj[prop]) == "function" &&
              (obj._proxyOptions.methods.length == 0) || (obj._proxyOptions.methods.indexOf(prop) >= 0)) {
              return function() {
                  // Only if "all" functions are threadify, the specifics methods, and if it is a function at the start
                  var _myResolve, _myReject, _myArgs = CopyArguments(arguments);

                  // Creating a Promise
                  var promise = new Promise(function(resolve, reject) {
                      _myReject = reject;
                      _myResolve = resolve;
                  });
                  var hrTime = process.hrtime();

                  // ID Created with the time in nanoseconds and below
                  var id = "execute-"+hrTime[0]+"-"+hrTime[1];
                  var threadId = 0;
                  var thisRequestOptions = Object.assign({}, obj._proxyOptions);
                  if (_myArgs.length) {
                      var arg = _myArgs.pop();

                      // Threadify options passed to the request
                      // So we can execute the function on a specific thread

                      if (typeof(arg) == "object" && typeof(arg.threadify) == "object") {
                          thisRequestOptions = Object.assign(thisRequestOptions, arg.threadify);
                          for (var i in arg.threadify) {
                              if (["thread"].indexOf(i)) {
                                  console.warn("[Threadify] Unknown option: "+i);
                              }
                          }

                      } else {
                          _myArgs.push(arg);
                      }
                  }

                  if (thisRequestOptions.thread) {
                      threadId = thisRequestOptions.thread;
                  }

                  var ThreadRequest = {id: id, name: "thread-execute-method", threadId: threadId, args: [{id: id, obj: SerializeForProcess(obj), name: prop, args: SerializeForProcess(_myArgs)}]}
                  ExecuteRequests[id] = {request: ThreadRequest, resolve: _myResolve, reject: _myReject, promise: promise};
                  if (!SendThreadRequest(ThreadRequest)) {
                      // Non-Electron: Adding the request to the queue
                      // Electron: SendThreadRequest at this step is always true, because we are in a Renderer Process
                      Log(1, "[Threadify]", "Queing request", ThreadRequest.id, ": No threads available")
                      PendingThreadRequests.push(ThreadRequest);
                  }
                  return promise;
              }
          } else if (prop in obj) {
              return obj[prop];
          }
      }
    };
    var myOptions = options;
    var base = function() {
        this._proxy = true;
        this._proxyOptions = Object.assign({}, myOptions, {constructArgs: SerializeForProcess(CopyArguments(arguments))});

    };

    if (typeof(sup) == "function") {

        // Class Threadify: we create another class
        var descriptor = Object.getOwnPropertyDescriptor(
            base.prototype, "constructor"
        );
        base.prototype = Object.create(sup.prototype);

        var gestionnaire = {
            // New instance
            construct: function(cible, args) {

                var obj = this.apply(args);
                return obj;
            },

            // Apply
            apply: function(args) {
                // We create a new object with original args
                var that = new (Function.prototype.bind.apply(sup, args))(...args);

                // We apply the new constructor on it
                base.apply(that, args);
                // We add the proxy and send the object
                return new Proxy(that, baseProxy);
            }
        };

        // Proxying the new class
        var proxy = new Proxy(base,gestionnaire);
        descriptor.value = proxy;
        Object.defineProperty(base.prototype, "constructor", descriptor);
        return proxy;
    } else {
        // Object: just a simple Proxy is needed here
        // But we apply the new class constructor too for some properties
        base.apply(sup);
        return new Proxy(sup, baseProxy);
    }
}


/**
 * Find an object recursively and return the path where it was founded
 * Use in Threadify function to find the module and the path to the object
 * so we can clone it in the thread
 */
function findObject(c, obj, path, alreadyParsed) {
    if (!path) {
        path = [];
    }

    // Recursive reference : boooh, very wrong
    if (!alreadyParsed) {
        alreadyParsed = [];
    }
    var keys = Object.keys(obj);
    alreadyParsed.push(obj);
    for (var key = 0; key < keys.length; key++) {
        var i = keys[key];
        if (i == "NativeModule" && isElectron) {
            break;
        }
        if (obj[i] === c) {
            path.push(i);
            return path;
        } else if (["object", "function"].indexOf(typeof(obj[i])) >= 0 && alreadyParsed.indexOf(obj[i]) == -1 && obj[i] !== null && obj[i] !== undefined) {
            path.push(i);
            var founded = findObject(c, obj[i], path, alreadyParsed);
            if (founded) {
                return founded;
            } else {
                path.pop();
            }
        }
    };
    return null;
}


/**
 * Threadify a class or an object defined in a separate uncore module
 * Cored module like fs, path, and others can't be threadified
 *
 * Options can be:
 * - Nothing: all functions are threadified
 * - A String: the specific function is threadified
 * - An array of string: all the functions specified are threadified
 *
 * For class only:
 * The current object is sent to the thread and then reproduced
 * If you want to use some properties, be sure to have them accessible (public properties)
 * Private ones can't be accessed
 */
function Threadify(options) {
    if (typeof(options) == "string") {
        options = {methods: [options]};
    } else if (Array.isArray(options)) {
        options = {methods: options};
    } else {
        if (options !== undefined && typeof(options) != "object") {
            throw new Error("[Threadify] You must specify either: \nNothing\nA string\nAn array of string\n")
        }
    }
    var options = Object.assign({
        module: null,
        exportsPath: null,
        methods: []
    }, options);
    // We automatically search the class or the object in the module loaded
    if (!options.module) {
        var cacheFounded = null;
        var pathExport = [];
        var parsedModule = [require.main, require.cache];
        for (var i in require.cache) {
            var cache = require.cache[i];

            // If module have exports, we search the class/object in it
            if (cache.exports) {
                var objectToSearch = {};

                // We exclude electron modules because of a lot of loop references
                if (isElectron && cache.filename.indexOf("/node_modules/electron/") >= 0) {
                    continue;
                }
                var pathObject = [];
                if (cache.exports !== this) {
                    pathObject = findObject(this, cache.exports, [], parsedModule);
                }

                if (pathObject !== null) {
                    cacheFounded = {module: cache, pathToClass: pathObject};
                    break;
                }
            }

        }
        if (!cacheFounded) {
           throw new Error("[Threadify] Class to threadify must be in a non-core separate module.");
        } else {
           options.module = cacheFounded.module.filename;
           options.exportsPath = cacheFounded.pathToClass;
        }
    }
    return ThreadifyAll(this, options);
}

/**
 * Configuration of Threadify
 */
var Config = new (function() {
    /**
     * The number of threads maximum
     * Default: 4
     */
    this.maxThreads = Math.max(osNumberOfCPUs-1, 1);
    /**
     * Log level information (from 0 to no information, to 3 to thread information)
     * Default: 0
     */
    this.logLevel = 0;
    /**
     * If set to true, threads are killed when inactive. This keep low memory usage
     * Set to false if you control the memory used in your modules
     * Default: true
     */
    this.killThreadsWhenInactive = true; // To avoid memory leaks. Set on true if memory is controlled on each thread to have better performance
})();
Function.prototype.Threadify = Threadify;

exports.Threadify = function(o, options) {
    return Threadify.apply(o, [options]);
};
exports.ThreadifyConfig = Config;
