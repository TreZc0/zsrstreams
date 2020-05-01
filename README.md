# Discord Bot for Multigame Speedrun TTV-stream announcements
## powered by ZeldaSpeedRuns
### Based on Simple Twitch Streams Discord Bot

A basic discord bot that tracks twitch streams for a list of games, and posts messages to discord when twitch streams go live.

Note: It only posts to one discord server and one channel.

# How to set up:

### Prerequisites

* [Node.js](https://nodejs.org/)

### Step 1
Rename the config.json.example file to config.json and edit the settings in the file.

To get the channel ID of a channel in your discord server, turn on developer mode in your discord user settings (under "Appearance"). You can then get the channel ID by right-clicking a channel and selecting "Copy ID".

To create a Twitch development app for the Client-ID and Secret go to the [Twitch Developers website](https://dev.twitch.tv/console/apps) 

To create a Discord Bot / Application and get a token, check out the [Discord Developer Portal](https://discordapp.com/developers/applications/)

To get the bot running, you will need Twitch OAuth Access Token.
To receive one, run through the [OAuth Authorization Code Flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth#oauth-authorization-code-flow)

To get a list of games you want to track, grab the id and boxArt off the [Twitch API Games Endpoint](https://dev.twitch.tv/docs/api/reference#get-games)
An entry for the games object needs to have the following format:
```json
{
  "twitchGameID": { "name": "Name of your Choice / Gamename", "boxArt": "twitchBoxArtImageLink" }
}
```
The tags array includes Twitch streaming tags that should be included in your search. Per default, "Speedrun", "Randomizer", and "TAS" are tracked.
For more or different tags check the [Full API Tags list](https://dev.twitch.tv/docs/api/reference#get-all-stream-tags).

### Step 2

Install the node.js dependencies:
```
npm i
```

### Step 3

Run the bot:
```
node index.js
```
To run it permanently, use a process manager like [PM2](https://www.npmjs.com/package/pm2)
