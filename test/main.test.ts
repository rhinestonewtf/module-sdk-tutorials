import {
  arbitrumSepolia,
  baseSepolia,
  odysseyTestnet,
  optimismSepolia,
  sepolia,
} from "viem/chains";
import { ensureBundlerIsReady, ensurePaymasterIsReady } from "./healthCheck";
import smartSessionsPermissionlessSafe from "../src/smart-sessions/permissionless-safe";
import smartSessionsPermissionlessSafeZeroSigs from "../src/smart-sessions/permissionless-safe-zero-sigs";
import smartSessionsPermissionlessSafe7702 from "../src/smart-sessions/permissionless-safe-7702";
import deadmanSwitchPermissionlessSafe from "../src/deadman-switch/permissionless-safe";
import socialRecoveryPermissionlessSafe from "../src/social-recovery/permissionless-safe";
import socialRecoveryZeroDevKernel from "../src/social-recovery/zerodev-kernel";
import scheduledTransfersPermissionlessSafe from "../src/scheduled-transfers/permissionless-safe";
import scheduledOrdersPermissionlessSafe from "../src/scheduled-orders/permissionless-safe";
import autoSavingsPermissionlessSafe from "../src/auto-savings/permissionless-safe";
import omniAccountNewAccount from "../src/orchestrator-sdk/new-account";
import omniAccountExistingAccount from "../src/orchestrator-sdk/existing-account";

import * as dotenv from "dotenv";
import { Hex } from "viem";
dotenv.config();

const bundlerUrl = "http://localhost:4337";
const rpcUrl = "http://localhost:8545";
const paymasterUrl = "http://localhost:3000";

// @ts-ignore
BigInt.prototype.toJSON = function () {
  return this.toString();
};

describe("Test erc7579 reference implementation", () => {
  beforeAll(async () => {
    // await ensureBundlerIsReady({
    //   bundlerUrl,
    // });
    // await ensurePaymasterIsReady({
    //   paymasterUrl,
    // });
  }, 2000);

  // it("should test smart sessions with permissionless", async () => {
  //   const receipt = await smartSessionsPermissionlessSafe({
  //     bundlerUrl,
  //     rpcUrl,
  //     paymasterUrl,
  //     chain: sepolia,
  //   });
  //   expect(receipt.success).toBe(true);
  // }, 40000);
  //
  // it("should test smart sessions with permissionless and zero user sigs", async () => {
  //   const receipt = await smartSessionsPermissionlessSafeZeroSigs({
  //     bundlerUrl,
  //     rpcUrl,
  //     paymasterUrl,
  //     chain: sepolia,
  //   });
  //   expect(receipt.success).toBe(true);
  // }, 40000);
  //
  // it("should test smart sessions with permissionless and 7702", async () => {
  //   const receipt = await smartSessionsPermissionlessSafe7702({
  //     bundlerUrl,
  //     rpcUrl,
  //     paymasterUrl,
  //     chain: sepolia,
  //   });
  //   expect(receipt.success).toBe(true);
  // }, 40000);

  // it("should test deadman switch with permissionless", async () => {
  //   const receipt = await deadmanSwitchPermissionlessSafe({
  //     bundlerUrl,
  //     rpcUrl,
  //     paymasterUrl,
  //     chain: sepolia,
  //   });
  //   expect(receipt.success).toBe(true);
  // }, 40000);
  //
  // it("should test social recovery with permissionless", async () => {
  //   const receipt = await socialRecoveryPermissionlessSafe({
  //     bundlerUrl,
  //     rpcUrl,
  //     paymasterUrl,
  //     chain: sepolia,
  //   });
  //   expect(receipt.success).toBe(true);
  // }, 40000);
  // //
  // it("should test social recovery with permissionless", async () => {
  //   const receipt = await socialRecoveryZeroDevKernel({
  //     bundlerUrl,
  //     rpcUrl,
  //     paymasterUrl,
  //     chain: sepolia,
  //   });
  //   expect(receipt.success).toBe(true);
  // }, 40000);

  // it("should test scheduled transfers with permissionless", async () => {
  //   const logs = await scheduledTransfersPermissionlessSafe({
  //     bundlerUrl: `https://api.pimlico.io/v2/11155111/rpc?apikey=${process.env.PIMLICO_API_KEY}`,
  //     rpcUrl: `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
  //     paymasterUrl: `https://api.pimlico.io/v2/11155111/rpc?apikey=${process.env.PIMLICO_API_KEY}`,
  //     chain: sepolia,
  //     automationsApiKey: process.env.AUTOMATIONS_API_KEY!,
  //   });
  //   // expect(receipt.success).toBe(true);
  // }, 200000);
  //
  // it("should test scheduled orders with permissionless", async () => {
  //   const logs = await scheduledOrdersPermissionlessSafe({
  //     bundlerUrl: `https://api.pimlico.io/v2/11155111/rpc?apikey=${process.env.PIMLICO_API_KEY}`,
  //     rpcUrl: `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
  //     paymasterUrl: `https://api.pimlico.io/v2/11155111/rpc?apikey=${process.env.PIMLICO_API_KEY}`,
  //     chain: sepolia,
  //     automationsApiKey: process.env.AUTOMATIONS_API_KEY!,
  //   });
  //   // expect(receipt.success).toBe(true);
  // }, 200000);
  //
  // it("should test auto savings with permissionless", async () => {
  //   const logs = await autoSavingsPermissionlessSafe({
  //     bundlerUrl: `https://api.pimlico.io/v2/11155111/rpc?apikey=${process.env.PIMLICO_API_KEY}`,
  //     rpcUrl: `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
  //     paymasterUrl: `https://api.pimlico.io/v2/11155111/rpc?apikey=${process.env.PIMLICO_API_KEY}`,
  //     chain: sepolia,
  //     automationsApiKey: process.env.AUTOMATIONS_API_KEY!,
  //   });
  //   // expect(receipt.success).toBe(true);
  // }, 200000);
  //
  // it("should test omni account with a new account", async () => {
  //   const bundleStatus = await omniAccountNewAccount({
  //     sourceChain: baseSepolia,
  //     targetChain: optimismSepolia,
  //     orchestratorApiKey: process.env.ORCHESTRATOR_API_KEY!,
  //     pimlicoApiKey: process.env.PIMLICO_API_KEY!,
  //     fundingPrivateKey: process.env.FUNDING_PRIVATE_KEY! as Hex,
  //   });
  //   console.log(bundleStatus);
  // }, 200000);

  it("should test omni account with an existing account", async () => {
    const bundleStatus = await omniAccountExistingAccount({
      sourceChain: baseSepolia,
      targetChain: optimismSepolia,
      orchestratorApiKey: process.env.ORCHESTRATOR_API_KEY!,
      pimlicoApiKey: process.env.PIMLICO_API_KEY!,
      fundingPrivateKey: process.env.FUNDING_PRIVATE_KEY! as Hex,
    });
    console.log(bundleStatus);
  }, 200000);
});
