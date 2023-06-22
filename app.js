const express = require("express");
const app = express();

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const jwt = require("jsonwebtoken");
app.use(express.json());
const bcrypt = require("bcrypt");

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
};

initializeDbAndServer();

// Authenticate JWT token Middleware Function
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
undefined
  if (authHeader !== ) {
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
};

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
  //   const dateTime = `${todayDate}month, year, hours, minutes, seconds`
  //   console.log(todayDate, month, year, hours, minutes, seconds);
  const createTweetQuery = `
    INSERT INTO tweet (tweet, user_id)
    VALUES ('${tweet}', '${userId}');`;
  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

// Delete Tweet API
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
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
  }
);

// Get Followers API
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const selectLoggedUserQuery = `
    SELECT user_id AS userId
    FROM 
    user
    WHERE username = '${username}'`;

  const dbUser = await db.get(selectLoggedUserQuery);
  const { userId } = dbUser;

  const selectFollowingQuery = `
    SELECT user.name
    FROM user
    INNER JOIN follower
    ON user.user_id = follower.following_user_id
    WHERE follower.follower_user_id = '${userId}';`;
  const dbResponse = await db.all(selectFollowingQuery);
  response.send(dbResponse);
});

// Get Tweets  Feed API
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
  const dbUser = await db.get(selectUserQuery);
  const followingUsersQuery = `
    SELECT following_user_id FROM follower 
    WHERE follower_user_id = ${dbUser.user_id};
  `;
  const followingUsersObjectsList = await db.all(followingUsersQuery);
  const followingUsersList = followingUsersObjectsList.map((object) => {
    return object["following_user_id"];
  });
  const getTweetsQuery = `
  SELECT 
    user.username AS username, 
    tweet.tweet AS tweet, 
    tweet.date_time AS dateTime
  FROM 
    tweet 
    INNER JOIN user ON tweet.user_id = user.user_id 
  WHERE
    tweet.user_id IN (
        ${followingUsersList}
    )
  ORDER BY tweet.date_time DESC 
  LIMIT 4;
  `;

  const tweets = await db.all(getTweetsQuery);
  response.send(tweets);
});

// Get Followers API
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;

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
WHERE follower.following_user_id = '${userId}'`;

  const dbResponse = await db.all(selectFollowersQuery);
  response.send(dbResponse);
});

// Get Specific Tweet API
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
  const dbUser = await db.get(selectUserQuery);
  const getTweetQuery = `
  SELECT * FROM tweet WHERE tweet_id = ${tweetId};
  `;
  const tweetInfo = await db.get(getTweetQuery);

  const followingUsersQuery = `
    SELECT following_user_id FROM follower 
    WHERE follower_user_id = ${dbUser.user_id};
  `;
  const followingUsersObjectsList = await db.all(followingUsersQuery);
  const followingUsersList = followingUsersObjectsList.map((object) => {
    return object["following_user_id"];
  });
  if (!followingUsersList.includes(tweetInfo.user_id)) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const { tweet_id, date_time, tweet } = tweetInfo;
    const getLikesQuery = `
    SELECT COUNT(like_id) AS likes FROM like 
    WHERE tweet_id = ${tweet_id} GROUP BY tweet_id;
    `;
    const likesObject = await db.get(getLikesQuery);
    const getRepliesQuery = `
    SELECT COUNT(reply_id) AS replies FROM reply 
    WHERE tweet_id = ${tweet_id} GROUP BY tweet_id;
    `;
    const repliesObject = await db.get(getRepliesQuery);
    response.send({
      tweet,
      likes: likesObject.likes,
      replies: repliesObject.replies,
      dateTime: date_time,
    });
  }
});

// Get Likes API
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
    const dbUser = await db.get(selectUserQuery);
    const getTweetQuery = `
  SELECT * FROM tweet WHERE tweet_id = ${tweetId};
  `;
    const tweetInfo = await db.get(getTweetQuery);

    const followingUsersQuery = `
    SELECT following_user_id FROM follower 
    WHERE follower_user_id = ${dbUser.user_id};
  `;
    const followingUsersObjectsList = await db.all(followingUsersQuery);
    const followingUsersList = followingUsersObjectsList.map((object) => {
      return object["following_user_id"];
    });
    if (!followingUsersList.includes(tweetInfo.user_id)) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const { tweet_id, date_time } = tweetInfo;
      const getLikesQuery = `
        SELECT user_id FROM like 
        WHERE tweet_id = ${tweet_id};
        `;
      const likedUserIdObjectsList = await db.all(getLikesQuery);
      const likedUserIdsList = likedUserIdObjectsList.map((object) => {
        return object.user_id;
      });
      const getLikedUsersQuery = `
      SELECT username FROM user 
      WHERE user_id IN (${likedUserIdsList});
      `;
      const likedUsersObjectsList = await db.all(getLikedUsersQuery);
      const likedUsersList = likedUsersObjectsList.map((object) => {
        return object.username;
      });
      response.send({
        likes: likedUsersList,
      });
    }
  }
);

//Get Tweet Replies API
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
    const dbUser = await db.get(selectUserQuery);
    const getTweetQuery = `
  SELECT * FROM tweet WHERE tweet_id = ${tweetId};
  `;
    const tweetInfo = await db.get(getTweetQuery);

    const followingUsersQuery = `
    SELECT following_user_id FROM follower 
    WHERE follower_user_id = ${dbUser.user_id};
  `;
    const followingUsersObjectsList = await db.all(followingUsersQuery);
    const followingUsersList = followingUsersObjectsList.map((object) => {
      return object["following_user_id"];
    });
    if (!followingUsersList.includes(tweetInfo.user_id)) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const { tweet_id, date_time } = tweetInfo;
      const getUserRepliesQuery = `
    SELECT user.name AS name, reply.reply AS reply
    FROM reply 
    INNER JOIN user ON reply.user_id = user.user_id 
    WHERE reply.tweet_id = ${tweet_id};
    `;
      const userRepliesObject = await db.all(getUserRepliesQuery);
      response.send({
        replies: userRepliesObject,
      });
    }
  }
);

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
    SELECT tweet AS Tweets,
    date_time AS dateTime, 
    tweet_id
    FROM tweet 
    WHERE tweet.user_id = '${userId}'`;

  const dbResponseTweets = await db.all(selectTweetsQuery);
  const tweetList = [];
  // console.log(dbResponseTweets)

  for (let tweets of dbResponseTweets) {
    const { Tweets, tweet_id, dateTime } = tweets;
    const tweetObject = {
      tweet: Tweets,
      likes: null,
      replies: null,
      dateTime: null,
    };
    const selectTweetsLikesQuery = `
        SELECT COUNT(like_id) AS like
        FROM like 
        WHERE like.tweet_id = '${tweet_id}'`;
    const dbResponseLikes = await db.all(selectTweetsLikesQuery);
    const [like] = dbResponseLikes;
    tweetObject.likes = like.like;

    const selectTweetsReplyQuery = `
        SELECT COUNT(reply) AS reply
        FROM reply 
        WHERE reply.tweet_id = '${tweet_id}'`;
    const dbResponseReply = await db.all(selectTweetsReplyQuery);
    const [reply] = dbResponseReply;
    tweetObject.replies = reply.reply;

    tweetObject.dateTime = dateTime;

    tweetList.push(tweetObject);
  }
  response.send(tweetList);
});

// Get All Tweets For My Reference
app.get("/users/", async (request, response) => {
  const selectTweet = `
    SELECT * 
    FROM 
    user`;
  const dbResponse = await db.all(selectTweet);
  response.send(dbResponse);
});

module.exports = app;
