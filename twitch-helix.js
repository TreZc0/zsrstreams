const rp = require('request-promise');
const EventEmitter = require('events');

const editJsonFile = require("edit-json-file");
const json = editJsonFile("./config.json");
const config = json.get();

const streamEmitter = new EventEmitter();

let streams = {};

let gameIDs = config["games"];

let tags = config["tags"];

// Returns an already available access token or refreshes it and then returns.
async function getOauthToken() {
  if (Date.now() < config["twitch-access-token-expires-At"] && config["twitch-access-token"].length > 0) {
    return config["twitch-access-token"];
  }
  const res = await rp.post("https://id.twitch.tv/oauth2/token", {
    body: {
      "client_id": config["twitch-client-id"],
      "client_secret": config["twitch-client-secret"],
      "grant_type": "refresh_token",
      "refresh_token": config["twitch-refresh-token"],
    },
    json: true,
  });
  if (!res["access_token"]) {
    throw new Error("API did not provide an OAuth token!");
  }
  updateConfig("twitch-access-token", res["access_token"]);
  updateConfig("twitch-access-token-expires-At", Date.now() + 3500 * 1000);

  return res["access_token"];
}

//returns a list of streams based on game IDs 
//Twitch only responds with 99 streams at a time and includes a pagination cursor if there is more.
function getStreams(gameIDs, token, cursor = "") {
  return rp.get("https://api.twitch.tv/helix/streams", {
    headers: {
      "Client-ID": config["twitch-client-id"],
      "Authorization": "OAuth " + token,
    },
    qs: {
      "game_id": gameIDs,
      "first": 99,
      "type": 'live',
      "after": cursor
    },
    json: true,
  });
}

//This loops through the different pagination cursors of a current getStreams run to get a complete list of streams
// resolves with a list of streams for the current cursor
function pageLoop(res, nextCursor) {
  return new Promise(
    function (resolve, reject) {
      setTimeout(() => {
        if (nextCursor != null) {
          getOauthToken().catch(e => {
            console.error("error while trying to receive access token: " + e);
          }).then((token) => {
            return getStreams(token, nextCursor);
          }).then((nextPage) => {

            if (nextPage && nextPage.data && nextPage.data.length > 0) {
              var counter = 0;

              nextPage.data.forEach(stream => {
                if (stream.tag_ids) {
                  var streamWithTag = tags.find(tag => {
                    if (stream.tag_ids.includes(tag))
                      return true;
                    return false;
                  });
                  if (streamWithTag) {
                    res.push(stream);
                    counter++;
                  }
                }
              });
            }
            if (nextPage && nextPage.data && nextPage.pagination && nextPage.pagination.cursor && nextCursor != nextPage.pagination.cursor) {

              nextCursor = nextPage.pagination.cursor;
              resolve({ "res": res, "next": nextCursor });
            }
            else {
              nextCursor = null;
              resolve({ "res": res, "next": null });
            }
          });

        }
        else {
          //console.log("no more cursor transmitted, end of list!");
          resolve({ "res": res, "next": null });
        }
      }, 150);

    }
  );
}
//recursively goes through the streams with the current set of gameIDs and returns once no more cursor is provided by the API
//returns a complete list of streams
function pagination(res, nextCursor) {
  return pageLoop(res, nextCursor).then((result) => {
    if (result.next != null) {
      return pagination(result.res, result.next);
    }
    else return result.res;
  })
}

//performs an initial api call for a base set of streams and an initial pagination cursor
//afterwards, starts the pagination process for the current set of gameIDs (10 at a time)
function getGameStreams(gameIDs) {
  return new Promise(function (resolve, reject) {
    getOauthToken().catch(e => {
      console.error("error while trying to receive access token: " + e);
    }).then((token) => {
      return getStreams(gameIDs, token);
    }).then((twitchData) => {
      let res = [];

      twitchData.data.forEach(ttvStream => {
        if (ttvStream.tag_ids) {
          var streamWithTag = tags.find(tag => {
            if (ttvStream.tag_ids.includes(tag))
              return true;
            return false;
          });
          if (streamWithTag) {
            res.push(ttvStream);
          }
        }
      });
      var nextCursor;
      if (twitchData.pagination.cursor)
        nextCursor = twitchData.pagination.cursor;
      pagination(res, nextCursor).then(fullGameData => {
        resolve(fullGameData);
      });
    });
  })
}

//returns a list of twitch user objects that are just to keep track of the already published streams
function getUsers(ids) {
  return rp.get("https://api.twitch.tv/helix/users", {
    headers: {
      "Client-ID": config["twitch-client-id"],
      "Authorization": "OAuth " + config["twitch-access-token"],
    },
    qs: {
      "id": ids,

    },
    json: true,
  });
}

// chunks the amount of users to track in packs of 99 and returns a promise resolve
// containing all the different api call responses
function userList(ids) {

  let perChunk = 99;
  let chunks = ids.reduce((resultArray, item, index) => {
    const chunkIndex = Math.floor(index / perChunk);

    if (!resultArray[chunkIndex]) {
      resultArray[chunkIndex] = [];
    }
    resultArray[chunkIndex].push(item);

    return resultArray;
  }, []);

  let promisesChunks = [];

  chunks.forEach(chunk => {
    promisesChunks.push(getUsers(chunk));
  });
  return Promise.all(promisesChunks);
}


//full loop
function streamLoop() {

  //chunks the gameID list in groups of 10 (API maximum)
  let perChunk = 10;
  let chunks = Object.keys(gameIDs).reduce((resultArray, item, index) => {
    const chunkIndex = Math.floor(index / perChunk);

    if (!resultArray[chunkIndex]) {
      resultArray[chunkIndex] = []; // start a new chunk
    }

    resultArray[chunkIndex].push(item);

    return resultArray;
  }, []);

  let promisesChunks = [];

  chunks.forEach(chunk => {
    promisesChunks.push(getGameStreams(chunk))
  });

  //this promise resolves with a list of responses for the different API getStreams calls
  //one Array per response
  Promise.all(promisesChunks).then((data) => {

    let res = [].concat(...data);
    let user_ids = [];
    for (let stream of res) {

      //create the initial stream element for keeping track of the already published streams
      user_ids.push(stream["user_id"]);
      if (typeof streams[stream["user_id"]] === 'undefined') {
        streams[stream["user_id"]] = {};
      }
      //this timer will be used to track if streams have to be removed
      streams[stream["user_id"]]["timer"] = 15;
      streams[stream["user_id"]]["title"] = stream["title"];
      streams[stream["user_id"]]["viewer_count"] = stream["viewer_count"];
      streams[stream["user_id"]]["game_id"] = stream["game_id"];
    }
    //run through the userIDs we gathered to emit the discord message events later based on them
    if (user_ids.length > 0) {
      return userList(user_ids);
    }
    return null;
  }).then((data) => {
    if (data === null) {
      return;
    }
    let userData = [];
    //full promise resolve of api calls, same as above
    data.forEach(elem => userData.push(...elem.data));

    //emit a discord Message event for every user we just tracked, containing all required information
    //Add the url element afterwards to ensure no double messages
    for (let i = 0; i < userData.length; i++) {
      let userElement = userData[i];
     
      if (userElement["id"] in streams && typeof streams[userElement["id"]]["url"] === 'undefined') {

        streamEmitter.emit('messageStreamStarted', {
          "url": 'https://www.twitch.tv/' + userElement["login"],
          "name": userElement["login"],
          "title": streams[userElement["id"]]["title"],
          "game": gameIDs[streams[userElement["id"]]["game_id"]].name,
          "gameID": streams[userElement["id"]]["game_id"],
          "cover": gameIDs[streams[userElement["id"]]["game_id"]].boxArt
        });

      }
      streams[userElement["id"]]["url"] = 'https://www.twitch.tv/' + userElement["login"];
      streams[userElement["id"]]["display_name"] = userElement["display_name"];
      streams[userElement["id"]]["login"] = userElement["login"];
    }
    return;
  }).catch((e) => {
    console.error(e);
  })
};

//Run the loop every 50 seconds
setInterval(streamLoop, 50000);


//check the timer element of each stream every 30 seconds.
//if it reaches 0 (refresh on every streamLoop run if still up), remove the discord message
setInterval(() => {
  for (let stream of Object.keys(streams)) {
    streams[stream]["timer"]--;
    if (streams[stream]["timer"] < 1) {
      if (typeof streams[stream]["url"] !== 'undefined' && typeof streams[stream]["title"] !== 'undefined') {
        streamEmitter.emit('messageStreamDeleted', {
          "url": streams[stream]["url"],
          "title": streams[stream]["title"],
          "id": stream
        });
      }
      delete streams[stream];
    }
  }
}, 30000);


//save the Access Token in the bot's config in case of an outage
function updateConfig(key, value) {
  config[key] = value;
  json.set(key, value);
  json.save();
}

streamEmitter.getStreams = () => {
  return streams;
}

//initial run of the loop right after discord has logged in
setTimeout(streamLoop, 6500);

module.exports = streamEmitter;