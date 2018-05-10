const { Threadify } = require("thread-promisify");
const { Example } = require('./threadify.example');

let ThreadifyExample = Example.Threadify();


document.getElementById("sleep").addEventListener("click", function() {
    (new Example()).sleep(2000).then(function() {
        alert('Procedure done !');
    });
});
document.getElementById("threadify").addEventListener("click", function() {
    (new ThreadifyExample()).sleep(5000).then(function() {
        console.log('Procedure done (with thread id) !', this);
    });
});
document.getElementById("threadify-thread-id").addEventListener("click", function() {
    (new ThreadifyExample()).sleep(2000, {threadify: {thread: "mythread-id", id: "truc"}}).then(function() {
        console.log('Procedure done (with thread id custom) !');
    });
});
