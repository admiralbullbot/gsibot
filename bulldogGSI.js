const WebSocket = require('./ReconnectingWebSocket.js');
const fs = require('fs');
const { Pool } = require('pg');

const pool = new Pool({
    host: '/var/run/postgresql',
    database: 'pajbot',
});

pool.on('connect', (client) => {
    client.query('SET search_path TO pajbot1_bulldog, public');
});

const wss = new WebSocket('wss://chatbot.admiralbulldog.live/clrsocket', {
    rejectUnauthorized: false,
});

wss.reconnectInterval = 30000;

var d2gsi = require('dota2-gsi');
var server = new d2gsi();

var passiveMidas = 0;
var recentHealth = Array(25);
var winPercentExists = false;
var betsExist = false;
var digReminder = true;
const correctAuth = process.argv.slice(2)[0];
const deathSelections = [
    'https://admiralbullbot.github.io/playsounds/files/new/questionable.ogg',
    'https://admiralbullbot.github.io/playsounds/files/bulldog/washedup.ogg',
    'https://admiralbullbot.github.io/playsounds/files/vadikus/deth.ogg'
];

var defaultRoons = 'https://admiralbullbot.github.io/playsounds/files/bulldog/roons.ogg';
const roonsSelections = [defaultRoons] // 'https://admiralbullbot.github.io/playsounds/files/new/xqcroons.ogg']

console.log(correctAuth);
recentHealth.fill(100);

server.events.on('newclient', function (client) {
    console.log('New client connection, IP address: ' + client.ip);
    if (client.auth && client.auth.token) {
        console.log('Auth token: ' + client.auth.token);
    } else {
        console.log('No Auth token');
    }

    client.on('player:activity', function (activity) {
        if (
            client.gamestate.map.customgamename !== '' ||
            'team2' in client.gamestate.player ||
            client.auth.token != correctAuth
        ) {
            return;
        }
        console.log('New activity: ' + activity);
        if (activity == 'playing') {
            if (
                client.gamestate.map.game_time < 20 &&
                client.gamestate.map.name == 'start'
            ) {
                betsExist = true;
                wss.send(
                    JSON.stringify({
                        event: 'open_bets',
                    })
                );
            }
        }
    });

    client.on('map:roshan_state', function (newState) {
        // `alive`, `respawn_base` and `respawn_variable`
        // console.log("New roshan state: " + newState);
        if (newState == 'respawn_variable') {
            return;
        }

        setTimeout(function () {
            playSound('https://admiralbullbot.github.io/playsounds/files/new/roshan.ogg');
        }, 2500);
    });

    client.on('hero:level', function (level) {
        // console.log(client.gamestate.hero.name);
        // console.log("Now level " + level);
        // console.log(wss.readyState);
    });

    client.on('hero:name', function (name) {
        if (client.auth.token != correctAuth) {
            return;
        }

        heroName = name.substr(14);
        console.log('Playing hero ' + heroName);
    });

    client.on('newdata', function (data) {
        if (client.auth.token != correctAuth) {
            return;
        }

        try {
            if (!('radiant_win_chance' in data.map) && winPercentExists) {
                // stopWin();
                winPercentExists = false;
            }

            if (
                'radiant_win_chance' in data.map &&
                data.map.radiant_win_chance != ''
            ) {
                if (!winPercentExists) {
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
        } catch (e) {
            // Sometimes TypeError
            if (!(e instanceof TypeError)) {
                console.log(e);
            }
        }
    });

    client.on('map:paused', function (isPaused) {
        if (client.auth.token != correctAuth || !isPaused) {
            return;
        }
        // playSound("residentsleeper");
    });

    client.on('map:clock_time', function (time) {
        if (client.auth.token != correctAuth) {
            return;
        }

        if (
            client.gamestate.map.customgamename !== '' ||
            'team2' in client.gamestate.player
        ) {
            return;
        }

        // Skip pregame
        if ((time + 30) % 300 == 0 && time + 30 > 0) {
            playSound(
                roonsSelections[
                    Math.floor(Math.random() * roonsSelections.length)
                ]
            );
        }

        if (
            time == 15 &&
            client.gamestate.previously.map.clock_time < 15 &&
            client.gamestate.map.name == 'start' &&
            client.gamestate.map.game_state ==
                'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS'
        ) {
            wss.send(
                JSON.stringify({
                    event: 'lock_bets',
                })
            );
        }
    });

    client.on('hero:smoked', function (issmoked) {
        if (client.auth.token != correctAuth) {
            return;
        }

        if (issmoked && Math.random() >= 0.8) {
            playSound('https://admiralbullbot.github.io/playsounds/files/new/weed.ogg');
        }
    });

    client.on('hero:alive', function (isAlive) {
        if (
            client.auth.token != correctAuth ||
            client.gamestate.map.customgamename !== '' ||
            'team2' in client.gamestate.player
        ) {
            return;
        }
        if (isAlive && Math.floor(Math.random() * 3) == 1) {
            setTimeout(function () {
                playSound('https://admiralbullbot.github.io/playsounds/files/old/herewegoagain.ogg');
            }, 3000);
        }

        if (!isAlive && Math.floor(Math.random() * 16) == 1) {
            playSound(
                deathSelections[
                    Math.floor(Math.random() * deathSelections.length)
                ]
            );
        }
    });

    client.on('map:win_team', function (team) {
        if (client.auth.token != correctAuth) {
            return;
        }

        console.log('Winning team: ' + team);
        stopWin();
        if (
            client.gamestate.map.customgamename !== '' ||
            'team2' in client.gamestate.player
        ) {
            return;
        }
        if (client.gamestate.player.team_name == team) {
            playSound('https://admiralbullbot.github.io/playsounds/files/bulldog/vivon.ogg');
        } else {
            playSound('https://admiralbullbot.github.io/playsounds/files/new/lost.ogg');
        }

        wss.send(
            JSON.stringify({
                event: 'end_bets',
                data: {
                    winning_team: team,
                    player_team: client.gamestate.player.team_name,
                },
            })
        );
        betsExist = false;
    });

    client.on('hero:has_debuff', function (name) {
        // console.log("Has debuff " + name)
    });

    client.on('hero:buyback_cooldown', function (name) {
        // console.log("Cooldown is " + name)
    });
});

function checkHealth(data) {
    // console.log(recentHealth.reduce((a, b) => a + b, 0));
    const healthPct = data.hero.health_percent;
    try {
        recentHealth.shift();
        recentHealth.push(healthPct);

        if (
            data.hero.health - data.previously.hero.health > 200 &&
            Math.floor(Math.random() * 3) == 1 &&
            data.previously.hero.health != 0 &&
            healthPct - data.previously.hero.health_percent > 5
        ) {
            playSound('https://admiralbullbot.github.io/playsounds/files/bulldog/eel.ogg');
        }
    } catch (e) {
        // Sometimes TypeError
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
            if (!slot.startsWith('slot') || item.cooldown > 0) {
                passiveMidas = 0;
                continue;
            }

            if (passiveMidas == 25) {
                playSound('https://admiralbullbot.github.io/playsounds/files/new/useyourmidas.ogg');
                passiveMidas = -50;
            }
            passiveMidas += 1;
        }
    } catch (e) {
        // Sometimes TypeError
        if (!(e instanceof TypeError)) {
            console.log(e);
        }
    }
}

function playSound(url, volume = 100) {
    if (wss.readyState !== 1) {
        console.log('Not ready');
    }

    (async () => {
        pool.query(
            'SELECT volume FROM playsound WHERE link = $1',
            [url],
            function (err, res) {
                if (err) throw err;

                if (res.rows && res.rows.length >= 1) {
                    volume = res.rows[0].volume;
                }

                volume = Math.round(volume * 0.65); // Playsound volumes are on global scale

                console.log('Playing ' + url + ' with volume ' + volume);
                wss.send(
                    JSON.stringify({
                        event: 'play_sound',
                        data: {
                            links: [[url, volume]],
                            rate: 1.0,
                        },
                    })
                );
            }
        );
    })();
}

function updatePercent(isRadiant, isDraw, winPct) {
    if (wss.readyState !== 1) {
        console.log('Not ready');
    }
    wss.send(
        JSON.stringify({
            event: 'win_percent_change',
            data: {
                isRadiant: isRadiant,
                isDraw: isDraw,
                winPct: winPct,
            },
        })
    );
}

function stopWin() {
    if (wss.readyState !== 1) {
        console.log('Not ready');
    }
    wss.send(
        JSON.stringify({
            event: 'win_percent_close',
        })
    );
}
