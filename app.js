var html = require("choo/html")
var devtools = require("choo-devtools")
var choo = require("choo")
var css = require("sheetify")

css("./links/style.css")

var app = choo()
app.use(devtools())
app.use(countStore)
app.route("/", mainView)
app.mount("body")

function mainView (state, emit) {
    emit("DOMTitleChange", "piratrad.io")
    return html`
        <body>
        <h1>piratradio</h1>
        <p>piratrad.io lives fkrs</p>
        <button onclick=${onclick}>clicker</button>
        </body>
        `

    function onclick () {
        emit("evt", "ahoy")
    }
}

function countStore (state, emitter) {
    emitter.on("evt", function (msg) {
        console.log("CAPTAIN! I spy with mine eye a message: ", msg)
        emitter.emit("render")
    })
}

