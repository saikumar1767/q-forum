const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
const session = require("express-session");

const session_secret = "qforum";

const app = express();
app.use(express.json()); // added body key to req
app.set('trust proxy',1);
app.use(cors({
  credentials: true,
  origin: "https://q-forum.herokuapp.com"
}));
app.use(
  session({
    secret: session_secret,
    cookie: { maxAge: 1*60*60*1000, sameSite: 'none', secure: true }
  })
); // adds a property called session to req

// connect - must edit
const db = mongoose.createConnection("mongodb+srv://saikumar:venkat@1767@q-forum-app.palan.mongodb.net/q-forum?retryWrites=true&w=majority", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// schemas
const userSchema = new mongoose.Schema({
  userName: String,
  password: String,
});


const meetingSchema = new mongoose.Schema({
    meetingName: String,
    done: Boolean,
    startTime: Date,
    endTime: Date,
    userId: mongoose.Schema.Types.ObjectId,
});

const questionSchema = new mongoose.Schema({
  question: String,
  likes: Number,
  creationTime: Date,
  userId: mongoose.Schema.Types.ObjectId,
  meetingId: mongoose.Schema.Types.ObjectId, 
});

// models
const userModel = db.model("user", userSchema);
const meetingModel = db.model("meeting", meetingSchema);
const questionModel = db.model("question",questionSchema);

// backend apis
const isNullOrUndefined = (val) => val === null || val === undefined;
const SALT = 5;

app.post("/signup", async (req, res) => {
    const { userName, password } = req.body;
    if(userName.trim()==="" || userName.trim()===null || userName.trim()===undefined)
      res.sendStatus(404);
    if(password.trim()==="" || password.trim()===null || password.trim()===undefined)
      res.sendStatus(404);
    const existingUser = await userModel.findOne({ userName });
    if (isNullOrUndefined(existingUser)) {
        // we should allow signup
        const hashedPwd = bcrypt.hashSync(password, SALT);
        const newUser = new userModel({ userName, password: hashedPwd });

        await newUser.save();
        req.session.userId = newUser._id;
        res.status(201).send({ success: "Signed up" });
    } else {
        res.status(400).send({
        err: `UserName ${userName} already exists. Please choose another.`,
        });
    }
});

app.post("/login", async (req, res) => {
    const { userName, password } = req.body;
    const existingUser = await userModel.findOne({
      userName,
    });
  
    if (isNullOrUndefined(existingUser)) {
      res.status(401).send({ err: "UserName does not exist." });
    } else {
      const hashedPwd = existingUser.password;
      if (bcrypt.compareSync(password, hashedPwd)) {
        req.session.userId = existingUser._id;
        console.log('Session saved with', req.session);
        res.status(200).send({ success: "Logged in" });
      } else {
        res.status(401).send({ err: "Password is incorrect." });
      }
    }
});

const AuthMiddleware = async (req, res, next) => {
    console.log('Session', req.session);
  // added user key to req
  if (isNullOrUndefined(req.session) || isNullOrUndefined(req.session.userId) ) {
    res.status(401).send({ err: "Not logged in" });
  } else {
    next();
  }
};

app.get("/meetings", AuthMiddleware, async (req, res) => {
    const allmeetings = await meetingModel.find();
    res.send(allmeetings);
});

app.get("/meeting/:mid", AuthMiddleware, async (req, res) => {
  try{
    const meets = await meetingModel.findOne({ _id: req.params.mid });
    if(String.valueOf(meets.userId) === String.valueOf(req.session.userId)){
      const username= await userModel.findOne({ _id: meets.userId});
      res.status(200).send({ 
        userId: meets.userId,
        userName: username.userName
      });
    }
    else
      res.sendStatus(401);
  }catch(e){
    res.sendStatus(404);
  }
});

app.get("/meeting/:mid/questions", AuthMiddleware, async (req, res) => {
    const allquestions = await questionModel.find({ meetingId: req.params.mid });
    res.send(allquestions);
});

app.post("/meeting", AuthMiddleware, async (req, res) => {
    const meeting = req.body;
    meeting.done = false;
    meeting.userId = req.session.userId;
    const newMeeting = new meetingModel(meeting);
    await newMeeting.save();
    res.status(201).send(newMeeting);
});

app.post("/meeting/:mid/askQuestion", AuthMiddleware, async (req, res) => {
    console.log("entered");
    const question = req.body;
    question.creationTime = new Date();
    question.userId = req.session.userId;
    question.meetingId = req.params.mid
    const newQuestion = new questionModel(question);
    await newQuestion.save();
    res.status(201).send(newQuestion);
});

app.put("/meeting/:mid", AuthMiddleware, async (req, res) => {
  const  meet  = req.body;
  const meetingId = req.params.mid;

  try {
    const meeting = await meetingModel.findOne({ _id: meetingId, userId: req.session.userId});
    if (isNullOrUndefined(meeting)) {
      res.sendStatus(404);
    } else {
      if(meet.meetingName)
        meeting.meetingName = meet.meetingName;
      if(meet.startTime)
        meeting.startTime = meet.startTime;
      if(meet.endTime)
        meeting.endTime = meet.endTime;
      
      await meeting.save();
      res.send(meeting);
    }
  } catch (e) {
    res.sendStatus(404);
  }
});

app.put("/meeting/:mid/questions/:qid", AuthMiddleware, async (req, res) => {
  const  ques  = req.body;
  const meetingId = req.params.mid;
  const questionId = req.params.qid;

  try {
    const quest = await questionModel.findOne({ _id: questionId, meetingId: meetingId, userId: req.session.userId });
    if (isNullOrUndefined(quest)) {
      res.sendStatus(404);
    } else {
      if(ques.question)
        quest.question = ques.question;
      if(ques.likes)
        quest.likes = ques.likes;
      await quest.save();
      res.send(quest);
    }
  } catch (e) {
    res.sendStatus(404);
  }
});

app.delete("/meeting/:mid", AuthMiddleware, async (req, res) => {
  const mid = req.params.mid;

  try {
    await questionModel.deleteMany({ meetingId: mid, userId: req.session.userId });
    await meetingModel.deleteOne({ _id: mid, userId: req.session.userId });
    res.sendStatus(200);
  } catch (e) {
    res.sendStatus(404);
  }
});

app.delete("/meeting/:mid/questions/:qid", AuthMiddleware, async (req, res) => {
  const mid = req.params.mid;
  const qid = req.params.qid;

  try {
    await questionModel.deleteOne({ _id: qid, meetingId: mid, userId: req.session.userId });
    res.sendStatus(200);
  } catch (e) {
    res.sendStatus(404);
  }
});

app.get("/logout", (req, res)=> {
    if(!isNullOrUndefined(req.session)) {
        // destroy the session
        req.session.destroy(() => {
            res.sendStatus(200);
        });

    } else {
        res.sendStatus(200);
    }
});

app.get('/userinfo', AuthMiddleware, async (req, res) => {
    const user = await userModel.findById(req.session.userId);
    res.send({ 
      userName : user.userName,
      _id : user._id 
    });
});

app.listen(process.env.PORT);
//app.listen(9999);