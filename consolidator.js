const config = require("./config.consolidator.json");
const balanceFile = "./consolidated.json";

const jsonfile = require("jsonfile");
const later = require('later');

const Logic = require("./logic");
const logic = new Logic(config);
const util = require("./util");

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
      const newBalance = await logic.retrieveNewForgedBalance(balance);
      console.log('-------------------------------------------------------');
      const newAccounts = await Promise.all(newBalance.accounts.map(account => logic.payout(account, argv.dryrun)));
      console.log('-------------------------------------------------------');
      console.log(`Total amount sent to node for processing: ${util.dustToLSK(newAccounts.reduce((mem, a) => mem = mem + a.paid, 0))}`);
      console.log('-------------------------------------------------------');
      newBalance.accounts = newAccounts.map(a => a.account);
      if (!argv.dryrun) {
        jsonfile.writeFile(balanceFile, newBalance, (err) => {
          if (err) {
            throw { data: newBalance, err };
          }
        });
      }
    } catch (e) {
      console.log('Encountered an error while trying to update the balance');
      console.log('This had to be saved to disk but failed, verify everything!');
      console.log(JSON.stringify(errObj.data, null, 2));
      throw errObj.err;
    }
  }); 
}

if (argv.once) {
  app();
} else {
  console.log('Consolidator started succesfully, next run will be at: ' + later.schedule(schedule).next(1));

  later.setInterval(app, schedule);
}