jsiid
=====
Converts IRC messages to JSON and vice versa.

Examples
========

### Receive message
```
:myNick!blah@foo.com PRIVMSG #channel :This is a test.
```

->

```
{
    "server":"freenode",
    "cmd":"message",
    "chan":"#channel",
    "nick":"myNick",
    "message":"This is a test."
}
```

### myNick joins #channel
```
:myNick!blah@foo.com JOIN #channel
```

->

```
{
    "server":"freenode",
    "cmd":"join",
    "chan":"#channel",
    "nick":"myNick"
}
```

### Send message
```
{
    "cmd":"message",
    "chan":"#channel",
    "server":"qnet",
    "message":"This is a test.",
    "nick":"myNick"
}
```

->

```
PRIVMSG #channel :This is a test.
```

### Search for message on #channel
```
{
    "cmd":"search",
    "searchRE":"\\d\\d.*"       // search regex as a string, must escape backslashes
    "type":"yourUniqueIdHere",  // will be sent in reply
    "skip":3,                   // skip this many matches
    "chan":"#channel",
    "server":"qnet",
    "firstMatchOnly": false,    // only send the first match?
    "onlyMatching": true        // only send matching part of message?
}
```
->
```
{
    "cmd":"searchResults",
    "type":"yourUniqueIdHere",
    "id":4,                     // 4th match
    "chan":"#channel",
    "server":"qnet",
    "nick":"myNick",
    "message":"42asdfs"
}
```

### Fetch backlog on #channel
```
{
    "cmd":"backlog",
    "chan":"#channel",
    "server":"freenode"
}
```
->
```
{
    "server":"freenode",
    "cmd":"message",
    "chan":"#channel",
    "nick":"myNick",
    "message":"This is a test."
}
{
    "server":"freenode",
    "cmd":"message",
    "chan":"#channel",
    "nick":"myNick",
    "message":"This is another test."
}
...
```

Setup
=====
1. `cp jsiidConfig.js.example  ~/.jsiidConfig.js`
2. Edit `~/.jsiidConfig.js`
3. `node jsiid.js`
