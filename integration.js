const WebSocket = require('./ReconnectingWebSocket.js');
const fs = require('fs');
const mysql = require('mysql');

const pool = mysql.createPool({
    host: "localhost",
    user: "bullbot",
    password: fs.readFileSync('/srv/gsibot/password.txt', "utf8"),
    database: "bullbot"
});

const wss = new WebSocket('wss://chatbot.admiralbulldog.live/clrsocket', {
    cert: fs.readFileSync('/etc/letsencrypt/live/chatbot.admiralbulldog.live/cert.pem'),
    key: fs.readFileSync('/etc/letsencrypt/live/chatbot.admiralbulldog.live/privkey.pem'),
    rejectUnauthorized: false
});

wss.reconnectInterval = 30000;

var d2gsi = require('dota2-gsi');
var server = new d2gsi();

const heroSounds = {
    "abaddon": "https://i.nuuls.com/O4F8-.mp3",
    "alchemist": "https://i.nuuls.com/fQBGb.mp3",
    "axe": "https://i.nuuls.com/TFMmN.mp3",
    "bane": "https://i.nuuls.com/WPQHh.mp3",
    "furion": "https://i.nuuls.com/N8Wvj.mp3",
    "invoker": "https://i.nuuls.com/R4X8V.mp3",
    "lone_druid": "https://i.nuuls.com/_GPOJ.mp3",
    "venomancer": "https://i.nuuls.com/8LrO9.mp3"
}

var passiveMidas = 0;
var recentHealth = Array(25);
var winPercentExists = false;
var betsExist = false;
var digReminder = true;
const correctAuth = process.argv.slice(2)[0];
const deathSelections = ["https://i.nuuls.com/UOAPG.mp3", "https://i.nuuls.com/zVZoj.mp3"]
const roonsSelections = ["https://i.nuuls.com/jixVp.mp3"] // , "https://i.nuuls.com/ULN7p.mp3"
console.log(correctAuth);
recentHealth.fill(100);


server.events.on('newclient', function(client) {
    console.log("New client connection, IP address: " + client.ip);
    if (client.auth && client.auth.token) {
        console.log("Auth token: " + client.auth.token);
    } else {
        console.log("No Auth token");
    }

    client.on('player:activity', function(activity) {
        if (client.gamestate.map.customgamename !== '' || 'team2' in client.gamestate.player) {
            return;
        }
        console.log("New activity: " + activity);
        if (activity == "playing") {
            if (client.gamestate.map.game_time < 20 && !(betsExist)) {
                betsExist = true;
                wss.send(JSON.stringify({
                    "event": "open_bets"
                }))
            }

            setTimeout(function() {
                //playSound("https://i.nuuls.com/cScBj.mp3", 35)
            }, 2000);
        }
    });

    client.on('map:roshan_state', function(newState) {
        // `alive`, `respawn_base` and `respawn_variable`
        // console.log("New roshan state: " + newState);
        if (newState == "respawn_variable") {
            return;
        }

        setTimeout(function() {
            playSound("https://i.nuuls.com/LW1ov.mp3", 40)
        }, 2500)
    });

    client.on('hero:level', function(level) {
        // console.log(client.gamestate.hero.name);
        // console.log("Now level " + level);
        // console.log(wss.readyState);
    });

    client.on('hero:name', function(name) {
        if (client.auth.token != correctAuth) {
            return;
        }

        heroName = name.substr(14);
        console.log("Playing hero " + heroName);
        if (heroName in heroSounds) {
            playSound(heroSounds[heroName]);
        }
    })

    client.on('newdata', function(data) {
        if (client.auth.token != correctAuth) {
            return;
        }

        try {
            for (ability in data.abilities) {
                if (data["abilities"][ability]["name"] === "seasonal_ti9_shovel") {
                    if (data["abilities"][ability]["cooldown"] === 0) {
                        if ((Math.floor(Math.random() * 2) == 0) && !(digReminder)) {
                            playSound("https://i.nuuls.com/A_FLh.mp3", 50);
                        }
                        digReminder = true;
                    } else {
                        digReminder = false;
                    }
                }
            }

            if (!('radiant_win_chance' in data.map) && winPercentExists) {
                // stopWin();
                winPercentExists = false;
            }

            if ('radiant_win_chance' in data.map && data.map.radiant_win_chance != '') {
                if (!(winPercentExists)) {
                    winPercentExists = true;
                    // wss.send(JSON.stringify({
                    //   "event": "win_percent_open"
                    // }))
                }
                isDraw = false;
                isRadiant = true;
                winChance = data.map.radiant_win_chance;
                if (winChance == 50) {
                    isDraw = true;
                } else if (winChance < 50) {
                    isRadiant = false;
                    winChance = 100 - winChance;
                }
                // updatePercent(isRadiant, isDraw, winChance.toString() + "%");
            }

            if ('team2' in data.player) {
                return;
            }
            if (data.hero.respawn_seconds > 0) {
                recentHealth.fill(100);
                passiveMidas = -25;
                return;
            } // Don't do anything if dead

            checkMidas(data);
            checkHealth(data);

        } catch (e) { // Sometimes TypeError
            if (!(e instanceof TypeError)) {
                console.log(e);
            }
        }
    })

    client.on('map:paused', function(isPaused) {
        if (client.auth.token != correctAuth || !isPaused) {
            return;
        }
        // playSound("residentsleeper");
    })

    client.on('map:clock_time', function(time) {
        if (client.auth.token != correctAuth) {
            return;
        }

        if (client.gamestate.map.customgamename !== '' || 'team2' in client.gamestate.player) {
            return;
        }

        // Skip pregame
        if ((time + 30) % 300 == 0 && (time + 30) > 0) {
            playSound(roonsSelections[Math.floor(Math.random() * roonsSelections.length)]);
        }

        if (time == 15 && client.gamestate.previously.map.clock_time < 15) {
            wss.send(JSON.stringify({
                "event": "lock_bets"
            }))
        }
    })

    client.on('hero:smoked', function(issmoked) {
        if (client.auth.token != correctAuth) {
            return;
        }

        if (issmoked && Math.random() >= 0.8) {
            playSound("https://i.nuuls.com/FNQIW.mp3");
        }
    })

    client.on('hero:alive', function(isAlive) {
        if (client.auth.token != correctAuth || client.gamestate.map.customgamename !== '' || 'team2' in client.gamestate.player) {
            return;
        }
        if (isAlive && (Math.floor(Math.random() * 3) == 1)) {
            setTimeout(function() {
                playSound("https://i.nuuls.com/8hdLJ.mp3");
            }, 3000);
        }

        // Select either 'washed up' from morphling or 'questionable at the best' from OD
        if (!isAlive && (Math.floor(Math.random() * 22) == 1)) {
            playSound(deathSelections[Math.floor(Math.random() * deathSelections.length)], 40);
        }
    })

    client.on('map:win_team', function(team) {
        if (client.auth.token != correctAuth) {
            return;
        }

        console.log("Winning team: " + team)
        stopWin();
        if (client.gamestate.map.customgamename !== '' || 'team2' in client.gamestate.player) {
            return;
        }
        if (client.gamestate.player.team_name == team) {
            playSound("https://i.nuuls.com/U5ru7.mp3");
        } else {
            playSound("https://i.nuuls.com/w9YIR.mp3");
        }

        wss.send(JSON.stringify({
            "event": "end_bets",
            "data": {
                "winning_team": team,
                "player_team": client.gamestate.player.team_name
            }
        }))
        betsExist = false;
    })

    client.on('hero:has_debuff', function(name) {
        // console.log("Has debuff " + name)
    })

    client.on('hero:buyback_cooldown', function(name) {
        // console.log("Cooldown is " + name)
    })

    client.on('abilities:ability0:can_cast', function(can_cast) {
        // console.log(client.gamestate);
        if (!can_cast && client.gamestate.hero.name == 'npc_dota_hero_lone_druid') {
            // playSound("https://i.nuuls.com/llXGx.mp3");
        }
    });
});

function checkHealth(data) {
    // console.log(recentHealth.reduce((a, b) => a + b, 0));
    const healthPct = data.hero.health_percent;
    try {
        recentHealth.shift();
        recentHealth.push(healthPct);

        if (
            (data.hero.health - data.previously.hero.health > 200) && (Math.floor(Math.random() * 3) == 1) &&
            (data.previously.hero.health != 0) && (healthPct - data.previously.hero.health_percent > 5)
        ) {
            playSound("https://i.nuuls.com/uh5vW.mp3");
        }

    } catch (e) { // Sometimes TypeError
        if (!(e instanceof TypeError)) {
            console.log(e);
        }
    }
}

function checkMidas(data) {
    try {
        for (let [slot, item] of Object.entries(data.items)) {
            // Skip if not midas
            if (item.name != 'item_hand_of_midas') {
                continue;
            }
            // Skip stash/if midas is on cooldown
            if (!slot.startsWith("slot") || item.cooldown > 0) {
                passiveMidas = 0;
                continue;
            }

            if (passiveMidas == 25) {
                playSound("https://i.nuuls.com/aNjaD.mp3");
                passiveMidas = -50;
            }
            passiveMidas += 1;
        }
    } catch (e) { // Sometimes TypeError
        if (!(e instanceof TypeError)) {
            console.log(e);
        }
    }
}

function playSound(url, volume = 100) {
    if (wss.readyState !== 1) {
        console.log("Not ready");
    }

    pool.query("SELECT volume FROM tb_playsound WHERE link = ?", [url], function(err, res) {
        if (res && res.length >= 1) {
            volume = res[0].volume;
        }

        volume = Math.round(volume * 0.4); // Playsound volumes are on global 0.4 scale

        console.log("Playing " + url + " with volume " + volume);
        wss.send(JSON.stringify({
            "event": "play_sound",
            "data": {
                "link": url,
                "volume": volume
            }
        }))
    });
}

function updatePercent(isRadiant, isDraw, winPct) {
    if (wss.readyState !== 1) {
        console.log("Not ready");
    }
    wss.send(JSON.stringify({
        "event": "win_percent_change",
        "data": {
            "isRadiant": isRadiant,
            "isDraw": isDraw,
            "winPct": winPct
        }
    }))
}

function stopWin() {
    if (wss.readyState !== 1) {
        console.log("Not ready");
    }
    wss.send(JSON.stringify({
        "event": "win_percent_close"
    }))
}
