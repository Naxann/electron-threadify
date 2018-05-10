class Example {
    constructor() {

    }

    sleep(ms) { return new Promise(function(resolve, reject) {
        var waitTill = new Date(new Date().getTime() + ms);
        while(waitTill > new Date()){};
        resolve();
    }); }

}

exports.Example = Example;
