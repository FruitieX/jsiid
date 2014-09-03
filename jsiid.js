var config = require(process.env.HOME + "/.jsiidConfig.js");
var net = require("net");

var clients = [];

var handleClientMessage = function(msg, socket) {
    var chanLongName = msg.server + ':' + msg.chan;
    if(msg.cmd === "backlog") {
        if(ircChans[chanLongName]) {
            // first send the nicklist
            broadcastMsg([socket], JSON.stringify({
                "cmd": "nicklist",
                "nicks": Object.keys(ircChans[chanLongName].nicks),
                "server": msg.server,
                "chan": msg.chan
            }));

            // then send backlog
            for(var i = 0; i < config.backlog && i < ircChans[chanLongName].messages.length; i++) {
                broadcastMsg([socket], JSON.stringify(ircChans[chanLongName].messages[i]));
            }
        }
    } else if (msg.cmd === "search") {
        if(ircChans[chanLongName]) {
            // send search results
            var id = 0;
            for(var i = ircChans[chanLongName].messages.length - 1; i >= 0; i--) {
                var origMsg = ircChans[chanLongName].messages[i];
                if(origMsg.message &&
                   origMsg.message.match(new RegExp(msg.searchRE))) {

                    if(msg.skip > 0) {
                        msg.skip--;
                        continue;
                    }

                    var message = origMsg.message;
                    if(msg.onlyMatching) {
                        message = message.match(new RegExp(msg.searchRE))[0];
                    }

                    var results = {
                        "cmd": "searchResults",
                        "type": msg.type,
                        "id": id++,
                        "server": origMsg.server,
                        "chan": origMsg.chan,
                        "message": message,
                        "nick": origMsg.nick
                    }

                    broadcastMsg([socket], JSON.stringify(results));

                    if(msg.firstMatchOnly)
                        return;
                }
            }
        }
    } else {
        sendIrcMsg(msg, socket);
    }
};

var handleClientDisconnect = function(socket) {
    console.log("client disconnected.");
    clients.splice(clients.indexOf(socket), 1);
};

var createListener = function() {
    var listener = net.createServer(function (socket) {
        console.log("client connected.");
        var buffer = "";

        socket.on("data", function(data) {
            console.log("got client data:" + data);
            buffer += data.toString('utf8');
            var lastNL = buffer.lastIndexOf('\n');
            if(lastNL !== -1) {
                var recvdLines = buffer.substr(0, lastNL).split('\n');
                buffer = buffer.substr(lastNL + 1);

                for(var i = 0; i < recvdLines.length; i++) {
                    var msg = JSON.parse(recvdLines[i]);
                    handleClientMessage(msg, socket);
                }
            }
        });
        socket.on("end", function() {
            handleClientDisconnect(socket);
        });
        socket.on("close", function() {
            handleClientDisconnect(socket);
        });

        clients.push(socket);
    });

    listener.listen(config.listenPort, config.listenAddr);
};

var broadcastMsg = function(clients, msg) {
    // msg shouldn't contain any newlines, but let's be sure
    if(msg.message)
        msg.message.replace('\n', '');

    for(var i = 0; i < clients.length; i++) {
        clients[i].write(msg + '\n');
    }
    console.log("broadcastMsg(): " + msg);
};

var ircChans = {};
var ircServers = {};

var recvdIrcMsg = function(serverName, cmd, chan, nick, msgString, noBroadcast) {
    var chanLongName = serverName + ':' + chan;

    var msg = {
        "server": serverName,
        "cmd": cmd,
        "chan": chan,
        "nick": nick,
        "message": msgString
    };

    if(chan) {
        ircChans[chanLongName].messages.push(msg);
        if(ircChans[chanLongName].messages.length > config.backlog)
            ircChans[chanLongName].messages.shift();
    }

    if(!noBroadcast)
        broadcastMsg(clients, JSON.stringify(msg));
};

var sendIrcMsg = function(msg, client) {
    var ircServer = ircServers[msg.server];
    if(!ircServer)
        broadcastMsg([client], JSON.stringify({"error": "Server not found."}))
    else {
        if(!msg.chan) {
            broadcastMsg([client], JSON.stringify({"error": "Invalid recepient."}))
        } else if(!msg.message) {
            broadcastMsg([client], JSON.stringify({"error": "No message provided."}))
        } else if (msg.message[0] !== '/') {
            // add message to our backlog and send it
            initChan(msg.server, msg.chan, true);
            recvdIrcMsg(msg.server, "message", msg.chan, msg.nick, msg.message, true);
            ircServer.send('PRIVMSG ' + msg.chan + ' :' + msg.message);
        } else {
            ircServer.send(msg.message.substr(1));
        }
    }
};

var initChan = function(serverName, chan, requestNames) {
    var chanLongName = serverName + ':' + chan;

    if(!ircChans[chanLongName]) {
        ircChans[chanLongName] = {
            "messages": [],
            "nicks": {},
            "nicksRequested": true
        };

        if(requestNames)
            ircServers[serverName].send('NAMES ' + chan);
    }
};

var handleIrcLine = function(line, server, ircServer) {
    var tokens = line.split(' ');

    //console.log(server.name + ': ' + line);
    if(tokens[0] === "PING") {
        console.log('got PING, sending PONG to ' + tokens[1].substr(1));
        ircServer.send("PONG " + tokens[1].substr(1));
    } else if (tokens[0][0] === ":") {
        var prefix = tokens[0].substr(1);
        var nick = prefix.substr(0, prefix.indexOf('!'));
        var cmd = tokens[1];
        var chan = tokens[2];

        if(prefix === server.serverLongName) {
            tokens.shift(); tokens.shift(); tokens.shift();
            var msg = tokens.join(' ');
            // nicklist
            if (cmd === "353") {
                chan = msg.split(':')[0];
                chan = chan.split(' ')[1];
                var nicks = msg.split(':')[1];
                nicks = nicks.split(' ');

                var chanLongName = server.name + ':' + chan;
                initChan(server.name, chan, false);

                for(var i = 0; i < nicks.length; i++) {
                    ircChans[chanLongName].nicks[nicks[i]] = true;
                }

                // send the nicklist
                broadcastMsg(clients, JSON.stringify({
                    "cmd": "nicklist",
                    "nicks": Object.keys(ircChans[chanLongName].nicks),
                    "server": msg.server,
                    "chan": msg.chan
                }));
            } else {
                initChan(server.name, server.name, false);
                recvdIrcMsg(server.name, "message", server.name, server.name, msg);
            }
        } else if(cmd === "PRIVMSG") {
            tokens.shift(); tokens.shift(); tokens.shift();
            var msg = tokens.join(' ').substr(1);

            // query message
            if(chan === config.nick) {
                chan = nick;
            }

            initChan(server.name, chan, true);
            recvdIrcMsg(server.name, "message", chan, nick, msg);
        } else if (cmd === "JOIN") {
            initChan(server.name, chan, true);
            recvdIrcMsg(server.name, "join", chan, nick, null);
            ircChans[server.name + ':' + chan].nicks[nick] = true;
        } else if (cmd === "PART") {
            initChan(server.name, chan, true);
            recvdIrcMsg(server.name, "part", chan, nick, null);
            delete(ircChans[server.name + ':' + chan].nicks[nick]);
        } else if (cmd === "QUIT") {
            initChan(server.name, chan, false);
            recvdIrcMsg(server.name, "quit", null, nick, null);
            delete(ircChans[server.name + ':' + chan].nicks[nick]);
        } else if (cmd === "001") {
            server.serverLongName = prefix;
            console.log("serverLongName changed to " + server.serverLongName);
        } else {
            console.log("got unknown msg from " + nick + ": " + line);
        }
    } else {
        console.log("got unknown msg on " + server.name + ": " + line);
    }
};

var ircConnect = function(serverConfig) {
    var buffer = "";

    var ircServer = net.connect({
        "port": serverConfig.port,
        "host": serverConfig.address
    }, function() {
        console.log('connected to irc server');

        var passString = "";
        if(serverConfig.password)
            passString = "PASS " + serverConfig.password + "\r\n";

        ircServer.write(passString +
                     "NICK " + (serverConfig.nick || config.nick) + "\r\n" +
                     "USER " + (serverConfig.nick || config.nick) + " " +
                     "localhost " + serverConfig.address + " :" +
                     (serverConfig.nick || config.nick) + "\r\n");

    });

    ircServer.send = function(data) {
        console.log("sending data: " + data);
        ircServer.write(data + '\r\n');
    };

    ircServer.on('data', function(data) {
        buffer += data.toString('utf8');
        var lastNL = buffer.lastIndexOf('\n');

        // have we received at least one whole line? else wait for more data
        if(lastNL !== -1) {
            var recvdLines = buffer.substr(0, lastNL + 1).split('\r\n');
            buffer = buffer.substr(lastNL + 1);

            for(var i = 0; i < recvdLines.length; i++) {
                if(recvdLines[i] !== "") {
                    console.log('irc server sent ' + recvdLines[i]);
                    handleIrcLine(recvdLines[i], serverConfig, ircServer);
                }
            }
        }
    });
    ircServer.on('end', function() {
        console.log('disconnected from irc, reconnecting...');
        setTimeout(function() {
            ircConnect(serverconfig);
        }, config.reconnectDelay);
    });
    ircServer.on('close', function() {
        console.log('connection to irc closed, reconnecting...');
        setTimeout(function() {
            ircConnect(serverconfig);
        }, config.reconnectDelay);
    });

    ircServer.config = serverConfig;

    ircServers[serverConfig.name] = ircServer;
};

createListener();

for(var i = 0; i < config.servers.length; i++)
    ircConnect(config.servers[i]);

process.on('uncaughtException', function (err) {
    console.error(err.stack);
    console.log("ERROR! Node not exiting.");
});
