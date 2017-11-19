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

  async retrieveAmountToDistribute(balance) {
    const newBalance = JSON.parse(JSON.stringify(balance));
    const newTimestamp = util.unixTimeStamp(new Date().getTime());
    let distributableBalance = 0;
    if (this.config.mode === "forged") {
      const forgedAmount = await this.api.getForgedAmountFromAddress(this.config.address, balance.updateTimestamp, newTimestamp);
      distributableBalance = math.floor(math.eval(`${parseInt(forgedAmount)} / 100 * ${this.config.percentage}`));
    } else if (this.config.mode === "received") {
      const currentBalance = await this.api.getBalance(this.config.address);
      const owedBalance = newBalance.accounts.reduce((mem, val) => mem = mem + parseInt(val.unpaidBalance), 0);
      distributableBalance = parseInt(currentBalance) - owedBalance;
    }
    return { balance: parseInt(distributableBalance), newTimestamp };
  }

  async retrieveNewBalance(balance) {
    try {
      const newBalance = JSON.parse(JSON.stringify(balance));
      const distributableBalance = await this.retrieveAmountToDistribute(balance);
      newBalance.updateTimestamp = distributableBalance.newTimestamp;
      if (distributableBalance.balance > 0) {
        const eligableVoters = await this.getEligableVoters();
        eligableVoters.forEach(eligableVoter => {
          eligableVoter.voter.increasedBalance = eligableVoter.voter.balance * (1 + ((eligableVoter.optional * this.config.optionalIncreasePercentage) / 100));
        });
        const totalWeight = eligableVoters.reduce((mem, val) => mem = mem + parseInt(val.voter.increasedBalance), 0);
        eligableVoters.forEach(eligableVoter => {
          const eligibleBalance = math.floor(math.eval(`${distributableBalance.balance} * (${parseInt(eligableVoter.voter.increasedBalance)} / ${totalWeight})`));
          const found = newBalance.accounts.filter(account => account.address == eligableVoter.voter.address);
          if (found.length === 0) {
            newBalance.accounts.push({address: eligableVoter.voter.address, paidBalance: 0, unpaidBalance: eligibleBalance, payfee: false})
          } else {
            found[0].unpaidBalance = parseInt(found[0].unpaidBalance) + parseInt(eligibleBalance);
          }
        });
      }
      const payableAmount = newBalance.accounts.reduce((mem, a) => {
        if (a.unpaidBalance > util.LSKToDust(this.config.minPayout)) {
         mem = mem + a.unpaidBalance;
        }
        return mem;
      }, 0);
      return { newBalance, distributable: distributableBalance.balance, payableAmount };
    } catch(e) {
      console.log(e);
      return { newBalance: balance, distributable: distributableBalance.balance, payableAmount: 0 };
    }
  }

  async retrieveNewForgedBalance(balance) {
    try {
      const newBalance = JSON.parse(JSON.stringify(balance));
      const newTimestamp = util.unixTimeStamp(new Date().getTime());
      const forgedAmount = await this.api.getForgedAmount(this.config.delegate, balance.updateTimestamp, newTimestamp);
      if (forgedAmount > 0) {
        const finalAccounts = [];
        this.config.targetAddresses.forEach(ta => {
          let payoutAmount = 0;
          if (ta.percentage) {
            payoutAmount = math.floor(math.eval(`${parseInt(forgedAmount)} / 100 * ${ta.percentage}`));
          } else if (ta.amount) {
            payoutAmount = util.LSKToDust(ta.amount);
          }
          const foundAccount = newBalance.accounts.find(account => account.address === ta.address);
          if (foundAccount)  {
            foundAccount.unpaidBalance = parseInt(foundAccount.unpaidBalance) + payoutAmount;
            foundAccount.payfee = ta.payfee;
            finalAccounts.push(foundAccount);
          } else {
            finalAccounts.push({address: ta.address, paidBalance: 0, unpaidBalance: payoutAmount, payfee: ta.payfee});
          }
        });
        newBalance.accounts = finalAccounts;
      }
      newBalance.updateTimestamp = newTimestamp;
      return newBalance;
    } catch(e) {
      console.log(e);
      return balance;
    }
  }
 
  async payout(account, dryrun) {
    try {
      let paid = 0;
      if (account.unpaidBalance > util.LSKToDust(this.config.minPayout)) {
        const payoutAmount = account.unpaidBalance - (account.payfee ? 0 : util.getTransactionFee());
        paid = payoutAmount + util.getTransactionFee();
        console.log(`Sending ${util.dustToLSK(paid)} to ${account.address}`);
        const transaction = lisk.transaction.createTransaction(account.address, payoutAmount, this.config.secret1, this.config.secret2);
        if (!dryrun) {
          const paymentRes = await this.api.sendTransaction(transaction);
          if (paymentRes.success) {
            account.paidBalance = account.paidBalance + account.unpaidBalance;
            account.unpaidBalance = 0;
          } else {
            console.log(paymentRes);
          }
        } else {
          account.paidBalance = account.paidBalance + account.unpaidBalance;
          account.unpaidBalance = 0;
        }
      }
      return { account, paid };
    } catch(e) {
      console.log("Payment failed:");
      console.log(e);
      return { account, paid: 0 };
    }
  }

}

module.exports = Logic;