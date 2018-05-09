
/**
 * Thread Script
 * Mainly execute the request one by one
 */
const {SerializeForProcess, ExecuteSerializedFunction, CopyArguments} = require('./util');

var PendingRequests = [];
var PendingTimeout = null;

/**
 * Log an information
 */
function Log() {
    var args = CopyArguments(arguments);
    var level = args.shift();
    args.unshift("[Thread] <"+threadId+">");
    args.unshift(level);
    process.send({name: "thread-log", args: SerializeForProcess(args)});
};

/**
 * Convert SerializedFunction objects to function, so when called
 * we execute the function in the original thread
 */
function ConvertArgs(args, baseResponse) {
    var baseResponse = Object.assign({}, baseResponse);
    args.forEach(function(arg, i) {
        if (typeof(arg) == "object" && arg._className == "SerializedFunction") {
            var idRemoteFunction = arg.id;
            args[i] = function() {
                process.send(Object.assign(baseResponse, {name: "thread-execute-remote-function", args: [{id: idRemoteFunction, args: SerializeForProcess(CopyArguments(arguments))}]}));
            };
        }
    });
    return args;
};

/**
 * Finalize a request when it is done
 */
function finalizeRequestDone() {
    if (PendingRequests.length) {
        // If we have queued requests, we execute the next one
        currentRequest = PendingRequests.shift();
        Log(3, "Executing request", currentRequest.id);
        executeRequest(currentRequest);
    } else {
        // We set a timeout in case of other requests blocked in the process
        executing = false;
        PendingTimeout = setTimeout(() => {
            if (Object.keys(PendingRequests).length == 0) {
                // Telling main thread that he can kill us if he wants
                Log(3, "Inactive thread");
                process.send({name: "thread-no-pending-requests", args: [{threadId: threadId}]});
            }
        }, 1000);
    }

}

/**
 * Original Thread messages
 */
var ThreadMessage = new function() {
    /**
     * Execute a method on an object
     */
    this["thread-execute-method"] = function(data) {
        currentRequest = data;
        var object = data.obj;
        var executeId = data.id;
        var proxyOptions = data.obj._proxyOptions;
        var pathToRequire = proxyOptions.module;
        var pathToClass = proxyOptions.exportsPath;

        var electronSenderId = this.electronSenderId;
        var baseResponse = {};
        if (electronSenderId) {
            baseResponse.electronSenderId = electronSenderId;
        }
        var args = ConvertArgs(data.args, baseResponse);
        var method = data.name;
        var exports = require(pathToRequire);
        var currentExports = exports;
        while (pathToClass.length > 0) {
            currentExports = currentExports[pathToClass.shift()];
        }
        var ret = null;
        if (typeof(currentExports) == "object") {
            // Original export is an object, so we just call the function
            ret = currentExports[method].apply(currentExports, args);
        } else {
            // Original export is an class, we have to recreate an object with the same values
            var trueArgs = ConvertArgs(proxyOptions.constructArgs, baseResponse);

            // Creating the object with the original construct args
            var o = new (Function.prototype.bind.apply(currentExports, trueArgs)) (...trueArgs);

            // Change the public values of the object (and also the serialized function)
            for (var i in object) {
                // We change all except functions
                // If you want "progress" function, add them to the method args, or the constructor
                if (typeof(o[i]) != "function") {
                    o[i] = object[i];
                }
            }

            // Calling the method with the correct "this"
            ret = o[method].apply(o, args);
        }
        if (ret instanceof Promise) {
            // We have to wait until Promise is done, and then resolve or reject
            ret.then(function() {
                var ret = SerializeForProcess(CopyArguments(arguments));
                process.send(Object.assign(baseResponse, {name: "thread-function-resolve", args: [{id: data.id, result: ret}]}));
                finalizeRequestDone();
            }).catch(function() {
                var ret = CopyArguments(arguments);
                if (ret[0] instanceof Error) {
                    var err = ret[0];
                    var o = {};
                    o.message = err.message;
                    o.name = err.name;
                    o.stack = err.stack;
                    ret[0] = o;
                }
                process.send(Object.assign(baseResponse, {name: "thread-function-reject", args: [{id: data.id, result: SerializeForProcess(ret)}]}));
                finalizeRequestDone();
            });
        } else {
            // Return is immediate, we call the success resolve method
            process.send(Object.assign(baseResponse, {name: "thread-function-resolve", args: [{id: data.id, result: [ret]}]}));
            finalizeRequestDone();
        }
        // console.log(object, pathToRequire, method, args);
    };
};
function executeRequest(o) {
    var args = o.args;
    var name = o.name;
    ThreadMessage[name].apply(o, args);
}

var threadId = null;
var executing = false;
var currentRequest = null;


/**
 * Processing message from original thread
 *
 * Important note:
 * The thread can be busy, so request could not be processed right away
 * The inactive timer is here for that: when request is executed, we wait 1s
 * to be sure there were no request waiting for parsed
 */
process.on("message", function(o) {
    if (typeof(o) == "object" && o.name && o.args) {
        if (o.threadId && !threadId) {
            threadId = o.threadId;
            Log(3, "New thread started");
        }
        Log(3, "Recieved request", o.id);

        // No request in the execution process, we execute this one
        if (!executing)  {

            // An inactive timer was initiated, we clear it
            if (PendingTimeout) {
                clearTimeout(PendingTimeout);
                PendingTimeout = null;
                Log(3, "Timeout for inactive aborted")
            }

            executing = true;
            Log(3, "Executing request", o.id);
            executeRequest(o);
        }
        else {
            // A request is already executing, we queue the request
            Log(3, "Queueing request", o.id);
            PendingRequests.push(o);
        }
    }
});
