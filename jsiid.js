var config = require(process.env.HOME + "/.jsiidConfig.js");
console.log("read configuration:");
console.log(config);

var net = require("net");

var createListener = function() {
    var listener = net.createServer(function (socket) {
        socket.on('data', function(data) {
            console.log('got data:' + data);
        });
    });

    listener.listen(config.listenPort, config.listenAddr);
};

var ircChans = {};
var ircServers = {};

var recvdIrcMsg = function(serverName, cmd, chan, nick, msgString) {
    var chanLongName = serverName + ':' + chan;
    if(!ircChans[chanLongName]) {
        ircChans[chanLongName] = {
            "messages": []
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

    console.log("recvdIrcMsg(): " + JSON.stringify(msg));
};

var sendIrcMsg = function(serverName, cmd, chan, nick, msg) {
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
