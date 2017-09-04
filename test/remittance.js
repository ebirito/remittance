var Remittance = artifacts.require("./Remittance.sol");

require('bluebird').promisifyAll(web3.eth, { suffix: "Promise" });

contract('Remittance', accounts => {
  let remittanceInstance;
  let owner = accounts[0];
  let remittanceSender = accounts[1];
  let remittanceRecepient = accounts[2];
  let remittanceRecipientHash;
  const password1 = "p@$$w0rd";
  let password1Hash;
  const password2 = "0pen$e$@me";
  let password2Hash;
  let combinedPasswordHash;
  const deadlineLimitBlocks = 100;
  const withdrawableForDuration = 99;
  const remittanceAmount = 7777777;
  let gasPrice;
  let blockNumber;
  //let costOfDeployingTheContract = 100; //TODO

   before("check that prerequisites for tests are valid", function() {
    const accountsToCheck = [0, 1, 2];
    accountsToCheck.forEach(function (accountNumber) {
      assert.isDefined(accounts[accountNumber], `"accounts[${accountNumber}] is undefined`);
      try {
        web3.eth.sendTransaction({
            from: accounts[accountNumber],
            to: accounts[accountNumber],
            value: 0
        });
        return false;
      } catch (err) {
        assert.fail(`"accounts[${accountNumber}] is not unlocked`);
      }
      web3.eth.getBalancePromise(accounts[accountNumber])
      .then((balance) => {
        assert.isTrue(balance > web3.toWei('1', 'ether'), `"accounts[${accountNumber}] insufficient balance`);
      });
    });
  });

  beforeEach("create a new Remittance contract instance", () => {
    return Remittance.new(deadlineLimitBlocks, { from: owner })
    .then(instance => {
      remittanceInstance = instance;
      return remittanceInstance.owner();
    })
    .then(instanceOwner => {
      assert.equal(instanceOwner, owner);
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
    
    /*it("should throw if the remittance amount is less than the fee", () => {
      return remittanceInstance.deposit(remittanceRecipientHash, combinedPasswordHash, withdrawableForDuration, {
        from: remittanceSender,
        value: (costOfDeployingTheContract * gasPrice) - 2
      })
    .then(() => {
        assert.fail("deposit was successful, but it should have thrown");
      })
      .catch((error) => {
        assert.isTrue(error.message.includes("invalid opcode"))
      });
    });*/

    it("should deposit succesfully if everything is provided correctly", () => {
      return remittanceInstance.deposit.call(remittanceRecipientHash, combinedPasswordHash, withdrawableForDuration, {
        from: remittanceSender,
        value: remittanceAmount
      })
      .then(result => {
        assert.isTrue(result);
        return remittanceInstance.deposit(remittanceRecipientHash, combinedPasswordHash, withdrawableForDuration, {
          from: remittanceSender,
          value: remittanceAmount
        })
      })
      .then(txn => {
          assert.equal(txn.logs.length, 1);
          let logRemittanceDeposited = txn.logs[0];
          assert.equal(logRemittanceDeposited.event, "LogRemittanceDeposited");
          assert.equal(logRemittanceDeposited.args.sender, remittanceSender);
          assert.equal(logRemittanceDeposited.args.recipientAddressHash, remittanceRecipientHash);
          assert.equal(logRemittanceDeposited.args.amount, remittanceAmount);
          //assert.equal(logRemittanceDeposited.args.feeToBeCollected, (costOfDeployingTheContract * gasPrice) - 1);
          assert.equal(logRemittanceDeposited.args.deadlineBlockNumber.toString(10), (blockNumber + withdrawableForDuration + 1).toString(10));
          assert.equal(logRemittanceDeposited.args.combinedPasswordsHash, combinedPasswordHash);

          return remittanceInstance.remittances(combinedPasswordHash);
      })
      .then(remittanceInfo => {
        assert.equal(remittanceInfo[0], remittanceSender);
        assert.equal(remittanceInfo[1], remittanceRecipientHash);
        assert.equal(remittanceInfo[2].toString(10), remittanceAmount.toString(10));
        //assert.equal(remittanceInfo.feeToBeCollected, (costOfDeployingTheContract * gasPrice) - 1);
        assert.equal(remittanceInfo[3].toString(10), (blockNumber + withdrawableForDuration + 1).toString(10));
      })
    });

    it("should throw if the combined passwords hash has already been used", () => {
      return remittanceInstance.deposit(remittanceRecipientHash, combinedPasswordHash, withdrawableForDuration, {
          from: remittanceSender,
          value: remittanceAmount
      })
      .then(txn => {
        return remittanceInstance.deposit(remittanceRecipientHash, combinedPasswordHash, withdrawableForDuration, {
          from: remittanceSender,
          value: remittanceAmount
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
});
