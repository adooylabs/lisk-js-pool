const util = require("./util");
const Api = require("./api");
const math = require("mathjs");

class Logic {

  constructor(config) {
    this.config = config;
    this.api = new Api(config);
  }

  async getEligableVoters() {
    const allVotes = [];
    this.config.requiredVotes.forEach(dg => allVotes.push({delegate: dg, required: true}));
    this.config.optionalVotes.forEach(dg => allVotes.push({delegate: dg, required: false}));
    const delegates = await Promise.all(allVotes.map(delegate => this.api.getDelegateDetails(delegate)));
    const blacklist = delegates.map(delegate => delegate.address);
    blacklist.push(this.config.address);
    const allVoters = [];
    delegates.forEach(delegate => {
      delegate.voters.forEach(voter => {
        const found = allVoters.filter(eligableVoter => eligableVoter.voter.address == voter.address);
        if (delegate.required) {
          if (found.length === 0) {
            allVoters.push({voter, required: 1, optional: 0});
          } else {
            found[0].required = found[0].required + 1;
          }
        } else {
          if (found.length === 0) {
            allVoters.push({voter, required: 0, optional: 1});
          } else {
            found[0].optional = found[0].optional + 1;
          }
        }
      });
    });
    return allVoters.filter(eligableVoter => eligableVoter.required == this.config.requiredVotes.length && blacklist.filter(address => address == eligableVoter.voter.address).length === 0);
  }

  async retrieveNewBalance(balance) {
    try {
      const newBalance = JSON.parse(JSON.stringify(balance));
      newBalance.updateTimestamp = util.unixTimeStamp(new Date().getTime());
      const currentBalance = await this.api.getBalance(this.config.address);
      const owedBalance = newBalance.accounts.reduce((mem, val) => mem = mem + parseInt(val.unpaidBalance), 0);
      const distributableBalance = parseInt(currentBalance) - owedBalance;
      console.log("Distributable balance: " + distributableBalance);
      if (distributableBalance > 0) {
        const eligableVoters = await this.getEligableVoters();
        eligableVoters.forEach(eligableVoter => {
          eligableVoter.voter.increasedBalance = eligableVoter.voter.balance * (1 + ((eligableVoter.optional * this.config.optionalIncreasePercentage) / 100));
        });
        const totalWeight = eligableVoters.reduce((mem, val) => mem = mem + parseInt(val.voter.increasedBalance), 0);
        eligableVoters.forEach(eligableVoter => {
          const eligibleBalance = math.floor(math.eval(`${distributableBalance} * (${parseInt(eligableVoter.voter.increasedBalance)} / ${totalWeight})`));
          const found = newBalance.accounts.filter(account => account.address == eligableVoter.voter.address);
          if (found.length === 0) {
            newBalance.accounts.push({address: eligableVoter.voter.address, paidBalance: 0, unpaidBalance: eligibleBalance})
          } else {
            found[0].unpaidBalance = parseInt(found[0].unpaidBalance) + parseInt(eligibleBalance);
          }
        });
      }
      return newBalance;
    } catch(e) {
      console.log(e);
      return balance;
    }
  }

  async retrieveNewForgedBalance(balance) {
    const newBalance = JSON.parse(JSON.stringify(balance));
    const newTimestamp = util.unixTimeStamp(new Date().getTime());
    const forgedAmount = await this.api.getForgedAmount(this.config.delegate, balance.updateTimestamp, newTimestamp);
    const finalAccounts = [];
    this.config.targetAddresses.forEach(ta => {
      let payoutAmount = 0;
      if (ta.percentage) {
        payoutAmount = math.floor(math.eval(`${parseInt(forgedAmount)} / 100 * ${ta.percentage}`));
      } else if (ta.amount) {
        payoutAmount = util.LSKToDust(ta.amount);
      }
      const foundAccount = newBalance.accounts.find(account => account.address === this.config.targetAddress);
      if (foundAccount)  {
        foundAccount.unpaidBalance = parseInt(foundAccount.unpaidBalance) + payoutAmount;
        finalAccounts.push(foundAccount);
      } else {
        finalAccounts.push({address: ta.address, paidBalance: 0, unpaidBalance: payoutAmount, exact: ta.exact});
      }
    });
    newBalance.updateTimestamp = newTimestamp;
    newBalance.accounts = finalAccounts;
    return newBalance;
  }

  async payout(account) {
    try {
      if (account.unpaidBalance > util.LSKToDust(this.config.minPayout)) {
        const payoutAmount = account.unpaidBalance - account.exact ? 0 : util.getTransactionFee();
        const transaction = lisk.transaction.createTransaction(account.address, payoutAmount, this.config.secret1, this.config.secret2);
        const paymentRes = await this.api.sendTransaction(transaction);
        if (paymentRes.success) {
          account.paidBalance = account.unpaidBalance;
          account.unpaidBalance = 0;
        } else {
          console.log(paymentRes);
        }
      }
      return account;
    } catch(e) {
      console.log("Payment failed:");
      console.log(e);
      return account;
    }
  }

}

module.exports = Logic;