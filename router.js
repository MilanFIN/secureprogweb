
pg			= require('pg');

const express = require('express')

const argon2 = require('argon2');

var path = require('path');
//for random secret generation
var hat = require('hat');

config		= require('./config/config'),
pgClient = new pg.Client(config.connectionString);
pgClient.connect();


const publicPath = __dirname + "/public/"

//ms to cookie expiration 
const EXPIRYTIME = 7200000 // (2 hours)


var loginTokens = {} //as {user: [token, datetime]}

var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser'); 
const rateLimit = require("express-rate-limit");



module.exports = function(app){

	app.enable('trust proxy');
	app.use (function (req, res, next) {
	  if (req.secure) {
		  // request was via https, so do no special handling
		  next();
	  } else {
		  // request was via http, so redirect to https
		  res.redirect('https://' + req.headers.host + req.url);
	  }
	  });
	  

	app.use(bodyParser.json()); // for parsing application/json
	app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
	app.use(cookieParser()); 
	
	const userApiLimiter = rateLimit({
		windowMs: 2 * 60 * 1000, 
		max: 5,
	});
	// only apply to requests that begin with /api/
	app.use("/user/", userApiLimiter);

	const messageApiLimiter = rateLimit({
		windowMs: 1 * 60 * 1000, 
		max: 2,
	});
	// only apply to requests that begin with /api/
	app.use("/messages/", messageApiLimiter);


	/*
	//redirect http to https, TODO: fix
	app.use (function (req, res, next) {
		if (req.secure) {
				next();
		} else {
				res.redirect('https://' + req.headers.host + req.url);
		}
	});
	*/
  
	app.use('/public', express.static(path.join(__dirname, "public")));


	function generateSecret() {
		return hat();
	}

	function verifyLogin(cookie) {
		if (!("user" in cookie)) {
			return false
		}
		if (!("token" in cookie)) {
			res.send("not")
			return false
		}
		let secret = cookie.token;
		let user = cookie.user

		if (!(user in loginTokens)) {
			return false
		}


		//expired token, can't allow login
		if (loginTokens[user][1] + EXPIRYTIME < Date.now()) {
			return false
		}

		if (loginTokens[user][0] === secret) {
			return true
		}
		else {
			return false
			
		}	
	}

	app.get('/', (req, res) => {
		res.sendFile(path.join(publicPath +"index.html"));
	})




	//Iterate users data from cookie 
	app.get("/loggedin", (req, res)=>{ 

		if (!("user" in req.cookies)) {
			res.send("not")
			return
		}
		if (!("token" in req.cookies)) {
			res.send("not")
			return
		}
		let secret = req.cookies.token;
		let user = req.cookies.user

		if (! (user in loginTokens)) {
			res.send("not")
			return;
		}

		if (loginTokens[user][1] + EXPIRYTIME < Date.now()) {
			res.send("not")
			return
		}

		if (loginTokens[user][0] === secret) {
			res.send("logged in")

		}
		else {
			res.send("not")
			
		}	
	}); 



	app.get("/topics", async(req, res) => {
		let pageNumber = req.query.page;
		pageNumber = parseInt(pageNumber)
		if (isNaN(pageNumber)) {
			res.status(404)
			return
		}
			//result is of structure: id: [topic, op]
		//let topics = [[1, "topic", "op"]]
		let topics = []
		let err, result = await pgClient.query("SELECT topics.id, MAX(messages.id) as message, topics.topic, topics.op FROM topics LEFT JOIN messages ON topics.id = messages.topic GROUP BY topics.id  ORDER BY message DESC;");
		//SELECT id, topic, op FROM topics ORDER BY id DESC
		//SELECT topics.id, MAX(messages.id) as message, topics.topic, topics.op FROM topics LEFT JOIN messages ON topics.id = messages.topic GROUP BY topics.id  ORDER BY message DESC;
		if (err) {
			res.json([])
			return
		}
		pageResult = result.rows.slice(5*pageNumber, 5*(1+pageNumber));//;

		pageResult.forEach(e => {
			let id = e.id;
			let topic = e.topic;
			let op = e.op;
			topics.push([id, topic, op])
		});


		let more = false
		if (result.rows.slice(5*(1+pageNumber)).length !== 0){
			more = true
		}
		let result2 = {"topics": topics, "more": more}
		res.json(result2)
	});

	app.get("/topic", async(req, res) => {

		let id = req.query.id;
		if (isNaN(id)) {
			res.status(404)
			return
		}

		let err, result = await pgClient.query("SELECT id, topic FROM topics where id = $1", [id]);

		if (err) {
			res.status(404).send("topic doesn't exist") //not logged in
			return
		}
		if (result.rows.length === 0) {
			res.status(404).send("topic doesn't exist") //not logged in
			return
		}

		let header = result.rows[0].topic;

		let messages = []
		let err2, result2 = await pgClient.query("SELECT id, op, message FROM messages WHERE topic = $1 ORDER BY id ASC", [id]);
		if (err2) {
			res.status(404).send("topic doesn't exist") //not logged in
			return
		}

		result2.rows.forEach(e => {
			let msgid = e.id;
			let op = e.op;
			let message = e.message;
			messages.push({"op": op, "message": message, "id":msgid})
		});

		result = {"header": header, "messages": messages}
		res.json(result)

	});

	app.post("/messages/message", async (req, res) => {
		if (!verifyLogin(req.cookies)) {
			res.status(403).send("not logged in") //not logged in
			return
		}

		let message = req.body.message;
		let user = req.cookies.user;
		let topic = req.body.topic;

		if (topic == "" || message == "" || message.length > 10000) {
			res.status(403).send("invalid inputs") 
			return
		}
		let err, result = await pgClient.query("INSERT INTO messages(topic, op, message) values($1, $2, $3)", [topic, user, message]);

		if (err) {
			res.status(403).send("invalid inputs") 
			return	
		}

		res.json({"user": user, "message": message});

	});

	app.post("/messages/topic", async (req, res) => {
		if (!verifyLogin(req.cookies)) {
			res.status(403).send("not logged in") //not logged in
			return
		}

		let topic = req.body.topic;
		let message = req.body.message;
		let user = req.cookies.user


		if (topic == "" || message == "" || message.length > 10000 || topic.length > 100) {
			res.status(403).send("invalid inputs") 
			return
		}

		//insert into db here
		//
		let err, result = await pgClient.query("INSERT INTO topics(op, topic) values($1, $2) RETURNING id", [user, topic]);
		if (err) {
			res.status(403).send("invalid inputs") 
			return
		}
		let id = result.rows[0].id;

		let err2, result2 = await pgClient.query("INSERT INTO messages(topic, op, message) values($1, $2, $3)", [id, user, message]);
		if (err2) {
			res.status(403).send("invalid inputs") 
			return
			//TODO: should delete topic here, as message couldn't be added
		}

		res.send("topic created")
		
	});


	app.post('/user/signup', async(req, res) => {

		
		let user = req.body.username;
		let passwd = req.body.password;


		if (passwd.length < 8) {
			res.status(200).send("password must be longer than 8 characters");
			return;
		}

		if (user != "" && passwd != "") {
			//NOTE: we don't have to use a separate salt, as argon2 generates a new salt each time we hash
			let hash = await argon2.hash(passwd);
			pgClient.query('INSERT INTO users(username, passwd) values($1, $2)', [user, hash], (err1, results) => {
				if (err1) {
					res.status(200).send("user exists");
				}
				else {
					res.status(200).send("user created")
		
				}

			});

		}
		else {
			res.status(403).send("error");
		}
	})

	app.post("/user/login", async(req, res) => {

		var user = req.body.username;
		let passwd = req.body.password;

		if (user != "" && passwd != "") {
			let err, result = await pgClient.query("SELECT passwd FROM users WHERE username = $1", [user]);
			if (err) {
				res.status(200).send("login error");
			}
			else {
				if (result.rows.length != 1) {
					res.status(200).send("invalid username or password")
				}
				else {
					let hash = result.rows[0].passwd;
					let correct = await argon2.verify(hash, passwd);

					if (correct) {
						let token = generateSecret()
						res.cookie("user", user, {expire: Date.now() + EXPIRYTIME});
						res.cookie("token", token, {expire: Date.now() + EXPIRYTIME});
						loginTokens[user] = [token, Date.now()]


						res.status(200).send("logged in")

					}
					else {
						res.status(200).send("invalid username or password")
					}

				}

			}


		}
		else {
			res.status(403).send("illegal credentials");
		}


	})


	app.get("/user/logout", (req, res) => {
		if (verifyLogin(req.cookies)) {
			delete loginTokens[req.cookies.user];
		}

		res.clearCookie("user");
		res.clearCookie("token") 
		res.sendFile(path.join(publicPath +"index.html"));

	});

}