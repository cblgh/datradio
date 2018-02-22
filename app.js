var html = require("choo/html")
var devtools = require("choo-devtools")
var Nanocomponent = require("nanocomponent")
var choo = require("choo")
var css = require("sheetify")

css("./links/style.css")

var remoteRoute = "/remote/:url/:playlist"

var archive = new DatArchive(window.location.toString())
var title = "datradio"

var app = choo()
app.use(devtools())
app.use(init)
app.use(inputHandler)
app.route(remoteRoute, mainView)
app.route("/:playlist", mainView)
app.mount("body")

// fix modulo for negative integers
Number.prototype.mod = function(n) {
        return ((this%n)+n)%n;
}

function format(durationStr) {
    durationStr = parseInt(durationStr)
    var min = pad(parseInt(durationStr / 60), 2)
    var sec = pad(parseInt(durationStr % 60), 2)
    return `${min}:${sec}`
}

class Counter extends Nanocomponent {
    constructor() {
        super()
        this.current = "--:--"
        this.duration = "--:--"
    }

    createElement(time, duration) {
        this.current = time
        this.duration = duration
        return html`<div id="time">${format(this.current)}/${format(this.duration)}</div>`
    }
    
    update(time, duration) {
        console.log("nanocomponent update - time:", time)
        time = format(time)
        duration = format(duration)
        return time != this.current || duration != this.duration
    }
}

var commands = {
    "create": {
        value: "playlist-name (no spaces)",
        desc: "create a playlist",
        call: function(state, emit, value) {
            value = value.replace(" ", "-")
            state.playlists.push(value)
            window.location.hash = value
            reset(state)
            savePlaylist(value, state)
            .then(() => {
                save(state)
                emit.emit("render")
            })
        }
    },
    "delete-playlist": {
        value: "playlist-name",
        desc: "delete the playlist",
        call: function(state, emit, value) {
            // don't delete the default playlist
            if (value === "playlist") {
                return
            }
            deletePlaylist(value)
            .then(loadPlaylists)
            .then((playlists) => {
                state.playlists = playlists
                // handle deleting the current playlist 
                if (value === state.params.playlist) {
                    window.location.hash = "playlist"
                }
                emit.emit("render")
            })
        }
    },
    "rename": {
        value: "new-playlist-name (no spaces)",
        desc: "rename the current playlist",
        call: function(state, emit, value) {
            if (value) {
                var oldPlaylist = state.params.playlist
                state.playlists.splice(state.playlists.indexOf(oldPlaylist), 1)
                savePlaylist(value, state).then(() => {
                    deletePlaylist(oldPlaylist)
                    .then(loadPlaylists)
                    .then((playlists) => {
                        state.playlists = playlists
                        window.location.hash = value.replace(" ", "")
                        emit.emit("render")
                    })
                })
            }
        }
    },
    "save": {
        value: "",
        desc: "[debug] save state",
        call: function(state, emit, value) {
            save(state)
        }
    },
    "prev": {
        value: "",
        desc: "play the previous track",
        call: function(state, emit, value) {
            emit.emit("previousTrack")
        }
    },
    "next": {
        value: "",
        desc: "play the next track",
        call: function(state, emit, value) {
            emit.emit("nextTrack")
        }
    },
    "del": {
        value: "track index",
        desc: "delete track from playlist",
        call: function(state, emit, value) {
            emit.emit("deleteTrack", parseInt(value))
        }
    },
    "pause": {
        value: "",
        desc: "pause the current track",
        call: function(state, emit, value) {
            emit.emit("pauseTrack")
        }
    },
    "play": {
        value: "track index",
        desc: "play track",
        call: function(state, emit, value) {
            emit.emit("playTrack", parseInt(value))
        }
    },
    "bg": {
        value: "#1d1d1d",
        desc: "change the background colour",
        call: function(state, emit, value) {
            state.profile.bg = value
        }
    },
    "color": {
        value:  "#f2f2f2",
        desc: "change the font colour",
        call: function(state, emit, value) {
            state.profile.color = value
        }
    },
    // "unsub": {
    //     value:  "",
    //     desc: "unsub from current playlist",
    //     call: function(state, emit, value) {
    //         console.log("unsub unimplemented")
    //         var index = state.following.indexOf(value)
    //         if (index >= 0) {
    //             state.following.splice(index, index)
    //             save(state)
    //         }
    //     }
    // },
    "sub": {
        value: "dat://1337...7331/#playlist-name",
        desc: "subscribe to a playlist",
        call: function(state, emit, value) {
            extractSub(value).then((info) => {
                state.following.push(info)
                emit.emit("render")
                save(state)
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

function deletePlaylist(name) {
    return await archive.unlink(`playlists/${name}.json`)
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

var counter = new Counter()
function mainView(state, emit) {
    emit("DOMTitleChange", title)
    var playlistName = state.params.playlist ? state.params.playlist : "playlist"
    return html`
        <body onkeydown=${hotkeys} style="background-color: ${state.profile.bg}!important; color: ${state.profile.color}!important;">
            <div id="grid-container">
                <ul id="playlists">
                    <h3> playlists </h3>
                    ${state.playlists.map(createPlaylistEl)}
                    ${state.following.map(createPlaylistSub)}
                </ul>
                <div class="center">
                    <h1 id="title">${title} (${playlistName})</h1>
                    <input id="terminal" placeholder="i love tracks" onkeydown=${keydown}>
                    <ul id="tracks">
                    ${state.tracks.map(createTrack)}
                    </ul>
                    ${counter.render(state.time, state.duration)}
                </div>
                ${createHelpSidebar()}
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
        return html`<li id=track-${index} onclick=${play}>${pad(index, 3)} ${title}</li>`
        
        // play the track when clicked on
        function play() {
            emit("playTrack", index)
        }
    }

    function trackEnded(evt) {
        emit("nextTrack")
    }

    function hotkeys(e) {
        var term = document.getElementById("terminal")
        var player = document.getElementById("player")
        if (document.activeElement != term) {
            if (e.key === "n") { emit("nextTrack") }
            else if (e.key === "p") { emit("previousTrack") }
            else if (e.key === " ") { 
                if (player.paused) emit("resumeTrack")
                else emit("pauseTrack")
            }
        }
    }

    function keydown(e) {
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

function reset(state) {
    state.time = 0
    state.duration = 0
    state.trackIndex = 0
    state.tracks = []
    state.profile = {bg: "black", color: "#f2f2f2"}
}

async function loadPlaylists() {
    var playlists = (await archive.readdir("playlists")).filter((i) => { return i.substr(i.length - 5) === ".json" }).map((p) => p.substr(0,p.length-5))
    return playlists
}

async function init(state, emitter) {
    reset(state)
    state.playlists = []
    state.following = []
    setInterval(function() {
        var player = document.getElementById("player")
        if (player) {
            state.time = player.currentTime
            state.duration = player.duration || 0
        }
        counter.render(state.time, state.duration)
    }, 1000)

    var followUrls = JSON.parse(await archive.readFile("profile.json")).following
    state.following = await Promise.all(followUrls.map((url) => extractSub(url)))
    console.log("pls fix playlists")
    state.playlists = await loadPlaylists() 
    console.log("why u no work")
    var initialPlaylist = window.location.hash ? `playlists/${window.location.hash.substr(1)}.json` : `playlists/playlist.json`
    // initialize the state with the default playlist
    loadPlaylist(archive, initialPlaylist)

    async function loadPlaylist(playlistArchive, path) {
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
        console.log("playTrack received this index: " + index, typeof index)
        state.trackIndex = index
        playTrack(state.tracks[index], index)
    })

    emitter.on("resumeTrack", function() {
        var player = document.getElementById("player")
        player.play()
    })

    emitter.on("pauseTrack", function() {
        var player = document.getElementById("player")
        player.pause()
    })

    emitter.on("nextTrack", function() {
        // TODO: add logic for shuffle :)
        console.log("b4, track index is: " + state.trackIndex)
        state.trackIndex = (state.trackIndex + 1) % state.tracks.length 
        console.log("after, track index is: " + state.trackIndex)
        playTrack(state.tracks[state.trackIndex], state.trackIndex)
    })

    emitter.on("previousTrack", function() {
        // TODO: add logic for shuffle :)
        state.trackIndex = (state.trackIndex - 1) % state.tracks.length 
        playTrack(state.tracks[state.trackIndex], state.trackIndex)
    })


    emitter.on("deleteTrack", function(index) {
        var emitNextTrack = false
        state.trackIndex = parseInt(state.trackIndex)
        index = parseInt(index)
        state.tracks.splice(index, 1)
        if (state.trackIndex >= index) {
            var emitNextTrack = (state.trackIndex === index && state.tracks.length > 0)
            state.trackIndex = state.trackIndex - 1
            // if current was deleted, play next
            if (emitNextTrack) { emitter.emit("nextTrack") }
        }
    })
}

function playTrack(track, index) {
    var prev = document.getElementsByClassName("playing")[0]
    if (prev) {
        prev.classList.remove("playing")
    }
    document.getElementById(`track-${index}`).classList.add("playing")

    console.log(`playing ${track}`)
    var player = document.getElementById("player")
    player.src = track
    player.load()
    player.play()
    var duration = player.duration || 0
    counter.render(player.currentTime, duration)
}

async function save(state) {
    console.log(`saving ${state.tracks[state.tracks.length - 1]} to ${state.params.playlist}.json`)
    savePlaylist(state.params.playlist, state)
    archive.writeFile(`profile.json`, JSON.stringify({name: "cpt.placeholder", following: state.following.map((o) => o.link)}, null, 2))
}

async function extractSub(url) {
    return {
        source: url.substr(6, 64),
        playlist: extractPlaylist(url),
        name: await getProfileName(url),
        link: url
    }
}

async function getProfileName(datUrl) {
    var remote = new DatArchive(datUrl)
    var profile = JSON.parse(await remote.readFile("profile.json"))
    return profile.name
}

function extractPlaylist(input) {
    var playlistName = input.substr(72)
    if (playlistName.length === 0) {
        return "playlist"
    }
    return playlistName
}


var audioRegexp = new RegExp("\.[wav|ogg|mp3]$")
function isTrack(msg) {
    return audioRegexp.test(msg)
}

function pad(num, size) {
    var s = num+"";
    while (s.length < size) s = "0" + s;
    return s;
}

function normalizeArchive(str) {     
    // remove trailing slash
    return str.replace(/\/$/, "")
} 

function savePlaylist(name, state) {
    return archive.writeFile(`playlists/${name}.json`, JSON.stringify({tracks: state.tracks, profile: state.profile}, null, 2))
}

function inputHandler(state, emitter) {
    emitter.on("inputEvt", function (msg) {
        if (msg.length) {
            if (msg[0] === ".") {
                var sep = msg.indexOf(" ")
                var cmd = sep >= 0 ? msg.substr(1, sep-1).trim() : msg.substr(1)
                var val = sep >= 0 ? msg.substr(sep).trim() : ""
                handleCommand(cmd, val)
            } else {
                if (isTrack(msg)) {
                    state.tracks.push(msg)
                } else {
                    // assume it's a dat archive folder, and try to read its contents
                    var a = new DatArchive(msg)
                    console.log("assuming a folder full of stuff!")
                    a.readdir("/").then((dir) => {
                        dir.filter((i) => isTrack(i)).map((i) => {
                            var p = normalizeArchive(msg) + "/" + i
                            state.tracks.push(p)
                        })
                        emitter.emit("render")
                        save(state)
                    })
                }
                save(state)
                emitter.emit("render")
            }
        }
    })

    function handleCommand(command, value) {
        if (command in commands) {
            commands[command].call(state, emitter, value)
            save(state)
            emitter.emit("render")
        }
    }
}
