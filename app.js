"use strict";

const { MongoClient } = require("mongodb");
const dotenv = require("dotenv");
dotenv.config();

const dbUrl = `mongodb+srv://admin:${process.env.DB_KEY}@cluster0.vl3pn.mongodb.net`;

const client = new MongoClient(dbUrl);
client.connect();

const syncDB = require("./apor/sync");

setTimeout(() => {
  syncDB(client);
}, 2000);
