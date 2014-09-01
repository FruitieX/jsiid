var config = require(process.env.HOME + "/.jsiidConfig.js");
var net = require("net");

var clients = [];

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
                    console.log('parsing ' + recvdLines[i]);
                    var msg = JSON.parse(recvdLines[i]);
                    if(msg.cmd === "backlog") {
                        if(ircChans[msg.server + ':' + msg.chan]) {
                            for(var j = 0; j < config.backlog && j < ircChans[msg.server + ':' + msg.chan].messages.length; j++) {
                                broadcastMsg([socket], JSON.stringify(ircChans[msg.server + ':' + msg.chan].messages[j]));
                            }
                        }
                    } else {
                        sendIrcMsg(recvdLines[i], socket);
                    }
                }
            }
        });
        socket.on("end", function() {
            console.log("client disconnected.");
            clients.splice(clients.indexOf(socket), 1);
        });

        clients.push(socket);
    });

    listener.listen(config.listenPort, config.listenAddr);
};

var broadcastMsg = function(clients, msg) {
    // msg shouldn't contain any newlines, but let's be sure
    msg.replace('\n', '');

    for(var i = 0; i < clients.length; i++) {
        clients[i].write(msg + '\n');
    }
    console.log("broadcastMsg(): " + msg);
};

var ircChans = {};
var ircServers = {};

var recvdIrcMsg = function(serverName, cmd, chan, nick, msgString) {
    var chanLongName = serverName + ':' + chan;
    if(!ircChans[chanLongName]) {
        ircChans[chanLongName] = {
            "messages": [],
            "nicks": [] // TODO
        };
    }

    var msg = {
        "server": serverName,
        "cmd": cmd,
        "chan": chan,
        "nick": nick,
        "message": msgString
    };

    ircChans[chanLongName].messages.push(msg);
    if(ircChans[chanLongName].length > config.backlog)
        ircChans[chanLongName].shift();

    broadcastMsg(clients, JSON.stringify(msg));
};

var sendIrcMsg = function(msg, client) {
    console.log('sendIrcMsg(' + msg + ')');

    var ircServer = ircServers[msg.server];
    if(!ircServer)
        broadcastMsg([client], {"error": "Server not found."})
    else {
        console.log('TODO');
        //ircServer.write(msg.cmd.toUpperCase() + ' ' + 
    }
};

var handleIrcLine = function(line, server, ircServer) {
    var tokens = line.split(' ');

    if (line === "")
        return;

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
            recvdIrcMsg(server.name, "message", server.name, server.name, tokens.join(' '));
        } else if(cmd === "PRIVMSG") {
            tokens.shift(); tokens.shift(); tokens.shift();
            var msg = tokens.join(' ').substr(1);

            recvdIrcMsg(server.name, "message", chan, nick, msg);
        } else if (cmd === "JOIN") {
            recvdIrcMsg(server.name, "join", chan, nick, null);
        } else if (cmd === "PART") {
            recvdIrcMsg(server.name, "part", chan, nick, null);
        } else if (cmd === "QUIT") {
            recvdIrcMsg(server.name, "quit", chan, nick, null);
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
        ircServer.write(data);
    };

    ircServer.on('data', function(data) {
        buffer += data.toString('utf8');
        var lastNL = buffer.lastIndexOf('\n');

        // have we received at least one whole line? else wait for more data
        if(lastNL !== -1) {
            var recvdLines = buffer.substr(0, lastNL + 1).split('\r\n');
            buffer = buffer.substr(lastNL + 1);

            for(var i = 0; i < recvdLines.length; i++) {
                handleIrcLine(recvdLines[i], serverConfig, ircServer);
            }
        }
    });
    ircServer.on('end', function() {
        console.log('disconnected from irc');
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
