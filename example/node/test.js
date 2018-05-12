const { Threadify, ThreadifyConfig } = require('../../index');
let { Test, TestObject } = require('./test.class');
ThreadifyConfig.logLevel = 1;
ThreadifyConfig.maxThreads = 1;

function Progress(status) {
    console.log("[Progress] "+status);
}


Test2 = Test.truc.machin[0].Threadify("hello");
var t = new Test2(17);
t.hello(false, Progress).then(function(o) {
    console.log(o);
}).catch(function(err) {
    console.log("[Error]", err);
});

TestObject = Threadify(TestObject);

TestObject.procede("a", "2", Progress).then(function(o) {
    console.log(o);
});
