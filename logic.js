const util = require("./util");
const Api = require("./api");
const math = require("mathjs");

class Logic {

  constructor(config) {
    this.config = config;
    this.api = new Api(config);
  }

  async getEligableVoters() {
    const delegates = await Promise.all(this.config.requiredVotes.map(delegate => this.api.getDelegateDetails(delegate)));
    const blacklist = delegates.map(delegate => delegate.delegate);
    blacklist.push(this.config.address);
    const allVoters = [];
    delegates.forEach(delegate => {
      delegate.voters.forEach(voter => {
        const found = allVoters.filter(eligableVoter => eligableVoter.address == voter.address);
        if (found.length === 0) {
          allVoters.push({voter, votes: 1});
        } else {
          found[0].votes = found[0].votes + 1;
        }
      });
    });
    return allVoters.filter(eligableVoter => eligableVoter.votes == this.config.requiredVotes.length && blacklist.filter(delegate => delegate == eligableVoter.voter.address).length === 0);
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
    const payoutAmount = math.floor(math.eval(`${parseInt(forgedAmount)} / 100 * ${this.config.targetPercentage}`));
    const matchedAccounts = newBalance.accounts.filter(account => account.address === this.config.targetAddress);
    if (matchedAccounts.length == 1) {
      matchedAccounts[0].unpaidBalance = parseInt(matchedAccounts[0].unpaidBalance) + payoutAmount;
    } else {
      matchedAccounts.push({address: this.config.targetAddress, paidBalance: 0, unpaidBalance: payoutAmount})
    }
    newBalance.updateTimestamp = newTimestamp;
    newBalance.accounts = matchedAccounts;
    return newBalance;
  }

  async payout(account) {
    try {
      if (account.unpaidBalance > util.LSKToDust(this.config.minPayout)) {
        const payoutAmount = account.unpaidBalance - util.getTransactionFee();
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