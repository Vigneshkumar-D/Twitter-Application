const express = require("express");
const app = express();

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const jwt = require("jsonwebtoken");
app.use(express.json());
const bcrypt = require("bcrypt");


var isValid = require("date-fns/isValid");
var format = require("date-fns/format");

const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;


// initialize Database And Server
const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server running at http://localhost:3000");
    });
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
}
initializeDbAndServer();

// Authenticate JWT token Middleware Function
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (authHeader === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_KEY", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
}

// New User Register API
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const encryptedPassword = await bcrypt.hash(password, 10);

  const selectUserQuery = `
    SELECT * 
    FROM 
    user
    WHERE username = '${username}'`;

  const dbUser = await db.get(selectUserQuery);

  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const registerUserQuery = `
        INSERT INTO user ( username, password, name, gender )
        VALUES ( '${username}', '${encryptedPassword}', '${name}', '${gender}')`;
      await db.run(registerUserQuery);
      response.send("User created successfully");
    }
  }
});

// User Login API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const selectUserQuery = `
    SELECT *
    FROM user
    WHERE username = '${username}';`;

  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatch = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatch === true) {
      const payload = { username: username };
      const jwtToken = await jwt.sign(payload, "MY_SECRET_KEY");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// Post Tweet API
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;

  const selectLoggedUserQuery = `
    SELECT user_id AS userId
    FROM user
    WHERE username = '${username}'`;

  const dbUser = await db.get(selectLoggedUserQuery);
  const { userId } = dbUser;
  const date = new Date();
  const [todayDate, month, year, hours, minutes, seconds] = [
    `${date.getDate()}`,
    `${date.getMonth() + 1}`,
    `${date.getFullYear()}`,
    `${date.getHours()}`,
    `${date.getMinutes()}`,
    `${date.getSeconds()}`,
  ];
  const dateTime = format(
    new Date(year, month, todayDate, hours, minutes, seconds),
    "yyyy-MM-dd HH:mm:ss"
  );
  console.log(todayDate, month, year, hours, minutes, seconds);
  const createTweetQuery = `
    INSERT INTO tweet (tweet, user_id, date_time)
    VALUES ('${tweet}', '${userId}', '${dateTime}');`;
  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

// Delete Tweet API
app.delete("/tweets/:tweetId/", authenticateToken, async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const selectLoggedUserQuery = `
    SELECT user_id AS userId
    FROM 
    user
    WHERE username = '${username}'`;

    const dbUser = await db.get(selectLoggedUserQuery);
    const { userId } = dbUser;

    const selectTweetQuery = `
    SELECT tweet.user_id
    FROM tweet
    INNER JOIN user
    ON tweet.user_id = user.user_id 
    WHERE tweet.tweet_id = '${tweetId}';`;

    const dbResponse = await db.all(selectTweetQuery);
    const [userObject] = dbResponse;
    console.log(userObject);
    console.log(dbResponse);
    if (dbResponse[0] !== undefined) {
      if ((userObject.user_id !== userId) | (userObject === undefined)) {
        response.status(401);
        response.send("Invalid Request");
      } else {
        const deleteTweetQuery = `
                    DELETE FROM tweet
                    WHERE tweet.tweet_id = '${tweetId}'`;
        await db.run(deleteTweetQuery);
        response.send("Tweet Removed");
      }
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
});

// Get Followers API
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const selectLoggedUserQuery = `
    SELECT user_id AS userId
    FROM 
    user
    WHERE username = '${username}'`;

  const dbUser = await db.get(selectLoggedUserQuery);
  console.log(dbUser);
  const { userId } = dbUser;
  
  const selectFollowingQuery = `
    SELECT user.name
    FROM user
    JOIN follower
    WHERE follower.follower_user_id = '${userId}';`;
  const dbResponse = await db.all(selectFollowingQuery);
  response.send(dbResponse);
});

// Get Tweets  Feed API
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
    const { username } = request;

    const selectLoggedUserQuery = `
    SELECT user_id AS userId
    FROM 
    user
    WHERE username = '${username}'`
    
    const dbUser = await db.get(selectLoggedUserQuery);

    const { userId } = dbUser;

    const selectTweetQuery = `
    SELECT user.username,
    tweet.tweet,
    tweet.date_time AS dateTime
    FROM tweet
    INNER JOIN follower 
    ON follower.follower_user_id = tweet.user_id
    INNER JOIN user ON follower.follower_user_id = tweet.user_id
    WHERE follower.follower_user_id = '${userId}'
    ORDER BY tweet.date_time DESC
    LIMIT 4;`;

    const dbResponse = await db.all(selectTweetQuery);
    response.send(dbResponse)
    
});

// Get Followers API
app.get("/user/followers/", authenticateToken, async(request, response) => {
const {username} = request;

const getUserIdQuery = `
SELECT user_id AS userId
FROM user
WHERE username = '${username}';`;

const dbUser = await db.get(getUserIdQuery);
const { userId } = dbUser;

const selectFollowersQuery = `
SELECT user.name
FROM user 
INNER JOIN follower
ON follower.follower_user_id = user.user_id
WHERE follower.following_user_id = '${userId}'`

const dbResponse = await db.all(selectFollowersQuery);
response.send(dbResponse)

});

// Get Specific Tweet API
app.get("/tweets/:tweetId/", authenticateToken, async(request, response) => {
    const {username} = request;
    const  { tweetId } = request.params;  
   
    const getUserIdQuery = `
    SELECT user_id AS userId
    FROM user
    WHERE username = '${username}';`;

    const dbUser = await db.get(getUserIdQuery);
    const { userId } = dbUser;
    

    const selectTweetQuery = `
    SELECT tweet.tweet,
    count(like.like_id) AS likes,
    count(reply.reply) AS replies,
    tweet.date_time AS dateTime
    FROM tweet
    INNER JOIN like 
    ON  like.tweet_id = tweet.tweet_id
    INNER JOIN reply
    ON reply.tweet_id = tweet.tweet_id  
    INNER JOIN follower
    ON follower.follower_user_id = '${userId}'
    JOIN user
    WHERE tweet.tweet_id = '${tweetId}'`
     const dbResponse = await db.get(selectTweetQuery)
     const {tweet} = dbResponse;

     if(tweet === null){
         response.status(401)
         response.send("Invalid Request")
     }else{
     response.send(dbResponse)
     }
});

// Get Likes API
app.get("/tweets/:tweetId/likes/", authenticateToken, async(request, response) => {

const { username } = request;
const { tweetId } = request.params;

const getUserIdQuery = `
    SELECT user_id AS userId
    FROM user 
    WHERE username = '${username}';`;

    const dbUser = await db.get(getUserIdQuery);
    const { userId } = dbUser;

    const selectLikesQuery = `
    SELECT user.name
    FROM (user
    INNER JOIN like
    ON user.user_id = like.user_id) AS T
    INNER JOIN follower
    ON follower.follower_id = '${userId}'     
    WHERE like.tweet_id = '${tweetId}'`
    const dbResponse = await db.all(selectLikesQuery)
    if (dbResponse[0] === undefined){
       response.status(401);
       response.send("Invalid Request");
   }else{
    const list = []
    const likesObject = {
        likes:list
    } 
    for (let userName of dbResponse){
        list.push(userName.name)
    }
    response.send(likesObject)
}
});

// Get Tweet Replies API
app.get("/tweets/:tweetId/replies/", authenticateToken, async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    
    const getUserIdQuery = `
    SELECT user_id AS userId
    FROM user 
    WHERE username = '${username}';`;

    const dbUser = await db.get(getUserIdQuery);
    const { userId } = dbUser;
       
    const selectRepliesQuery =`
    SELECT user.name,
     reply.reply
     FROM user   
     INNER JOIN tweet 
     ON tweet.user_id = user.user_id
     INNER JOIN follower 
     ON follower.follower_user_id = '${ userId }'
     INNER JOIN reply
     ON reply.tweet_id = tweet.tweet_id
     WHERE tweet.tweet_id = '${ tweetId }';`
       
    const dbResponse = await db.all(selectRepliesQuery);
   if (dbResponse[0] === undefined){
       response.status(401);
       response.send("Invalid Request");
   }else{
    const reply = []
    const replyObject = {
        repiles:reply
    } 
    for (let replies of dbResponse){
       const replyObject1 = {
            name: replies.name,
            reply:replies.reply
        }
        reply.push(replyObject1)
    }
    response.send(replyObject);
   }    
}); 

// Get Logged User Tweet
app.get("/user/tweets/", authenticateToken, async (request, response) => {
    const { username } = request;

    const getUserIdQuery = `
    SELECT user_id AS userId
    FROM user     
    WHERE username = '${username}';`;

    const dbUser = await db.get(getUserIdQuery);
    const { userId } = dbUser;

    const selectTweetsQuery = `
    SELECT tweet.tweet,
    count(like.like_id) AS likes,
    count(reply.reply) AS replies,
    tweet.date_time AS dateTime
    FROM (tweet
    INNER JOIN like
    ON like.tweet_id = tweet.tweet_id) AS T
    INNER JOIN reply 
    ON reply.tweet_id = tweet.tweet_id
    WHERE tweet.user_id = '${userId}'`
    
    const dbResponse = await db.all(selectTweetsQuery);
    console.log(dbResponse);

});

// Get All Tweets For My Reference
app.get("/tweets/",  async (request, response) => {
  const selectTweet = `
    SELECT * 
    FROM 
    tweet`;
  const dbResponse = await db.all(selectTweet);
  response.send(dbResponse);
});

module.exports = app;
