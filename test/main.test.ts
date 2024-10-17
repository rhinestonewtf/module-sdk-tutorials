import { sepolia } from "viem/chains";
import { ensureBundlerIsReady, ensurePaymasterIsReady } from "./healthCheck";
import smartSessionsPermissionlessSafe from "../src/smart-sessions/permissionless-safe";
import deadmanSwitchPermissionlessSafe from "../src/deadman-switch/permissionless-safe";
import socialRecoveryPermissionlessSafe from "../src/social-recovery/permissionless-safe";
import socialRecoveryZeroDevKernel from "../src/social-recovery/zerodev-kernel";
import scheduledTransfersPermissionlessSafe from "../src/scheduled-transfers/permissionless-safe";

import * as dotenv from "dotenv";
dotenv.config();

const bundlerUrl = "http://localhost:4337";
const rpcUrl = "http://localhost:8545";
const paymasterUrl = "http://localhost:3000";

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
  //
  // it("should test social recovery with permissionless", async () => {
  //   const receipt = await socialRecoveryZeroDevKernel({
  //     bundlerUrl,
  //     rpcUrl,
  //     paymasterUrl,
  //     chain: sepolia,
  //   });
  //   expect(receipt.success).toBe(true);
  // }, 40000);

  it("should test scheduled transfers with permissionless", async () => {
    const logs = await scheduledTransfersPermissionlessSafe({
      bundlerUrl: process.env.BUNDLER_URL!,
      rpcUrl: process.env.RPC_URL!,
      paymasterUrl: process.env.PAYMASTER_URL!,
      chain: sepolia,
      automationsApiKey: process.env.AUTOMATIONS_API_KEY!,
    });
    console.log(logs);
    // expect(receipt.success).toBe(true);
  }, 200000);

  // todo: figure out how to run this in jest
  // it("should test webauhtn with permissionless", async () => {
  //   const receipt = await webauthnPermissionlessSafe({
  //     bundlerUrl,
  //     rpcUrl,
  //     paymasterUrl,
  //     chain: sepolia,
  //   });
  // }, 20000);
});
