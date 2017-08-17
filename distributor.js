const config = require("./config.distributor.json");
const balanceFile = "./distributed.json";

const jsonfile = require("jsonfile");
const later = require('later');

const util = require("./util");
const Logic = require("./logic");
const logic = new Logic(config);

const schedule = later.parse.cron(config.schedule);

async function app() {
  jsonfile.readFile(balanceFile, async (err, balance) => {
    if(!balance) {
      balance = {
        updateTimestamp: util.unixTimeStamp(new Date().getTime()),
        accounts: []
      }
    }
    try {
      const newBalance = await logic.retrieveNewBalance(balance);
      console.log(`New owed balance: ${JSON.stringify(newBalance, null, 2)}`);
      if (newBalance) {
        const newAccounts = await Promise.all(newBalance.accounts.map(account => logic.payout(account)));
        newBalance.accounts = newAccounts;
        console.log(`New processed balance: ${JSON.stringify(newBalance, null, 2)}`);
        console.log("Paid : " + newBalance.accounts.reduce((mem, val) => mem = mem + val.paidBalance, 0));
        console.log("Unpaid : " + newBalance.accounts.reduce((mem, val) => mem = mem + val.unpaidBalance, 0));
        jsonfile.writeFile(balanceFile, newBalance, (err) => {
          if (err) {
            throw err;
          }
        });
      } else {
        throw new Error("Undefined balance");
      }
    } catch (e) {
      console.log('Encountered an error while trying to update the balance');
      throw e;
    }
  }); 
}

later.setInterval(app, schedule);