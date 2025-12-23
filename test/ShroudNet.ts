import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { ShroudNet, ShroudNet__factory } from "../types";

type Signers = {
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("ShroudNet")) as ShroudNet__factory;
  const contract = (await factory.deploy()) as ShroudNet;
  const contractAddress = await contract.getAddress();
  return { contract, contractAddress };
}

describe("ShroudNet", function () {
  let signers: Signers;
  let contract: ShroudNet;
  let contractAddress: string;

  before(async function () {
    const ethSigners = await ethers.getSigners();
    signers = { alice: ethSigners[0], bob: ethSigners[1] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ contract, contractAddress } = await deployFixture());
  });

  it("creates a Net and shares encrypted key via ACL", async function () {
    const clearKey = "0x1111111111111111111111111111111111111111";

    const encrypted = await fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .addAddress(clearKey)
      .encrypt();

    await (await contract.connect(signers.alice).createNet("Test Net", encrypted.handles[0], encrypted.inputProof)).wait();

    expect(await contract.netCount()).to.eq(1n);

    const [name, creator, _createdAt, memberCount] = await contract.getNetInfo(0);
    expect(name).to.eq("Test Net");
    expect(creator).to.eq(signers.alice.address);
    expect(memberCount).to.eq(1);

    const handle = await contract.getEncryptedKey(0);
    const aliceDecrypted = await fhevm.userDecryptEaddress(handle, contractAddress, signers.alice);
    expect(ethers.getAddress(aliceDecrypted)).to.eq(ethers.getAddress(clearKey));

    let bobDecryptedOk = true;
    try {
      await fhevm.userDecryptEaddress(handle, contractAddress, signers.bob);
    } catch {
      bobDecryptedOk = false;
    }
    expect(bobDecryptedOk).to.eq(false);

    await (await contract.connect(signers.bob).joinNet(0)).wait();

    const bobDecrypted = await fhevm.userDecryptEaddress(handle, contractAddress, signers.bob);
    expect(ethers.getAddress(bobDecrypted)).to.eq(ethers.getAddress(clearKey));
  });

  it("only members can send messages", async function () {
    const clearKey = "0x2222222222222222222222222222222222222222";
    const encrypted = await fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .addAddress(clearKey)
      .encrypt();

    await (await contract.connect(signers.alice).createNet("Net", encrypted.handles[0], encrypted.inputProof)).wait();

    await expect(contract.connect(signers.bob).sendMessage(0, "0x1234")).to.be.revertedWithCustomError(
      contract,
      "NotMember",
    );

    await (await contract.connect(signers.bob).joinNet(0)).wait();

    await expect(contract.connect(signers.bob).sendMessage(0, "0x")).to.be.revertedWithCustomError(contract, "EmptyMessage");

    await (await contract.connect(signers.bob).sendMessage(0, "0x1234")).wait();
    expect(await contract.getMessageCount(0)).to.eq(1n);
  });
});
