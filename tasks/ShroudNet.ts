import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

/**
 * Examples:
 * - npx hardhat --network sepolia shroudnet:address
 * - npx hardhat --network sepolia shroudnet:create-net --name "My Net" --key 0x1111111111111111111111111111111111111111
 * - npx hardhat --network sepolia shroudnet:join --netid 0
 * - npx hardhat --network sepolia shroudnet:send --netid 0 --data 0x1234
 */

task("shroudnet:address", "Prints the ShroudNet address").setAction(async function (_args: TaskArguments, hre) {
  const { deployments } = hre;
  const deployed = await deployments.get("ShroudNet");
  console.log("ShroudNet address is " + deployed.address);
});

task("shroudnet:create-net", "Creates a new Net with an encrypted shared key A")
  .addParam("name", "Net name")
  .addOptionalParam("address", "Optionally specify the ShroudNet contract address")
  .addOptionalParam("key", "Shared key A as a plaintext address (0x...)")
  .setAction(async function (args: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const deployment = args.address ? { address: args.address as string } : await deployments.get("ShroudNet");
    const signers = await ethers.getSigners();
    const signer = signers[0];

    const keyAddress = (args.key as string) ?? ethers.Wallet.createRandom().address;

    const encrypted = await fhevm
      .createEncryptedInput(deployment.address, signer.address)
      .addAddress(keyAddress)
      .encrypt();

    const contract = await ethers.getContractAt("ShroudNet", deployment.address);
    const tx = await contract.createNet(args.name as string, encrypted.handles[0], encrypted.inputProof);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
    console.log(`Created Net name="${args.name}" key=${keyAddress}`);
  });

task("shroudnet:join", "Joins a Net and grants decryption permission for its key")
  .addParam("netid", "Net id")
  .addOptionalParam("address", "Optionally specify the ShroudNet contract address")
  .setAction(async function (args: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const deployment = args.address ? { address: args.address as string } : await deployments.get("ShroudNet");
    const contract = await ethers.getContractAt("ShroudNet", deployment.address);

    const tx = await contract.joinNet(BigInt(args.netid));
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
    console.log(`Joined Net ${args.netid}`);
  });

task("shroudnet:send", "Sends an encrypted message payload to a Net (payload must already be encrypted off-chain)")
  .addParam("netid", "Net id")
  .addParam("data", "Encrypted message bytes as 0x...")
  .addOptionalParam("address", "Optionally specify the ShroudNet contract address")
  .setAction(async function (args: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const deployment = args.address ? { address: args.address as string } : await deployments.get("ShroudNet");
    const contract = await ethers.getContractAt("ShroudNet", deployment.address);

    const tx = await contract.sendMessage(BigInt(args.netid), args.data as string);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
    console.log(`Sent encrypted message to Net ${args.netid}`);
  });

