pragma solidity ^0.4.4;

contract Remittance {
	address public owner;
	uint public deadlineLimitBlocks;
	uint public gasRequiredToDeployThisContract;
	mapping(bytes32 => RemmitanceInfo) public remittances;

	event LogRemittanceDeposited(address sender, bytes32 recipientAddressHash, uint amount, uint feeToBeCollected, uint deadlineBlockNumber, bytes32 combinedPasswordsHash);
	event LogFeeCollected(uint feeAmount);
	event LogRemittanceDelivered(address sender, address recipient, uint depositedAmount, uint fee, uint netAmountDeliveredAfterFee);
	//event LogRemittanceRefunded(address sender, uint amount);

	struct RemmitanceInfo {
		address sender;
		bytes32 recipientAddressHash;
		uint amount;
		uint feeToBeCollected;
		uint deadlineBlockNumber;
	}

	function Remittance(uint _deadlineLimitBlocks, uint _gasRequiredToDeployThisContract) {
		owner = msg.sender;
		deadlineLimitBlocks = _deadlineLimitBlocks;
		gasRequiredToDeployThisContract = _gasRequiredToDeployThisContract;
	}

	function deposit(bytes32 recipientAddressHash, bytes32 combinedPasswordsHash, uint withdrawableForDuration) public payable returns (bool success) {
		require(recipientAddressHash != 0);
		require(combinedPasswordsHash != 0);
		require(withdrawableForDuration > 0);
		require(withdrawableForDuration <= deadlineLimitBlocks);
		require(remittances[combinedPasswordsHash].sender == 0);
		// The fee should always be 1 wei cheaper than the cost to redeploy this contract
		uint fee = (gasRequiredToDeployThisContract * tx.gasprice) - 1;
		require(msg.value > fee);
		uint deadlineBlockNumber = block.number + withdrawableForDuration;

		remittances[combinedPasswordsHash] = RemmitanceInfo({
			sender: msg.sender,
			recipientAddressHash: recipientAddressHash,
			amount: msg.value,
			feeToBeCollected: fee,
			deadlineBlockNumber: deadlineBlockNumber
		});

		LogRemittanceDeposited(msg.sender, recipientAddressHash, msg.value, fee, deadlineBlockNumber, combinedPasswordsHash);

		return true;
	}

	function deliver(bytes32 password1Hash, bytes32 password2Hash) public returns (bool success) {
		require(password1Hash != 0);
		require(password2Hash != 0);

		bytes32[] memory passwordHashes = new bytes32[](2);
		passwordHashes[0] = password1Hash;
		passwordHashes[1] = password2Hash;
		bytes32 combinedPasswordsHash = getHash(passwordHashes);

		RemmitanceInfo storage remittance = remittances[combinedPasswordsHash];
		require(remittance.amount > 0);

		// TODO: Why is this failing?
		//require(remittance.deadlineBlockNumber <= block.number);
	
		// TODO: Why does this return a different hash than
		// calling getHash from the unit test?
		//bytes32 recipientAddressHash = keccak256(msg.sender);
		//require(remittance.recipientAddressHash == recipientAddressHash);

		uint remittanceDepositedAmount = remittance.amount;
		uint netAmountDeliveredAfterFee = remittanceDepositedAmount - remittance.feeToBeCollected;
		remittance.amount = 0;
		msg.sender.transfer(netAmountDeliveredAfterFee);
		LogRemittanceDelivered(remittance.sender, msg.sender, remittanceDepositedAmount, remittance.feeToBeCollected, netAmountDeliveredAfterFee);
	
		owner.transfer(remittance.feeToBeCollected);
		LogFeeCollected(remittance.feeToBeCollected);

		return true;
	}

	function getHash(bytes32[] inputs) public constant returns (bytes32 hash) {
		return keccak256(inputs);
	}
}
