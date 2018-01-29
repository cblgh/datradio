// choo stuff
var html = require("choo/html")
var devtools = require("choo-devtools")
var choo = require("choo")
var css = require("sheetify")

css("./links/style.css")

var archive = new DatArchive(window.location.toString())

var app = choo()
app.use(devtools())
app.use(init)
app.use(inputHandler)
app.route("/", mainView)
app.route("*", mainView)
app.mount("body")

function wowView(state, emit) {
    return html`<body><p> wow </p><p>${state.params.wildcard}</p></body>`
}

async function loadTracks(state, emit, playlist) {
    console.log("loadTracks:", playlist)
    if (playlist) {
        var p = JSON.parse(await archive.readFile(`playlists/${playlist}`))
        state.tracks = p.tracks
    }
}

function mainView(state, emit) {
    emit("DOMTitleChange", "piratradio")
    loadTracks(state, state.params.wildcard)
    return html`
        <body>
            <h1>piratradio</h1>
            <audio id="player" controls="controls" >
                <source src=${state.currentAudio}>
                Yer browser dinnae support the audio element :(
            </audio>
            <p>piratradio lives fkrs</p>
            <ul style="background-color: black; color: white">
            ${state.playlists.map(createPlaylistEl)}
            </ul>
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

function createPlaylistEl(playlist) {
    return html`<li><a href="/${playlist}">${playlist}</a></li>`
}

function createTrack(track) {
    var parts = track.split("/")
    var title = parts[parts.length - 1]
    return html`<li onclick=${play}>${title}</li>`
    
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
    state.playlists = []
    // try to load the user's playlist
    try {
        var playlist = JSON.parse(await archive.readFile("playlist.json"))
        state.tracks = playlist.tracks
        console.log(state.tracks)
        state.playlists = (await archive.readdir("playlists")).filter((i) => { return i.substr(i.length - 5) === ".json" })
        emitter.emit("render")
    } catch (e) {
        console.error("failed to read playlist.json; malformed json?")
        console.error(e)
    }
}

async function save(state) {
    console.log(`saving ${state.tracks[state.tracks.length - 1]} to playlist`)
    archive.writeFile("playlist.json", JSON.stringify({tracks: state.tracks}, null, 2))
}

function inputHandler(state, emitter) {
    state.currentAudio = "./assets/jam-congratulations.ogg"
    emitter.on("inputEvt", function (msg) {
        if (msg.length) {
            state.tracks.push(msg)
            save(state)
            state.currentAudio = msg
            var player = document.getElementById("player")
            player.src = msg
            player.load()
            emitter.emit("render")
        }
    })
}
