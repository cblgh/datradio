var html = require("choo/html")
var devtools = require("choo-devtools")
var choo = require("choo")
var css = require("sheetify")

css("./links/style.css")

var remoteRoute = "/remote/:url/:playlist"

var archive = new DatArchive(window.location.toString())

var app = choo()
app.use(devtools())
app.use(init)
app.use(inputHandler)
app.route(remoteRoute, mainView)
app.route("/:playlist", mainView)
app.mount("body")

var commands = {
    "bg": {
        value: "#1d1d1d",
        desc: "change the background colour",
        call: function(state, value) {
            state.profile.bg = value
        }
    },
    "color": {
        value:  "#f2f2f2",
        desc: "change the font colour",
        call: function(state, value) {
            state.profile.color = value
        }
    },
    "unsub": {
        value:  "",
        desc: "unsub from current playlist",
        call: function(state, value) {
            console.log("unsub unimplemented")
            // var index = state.following.indexOf(value)
            // if (index >= 0) {
            //     state.following.splice(index, index)
            //     save(state)
            // }
        }
    },
    "sub": {
        value: "dat://1337...7331/#playlist-name",
        desc: "subscribe to a playlist",
        call: function(state, value) {
            getProfileName(value).then((name) => {
                var playlist = extractPlaylist(value)
                state.following.push({
                    source: value.substr(6, 64),
                    playlist: playlist,
                    name: name,
                    link: value
                })
                emitter.emit("render")
                // save(state)
            })
        }
    }
}

async function loadTracks(state, emit, playlist) {
    if (playlist) {
        var p = JSON.parse(await archive.readFile(`playlists/${playlist}`))
        state.tracks = p.tracks
    }
}

function createHelpSidebar() {
    var items = []
    for (var key in commands) {
        items.push({key: key, cmd: commands[key]})
    }
    function createHelpEl(p) {
        return html`<div class="help-container"><div class="help-cmd">${p.key}</div><div class="help-value">${p.cmd.value}</div><div class="help-desc">${p.cmd.desc}</div></div>`
    }
    return html`<h3 id="commands"><div>commands</div>${items.map(createHelpEl)}</div>`
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
                ${state.following.map(createPlaylistSub)}
                </ul>
                <ul id="tracks">
                ${state.tracks.map(createTrack)}
                </ul>
                <input id="terminal" placeholder="i love tracks" onkeydown=${keydown}>
                ${createHelpSidebar()}
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
        var title = parts[parts.length - 1].trim()
        return html`<li id=track-${index} onclick=${play}>${title}</li>`
        
        // play the track when clicked on
        function play() {
            emit("playTrack", index)
        }
    }

    function trackEnded(evt) {
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
    return html`<li><a href="/#${playlist}">${playlist}</a></li>`
}

function createPlaylistSub(sub) {
    var playlist = `${sub.name}/${sub.playlist}`
    return html`<li><a href="/remote/${sub.source}/${sub.playlist}">+ ${playlist}</a></li>`
}


async function init(state, emitter) {
    state.trackIndex = 0
    state.tracks = []
    state.playlists = []
    state.following = []
    state.profile = {bg: "#331d1d", color: "#f2f2f2"}
    
    state.playlists = (await archive.readdir("playlists")).filter((i) => { return i.substr(i.length - 5) === ".json" }).map((p) => p.substr(0,p.length-5))
   
    var initialPlaylist = window.location.hash ? `playlists/${window.location.hash.substr(1)}.json` : `playlists/playlist.json`
    // initialize the state with the default playlist
    loadPlaylist(archive, initialPlaylist)

    async function loadPlaylist(playlistArchive, path) {
        console.log("trying to load playlist", name)
        // try to load the user's playlist
        try {
            var playlist = JSON.parse(await playlistArchive.readFile(path))
            state.tracks = playlist.tracks
            state.profile = playlist.profile
            emitter.emit("render")
        } catch (e) {
            console.error("failed to read playlist.json; malformed json?")
            console.error(e)
        }
    }

    // load the playlist we clicked on
    emitter.on("navigate", function()  {
        var arch = archive
        if (state.route === remoteRoute) {
            arch = new DatArchive(state.params.url)
        }
        loadPlaylist(arch, `playlists/${state.params.playlist}.json`)
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
    archive.writeFile(`playlists/${state.params.playlist}.json`, JSON.stringify({tracks: state.tracks, profile: state.profile}, null, 2))
    archive.writeFile(`profile.json`, JSON.stringify({name: "cpt.placeholder", playlists: []}, null, 2))
}

async function getProfileName(datUrl) {
    var remote = new DatArchive(datUrl)
    var profile = JSON.parse(await remote.readFile("profile.json"))
    return profile.name
}

function extractPlaylist(input) {
    var playlistName = input.substr(73)
    if (playlistName.length === 0) {
        return "playlist"
    }
    return playlistName
}

function inputHandler(state, emitter) {
    emitter.on("inputEvt", function (msg) {
        if (msg.length) {
            if (msg[0] === ".") {
                var sep = msg.indexOf(" ")
                var cmd = msg.substr(1, sep-1).trim()
                var val = msg.substr(sep).trim()
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
        if (command in commands) {
            commands[command].call(state, value)
            save(state)
            emitter.emit("render")
        }
    }
}
