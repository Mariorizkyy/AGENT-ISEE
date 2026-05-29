import { ethers } from "ethers";
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { config } from "dotenv";
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ARTIFACTS_DIR = join(__dirname, "../../artifacts");

const RPC_URL               = process.env["RPC_URL"] || "https://rpc.ritualfoundation.org";
const CHAIN_ID              = 1979;
const OWNER                 = "0x419fa2f1991b06b0ab25bac2341765b38ca16178";
const TEE_REGISTRY          = "0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F";

const DEPLOY_ABI = [
  "constructor(address _owner, address _executor)",
  "function openMint() external",
  "function mintOpen() view returns (bool)",
  "function totalSupply() view returns (uint256)",
  "function getBalance() view returns (uint256)",
  "function withdraw() external",
  "function setExecutorAndOpen(address) external",
];

async function fetchExecutor(provider: ethers.JsonRpcProvider): Promise<string | null> {
  console.log("🔍 Fetching executor from TEEServiceRegistry event logs...");

  // 1. Try event logs
  try {
    const latest = await provider.getBlockNumber();
    const logs = await provider.getLogs({
      address: TEE_REGISTRY,
      fromBlock: Math.max(0, latest - 50000),
      toBlock: "latest",
    });
    if (logs.length > 0) {
      const last = logs[logs.length - 1];
      const raw = (last.topics[1] || last.data) ?? "";
      const addr = "0x" + raw.slice(-40);
      if (addr.length === 42 && addr.toLowerCase() !== ethers.ZeroAddress.toLowerCase()) {
        console.log("   ✅ Executor from event logs:", addr);
        return addr;
      }
    }
  } catch {
    console.log("   ⚠ getLogs failed, trying eth_call selectors...");
  }

  // 2. Try raw selectors
  const selectors = ["0x9a8a0592", "0x8a7e35e9", "0x61e5f0cd"];
  for (const sel of selectors) {
    try {
      const result = await provider.call({ to: TEE_REGISTRY, data: sel });
      if (result && result.length > 10) {
        const addr = "0x" + result.slice(-40);
        if (addr.length === 42 && addr.toLowerCase() !== ethers.ZeroAddress.toLowerCase()) {
          console.log("   ✅ Executor via selector", sel, ":", addr);
          return addr;
        }
      }
    } catch { /* try next */ }
  }

  return null;
}

async function main() {
  if (!process.env["PRIVATE_KEY"]) {
    console.error("❌ Set PRIVATE_KEY in Replit Secrets");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL, { chainId: CHAIN_ID, name: "ritual" });
  const wallet   = new ethers.Wallet(process.env["PRIVATE_KEY"]!, provider);
  const balance  = await provider.getBalance(wallet.address);

  console.log("\n👁️  Deploying AgentISEE to Ritual Chain...");
  console.log("Wallet  :", wallet.address);
  console.log("Balance :", ethers.formatEther(balance), "RITUAL");

  // Executor: env override > auto-fetch > zero (set later via setExecutorAndOpen)
  let executor: string;
  if (process.env["EXECUTOR_ADDRESS"]) {
    executor = process.env["EXECUTOR_ADDRESS"]!;
    console.log("   Using EXECUTOR_ADDRESS from env:", executor);
  } else {
    const fetched = await fetchExecutor(provider);
    if (fetched) {
      executor = fetched;
    } else {
      console.log("   ⚠ Executor not found — deploying with zero address.");
      console.log("   After deploy, call setExecutorAndOpen(addr) as owner to activate minting.");
      executor = ethers.ZeroAddress;
    }
  }

  // Load compiled bytecode
  let bytecode: string;
  try {
    const files = readdirSync(ARTIFACTS_DIR);
    const binFile = files.find((f) => f.includes("AgentISEE") && f.endsWith(".bin"));
    if (!binFile) throw new Error("No .bin file found");
    bytecode = "0x" + readFileSync(join(ARTIFACTS_DIR, binFile), "utf8").trim();
    console.log("   Bytecode loaded:", Math.floor((bytecode.length - 2) / 2), "bytes");
  } catch {
    console.error("❌ Compiled artifacts not found — run first:\n   node scripts/compile.js");
    process.exit(1);
  }

  const factory  = new ethers.ContractFactory(DEPLOY_ABI, bytecode, wallet);
  const contract = await factory.deploy(OWNER, executor, { gasLimit: 6_000_000 });
  console.log("\nTX:", contract.deploymentTransaction()!.hash);
  console.log("Waiting for confirmation...");
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log("\n✅ CONTRACT DEPLOYED:", address);
  console.log("   Explorer:", `https://explorer.ritualfoundation.org/address/${address}`);

  const c = contract as ethers.Contract;
  if (executor !== ethers.ZeroAddress) {
    const tx = await c.openMint({ gasLimit: 100_000 });
    await tx.wait();
    console.log("✅ Mint is OPEN — 666 Eyes at 0.06 RITUAL");
  } else {
    console.log("⚠  Mint NOT yet open — call setExecutorAndOpen(addr) as owner when you have the executor address.");
  }

  const info = {
    contract: address,
    owner: OWNER,
    executor,
    chain: CHAIN_ID,
    rpc: RPC_URL,
    deployedAt: new Date().toISOString(),
  };
  writeFileSync("deployment.json", JSON.stringify(info, null, 2));
  console.log("\n📄 Saved to deployment.json");
  console.log("\n══════════════════════════════════════════════");
  console.log("NEXT: paste this into CONTRACT_ADDRESS in:");
  console.log("  artifacts/agent-isee/src/hooks/use-blockchain.ts");
  console.log("Address:", address);
  console.log("══════════════════════════════════════════════\n");
}

main().catch(console.error);
