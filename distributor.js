const config = require("./config.distributor.json");
const balanceFile = "./distributed.json";

const jsonfile = require("jsonfile");
const later = require('later');

const util = require("./util");
const Logic = require("./logic");
const logic = new Logic(config);

const argv = require('yargs')
.option('once', {
    type: 'boolean', demand: false, default: false
})
.option('dryrun', {
    type: 'boolean', demand: false, default: false
})
.alias('o', 'once')
.alias('d', 'dryrun')
.alias('h', 'help')
.argv;

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
      console.log(`New owed balance:`);
      console.log(JSON.stringify(newBalance, null, 2));
      if (newBalance) {
        console.log('-------------------------------------------------------');
        const newAccounts = await Promise.all(newBalance.accounts.map(account => logic.payout(account, argv.dryrun)));
        console.log('-------------------------------------------------------');
        newBalance.accounts = newAccounts;
        console.log(`New processed balance:`);
        console.log(JSON.stringify(newBalance, null, 2));
        console.log("Paid : " + util.dustToLSK(newBalance.accounts.reduce((mem, val) => mem = mem + val.paidBalance, 0)) + " LSK");
        console.log("Unpaid : " + util.dustToLSK(newBalance.accounts.reduce((mem, val) => mem = mem + val.unpaidBalance, 0)) + " LSK");
        if (!argv.dryrun) {
          jsonfile.writeFile(balanceFile, newBalance, (err) => {
            if (err) {
              throw err;
            }
          });
        }
      } else {
        throw new Error("Undefined balance");
      }
    } catch (e) {
      console.log('Encountered an error while trying to update the balance');
      throw e;
    }
  }); 
}

if (argv.once) {
  app();
} else {
  console.log('Distributor started succesfully, next run will be at: ' + later.schedule(schedule).next(1));

  later.setInterval(app, schedule);
}