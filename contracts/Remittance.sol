pragma solidity ^0.4.4;

contract Remittance {
	address public owner;
	uint public deadlineLimitBlocks;
	mapping(bytes32 => RemmitanceInfo) public remittances;
	//uint public constant GAS_REQUIRED_TO_DEPLOY_THIS_CONTRACT = 100; //TODO

	//event LogRemittanceDeposited(address sender, bytes32 recipientAddressHash, uint amount, uint feeToBeCollected, uint deadlineBlockNumber, bytes32 combinedPasswordsHash);
	event LogRemittanceDeposited(address sender, bytes32 recipientAddressHash, uint amount, uint deadlineBlockNumber, bytes32 combinedPasswordsHash);
	//event LogFeeCollected(uint feeAmount);
	//event LogRemittanceDelivered(address sender, address recipient, uint depositedAmount, uint fee, uint netAmountDeliveredAfterFee);
	event LogRemittanceDelivered(address sender, address recipient, uint depositedAmount);
	event LogRemittanceRefunded(address sender, uint amount);

	struct RemmitanceInfo {
		address sender;
		bytes32 recipientAddressHash;
		uint amount;
		//uint feeToBeCollected;
		uint deadlineBlockNumber;
	}

	function Remittance(uint _deadlineLimitBlocks) {
		owner = msg.sender;
		deadlineLimitBlocks = _deadlineLimitBlocks;
	}

	function deposit(bytes32 recipientAddressHash, bytes32 combinedPasswordsHash, uint withdrawableForDuration) public payable returns (bool success) {
		require(recipientAddressHash != 0);
		require(combinedPasswordsHash != 0);
		require(withdrawableForDuration > 0);
		require(withdrawableForDuration <= deadlineLimitBlocks);
		require(remittances[combinedPasswordsHash].sender == 0);
		// The fee should always be 1 wei cheaper than the cost to redeploy this contract
		//uint fee = (GAS_REQUIRED_TO_DEPLOY_THIS_CONTRACT * tx.gasprice) - 1;
		//require(msg.value > fee);
		uint deadlineBlockNumber = block.number + withdrawableForDuration;

		remittances[combinedPasswordsHash] = RemmitanceInfo({
			sender: msg.sender,
			recipientAddressHash: recipientAddressHash,
			amount: msg.value,
			//feeToBeCollected: fee,
			deadlineBlockNumber: deadlineBlockNumber
		});

		//LogRemittanceDeposited(msg.sender, recipientAddressHash, msg.value, fee, deadlineBlockNumber, combinedPasswordsHash);
		LogRemittanceDeposited(msg.sender, recipientAddressHash, msg.value, deadlineBlockNumber, combinedPasswordsHash);

		return true;
	}

	function getHash(bytes32[] inputs) public constant returns (bytes32 hash) {
		return keccak256(inputs);
	}
}
