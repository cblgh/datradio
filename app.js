// choo stuff
var html = require("choo/html")
var devtools = require("choo-devtools")
var choo = require("choo")
var css = require("sheetify")

css("./links/style.css")

var app = choo()
app.use(devtools())
app.use(init)
app.use(inputHandler)
app.route("/", mainView)
app.mount("body")

function mainView(state, emit) {
    emit("DOMTitleChange", "piratradio")
    return html`
        <body>
            <h1>piratradio</h1>
            <audio id="player" controls="controls" >
                <source src=${state.currentAudio}>
                Yer browser dinnae support the audio element :(
            </audio>
            <p>piratradio lives fkrs</p>
            <p>${state.currentAudio}</p>
                    <ul>
                    ${state.tracks.map(createTrack)}
                    </ul>
            <input placeholder="i love tracks" onkeydown=${keydown}>
        </body>
        `

    function keydown(e) {
        console.log(e)
        if (e.key === "Enter") {
            emit("inputEvt", e.target.value)
            e.target.value = ""
        }
    }
}

function createTrack(track) {
    return html`<li onclick=${play}>${track}</li>`
    
    // play the track when clicked on
    function play() {
        var player = document.getElementById("player")
        player.src = track
        player.load()
        player.play()
    }
}

async function init(state, emitter) {
    state.tracks = []
    // try to load the user's playlist
    var archive = new DatArchive(window.location.toString())
    try {
        var playlist = JSON.parse(await archive.readFile("playlist.json"))
        state.tracks = playlist.tracks
        console.log(state.tracks)
        emitter.emit("render")
    } catch (e) {
        console.error("failed to read playlist.json; malformed json?")
        console.error(e)
    }
}

function inputHandler(state, emitter) {
    state.currentAudio = "./assets/jam-congratulations.ogg"
    emitter.on("inputEvt", function (msg) {
        console.log("CAPTAIN! I spy with mine eye a message:", msg)
        state.currentAudio = msg
        var player = document.getElementById("player")
        player.src = msg
        player.load()
        emitter.emit("render")
    })
}
