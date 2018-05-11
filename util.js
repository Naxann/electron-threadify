/**
 * Utilitary functions
 */

/**
 * Serialize an object:
 * - Create an new object for function so it could be called back
 */

var TypedArrayNames = {
    "Int8Array": Int8Array,
    "Uint8Array": Uint8Array,
    "Uint8ClampedArray": Uint8ClampedArray,
    "Int16Array": Int16Array,
    "Uint16Array": Uint16Array,
    "Int32Array": Int32Array,
    "Uint32Array": Uint32Array,
    "Float32Array": Float32Array,
    "Float64Array": Float64Array
};
function SerializeForProcess(obj, parent) {
    var objSendified = obj;

    if (typeof(objSendified) == "object" && objSendified !== null && TypedArrayNames[obj.constructor.name]) {
        // Nothing to be done
        objSendified = {};
        objSendified.values = Array.from(obj);
        objSendified._classname = obj.constructor.name;
    }
    else if (typeof(objSendified) == "object" && !Array.isArray(objSendified) && objSendified !== null && objSendified !== undefined) {
        objSendified = Object.assign({}, objSendified);
        if (obj.constructor && obj.constructor.name !== "Object") {
            objSendified._classname = obj.constructor.name;
        }
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

function UnserializeFromProcess(obj, parent) {
    var objUnserialized = obj;
    var construct;
    if (typeof(objUnserialized) == "object" && objUnserialized !== null && (construct = TypedArrayNames[obj._classname])) {
        objUnserialized = new construct(objUnserialized.values);
    }
    else if (typeof(objUnserialized) == "object" && !Array.isArray(objUnserialized) && objUnserialized !== null && objUnserialized !== undefined) {
        for (var i in objUnserialized) {
            var unserialized = UnserializeFromProcess(objUnserialized[i], obj);
            if (unserialized != undefined) {
                objUnserialized[i] = unserialized;
            }
        };
    } else if (Array.isArray(objUnserialized)) {
        objUnserialized = objUnserialized.slice();
        objUnserialized.forEach(function(item, i) {
            objUnserialized[i] = UnserializeFromProcess(item);
        });
    }
    return objUnserialized;
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
    UnserializeFromProcess: UnserializeFromProcess,
    CopyArguments: copyArguments,
    ExecuteSerializedFunction: executeSerializedFunction
};
