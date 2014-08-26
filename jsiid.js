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

var handleLine = function(line, server) {
    var tokens = line.split(' ');

    if (line === "")
        return;

    console.log(server.name + ': ' + line);

    if(tokens[0] === "PING") {
        console.log('got PING, sending PONG to ' + tokens[1].substr(1));
        client.send("PONG " + tokens[1].substr(1));
    } else if (tokens[0][0] === ":") {
        var prefix = tokens[0].substr(1);
        var nick = prefix.substr(0, prefix.indexOf('!'));
        var cmd = tokens[1];
        var chan = tokens[2];

        if(prefix === server.serverName) {
            tokens.shift(); tokens.shift(); tokens.shift();
            console.log("Server msg: " + tokens.join(' '));
        } else if(cmd === "PRIVMSG") {
            tokens.shift(); tokens.shift(); tokens.shift();
            var msg = tokens.join(' ').substr(1);

            console.log("PRIVMSG " + chan + ': ' + nick + ': ' + msg);
        } else if (cmd === "JOIN") {
            console.log("JOIN " + chan + ': ' + nick);
        } else if (cmd === "PART") {
            console.log("PART " + chan + ': ' + nick);
        } else if (cmd === "001") {
            server.serverName = prefix;
            console.log("serverName changed to " + server.serverName);
        } else {
            console.log("got unknown msg from " + nick + ": " + line);
        }
    } else {
        console.log("got unknown msg on " + server.name + ": " + line);
    }
};

var ircConnect = function(server) {
    var buffer = "";

    var client = net.connect({
        "port": server.port,
        "host": server.address
    }, function() {
        console.log('connected to irc server');

        var passString = "";
        if(server.password)
            passString = "PASS " + server.password + "\r\n";

        client.write(passString +
                     "NICK " + (server.nick || config.nick) + "\r\n" +
                     "USER " + (server.nick || config.nick) + " " +
                     "localhost " + server.address + " :" +
                     (server.nick || config.nick) + "\r\n");

    });

    client.send = function(data) {
        console.log("sending data: " + data);
        client.write(data);
    };

    client.on('data', function(data) {
        buffer += data.toString('utf8');
        var lastNL = buffer.lastIndexOf('\n');

        // have we received at least one whole line? else wait for more data
        if(lastNL !== -1) {
            var recvdLines = buffer.substr(0, lastNL + 1).split('\r\n');
            buffer = buffer.substr(lastNL + 1);

            for(var i = 0; i < recvdLines.length; i++) {
                handleLine(recvdLines[i], server);
            }
        }
    });
    client.on('end', function() {
        console.log('disconnected from irc');
    });
};

createListener();

for(var i = 0; i < config.servers.length; i++)
    ircConnect(config.servers[i]);
