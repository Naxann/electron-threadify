
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

class SerializedFunction {
    constructor(f) {
        SerializedFunctions.push(this);
        this.id = SerializedFunctions.length;
        this.func = f;
    }
};

function copyArguments(args) {
    var copy = [];
    for (var i = 0; i < args.length; i++) {
        copy.push(args[i]);
    }
    return copy;
}
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
