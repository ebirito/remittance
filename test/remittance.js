var Remittance = artifacts.require("./Remittance.sol");
var Promise = require("bluebird");
var join = Promise.join;
Promise.promisifyAll(web3.eth, { suffix: "Promise" });

contract('Remittance', accounts => {
  let remittanceInstance;
  let owner = accounts[0];
  let remittanceSender = accounts[1];
  let remittanceRecepient = accounts[2];
  let notRemittanceRecepient = accounts[3];
  let remittanceRecipientHash;
  const password1 = "p@$$w0rd";
  let password1Hash;
  const password2 = "0pen$e$@me";
  let password2Hash;
  let combinedPasswordHash;
  const deadlineLimitBlocks = 100;
  const withdrawableForDuration = 99;
  let gasPrice;
  let blockNumber;
  let costOfDeployingTheContract = 100;
  let fee;
  let remittanceAmount;

   before("check that prerequisites for tests are valid", function() {
    const accountsToCheck = [0, 1, 2, 3];
    
    Promise.map(accountsToCheck, function (accountNumber) {
      assert.isDefined(accounts[accountNumber], `"accounts[${accountNumber}] is undefined`);
      var signedData = web3.eth.signPromise(accounts[accountNumber], "someData")
      var balance = web3.eth.getBalancePromise(accounts[accountNumber]);
      return join(signedData, balance, function(signedData, balance) {
        return {
          signedData: signedData,
          balance: balance,
          accountNumber: accountNumber
        }
      })
    })
    .catch((error) => {
      assert.fail("one of the accounts is is not unlocked");
    })
    .each((accountPromises) => {
        assert.isTrue(accountPromises.balance.greaterThan(web3.toWei(1, 'ether')), `accounts[${accountPromises.accountNumber}] insufficient balance`);
    });
  });

  beforeEach("create a new Remittance contract instance", () => {
    return Remittance.new(deadlineLimitBlocks, costOfDeployingTheContract, { from: owner })
    .then(instance => {
      remittanceInstance = instance;
      return remittanceInstance.owner();
    })
    .then(instanceOwner => {
      assert.equal(instanceOwner, owner);
      return remittanceInstance.gasRequiredToDeployThisContract();
    })
    .then(gasRequiredToDeployThisContract => {
      assert.equal(gasRequiredToDeployThisContract, costOfDeployingTheContract);
      return remittanceInstance.deadlineLimitBlocks();
    })
    .then(instanceDeadlineLimitBlocks => {
      assert.equal(instanceDeadlineLimitBlocks, deadlineLimitBlocks);

      // Hash the test passwords and remittance recipient
      // using the contract's instance hashing function
      return remittanceInstance.getHash([password1]);
    })
    .then(hash => {
      password1Hash = hash;
      return remittanceInstance.getHash([password2]);
    })
    .then(hash => {
      password2Hash = hash;
      return remittanceInstance.getHash([password1Hash, password2Hash]);
    })
    .then(hash => {
      combinedPasswordHash = hash;
      return remittanceInstance.getHash([remittanceRecepient]);
    })
    .then(hash => {
      remittanceRecipientHash = hash;
      return web3.eth.getGasPricePromise();
    })
    .then(currentGasPrice => {
      gasPrice = currentGasPrice;
      fee = gasPrice.times(costOfDeployingTheContract).minus(1);
      remittanceAmount = fee.plus(100);
      return web3.eth.getBlockNumberPromise()
    })
    .then(currentBlockNumber => {
      blockNumber = currentBlockNumber;
    });
  });

  describe("deposit", () => {
    it("should throw if the recipient address hash is empty (0)", () => {
      return remittanceInstance.deposit(0, combinedPasswordHash, withdrawableForDuration, {
        from: remittanceSender,
        value: remittanceAmount
      })
      .then(() => {
        assert.fail("deposit was successful, but it should have thrown");
      })
      .catch((error) => {
        assert.isTrue(error.message.includes("invalid opcode"))
      });
    });
    it("should throw if the combined password hash is empty (0)", () => {
      return remittanceInstance.deposit(remittanceRecipientHash, 0, withdrawableForDuration, {
        from: remittanceSender,
        value: remittanceAmount
      })
      .then(() => {
        assert.fail("deposit was successful, but it should have thrown");
      })
      .catch((error) => {
        assert.isTrue(error.message.includes("invalid opcode"))
      });
    });
    it("should throw if withdrawableForDuration is 0", () => {
      return remittanceInstance.deposit(remittanceRecipientHash, combinedPasswordHash, 0, {
        from: remittanceSender,
        value: remittanceAmount
      })
      .then(() => {
        assert.fail("deposit was successful, but it should have thrown");
      })
      .catch((error) => {
        assert.isTrue(error.message.includes("invalid opcode"))
      });
    });
    it("should throw if withdrawableForDuration is greater than the deadline limit", () => {
      return remittanceInstance.deposit(remittanceRecipientHash, combinedPasswordHash, deadlineLimitBlocks + 1, {
        from: remittanceSender,
        value: remittanceAmount
      })
      .then(() => {
        assert.fail("deposit was successful, but it should have thrown");
      })
      .catch((error) => {
        assert.isTrue(error.message.includes("invalid opcode"))
      });
    });
    it("should throw if the remittance amount is less than the fee", () => {
      return remittanceInstance.deposit(remittanceRecipientHash, combinedPasswordHash, withdrawableForDuration, {
        from: remittanceSender,
        value: fee - 1
      })
      .then(() => {
        assert.fail("deposit was successful, but it should have thrown");
      })
      .catch((error) => {
        assert.isTrue(error.message.includes("invalid opcode"))
      });
    });
    it("should deposit succesfully if everything is provided correctly", () => {
      return remittanceInstance.deposit.call(remittanceRecipientHash, combinedPasswordHash, withdrawableForDuration, {
        from: remittanceSender,
        value: remittanceAmount,
        gasPrice: gasPrice
      })
      .then(result => {
        assert.isTrue(result);
        return remittanceInstance.deposit(remittanceRecipientHash, combinedPasswordHash, withdrawableForDuration, {
          from: remittanceSender,
          value: remittanceAmount,
          gasPrice: gasPrice
        })
      })
      .then(txn => {
          assert.equal(txn.logs.length, 1);
          let logRemittanceDeposited = txn.logs[0];
          assert.equal(logRemittanceDeposited.event, "LogRemittanceDeposited");
          assert.equal(logRemittanceDeposited.args.sender, remittanceSender);
          assert.equal(logRemittanceDeposited.args.recipientAddressHash, remittanceRecipientHash);
          assert.strictEqual(logRemittanceDeposited.args.amount.toString(10), remittanceAmount.toString(10));
          assert.strictEqual(logRemittanceDeposited.args.feeToBeCollected.toString(10), fee.toString(10));
          assert.strictEqual(logRemittanceDeposited.args.deadlineBlockNumber.toString(10), (blockNumber + withdrawableForDuration + 1).toString(10));
          assert.equal(logRemittanceDeposited.args.combinedPasswordsHash, combinedPasswordHash);

          return remittanceInstance.remittances(combinedPasswordHash);
      })
      .then(remittanceInfo => {
        assert.equal(remittanceInfo[0], remittanceSender);
        assert.equal(remittanceInfo[1], remittanceRecipientHash);
        assert.strictEqual(remittanceInfo[2].toString(10), remittanceAmount.toString(10));
        assert.strictEqual(remittanceInfo[3].toString(10), fee.toString(10));
        assert.strictEqual(remittanceInfo[4].toString(10), (blockNumber + withdrawableForDuration + 1).toString(10));
      })
    });
    it("should throw if the combined passwords hash has already been used", () => {
      return remittanceInstance.deposit(remittanceRecipientHash, combinedPasswordHash, withdrawableForDuration, {
          from: remittanceSender,
          value: remittanceAmount,
          gasPrice: gasPrice
      })
      .then(txn => {
        return remittanceInstance.deposit(remittanceRecipientHash, combinedPasswordHash, withdrawableForDuration, {
          from: remittanceSender,
          value: remittanceAmount,
          gasPrice: gasPrice
        })
      })
      .then(() => {
        assert.fail("deposit was successful, but it should have thrown");
      })
      .catch((error) => {
        assert.isTrue(error.message.includes("invalid opcode"))
      });
    });
  });

  describe("deliver", () => {
    it("should throw if password1 hash is empty (0)", () => {
      return remittanceInstance.deliver(0, password2Hash, {
        from: remittanceRecepient,
        value: 0
      })
      .then(() => {
        assert.fail("deliver was successful, but it should have thrown");
      })
      .catch((error) => {
        assert.isTrue(error.message.includes("invalid opcode"))
      });
    });
    it("should throw if password2 hash is empty (0)", () => {
      return remittanceInstance.deliver(password1Hash, 0, {
        from: remittanceRecepient,
        value: 0
      })
      .then(() => {
        assert.fail("deliver was successful, but it should have thrown");
      })
      .catch((error) => {
        assert.isTrue(error.message.includes("invalid opcode"))
      });
    });
    it("should throw if there is no remittance amount deposited for that password combination", () => {
      return remittanceInstance.deliver(password1Hash, password2Hash, {
        from: remittanceRecepient,
        value: 0
      })
      .then(() => {
        assert.fail("deliver was successful, but it should have thrown");
      })
      .catch((error) => {
        assert.isTrue(error.message.includes("invalid opcode"))
      });
    });
    it("should throw if the block deadline has passed for that remittance", () => {
      return remittanceInstance.deposit(remittanceRecipientHash, combinedPasswordHash, withdrawableForDuration, {
          from: remittanceSender,
          value: remittanceAmount,
          gasPrice: gasPrice
      })
      .then(txn => {
        return remittanceInstance.deliver(password1Hash, password2Hash, {
          from: remittanceRecepient,
          value: 0
        })
      })
      .then(() => {
        assert.fail("deliver was successful, but it should have thrown");
      })
      .catch((error) => {
        assert.isTrue(error.message.includes("invalid opcode"))
      });
    });
    it("should throw if the requester is not the intended recipient", () => {
      return remittanceInstance.deposit(remittanceRecipientHash, combinedPasswordHash, 0, {
          from: remittanceSender,
          value: remittanceAmount,
          gasPrice: gasPrice
      })
      .then(txn => {
        return remittanceInstance.deliver(password1Hash, password2Hash, {
          from: notRemittanceRecepient,
          value: 0
        })
      })
      .then(() => {
        assert.fail("deliver was successful, but it should have thrown");
      })
      .catch((error) => {
        assert.isTrue(error.message.includes("invalid opcode"))
      });
    });
    it("should deliver succesfully if everything is provided correctly", () => {
      return remittanceInstance.deposit(remittanceRecipientHash, combinedPasswordHash, 0, {
          from: remittanceSender,
          value: remittanceAmount,
          gasPrice: gasPrice
      })
      .then(txn => {
        return remittanceInstance.deliver.call(password1Hash, password2Hash, {
          from: remittanceRecepient,
          value: 0
        })
      })
      .then(result => {
        assert.isTrue(result);
      });
    });
  });
});
