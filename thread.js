
const {SerializeForProcess, ExecuteSerializedFunction, CopyArguments} = require('./util');

var requests = [];

function ConvertArgs(args) {
    args.forEach(function(arg, i) {
        if (typeof(arg) == "object" && arg._className == "SerializedFunction") {
            var idRemoteFunction = arg.id;
            args[i] = function() {
                process.send({name: "thread-execute-remote-function", args: [{id: idRemoteFunction, args: SerializeForProcess(CopyArguments(arguments))}]});
            };
        }
    });
    return args;
};

var ThreadMessage = new function() {
    this["thread-execute-method"] = function(data) {
        var object = data.obj;
        var executeId = data.id;
        var proxyOptions = data.obj._proxyOptions;
        var pathToRequire = proxyOptions.module;
        var pathToClass = proxyOptions.exportsPath;

        var args = ConvertArgs(data.args);
        var method = data.name;
        var exports = require(pathToRequire);
        var currentExports = exports;
        while (pathToClass.length > 0) {
            currentExports = currentExports[pathToClass.shift()];
        }
        var ret = null;
        if (typeof(currentExports) == "object") {
            //console.log("[Thread] Calling method", method, "with", args);
            ret = currentExports[method].apply(currentExports, args);
        } else {
            //console.log("[Thread] Constructing object && calling method", method, "with", args);
            var trueArgs = ConvertArgs(proxyOptions.constructArgs);
            var o = new (Function.prototype.bind.apply(currentExports, trueArgs)) (...trueArgs);
            for (var i in object) {
                o[i] = object[i];
            }
            ret = o[method].apply(o, args);
        }
        if (ret instanceof Promise) {
            // We have to wait until Promise is done, and then resolve or reject
            ret.then(function() {
                var ret = SerializeForProcess(CopyArguments(arguments));
                process.send({name: "thread-function-resolve", args: [{id: data.id, result: ret}]});
            }).catch(function() {
                var ret = SerializeForProcess(CopyArguments(arguments));
                process.send({name: "thread-function-reject", args: [{id: data.id, result: ret}]});
            });
        } else {
            process.send({name: "thread-function-resolve", args: [{id: data.id, result: [ret]}]});
            // Return is immediate, we call the success resolve method
        }
        // console.log(object, pathToRequire, method, args);
    };
};



process.on("message", function(o) {
    if (typeof(o) == "object" && o.name && o.args) {
        var args = o.args;
        var name = o.name;
        ThreadMessage[name].apply(ThreadMessage, args);
    }
});
