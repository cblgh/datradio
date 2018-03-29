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
function mod(n, m) {
      return ((n % m) + m) % m;
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
        this.time = "--:--"
        this.duration = "--:--"
    }

    createElement(time, duration) {
        this.time = time
        this.duration = duration
        return html`<div id="time">${format(this.time)}/${format(this.duration)}</div>`
    }
    
    update(time, duration) {
        console.log("nanocomponent update - time:", time)
        time = format(time)
        duration = format(duration)
        return time != this.time || duration != this.duration
    }
}

var hotkeySheet = {
    "toggle play/pause": {
        key: "spacebar",
    },
    "next track": {
        key: "n",
    },
    "previous track": {
        key: "p",
    },
    "random track": {
        key: "r",
    }
}

var commands = {
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
    "nick": {
        value: "<your nickname>",
        desc: "sets the name of your profile",
        call: function(state, emit, value) {
            state.user.name = value
        }
    },
    "desc": {
        value: "<description>",
        desc: "a description of this playlist",
        call: function(state, emit, value) {
            state.description = value
            save(state)
            emit.emit("render")
        }
    },
    "create": {
        value: "playlist-name (no spaces)",
        desc: "create a playlist",
        call: function(state, emit, value) {
            value = value.replace(" ", "-")
            state.playlists.push(value)
            window.location.hash = value
            reset(state)
            savePlaylist(state, value)
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
                var oldPlaylist = state.params.playlist ? state.params.playlist : "playlist"
                state.playlists.splice(state.playlists.indexOf(oldPlaylist), 1)
                savePlaylist(state, value).then(() => {
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
    "unsub": {
        value:  "",
        desc: "unsub from current playlist",
        call: function(state, emit, value) {
            parts = window.location.pathname.split("/remote/")
            if (parts.length <= 1) {
                return
            }
            value = prefix(parts[1])
            state.following.forEach((f, index) => {
                if (f.link === value) {
                    state.following.splice(index, 1)
                    return
                }
            })
        }
    },
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
    },
    // "clear": {
    //     value: "'yes i want to clear everything'",
    //     desc: "remove all playlists and user info",
    //     call: function(state, emit, value) {
    //     }
    // },
    // "save": {
    //     value: "",
    //     desc: "[debug] save state",
    //     call: function(state, emit, value) {
    //         save(state)
    //     }
    // },
    "del": {
        value: "track index",
        desc: "delete track from playlist",
        call: function(state, emit, value) {
            emit.emit("deleteTrack", parseInt(value))
        }
    },
    "mv": {
        value: "trackIndex newIndex",
        desc: "move a track in the current playlist",
        call: function(state, emit, value) {
            var [src, dst] = value.split(/\W+/g)
            emit.emit("moveTrack", src, dst)
        }
    }
    // "rand": {
    //     value: "",
    //     desc: "play a random track",
    //     call: function(state, emit, value) {
    //         emit.emit("randTrack")
    //     }
    // },
    // "next": {
    //     value: "",
    //     desc: "play the next track",
    //     call: function(state, emit, value) {
    //         emit.emit("nextTrack")
    //     }
    // },
    // "prev": {
    //     value: "",
    //     desc: "play the previous track",
    //     call: function(state, emit, value) {
    //         emit.emit("previousTrack")
    //     }
    // },
    // "play": {
    //     value: "track index",
    //     desc: "play track",
    //     call: function(state, emit, value) {
    //         console.log("PLEASE PLAY", parseInt(value))
    //         emit.emit("playTrack", parseInt(value))
    //     }
    // },
    // "pause": {
    //     value: "",
    //     desc: "pause the current track",
    //     call: function(state, emit, value) {
    //         emit.emit("pauseTrack")
    //     }
    // }
}

async function loadTracks(playlist) {
    var tracks = playlist.tracks
    return new Promise((resolve, reject) => {
        // TODO: refactor/clean this?
        if (playlist) {
            console.log("playlist", playlist, "archives", playlist.archives)
            var promises = playlist.archives.map((address) => {
                return new Promise((res1, rej1) => {
                    var a = new DatArchive(address)
                    var path = address.substr(70) || "/"
                    var files = await a.readdir(path)
                    var newTracks = files.filter((i) => isTrack(i))
                        .map((i) => prefix(address, i))
                        .filter((i) => {
                            return playlist.removed.indexOf(i) < 0 && tracks.indexOf(i) < 0
                        })
                    tracks = tracks.concat(newTracks)
                    res1()
                })
            })
            await Promise.all(promises)
            resolve(tracks)
        }
    })
}

async function deletePlaylist(name) {
    return await archive.unlink(`playlists/${name}.json`)
}

function createHelpSidebar() {
    var items = []
    var hotkeyItems = []
    for (var key in commands) {
        items.push({key: key, cmd: commands[key]})
    }

    for (var key in hotkeySheet) {
        hotkeyItems.push({key: key, hotkey: hotkeySheet[key].key})
    }

    function createHelpEl(p) {
        return html`<div class="help-container"><div class="help-cmd">${p.key}</div><div class="help-value">${p.cmd.value}</div><div class="help-desc">${p.cmd.desc}</div></div>`
    }

    function createHotkeyEl(p) {
        return html`<div class="hotkey-container"><div class="help-hotkey">${p.key} =</div><div class="help-value">${p.hotkey}</div></div>`
    }

    return html`<h3 id="commands"><div>commands</div><div>${items.map(createHelpEl)}</div>
       <div>hotkeys</div><div>${hotkeyItems.map(createHotkeyEl)}</div></div>`
}

var counter = new Counter()
function mainView(state, emit) {
    emit("DOMTitleChange", title + `/${state.user.name}`)
    var playlistName = state.params.playlist ? state.params.playlist : "playlist"
    return html`
        <body onkeydown=${hotkeys} style="background-color: ${state.profile.bg}!important; color: ${state.profile.color}!important;">
            <a id="fork-url" href="dat://31efd7c43603b57d18d0dcc4e2a32bf5cae08ab5930071e4da3513dbc4c60f5f/">create your own radio</div>
            <div id="grid-container">
                <ul id="playlists">
                    <h3>${state.user.name}s playlists </h3>
                    ${state.playlists.map(createPlaylistEl)}
                    ${state.following.map(createPlaylistSub)}
                </ul>
                <div class="center">
                    <h1 id="title">${title} (${playlistName})</h1>
                    <div id="description">${state.description}</div>
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
                    emit("resumeTrack")
    }

    function addForkUrl(isOwner) {
        if (!isOwner) {
            return html``
        }
    }

    function createTrack(track, index) {
        var parts = track.split("/")
        var title = parts[parts.length - 1].trim()
        return html`<li id=track-${index} onclick=${play}>${pad(index, 3)} ${title}</li>`
        
        // play the track when clicked on
        function play() {
            // current track clicked on
            if (state.trackIndex === index) {
                var player = document.getElementById("player")
                // lets resume the current track
                if (player.paused) {
                    emit("resumeTrack")
                // pause the current track
                } else {
                    emit("pauseTrack")
                }
            // we wanted to play a new track
            } else {
                emit("playTrack", index)
            }
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
            else if (e.key === "r") { emit("randTrack") }
            else if (e.key === " ") { 
                e.preventDefault()
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
    state.removed = []
    state.archives = []
    state.description = ""
    state.profile = {bg: "black", color: "#f2f2f2"}
}

async function loadPlaylists() {
    var playlists = (await archive.readdir("playlists")).filter((i) => { return i.substr(i.length - 5) === ".json" }).map((p) => p.substr(0,p.length-5))
    return playlists
}

function prefix(url, path) {
    if (path) {
        // append /
        if (url.substr(-1) != "/") {
            url += "/"
        }
        url += path
    }
    if (url.substr(0, 6) != "dat://") {
        return `dat://${url}`
    }
    return url
}

async function init(state, emitter) {
    reset(state)
    state.playlists = []
    state.following = []
    state.user = {}
    state.isOwner = false
    setInterval(function() {
        var player = document.getElementById("player")
        if (player) {
            state.time = player.currentTime
            state.duration = player.duration || 0
        }
        counter.render(state.time, state.duration)
    }, 1000)

    archive.getInfo().then((info) => {
        state.isOwner = info.isOwner
        emitter.emit("render")
    })

    state.user = JSON.parse(await archive.readFile("profile.json"))
    state.following = await Promise.all(state.user.following.map((url) => extractSub(url)))
    state.playlists = await loadPlaylists() 
    var initialPlaylist = window.location.hash ? `playlists/${window.location.hash.substr(1)}.json` : `playlists/playlist.json`
    // initialize the state with the default playlist
    loadPlaylist(archive, initialPlaylist)

    async function loadPlaylist(playlistArchive, path) {
        // try to load the user's playlist
        try {
            var playlist = JSON.parse(await playlistArchive.readFile(path))
            state.profile = playlist.profile
            state.description = playlist.description
            state.archives = playlist.archives
            state.removed = playlist.removed
            // render once before loading the tracks
            // as loading them takes a noticeable time
            // (might be premature optimization oops :^)
            emitter.emit("render")
            state.tracks = await loadTracks(playlist)
            save(state)
            // render again after having loaded the tracks
            emitter.emit("render")
        } catch (e) {
            console.error("failed to read playlist's json; malformed json?")
            console.error(e)
        }
    }

    // load the playlist we clicked on
    emitter.on("navigate", function()  {
        var arch = archive
        var playlistName = state.params.playlist ? state.params.playlist : "playlist"
        if (state.route === remoteRoute) {
            arch = new DatArchive(state.params.url)
        }
        loadPlaylist(arch, `playlists/${playlistName}.json`)
    })

    emitter.on("playTrack", function(index) {
        console.log("playTrack received this index: " + index, typeof index)
        state.trackIndex = index
        playTrack(state.tracks[index], index)
    })

    emitter.on("randTrack", function() {
        var index = Math.floor(Math.random() * state.tracks.length)
        emitter.emit("playTrack", index)
    })

    emitter.on("resumeTrack", function() {
        var player = document.getElementById("player")
        removeClass("paused")
        addClass(state.trackIndex, "playing")
        player.play()
    })

    emitter.on("pauseTrack", function() {
        var player = document.getElementById("player")
        console.log("pauseTrack!!")
        removeClass("playing")
        addClass(state.trackIndex, "paused")
        player.pause()
    })

    emitter.on("nextTrack", function() {
        // TODO: add logic for shuffle :)
        console.log("b4, track index is: " + state.trackIndex)
        state.trackIndex = mod((state.trackIndex + 1), state.tracks.length)
        console.log("after, track index is: " + state.trackIndex)
        playTrack(state.tracks[state.trackIndex], state.trackIndex)
    })

    emitter.on("previousTrack", function() {
        // TODO: add logic for shuffle :)
        state.trackIndex = mod((state.trackIndex - 1), state.tracks.length) 
        playTrack(state.tracks[state.trackIndex], state.trackIndex)
    })

    emitter.on("moveTrack", function(srcIndex, dstIndex) {
        console.log(`move from ${srcIndex} to ${dstIndex}`)
        var track = state.tracks.splice(srcIndex, 1)[0]
        state.tracks.splice(dstIndex, 0, track)
        emitter.emit("render")
    })

    emitter.on("deleteTrack", function(index) {
        var emitNextTrack = false
        state.trackIndex = parseInt(state.trackIndex)
        index = parseInt(index)
        var removedTrack = state.tracks.splice(index, 1)[0]
        state.removed.push(removedTrack)
        save(state)
        if (state.trackIndex >= index) {
            var emitNextTrack = (state.trackIndex === index && state.tracks.length > 0)
            state.trackIndex = state.trackIndex - 1
            // if current was deleted, play next
            if (emitNextTrack) { emitter.emit("nextTrack") }
        }
    })
}

function addClass(index, cssClass) {
    console.log(`to track-${index} add ${cssClass}`)
    document.getElementById(`track-${index}`).classList.add(cssClass)
}

function removeClass(cssClass) {
    var items =  document.getElementsByClassName(cssClass)
    for (var i = 0; i < items.length; i++) {
        var item = items[i]
        if (item) {
            item.classList.remove(cssClass)
        }
    }
}

function playTrack(track, index) {
    removeClass("playing")
    removeClass("paused")
    addClass(index, "playing")

    console.log(`playing ${track}`)
    var player = document.getElementById("player")
    player.src = track
    player.load()
    player.play()
    var duration = player.duration || 0
    counter.render(player.currentTime, duration)
}

async function save(state) {
    var playlistName = state.params.playlist ? state.params.playlist : "playlist"
    console.log(`saving ${state.tracks[state.tracks.length - 1]} to ${playlistName}.json`)
    savePlaylist(state, playlistName)
    archive.writeFile(`profile.json`, JSON.stringify(
        {name: state.user.name, following: state.following.map((o) => o.link)},
    null, 2))
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
    var playlistName = input.substr(71)
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

// thx to 0xade & rotonde for this wonderful function <3
function normalizeArchive(url) {     
  if (!url)
    return null;

  // This is microoptimized heavily because it's called often.
  // "Make slow things fast" applies here, but not literally:
  // "Make medium-fast things being called very often even faster."
  
  if (
    url.length > 6 &&
    url[0] == 'd' && url[1] == 'a' && url[2] == 't' && url[3] == ':'
  )
    // We check if length > 6 but remove 4.
    // The other 2 will be removed below.
    url = url.substring(4);
  
  if (
    url.length > 2 &&
    url[0] == '/' && url[1] == '/'
  )
    url = url.substring(2);

  var index = url.indexOf("/");
  url = index == -1 ? url : url.substring(0, index);

  url = url.toLowerCase().trim();
  return url;
}

function savePlaylist(state, name) {
    return archive.writeFile(`playlists/${name}.json`, JSON.stringify({
        archives: state.archives, 
        tracks: state.tracks,
        removed: state.removed,
        description: state.description,
        profile: state.profile}, null, 2))
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
                var url = normalizeArchive(msg)
                if (!url || url.length != 64) {
                    return
                }
                // assume it's a dat archive folder, and try to read its contents

                var a = new DatArchive(msg)
                // length of dat:// + hash = 70
                var path = msg.substr(70) || "/"
                if (state.archives.indexOf(msg) < 0) {
                    state.archives.push(msg)
                }
                a.readdir(path).then((dir) => {
                    dir.filter((i) => isTrack(i)).forEach((i) => {
                        var p = prefix(url, i)
                        state.tracks.push(p)
                    })
                    emitter.emit("render")
                    save(state)
                })
            }
            save(state)
            emitter.emit("render")
        }
    })

    function handleCommand(command, value) {
        if (command in commands) {
            commands[command].call(state, emitter, value)
            emitter.emit("render")
            save(state)
        }
    }
}
