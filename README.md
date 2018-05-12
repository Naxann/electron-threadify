thread-promisify: Execute functions in a thread
========================================================

Allows you to execute methods of a class or an object into another thread, so application will have
better performance.

Object / Class have to be in an module separated from the main process.

**Exemple.class.js**

    // Example.class.js
    
    class Example {
        constructor() {

        }
        
        // I know, it is not very useful, but it 
        // demonstrates well the power of thread
        sleep(ms) { return new Promise(function(resolve, reject) {
            var waitTill = new Date(new Date().getTime() + ms);
            while(waitTill > new Date()){};
            resolve();
        }); }
        
        hello(s) { return new Promise(function(resolve, reject) {
            return "hello "+s;
        });}

    }
    

    exports.Example = Example;
    exports.ExampleStatic = {
        aStaticMethod: function() { return new Promise(function(resolve, reject) {
            return "Here you can read and parse a file";
        }); }
    };

**index.js**

    const { Threadify } = require("thread-promisify");
    const { Example, ExampleStatic } = require('./threadify.example');
    
    // No arguments, all methods are threadified
    let ThreadifyExample = Example.Threadify();
    
    var ex = new ThreadifyExample();
    ex.sleep(2000).then(function() {
        console.log("Done !");
    });
    
    // Just threadify some methods and not all
    let ThreadifyExample = Example.Threadify(["sleep"]);
    var ex = new ThreadifyExample();
    ex.sleep(2000).then(function() {
        console.log("I was executed in a thread !");
    });
    ex.hello("John Doe").then(function(s) {
        console.log(s);
        console.log("And I was not executed in a thread me.");
    })
    
    // Threadify an object
    let Statics = Threadify(ExampleStatic);
    Statics.aStaticMethod().then(function() {
        console.log("I was an object and I am executed in a thread");
    })
    

## Configuration

You can configure Threadify like this.

NOTE: For electron users, add this code in the main.js and not in the renderer.

    const { ThreadifyConfig } = require("thread-promisify");
    
    // The max number of threads who will be executed at the same time
    // Default to CPU cores-1 or 1 if only 1 CPU core
    ThreadifyConfig.maxThreads = 1;
    
    // If set to true, when a Thread is inactive
    // it will be killed and recreated from scratch later
    // Set false if you keep static object for performance issue
    // Default to true
    ThreadifyConfig.killThreadsWhenInactive = true;
    
    // The log level of the module, values: 0, 1, 2, 3
    ThreadifyConfig.logLevel = 0;
    
## Use a specific thread

You can tell a threadified method to use the same specific thread when it is available

    myObject.myMethod(myArg1, myArg2, {threadify: {thread: "a-specific-thread"}}).then(function() {
        console.log("I will be using always the same thread");
    });


## Variables types supported

Object and variables are serialized because we use child process for thread.
So if you send back an object, you will have to instantiate back again in your main thread.

Only some basic variable types are supported:

* String
* Number
* Array
* TypedArray (Uint8array, ...)

If you send an object back, they will become anonymous object without methods.

In the future, objects will be recreated but the constructor will have to be in an exports

## Use a function in an method call

You can pass a function, like a progress function, 
as a parameter, without complications, as simple as that.

    function _progress(step) {
        console.log("I am called in the main process ! Step: ", step);
    }
    
    myObject.myMethod(_progress).then(function() {
        _progress(1);
        _progress(2);
    });

The method will be fired in the main process, and not in the thread process

## Event Handlers
    
Currently, EventEmitter is not supported by this. 
But in the future, maybe ! So when you will fire an event, the event will be 
send back to the main process too.

### mp3

    npm install mp3
    
### vorbis
    
    npm install vorbis.js

### opus
    
    npm install opus.js

### FLAC
    
    npm install flac.js
    
### AAC

    npm install aac
    
### ALAC (Apple Lossless)

    npm install alac

## Other formats

If you know other Aurora.js plugins, tell me in the issues, or just do a pull ;)