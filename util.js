/**
 * Utilitary functions
 */

/**
 * Serialize an object:
 * - Create an new object for function so it could be called back
 */
function SerializeForProcess(obj, parent) {
    var objSendified = obj;

    if (typeof(objSendified) == "object" && !Array.isArray(objSendified)) {
        objSendified = Object.assign({}, objSendified);
        objSendified._className = obj.constructor.name;
        for (var i in objSendified) {
            var sendified = SerializeForProcess(objSendified[i], obj);
            if (sendified != undefined) {
                objSendified[i] = sendified;
            } else {
                delete objSendified[i];
            }
        };
    } else if (Array.isArray(objSendified)) {
        objSendified = objSendified.slice();
        objSendified.forEach(function(item, i) {
            objSendified[i] = SerializeForProcess(item);
        });
    }
    else if (typeof(objSendified) == "function") {
        if (!(parent instanceof SerializedFunction)) {
            objSendified = SerializeForProcess(new SerializedFunction(objSendified));
        } else {
            objSendified = undefined;
        }
    }
    return objSendified;
}

var SerializedFunctions = [];

/**
 * Serialized Functions
 * Have an id, so we can call it back when it is called in the thread
 */
class SerializedFunction {
    constructor(f) {
        SerializedFunctions.push(this);
        this.id = SerializedFunctions.length;
        this.func = f;
    }
};

/**
 * Copy arguments in a clean classic array
 */
function copyArguments(args) {
    var copy = [];
    for (var i = 0; i < args.length; i++) {
        copy.push(args[i]);
    }
    return copy;
}

/**
 * Execute a serialized function with an id
 * Those are for progress functions, don't use Promise it will not be checked
 */
function executeSerializedFunction(id, args) {
    SerializedFunctions.forEach(function(sf) {
        if (sf.id == id) {
            sf.func.apply(null, args);
        }
    });
}

module.exports = {
    SerializeForProcess: SerializeForProcess,
    CopyArguments: copyArguments,
    ExecuteSerializedFunction: executeSerializedFunction
};
