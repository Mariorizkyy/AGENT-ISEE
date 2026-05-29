#!/usr/bin/env node
// Compile AgentISEE.sol using solc standard JSON (supports viaIR)
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const solc = require("solc");

const source = readFileSync("contracts/AgentISEE.sol", "utf8");

const input = {
  language: "Solidity",
  sources: {
    "AgentISEE.sol": { content: source }
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    outputSelection: {
      "*": { "*": ["abi", "evm.bytecode"] }
    }
  }
};

console.log("Compiling AgentISEE.sol with viaIR optimizer...");
const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  const fatal = output.errors.filter(e => e.severity === "error");
  if (fatal.length) {
    for (const e of fatal) console.error("ERROR:", e.formattedMessage);
    process.exit(1);
  }
  for (const w of output.errors) console.warn("WARN:", w.formattedMessage);
}

const contract = output.contracts["AgentISEE.sol"]["AgentISEE"];
if (!contract) { console.error("Contract not found in output"); process.exit(1); }

mkdirSync("artifacts", { recursive: true });
writeFileSync("artifacts/AgentISEE.bin", contract.evm.bytecode.object);
writeFileSync("artifacts/AgentISEE.abi", JSON.stringify(contract.abi, null, 2));

console.log("✅ Compiled successfully");
console.log("   artifacts/AgentISEE.bin —", contract.evm.bytecode.object.length / 2, "bytes");
console.log("   artifacts/AgentISEE.abi");
