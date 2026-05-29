import { ethers } from "ethers";
import { config } from "dotenv";
config();

const RPC      = "https://rpc.ritualfoundation.org";
const CHAIN_ID = 1979;
const CONTRACT = "0xaC9443A8FE8D6CABBcA820A66FAE2810EC8e8688";
const TEE_ADDR = "0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F";

const ABI = [
  "function setExecutorAndOpen(address _executor) external",
  "function mintOpen() view returns (bool)",
  "function executor() view returns (address)",
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC, { chainId: CHAIN_ID, name: "ritual" });
  const wallet   = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  console.log("Wallet :", wallet.address);
  console.log("Balance:", ethers.formatEther(await provider.getBalance(wallet.address)), "RITUAL");

  // ── Strategy 1: broad log scan (last 100 k blocks) ─────────────────────────
  let executorAddress = "";
  console.log("\n[1] Scanning recent logs for executor address...");
  try {
    const latest = await provider.getBlockNumber();
    const from   = Math.max(0, latest - 100000);
    const logs   = await provider.getLogs({ fromBlock: from, toBlock: "latest" });
    for (const log of [...logs].reverse()) {
      if (log.topics?.[1]?.length === 66) {
        const candidate = "0x" + log.topics[1].slice(26);
        if (candidate !== "0x0000000000000000000000000000000000000000") {
          executorAddress = candidate;
          console.log("  candidate from broad scan:", executorAddress);
          break;
        }
      }
    }
  } catch (e) {
    console.log("  broad scan failed:", e.shortMessage || e.message);
  }

  // ── Strategy 2: TEEServiceRegistry log scan ─────────────────────────────────
  if (!executorAddress) {
    console.log("\n[2] Querying TEEServiceRegistry logs...");
    try {
      const latest   = await provider.getBlockNumber();
      const from     = Math.max(0, latest - 200000);
      const teeLogs  = await provider.getLogs({ address: TEE_ADDR, fromBlock: from, toBlock: "latest" });
      console.log("  TEE logs found:", teeLogs.length);
      if (teeLogs.length > 0) {
        const last = teeLogs[teeLogs.length - 1];
        const raw  = (last.topics?.[1] || last.data) ?? "";
        if (raw.length >= 66) {
          executorAddress = "0x" + raw.slice(26, 66);
          console.log("  executor from TEE registry:", executorAddress);
        }
      }
    } catch (e) {
      console.log("  TEE scan failed:", e.shortMessage || e.message);
    }
  }

  // ── Strategy 3: latest block tx scan ────────────────────────────────────────
  if (!executorAddress) {
    console.log("\n[3] Scanning latest block transactions...");
    try {
      const block = await provider.getBlock("latest", true);
      for (const tx of (block?.prefetchedTransactions || []).slice(0, 20)) {
        if (tx.from?.toLowerCase().startsWith("0x0000")) {
          const receipt = await provider.getTransactionReceipt(tx.hash);
          for (const log of (receipt?.logs || [])) {
            const raw = log.data;
            if (raw && raw.length >= 66) {
              const candidate = "0x" + raw.slice(26, 66);
              if (candidate !== "0x0000000000000000000000000000000000000000") {
                executorAddress = candidate;
                console.log("  executor from sys tx:", executorAddress);
                break;
              }
            }
          }
          if (executorAddress) break;
        }
      }
    } catch (e) {
      console.log("  block tx scan failed:", e.shortMessage || e.message);
    }
  }

  // ── Strategy 4: try EXECUTOR_ADDRESS from .env ──────────────────────────────
  if (!executorAddress && process.env.EXECUTOR_ADDRESS) {
    executorAddress = process.env.EXECUTOR_ADDRESS;
    console.log("\n[4] Using EXECUTOR_ADDRESS from .env:", executorAddress);
  }

  // ── Strategy 5: known Ritual Chain executor (discovered 2026-05-29) ─────────
  if (!executorAddress) {
    executorAddress = ethers.getAddress("0xdeeab400585b6dc15670896731065a9f4a2946a6");
    console.log("\n[5] Using known Ritual executor:", executorAddress);
  }

  if (!executorAddress) {
    console.error("\n❌  Could not auto-detect executor. Add EXECUTOR_ADDRESS=0x... to .env and re-run.");
    process.exit(1);
  }

  console.log("\nExecutor resolved:", executorAddress);
  console.log("Calling setExecutorAndOpen...");

  const contract = new ethers.Contract(CONTRACT, ABI, wallet);
  const tx = await contract.setExecutorAndOpen(executorAddress, { gasLimit: 200_000 });
  console.log("TX submitted:", tx.hash);
  console.log("Explorer    :", `https://explorer.ritualfoundation.org/tx/${tx.hash}`);

  const receipt = await tx.wait();
  console.log("Confirmed in block:", receipt.blockNumber);

  const isOpen = await contract.mintOpen();
  const exec   = await contract.executor();
  console.log("\n✅  MINT IS NOW:", isOpen ? "OPEN" : "CLOSED");
  console.log("Executor set to :", exec);
}

main().catch(console.error);
