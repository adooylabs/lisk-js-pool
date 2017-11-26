const axios = require("axios");
const lisk = require("lisk-js");

class Api {

  constructor(config) {
    this.config = config;
    this.http = axios.create({
      baseURL: "http://" + this.config.node + ":" + this.config.port,
      timeout: 10000
    });
  }

  async getDelegateDetails (delegate) {
    const dg = await this.http.get(`/api/delegates/get?username=${delegate.delegate}`);
    const voters = await this.http.get(`/api/delegates/voters?publicKey=${dg.data.delegate.publicKey}`);
    return {delegate: dg.data.delegate.username, address: dg.data.delegate.address,required: delegate.required, voters: voters.data.accounts};
  }

  async getBalance(address) {
    const currentBalance = await this.http.get(`/api/accounts/getBalance?address=${address}`);
    return currentBalance.data.balance;
  }

  async getForgedAmountFromAddress(address, start, end) {
    const publicKey = await this.http.get(`/api/accounts/getPublicKey?address=${address}`);
    const forgedAmount = await this.http.get('/api/delegates/forging/getForgedByAccount?generatorPublicKey=' + publicKey.data.publicKey + '&start=' + start + '&end=' + end);
    return forgedAmount.data.forged;
  }

  async getForgedAmount(delegate, start, end) {
    const publicKey = await this.http.get(`/api/delegates/get?username=${delegate}`)
    const forgedAmount = await this.http.get('/api/delegates/forging/getForgedByAccount?generatorPublicKey=' + publicKey.data.delegate.publicKey + '&start=' + start + '&end=' + end);
    return forgedAmount.data.forged;
  }

  async getVersion() {
    const versions = await this.http.get(`/api/peers/version`);
    return versions.data.version;
  }

  async sendTransaction (transaction) {
    const version = await this.getVersion();
    const payload = {"transaction": transaction};
    const netHash = await this.http.get("/api/blocks/getNethash");
    const httpConfig = {
      headers: {
        "version": version,
        "port": 1,
        "nethash": netHash.data.nethash
      }
    }
    const paymentRes = await this.http.post("/peer/transactions/", payload, httpConfig);
    return paymentRes.data;
  }

}

module.exports = Api;