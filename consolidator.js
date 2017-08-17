const config = require("./config.consolidator.json");
const balanceFile = "./consolidated.json";

const jsonfile = require("jsonfile");
const later = require('later');

const Logic = require("./logic");
const logic = new Logic(config);

const schedule = later.parse.cron(config.schedule);

async function app() {
  jsonfile.readFile(balanceFile, async (err, balance) => {
    if(!balance) {
      balance = {
        updateTimestamp: unixTimeStamp(new Date().getTime()),
        accounts: []
      }
    }
    try {
      const newBalance = await logic.retrieveNewForgedBalance(balance);
      console.log(`New owed balance: ${JSON.stringify(newBalance)}`);
      const newAccounts = await Promise.all(newBalance.accounts.map(account => logic.payout(account)));
      newBalance.accounts = newAccounts;
      console.log(`New processed balance: ${JSON.stringify(newBalance)}`);
      jsonfile.writeFile(balanceFile, newBalance, (err) => {
        if (err) {
          throw err;
        }
      });
    } catch (e) {
      console.log('Encountered an error while trying to update the balance');
      throw e;
    }
  }); 
}

later.setInterval(app, schedule);