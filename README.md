jsiid
=====
Converts IRC messages to JSON.

Examples
========

### Message
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

### Join
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

Setup
=====
1. `cp jsiidConfig.js.example  ~/.jsiidConfig.js`
2. Edit `~/.jsiidConfig.js`
3. `node jsiid.js`
