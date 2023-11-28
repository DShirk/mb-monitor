const { MD5 } = require("crypto-js");
const https = require("https");

function syncDB(client) {
  console.log("Syncing data with CFPB....");
  // setTimeout to make sure client object has time to be initialized and passed to this function.
  const loanTypes = ["fixed", "adjustable"];

  loanTypes.forEach(async (type) => {
    const txtData = await fetchData(type);
    const newWeeks = parseWeeksFromTxt(txtData);
    const storedWeeks = await getAllWeeks(type, client);
    const missingWeeks = findMissingWeeks(storedWeeks, newWeeks);

    if (missingWeeks.length > 0) {
      console.log("missing weeks", missingWeeks);
      updateWeeksInDB(missingWeeks, type, client);
      archive(txtData, type, client, true);
      return;
    }
    console.log(`${type}: No missing weeks.`);
    archive(txtData, type, client, false);
  });
}

async function fetchData(loanType) {
  const formattedLoanType =
    loanType.charAt(0).toUpperCase() + loanType.slice(1);
  const url = `https://s3.amazonaws.com/cfpb-hmda-public/prod/apor/YieldTable${formattedLoanType}.txt`;

  const response = await new Promise((resolve, reject) => {
    let data = "";

    https.get(url, (res) => {
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        resolve(data);
      });
    });
  });

  return response;
}

function parseWeeksFromTxt(txtData) {
  const parsed = [];

  let records = txtData.split("\n");

  records.forEach((record, i) => {
    if (i === 0) return;
    if (record === "") return;

    let parsedRecord = record.split("|");
    let date = parsedRecord.splice(0, 1);

    const obj = {
      date: date[0],
      dateISO: new Date(date[0]).toISOString(),
      dateAdded: new Date().toLocaleDateString(),
      timeAdded: new Date().toTimeString(),
      amended: false,
      rates: parsedRecord,
    };
    parsed.push(obj);
  });

  return parsed;
}

async function getAllWeeks(loanType, client) {
  let collection = client
    .db("mortgagebanking-staging")
    .collection(`apor-weekly-${loanType}-iso-sandbox`);
  let weeks = await collection.find({}).toArray();
  return weeks;
}

function findWeekByDate(date, weeks) {
  let allMatchingWeeks = [];

  weeks.forEach((week) => {
    if (week.date === date) allMatchingWeeks.push(week);
  });

  allMatchingWeeks.sort((a, b) => {
    return new Date(b.dateAdded) - new Date(a.dateAdded);
  });

  return allMatchingWeeks[0];
}

function compareRates(oldWeekRates, newWeekRates) {
  let matching = true;
  for (let i = 0; i < oldWeekRates.length; i++) {
    if (oldWeekRates[i] !== newWeekRates[i]) {
      matching = false;
      break;
    }
  }
  return matching;
}

function findMissingWeeks(storedWeeks, newWeeks) {
  // takes newWeeks and storedWeeks. Each being an array of week objects.
  // newWeeks is the weeks just parsed from the txt file, storedWeeks are the weeks from the database.
  // handles all updates in database, temp file, etc.

  // array to contain all weeks to be inserted into the database with insertMany. In most
  // cases this array will only contain one week object.
  const missingWeeks = [];

  newWeeks.forEach((newWeek, i) => {
    const matchingStoredWeek = findWeekByDate(newWeek.date, storedWeeks);

    if (matchingStoredWeek) {
      const matchingRates = compareRates(
        newWeek.rates,
        matchingStoredWeek.rates
      );

      if (!matchingRates) {
        // found an amendment to an existing week.
        const missingWeek = newWeek;

        missingWeek.dateAdded = new Date().toLocaleDateString();
        missingWeek.timeAdded = new Date().toTimeString();
        missingWeek.amended = true;

        missingWeeks.push(missingWeek);
        // add newWeek to database to missingWeeks with amended: true.
        // find matchingStoredWeek in database and toggle amended: true on it.
      }
    } else {
      // found new week.
      const missingWeek = newWeek;
      missingWeek.dateAdded = new Date().toLocaleDateString();
      missingWeeks.push(missingWeek);
    }
  });

  return missingWeeks;
}

async function updateWeeksInDB(missingWeeks, loanType, client) {
  const collection = client
    .db("mortgagebanking-staging")
    .collection(`apor-weekly-${loanType}-iso-sandbox`);

  missingWeeks.forEach(async (week) => {
    if (week.amended) {
      // do db query to find other weeks matching week.date, then make sure they have the amended flag toggled on.

      const filter = { date: week.date };

      const updateDocument = { $set: { amended: true } };

      const updateResult = await collection.updateMany(filter, updateDocument);
      console.log("updateResult", updateResult);
    }
  });

  const insertResult = await collection.insertMany(missingWeeks);
  console.log("insertResult", insertResult);
}
// TODO: Sign in to MongoDB and create set of apor-archive collections for the different loan types.
async function archive(data, loanType, client, unique) {
  const document = {
    unique: unique,
    body: data,
    hash: MD5(data).toString(),
    date: new Date().toLocaleDateString(),
    timeAdded: new Date().toTimeString(),
  };

  const collection = client
    .db("mortgagebanking-staging")
    .collection(`apor-archive-${loanType}`);

  const result = await collection.insertOne(document);
  console.log("archive result", result);
}

// Scripts to update the publish date.
// ==================================================================================================
async function updatePublishDate(loanType, client) {
  const collection = client
    .db("mortgagebanking-staging")
    .collection(`apor-weekly-${loanType}-iso`);

  const result = await collection.find({}).toArray();

  result.forEach((week) => {
    delete week["_id"];
    if (week.dateISO <= new Date("6/15/2023").toISOString()) {
      week.dateAdded = new Date(
        new Date(week.dateAdded).setDate(new Date(week.dateAdded).getDate() - 3)
      ).toLocaleDateString();
    }
  });

  fs.writeFileSync(`dump-${loanType}-updated.json`, JSON.stringify(result));
}

async function upload(loanType, client) {
  const collection = client
    .db("mortgagebanking-staging")
    .collection(`apor-weekly-${loanType}-iso-sandbox`);

  const result = await collection.insertMany(data);
  console.log("result", result);
}

module.exports = syncDB;
