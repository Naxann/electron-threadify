const {fork} = require('child_process');
const {SerializeForProcess, ExecuteSerializedFunction, CopyArguments} = require('./util.js');

var thread = null;

var ThreadMessage = new function() {
    this["thread-function-reject"] = function(o) {
        //console.log("Must reject: "+o.id);
        var id = o.id;
        var result = o.result;
        var request = ExecuteRequests[o.id];

        request.reject.apply(request.promise, result);
        delete ExecuteRequests[o.id];

        if (Object.keys(ExecuteRequests).length == 0) {
            // Must kill thread, no request pending
            thread.kill();
            thread = null;
        }
    };
    this["thread-function-resolve"] = function(o) {
        //console.log("Must resolve: "+o.id);
        var id = o.id;
        var result = o.result;
        var request = ExecuteRequests[o.id];
        request.resolve.apply(request.promise, result);
        delete ExecuteRequests[o.id];
        if (Object.keys(ExecuteRequests).length == 0) {
            // Must kill thread, no request pending
            thread.kill();
            thread = null;
        }
    };
    this["thread-execute-remote-function"] = function(o) {
        var id = o.id;
        var args = o.args;
        ExecuteSerializedFunction(id, args);
    };
};

function ParseMessageFromThread(o) {
    if (typeof(o) == "object" && o.name && o.args) {
        var args = o.args;
        var name = o.name;
        ThreadMessage[name].apply(ThreadMessage, args);
    }
}
function SendThreadRequest(tq) {
    if (thread === null) {
        thread = fork('thread.js');
        thread.on("message", ParseMessageFromThread);
    }
    thread.send(tq);
};

var ExecuteRequests = {};

function ThreadifyAll(sup, options) {

    var baseProxy = {
      get: function(obj, prop) {
          if (typeof(obj[prop]) == "function" &&
              (obj._proxyOptions.methods.length == 0) || (obj._proxyOptions.methods.indexOf(prop) >= 0)) {
              return function() {
                  var _myResolve, _myReject, _myArgs = CopyArguments(arguments);
                  var promise = new Promise(function(resolve, reject) {
                      _myReject = reject;
                      _myResolve = resolve;
                  });
                  var hrTime = process.hrtime();
                  var id = "execute-"+hrTime[0]+"-"+hrTime[1];
                  console.log("New request: "+id);
                  var ThreadRequest = {name: "thread-execute-method", args: [{id: id, obj: SerializeForProcess(obj), name: prop, args: SerializeForProcess(_myArgs)}]}
                  ExecuteRequests[id] = {resolve: _myResolve, reject: _myReject, promise: promise};
                  SendThreadRequest(ThreadRequest);
                  //console.log("threaded !", IPCRequest, IPCRequest.args[0].obj._proxyOptions.exportsPath.join("/"));
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
        var descriptor = Object.getOwnPropertyDescriptor(
            base.prototype, "constructor"
        );
        base.prototype = Object.create(sup.prototype);

        var gestionnaire = {
            construct: function(cible, args) {
                var obj = this.apply(args);
                return obj;
            },
            apply: function(args) {
                var that = new (Function.prototype.bind.apply(sup, args))(...args);
                base.apply(that, args);
                return new Proxy(that, baseProxy);
            }
        };
        var proxy = new Proxy(base,gestionnaire);
        descriptor.value = proxy;
        Object.defineProperty(base.prototype, "constructor", descriptor);
        return proxy;
    } else {
        base.apply(sup);
        return new Proxy(sup, baseProxy);
    }
}

function findObject(c, obj, path) {
    if (!path) {
        path = [];
    }
    var keys = Object.keys(obj);
    for (var key in keys) {
        var i = keys[key];
        if (obj[i] === c) {
            path.push(i);
            return path;
        } else if (["object", "function"].indexOf(typeof(obj[i])) >= 0) {
            path.push(i);
            var founded = findObject(c, obj[i], path);
            if (founded) {
                return founded;
            } else {
                path.pop();
            }
        }
    }
    return null;
}



function Threadify(options) {
    if (typeof(options) == "string") {
        options = {methods: [options]};
    } else if (Array.isArray(options)) {
        options = {methods: options};
    }
    var options = Object.assign({
        module: null,
        exportsPath: null,
        methods: []
    }, options);

    if (!options.file && !options.module) {
        // We are searching the class in the exports of required function
        var cacheFounded = null;
        var pathExport = [];
        for (var i in require.cache) {
            var cache = require.cache[i];
            if (cache.exports) {
                var pathObject = findObject(this, cache.exports);
                if (pathObject !== null) {
                    cacheFounded = {module: cache, pathToClass: pathObject};
                }
            }

        }
        if (!cacheFounded) {
           throw new Error("Class to electron-threadify must be in a non-core module required before.");
        } else {
           options.module = cacheFounded.module.filename;
           options.exportsPath = cacheFounded.pathToClass;
        }
    }
    return ThreadifyAll(this, options);
};

Function.prototype.Threadify = Threadify;

exports.Threadify = function(o, options) {
    return Threadify.apply(o, options);
};

// Threadify Function (Class)
// - Renvoyer une Classe qui crée un Proxy
// - Si all proxy, toute les méthodes
// - Envoyer le code de la fonction (toString) à ipcMain
// Threadify
