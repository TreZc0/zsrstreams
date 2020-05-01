const Discord = require('discord.js');
const discordClient = new Discord.Client();
const twitch = require('./twitch-helix');
const editJsonFile = require("edit-json-file");
const json = editJsonFile("./config.json");
const config = json.get();

class DiscordChannel {
  constructor (id) {
    this.id = id;
  }
  send (msg) {
    return new Promise ((resolve, reject) => {
      if (discordClient.ws.connection !== null && discordClient.status === 0) {
        let channel = discordClient.channels.get(this.id);
        if (typeof channel !== 'undefined') {
          resolve(channel.send(msg));
        } else {
          reject('Failed to send discord message (Discord connection open, but channel not found.');
        }
      } else {
        reject('Failed to send discord message (Discord connection not open)');
      }
    });
  }
}
const responseDiscordChannel = new DiscordChannel(config['discord-response-channel-id']);


//Announce a stream

twitch.on('messageStreamStarted', (stream) => {

  let channel = discordClient.channels.get(config['discord-notifications-channel-id']); 

  const embed = new Discord.RichEmbed()
    .setTitle(stream.name.replace(/[*_~]/g, '\\$&') + " just went live: " + stream.url.replace(/[*_~]/g, '\\$&'))
    .setAuthor(stream.name.replace(/[*_~]/g, '\\$&') + " is now live on Twitch!", "https://cdn.discordapp.com/app-icons/469910320932978698/fd891edff755ed2faafce9852cd48708.png")
    .setColor(1369976)
    .setDescription(stream.title.replace(/[*_~]/g, '\\$&'))
    .setFooter("Playing " + stream.game, "https://cdn.discordapp.com/app-icons/469910320932978698/fd891edff755ed2faafce9852cd48708.png")
    .setThumbnail(stream.cover)
    .setTimestamp()
    .setURL(stream.url);

  channel.send({ embed }).catch((e) => {
    console.log(e);
  });
 

});
//Stream is no longer live, remove the message
twitch.on('messageStreamDeleted', (stream) => {
  let channel = discordClient.channels.get(config['discord-notifications-channel-id']); 
  channel.fetchMessages({limit: 99})
    .then(messages => messages.forEach(message => {
     if ((message.embeds) && (message.embeds.length > 0)) {
        if (message.embeds[0].message.embeds[0].url == stream.url) {
          message.delete(); 
        }
      }
      if (message.content.includes(stream.url))
      message.delete();
      
    }))
    .catch(console.error);
});


//Clear the channel of all currently visible messages (API limit of 14 days)
discordClient.on('message', (message) => {
  let commandClear = /^(\.|!)clear$/;
  let channel = discordClient.channels.get(config['discord-notifications-channel-id']); 

  if (message.channel.id === responseDiscordChannel.id && commandClear.test(message.content)) {
      channel.fetchMessages({ limit: 99 })
      .then(messages => {
        if (messages.size > 2) {
          channel.bulkDelete(messages, false)
            .then(() => {

              console.log("Removed " + messages.size + " messages");
           });
        }
        else if (messages.size > 0) {

          console.log("Remove final " + messages.size + " messages");

          Array.from(messages.values()).forEach(message => {

            message.delete();
          });
        }
        else {
          console.log("No more messages left");
        }
      })
      .catch(error => log.info(error));
  };
});

//Log into Discord
setTimeout(() => {
  console.log("Logging in to discord...");
  discordClient.login(config["discord-token"]).then(() => {
    console.log("Discord login success");
  }).catch((e) => {
    console.log("Discord login failure");
    console.log(e);
  });
}, 2500);

discordClient.on('ready', () => {
  function failToSet(setting) {return (e) => {
    console.log('Failed to set ' + setting);
    console.log(e);
  }}
  discordClient.user.setPresence({
    "status": 'online',
    "game": {
      "name": config['bot-currently-playing']
    }
  }).catch(failToSet('presence'));
});