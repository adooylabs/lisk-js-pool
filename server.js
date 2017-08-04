const config = require("./config.json");
const balanceFile = "./balance.json";

const axios = require("axios");
const jsonfile = require("jsonfile");
const math = require("mathjs");
const lisk = require("lisk-js");

const http = axios.create({
  baseURL: "http://" + config.node + ":" + config.port,
  timeout: 5000
});

function dustToLSK(dust) {
  return math.round(math.eval(`${dust} / 100000000`),4);
}

function LSKToDust(LSK) {
  return LSK * 100000000;
}

function unixTimeStamp(jsTimestamp) {
  return jsTimestamp / 1000 | 0;
}

function getTransactionFee() {
  return LSKToDust(0.1);
}

async function getEligableVoters() {
  const delegates = await Promise.all(config.requiredVotes.map(delegate => http.get(`/api/delegates/get?username=${delegate}`)));
  const blacklist = delegates.map(delegate => delegate.data.delegate.address);
  blacklist.push(config.address);
  const delegateVoters = await Promise.all(delegates.map(async delegate => {
    const voters = await http.get(`/api/delegates/voters?publicKey=${delegate.data.delegate.publicKey}`);
    return {delegate: delegate.data.delegate.username, voters: voters.data.accounts};
  }));
  const allVoters = [];
  delegateVoters.forEach(delegate => {
    delegate.voters.forEach(voter => {
      const found = allVoters.filter(eligableVoter => eligableVoter.address == voter.address);
      if (found.length === 0) {
        allVoters.push({voter, votes: 1});
      } else {
        found[0].votes = found[0].votes + 1;
      }
    });
  });
  return allVoters.filter(eligableVoter => eligableVoter.votes == config.requiredVotes.length && blacklist.filter(delegate => delegate == eligableVoter.voter.address).length === 0);
}

async function retrieveNewBalance(balance) {
  try {
    const newBalance = JSON.parse(JSON.stringify(balance));
    const newTimestamp = unixTimeStamp(new Date().getTime());
    const currentBalance = await http.get(`/api/accounts/getBalance?address=${config.address}`);
    const owedBalance = newBalance.accounts.reduce((mem, val) => mem = mem + parseInt(val.unpaidBalance), 0);
    const distributableBalance = parseInt(currentBalance.data.balance) - owedBalance;
    console.log("Distributable balance: " + distributableBalance);
    if (distributableBalance > 0) {
      const eligableVoters = await getEligableVoters();
      const totalWeight = eligableVoters.reduce((mem, val) => mem = mem + parseInt(val.voter.balance), 0);
      eligableVoters.forEach(eligableVoter => {
        const eligibleBalance = math.floor(math.eval(`${distributableBalance} * (${parseInt(eligableVoter.voter.balance)} / ${totalWeight})`));
        const found = newBalance.accounts.filter(account => account.address == eligableVoter.voter.address);
        if (found.length === 0) {
          newBalance.accounts.push({address: eligableVoter.voter.address, paidBalance: 0, unpaidBalance: eligibleBalance})
        } else {
          found[0].unpaidBalance = parseInt(found[0].unpaidBalance) + parseInt(eligibleBalance);
        }
      });
      newBalance.updateTimestamp = newTimestamp;
      return newBalance;
    } else {
      return newBalance;
    }
  } catch(e) {
    console.log(e);
    return balance;
  }
}

async function payout(account) {
  try {
    if (account.unpaidBalance > LSKToDust(0.2)) {
      const payoutAmount = account.unpaidBalance - getTransactionFee();
      const transaction = lisk.transaction.createTransaction(account.address, payoutAmount, config.secret1, config.secret2);
      const payload = {"transaction": transaction};
      const netHash = await http.get("/api/blocks/getNethash");
      const httpConfig = {
        headers: {
          "version": "0.8.0",
          "port": 1,
          "nethash": netHash.data.nethash
        }
      }
      const paymentRes = await http.post("/peer/transactions/", payload, httpConfig);
      if (paymentRes.data.success) {
        account.paidBalance = account.unpaidBalance;
        account.unpaidBalance = 0;
      } else {
        console.log(paymentRes.data);
      }
    }
    return account;
  } catch(e) {
    console.log("Payment failed:");
    console.log(e);
    return account;
  }
}

async function app() {
  jsonfile.readFile(balanceFile, async (err, balance) => {
    if(!balance) {
      balance = {
        updateTimestamp: unixTimeStamp(new Date().getTime()),
        accounts: []
      }
    }
    try {
      const newBalance = await retrieveNewBalance(balance);
      console.log(`New owed balance: ${JSON.stringify(newBalance)}`);
      if (newBalance) {
        const newAccounts = await Promise.all(newBalance.accounts.map(account => payout(account)));
        newBalance.accounts = newAccounts;
        console.log(`New processed balance: ${JSON.stringify(newBalance)}`);
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

app();