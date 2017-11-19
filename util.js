const math = require("mathjs");

const util = {

  dustToLSK: function dustToLSK(dust) {
    return math.round(math.eval(`${dust} / 100000000`),6);
  },

  LSKToDust: function LSKToDust(LSK) {
    return LSK * 100000000;
  },

  unixTimeStamp: function unixTimeStamp(jsTimestamp) {
    return jsTimestamp / 1000 | 0;
  },

  getTransactionFee: function getTransactionFee() {
    return this.LSKToDust(0.1);
  }

};

module.exports = util;