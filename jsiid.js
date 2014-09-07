var config = require(process.env.HOME + "/.jsiidConfig.js");
var net = require("net");

var clients = [];

var handleClientMessage = function(msg, socket) {
    var chanLongName = msg.server + ':' + msg.chan;
    chanLongName = chanLongName.toLowerCase();
    if(msg.cmd === "backlog") {
        // get nicklist for chan if we already haven't
        initChan(msg.server, msg.chan, true);

        if(ircChans[chanLongName]) {
            // send backlog
            for(var i = 0; i < config.backlog && i < ircChans[chanLongName].messages.length; i++) {
                broadcastMsg([socket], JSON.stringify(ircChans[chanLongName].messages[i]));
            }

            // send the nicklist
            broadcastMsg([socket], JSON.stringify({
                "cmd": "nicklist",
                "nicks": Object.keys(ircChans[chanLongName].nicks),
                "server": msg.server,
                "chan": msg.chan
            }));

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
        if(msg.cmd === "message") {
            broadcastMsg(clients, JSON.stringify(msg));
        }
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
            socket.end();
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
    chanLongName = chanLongName.toLowerCase();

    var msg = {
        "server": serverName,
        "cmd": cmd,
        "chan": chan,
        "nick": nick,
        "message": msgString
    };

    if(chan && msgString) {
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
            initChan(msg.server, msg.chan, true);

            // add message to our backlog and send it
            recvdIrcMsg(msg.server, "message", msg.chan, msg.nick, msg.message, true);
            ircServer.send('PRIVMSG ' + msg.chan + ' :' + msg.message);
        } else {
            ircServer.send(msg.message.substr(1));
        }
    }
};

var initChan = function(serverName, chan) {
    var chanLongName = serverName + ':' + chan;
    chanLongName = chanLongName.toLowerCase();

    if(!ircChans[chanLongName]) {
        ircChans[chanLongName] = {
            "messages": [],
            "nicks": {}
        };
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
        chan = chan.replace(':', '');

        var chanLongName = server.name + ':' + chan;
        chanLongName = chanLongName.toLowerCase();

        if(prefix === server.serverLongName) {
            tokens.shift(); tokens.shift(); tokens.shift();
            var msg = tokens.join(' ');
            // nicklist
            if (cmd === "353") {
                chan = msg.split(':')[0];
                chan = chan.split(' ')[1];
                var nicks = msg.split(':')[1];
                nicks = nicks.split(' ');

                chanLongName = server.name + ':' + chan;
                chanLongName = chanLongName.toLowerCase();
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
            if(nick !== (server.nick || config.myNick)) {
                recvdIrcMsg(server.name, "join", chan, nick, null);
                ircChans[chanLongName].nicks[nick] = true;
            }
        } else if (cmd === "PART") {
            initChan(server.name, chan, true);
            recvdIrcMsg(server.name, "part", chan, nick, null);
            delete(ircChans[chanLongName].nicks[nick]);
        } else if (cmd === "QUIT") {
            for(var key in ircChans) {
                for(var chanNick in ircChans[key].nicks) {
                    if(chanNick === nick) {
                        recvdIrcMsg(server.name, "part", key, nick, null);
                        delete(ircChans[key].nicks[nick]);
                    }
                }
            }
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
        broadcastMsg(clients, JSON.stringify({
            nick: '!',
            message: serverConfig.name + ': Connected to IRC.',
            broadcast: true
        }));

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
        console.log("sending data to IRC: " + data);
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
                if(recvdLines[i] !== '') {
                    console.log('irc server sent ' + recvdLines[i]);
                    handleIrcLine(recvdLines[i], serverConfig, ircServer);
                }
            }
        }
    });
    ircServer.on('end', function() {
        socket.end();
    });
    ircServer.on('close', function() {
        console.log(serverConfig.name + ': connection to irc closed, reconnecting...');
        broadcastMsg(clients, JSON.stringify({
            nick: '!',
            message: serverConfig.name + ': Connection to irc closed, reconnecting...',
            broadcast: true
        }));
        setTimeout(function() {
            ircConnect(serverConfig);
        }, config.reconnectDelay);
    });

    ircServer.config = serverConfig;
    ircServer.chanNamesRequests = [];
    ircServer.namesRequestTimeout = null;

    ircServers[serverConfig.name] = ircServer;
};

createListener();

for(var i = 0; i < config.servers.length; i++)
    ircConnect(config.servers[i]);

process.on('uncaughtException', function (err) {
    console.error(err.stack);
    console.log("ERROR! Node not exiting.");
});
