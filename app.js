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
app.route("/:playlist", mainView)
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
    return html`
        <body style="background-color: ${state.profile.bg}!important; color: ${state.profile.color}!important;">
            <div id="grid-container">
                <h1 id="title">piratradio</h1>
                <ul id="playlists">
                <h3> playlists </h3>
                ${state.playlists.map(createPlaylistEl)}
                </ul>
                <ul id="tracks">
                ${state.tracks.map(createTrack)}
                </ul>
                <input id="terminal" placeholder="i love tracks" onkeydown=${keydown}>
                <div id="toggle" onclick=${togglePlayer}>toggle player</div>
                <audio id="player" onended=${trackEnded} controls="controls" >
                    Yer browser dinnae support the audio element :(
                </audio>
            </div>
        </body>
        `
    function togglePlayer() {
        var player = document.getElementById("player")
        player.style.display = player.style.display == "block" ? "none" : "block"
    }

    function createTrack(track, index) {
        var parts = track.split("/")
        var title = parts[parts.length - 1]
        return html`<li id=track-${index} onclick=${play}>${title}</li>`
        
        // play the track when clicked on
        function play() {
            emit("playTrack", index)
        }
    }

    function trackEnded(evt) {
        console.log("wow player stopped playing?")
        emit("nextTrack")
    }

    function keydown(e) {
        console.log(e)
        if (e.key === "Enter") {
            emit("inputEvt", e.target.value)
            e.target.value = ""
        }
    }
}

function createPlaylistEl(playlist) {
    return html`<li><a href="#${playlist}">${playlist}</a></li>`
}


async function init(state, emitter) {
    state.trackIndex = 0
    state.tracks = []
    state.playlists = []
    state.profile = {bg: "#331d1d", color: "#f2f2f2"}
    
    state.playlists = (await archive.readdir("playlists")).filter((i) => { return i.substr(i.length - 5) === ".json" }).map((p) => p.substr(0,p.length-5))
   
    var initialPlaylist = window.location.hash ? `playlists/${window.location.hash.substr(1)}.json` : `playlists/playlist.json`
    // initialize the state with the default playlist
    loadPlaylist(initialPlaylist)

    function loadPlaylist(path) {
        console.log("trying to load playlist", name)
        // try to load the user's playlist
        try {
            var playlist = JSON.parse(await archive.readFile(path))
            state.tracks = playlist.tracks
            emitter.emit("render")
        } catch (e) {
            console.error("failed to read playlist.json; malformed json?")
            console.error(e)
        }
    }

    // load the playlist we clicked on
    emitter.on("navigate", function()  {
        loadPlaylist(`playlists/${state.params.playlist}.json`)
    })

    emitter.on("playTrack", function(index) {
        console.log("playTrack received this index: " + index)
        state.trackIndex = index
        playTrack(state.tracks[index])
    })

    emitter.on("nextTrack", function() {
        // TODO: add logic for shuffle :)
        console.log("b4, track index is: " + state.trackIndex)
        state.trackIndex = (state.trackIndex + 1) % state.tracks.length 
        console.log("after, track index is: " + state.trackIndex)
        playTrack(state.tracks[state.trackIndex])
    })
}

function playTrack(track) {
    console.log(`playing ${track}`)
    var player = document.getElementById("player")
    player.src = track
    player.load()
    player.play()
}

async function save(state) {
    console.log(`saving ${state.tracks[state.tracks.length - 1]} to ${state.params.playlist}.json`)
    archive.writeFile(`playlists/${state.params.playlist}.json`, JSON.stringify({tracks: state.tracks}, null, 2))
}

function inputHandler(state, emitter) {
    emitter.on("inputEvt", function (msg) {
        if (msg.length) {
            if (msg[0] === ".") {
                var sep = msg.indexOf(" ")
                var cmd = msg.substr(1, sep-1).trim()
                var val = msg.substr(sep)
                handleCommand(cmd, val)
            } else {
                state.tracks.push(msg)
                save(state)
                var player = document.getElementById("player")
                player.src = msg
                player.load()
                emitter.emit("render")
            }
        }
    })

    function handleCommand(command, value) {
        if (command === "bg") {
            console.log("set profile bg")
            state.profile.bg = value
        } else if (command === "color") {
            console.log("set profile color")
            state.profile.color = value
        }
        emitter.emit("render")
        console.log("command: ", command)
        console.log(";"+command+";")
        console.log("value: ", value)
    }
}
