class Test {
    constructor(a) {
        this.machin = a;
    }

    hello(a, progress = (function() {})) { return new Promise(function(resolve, reject) {
        var t = 1;
        setInterval(function() {
            progress(t++);
        }, 500);
        setTimeout(function() {
            if (a) {
                resolve("yes");
            } else {
                reject("no");
            }
        }, 3000);
    }); }
}

exports.Test = {truc: {machin: [Test]}};
exports.TestObject = {
    procede: function(a, b, progress) {
        console.log(a,b);
        progress("1");
        return {a: a, b: b};
    }
};
