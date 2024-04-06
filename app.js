const express = require("express");
const app = express();
app.use(express.json());

const jwt = require("jsonwebtoken");

const bcrypt = require("bcrypt");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "eCartApplication.db");

let db = null;

const initializationDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server running at http://localhost:3000");
    });
  } catch (error) {
    console.log(`Error at : ${error.message}`);
    process.exit(1);
  }
};

initializationDBAndServer();

// jwt token verification

const checkTheAuthentication = (request, response, next) => {
  const authHeader = request.headers["authorization"];

  let jwtToken;

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }

  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "satish", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        request.userId = payload.userId;
        next();
      }
    });
  }
};

const tweetVerification = async (request, response, next) => {
  const { userId } = request;
  const { tweetId } = request.params;
  const getTheTweetQuery = `SELECT * FROM 
    tweet INNER JOIN follower 
    ON follower.follower_user_id=tweet.tweet_id
    WHERE tweet.tweet_id='${tweetId}' AND follower_user_id=${userId};`;

  const tweet = await db.get(getTheTweetQuery);

  if (tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

const getTheFollowingPeopleOfUser = async (username) => {
  const getTheFollowersIdQuery = `SELECT following_user_id 
    FROM follower 
    INNER JOIN user 
    follower.user_id=user.user_id WHERE username='${username}';`;
  const followersIdArray = await db.all(getTheFollowersIdQuery);
  const followersIds = followersIdArray.map((each) => each.following_user_id);
  return followersIds;
};

//register api -1 check the user is authenticated or not

app.post("/register/", async (request, response) => {
  const { username, password, gender, name,age,mobile_number,location} = request.body;
  const checkUserQuery = `SELECT * FROM user_table WHERE username='${username}';`;

  const isUserExists = await db.get(checkUserQuery);

  if (isUserExists !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const addUserToDBQuery = `INSERT INTO 
      user_table(username,password,gender,name,age,mobile_number,location)
            VALUES ('${username}',
            '${hashedPassword}',
            '${gender}',
            '${name}',
            '${age}',
            '${mobile_number}'
            '${location}');`;
      await db.run(addUserToDBQuery);
      response.status(200);
      response.send("User created successfully");
    }
  }
});

// login api

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const getTheUserDetailsQuery = `SELECT * FROM user
     WHERE username='${username}';`;
  const userDetails = await db.get(getTheUserDetailsQuery);

  if (userDetails === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    //checking the password
    const isPasswordMatched = await bcrypt.compare(
      password,
      userDetails.password
    );
    if (isPasswordMatched) {
      const payload = { username, userId: userDetails.user_id };
      const jwtToken = jwt.sign(payload, "satish");
      response.status(200);
      response.send({ jwtToken });
      console.log(jwtToken);
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API-3 get latest 4 tweets

app.get(
  "/user/tweets/feed/",
  checkTheAuthentication,
  async (request, response) => {
    const { username } = request;
    const followersIdsList = await getTheFollowingPeopleOfUser(username);
    const getTheLatestTweetsQuery = `SELECT
     username,
     tweet,
     date_time as dateTime
      FROM user INNER JOIN tweet 
      ON user.user_id=tweet.user_id 
      WHERE user.user_id IN (${followersIdsList})'
    ORDER BY date_time DESC
     LIMIT=4;`;
    const tweetArray = await db.all(getTheLatestTweetsQuery);
    response.send(tweetArray);
  }
);

//API-4

app.get(
  "/user/following/",
  checkTheAuthentication,
  async (request, response) => {
    const { username, userId } = request;
    const getTheFollowingUserQuery = `SELECT name FROM follower 
    INNER JOIN user on user.user_id=follower.following_user_id 
    WHERE follower_user_id='${userId}';`;
    const followingPeople = await db.all(getTheFollowingUserQuery);
    response.send(followingPeople);
  }
);

//API-5

app.get(
  "/user/followers/",
  checkTheAuthentication,
  async (request, response) => {
    const { username, userId } = request;
    const getTheUserFollowersQuery = `SELECT DISTINCT name from follower
    INNER JOIN user ON user.user_id=follower.follower_user_id 
    WHERE user_id='${userId}';`;

    const followersList = await db.all(getTheUserFollowersQuery);
    response.send(followersList);
  }
);

//API -6

app.get(
  "/tweets/:tweetId/",
  checkTheAuthentication,
  tweetVerification,
  async (request, response) => {
    const { userId, username } = request;
    const { tweetId } = request.params;
    const getTheTweetQuery = `SELECT tweet 
      (SELECT COUNT() FROM like WHERE tweet_id='${tweetId}') AS likes 
      (SELECT COUNT() FROM reply WHERE tweet_id='${tweetId}') AS replies 
      date_time AS dateTime FROM tweet WHERE tweet_id='${tweetId}';`;

    const tweet = await db.get(getTheTweetQuery);
    response.send(tweet);
  }
);

// API-7

app.get(
  "/tweets/:tweetId/likes/",
  checkTheAuthentication,
  tweetVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    const { userId, username } = request;
    const getLikesArrayQuery = `SELECT username
     FROM user INNER JOIN 
     like ON user.user_id=like.user_id WHERE tweet_id='${tweetId}';`;
    const likesArray = await db.all(getLikesArrayQuery);
    const userArray = likesArray.map((each) => each.username);
    response.send({ Likes: userArray });
  }
);

// API-8

app.get(
  "/tweets/:tweetId/replies/",
  checkTheAuthentication,
  tweetVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    const { userId, username } = request;
    const getTheReplyQuery = `SELECT name,reply 
    FROM user INNER JOIN 
    reply ON user.user_id=reply.user_id 
    WHERE tweet_id='${tweetId}';`;

    const repliesArray = await db.all(getTheReplyQuery);
    response.send({ replies: repliesArray });
  }
);

//API-9

app.get("/user/tweets/", checkTheAuthentication, async (request, response) => {
  const { userId, username } = request;
  const getTweetsListOfUserQuery = `SELECT tweet,
   COUNT(DISTINCT like_id) as likes,
COUNT(DISTINCT reply_id) as replies, date_time as dateTime FROM tweet 
LEFT JOIN reply ON tweet.tweet_id= reply.tweet_id
LEFT JOIN like ON tweet.tweet_id=like.tweet_id 
WHERE tweet.user_id=${userId}
GROUP BY tweet.user_id;`;

  const tweets = await db.all(getTweetsListOfUserQuery);
  response.send(tweets);
});

//API-10

app.post("/user/tweets/", checkTheAuthentication, async (request, response) => {
  const { tweet } = request.body;
  const userId = parseInt(request.userId);
  const dateTime = new Date().toJSON().substring(0, 19).replace("T", " ");
  const createTweetQuery = `INSERT INTO 
  tweet(tweet,user_id,date_time)
   VALUES('${tweet}','${userId}','${dateTime}');`;

  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

// API-11

app.delete(
  "/tweets/:tweetId/",
  checkTheAuthentication,
  async (request, response) => {
    const { tweetId } = request.params;
    const { userId } = request;
    const searchTweetQuery = `SELECT * FROM tweet 
    WHERE user_id='${userId}' AND tweet_id='${tweetId}'; `;
    const tweet = await db.get(searchTweetQuery);

    if (tweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteQuery = `DELETE FROM tweet  WHERE tweet_id='${tweetId}';`;
      await db.run(deleteQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;