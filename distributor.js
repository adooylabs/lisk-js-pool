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

let toWriteBalance;

async function app() {
  jsonfile.readFile(balanceFile, async (err, balance) => {
    if(!balance) {
      balance = {
        updateTimestamp: util.unixTimeStamp(new Date().getTime()),
        accounts: []
      }
    }
    try {
      await logic.checkLaunch();
      const { newBalance, distributable, payableAmount } = await logic.retrieveNewBalance(balance);
      if (newBalance) {
        console.log('-------------------------------------------------------');
        console.log("Historical Paid : " + util.dustToLSK(balance.accounts.reduce((mem, val) => mem = mem + val.paidBalance, 0)) + " LSK");
        console.log("Historical Unpaid : " + util.dustToLSK(balance.accounts.reduce((mem, val) => mem = mem + val.unpaidBalance, 0)) + " LSK");
        console.log(`Distributable balance: ${util.dustToLSK(distributable)}`);
        console.log(`Payable balance: ${util.dustToLSK(payableAmount)}`);
        console.log(`Paid ${newBalance.accounts.filter(a => a.unpaidBalance >= util.LSKToDust(config.minPayout)).length} accounts`);
        console.log(`Unpaid ${newBalance.accounts.filter(a => a.unpaidBalance < util.LSKToDust(config.minPayout)).length} accounts`);
        console.log('-------------------------------------------------------');
        const newAccounts = await Promise.all(newBalance.accounts.map(account => logic.payout(account, argv.dryrun)));
        console.log('-------------------------------------------------------');
        console.log(`Total amount sent to node for processing: ${util.dustToLSK(newAccounts.reduce((mem, a) => mem = mem + a.paid, 0))}`);
        console.log('-------------------------------------------------------');
        newBalance.accounts = newAccounts.map(a => a.account);
        toWriteBalance = newBalance;
        console.log("Final Paid : " + util.dustToLSK(newBalance.accounts.reduce((mem, val) => mem = mem + val.paidBalance, 0)) + " LSK");
        console.log("Final Unpaid : " + util.dustToLSK(newBalance.accounts.reduce((mem, val) => mem = mem + val.unpaidBalance, 0)) + " LSK");
        console.log('-------------------------------------------------------');
        if (!argv.dryrun) {
          jsonfile.writeFile(balanceFile, newBalance, (err) => {
            if (err) {
              throw { data: newBalance, err };
            }
          });
        }
      } else {
        throw new Error("Undefined balance");
      }
    } catch (err) {
      console.log('Encountered an error while trying to update the balance:');
      console.log(err);
      if(toWriteBalance) {
        console.log('This had to be saved to disk but failed, verify everything!');
        console.log(JSON.stringify(toWriteBalance, null, 2));
      }
    }
  }); 
}

if (argv.once) {
  app();
} else {
  console.log('Distributor started succesfully, next run will be at: ' + later.schedule(schedule).next(1));

  later.setInterval(app, schedule);
}