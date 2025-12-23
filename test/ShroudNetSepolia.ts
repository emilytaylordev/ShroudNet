import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { deployments, ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { ShroudNet } from "../types";

type Signers = {
  alice: HardhatEthersSigner;
};

describe("ShroudNetSepolia", function () {
  let signers: Signers;
  let contract: ShroudNet;
  let contractAddress: string;

  before(async function () {
    if (fhevm.isMock) {
      console.warn(`This hardhat test suite can only run on Sepolia Testnet`);
      this.skip();
    }

    try {
      const deployment = await deployments.get("ShroudNet");
      contractAddress = deployment.address;
      contract = await ethers.getContractAt("ShroudNet", deployment.address);
    } catch (e) {
      (e as Error).message += ". Call 'npx hardhat deploy --network sepolia'";
      throw e;
    }

    const ethSigners = await ethers.getSigners();
    signers = { alice: ethSigners[0] };
  });

  it("creates a Net and decrypts the shared key", async function () {
    this.timeout(4 * 40000);

    const clearKey = "0x3333333333333333333333333333333333333333";
    const encrypted = await fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .addAddress(clearKey)
      .encrypt();

    await (await contract.connect(signers.alice).createNet("Sepolia Net", encrypted.handles[0], encrypted.inputProof)).wait();

    const handle = await contract.getEncryptedKey((await contract.netCount()) - 1n);
    expect(handle).to.not.eq(ethers.ZeroHash);

    const decrypted = await fhevm.userDecryptEaddress(handle, contractAddress, signers.alice);
    expect(ethers.getAddress(decrypted)).to.eq(ethers.getAddress(clearKey));

    await (await contract.connect(signers.alice).sendMessage((await contract.netCount()) - 1n, "0x1234")).wait();
    expect(await contract.getMessageCount((await contract.netCount()) - 1n)).to.be.greaterThan(0n);
  });
});
