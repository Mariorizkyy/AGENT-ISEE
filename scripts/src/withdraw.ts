import { ethers } from "ethers";
import { readFileSync } from "fs";
import { config } from "dotenv";
config();

interface DeploymentInfo {
  contract: string;
  owner: string;
  executor: string;
  chain: number;
  rpc?: string;
  deployedAt: string;
}

const deploy: DeploymentInfo = JSON.parse(readFileSync("deployment.json", "utf8"));
const ABI = [
  "function withdraw() external",
  "function getBalance() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
];

async function main() {
  const provider = new ethers.JsonRpcProvider(deploy.rpc || "https://rpc.ritualfoundation.org", { chainId: 1979, name: "ritual" });
  const wallet   = new ethers.Wallet(process.env["PRIVATE_KEY"]!, provider);
  const contract = new ethers.Contract(deploy.contract, ABI, wallet);

  const balance = await contract.getBalance();
  const supply  = await contract.totalSupply();

  console.log("\n👁️  AgentISEE Revenue Dashboard");
  console.log("─────────────────────────────");
  console.log("Contract :", deploy.contract);
  console.log("Minted   :", supply.toString(), "/ 666");
  console.log("Balance  :", ethers.formatEther(balance), "RITUAL");

  if (balance === 0n) { console.log("\nNothing to withdraw yet."); return; }

  console.log("\nWithdrawing to", deploy.owner, "...");
  const tx = await contract.withdraw({ gasLimit: 80_000 });
  await tx.wait();
  console.log("✅ Withdrawn", ethers.formatEther(balance), "RITUAL");
  console.log("TX:", `https://explorer.ritualfoundation.org/tx/${tx.hash}\n`);
}

main().catch(console.error);
