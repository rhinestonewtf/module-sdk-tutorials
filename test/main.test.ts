import { sepolia } from "viem/chains";
import { ensureBundlerIsReady, ensurePaymasterIsReady } from "./healthCheck";
import smartSessionsPermissionlessSafe from "../src/smart-sessions/permissionless-safe";
import deadmanSwitchPermissionlessSafe from "../src/deadman-switch/permissionless-safe";
import socialRecoveryPermissionlessSafe from "../src/social-recovery/permissionless-safe";

const bundlerUrl = "http://localhost:4337";
const rpcUrl = "http://localhost:8545";
const paymasterUrl = "http://localhost:3000";

describe("Test erc7579 reference implementation", () => {
  beforeAll(async () => {
    await ensureBundlerIsReady({
      bundlerUrl,
    });
    await ensurePaymasterIsReady({
      paymasterUrl,
    });
  }, 2000);

  it("should test smart sessions with permissionless", async () => {
    const receipt = await smartSessionsPermissionlessSafe({
      bundlerUrl,
      rpcUrl,
      paymasterUrl,
      chain: sepolia,
    });
    expect(receipt.success).toBe(true);
  }, 40000);

  it("should test deadman switch with permissionless", async () => {
    const receipt = await deadmanSwitchPermissionlessSafe({
      bundlerUrl,
      rpcUrl,
      paymasterUrl,
      chain: sepolia,
    });
    expect(receipt.success).toBe(true);
  }, 40000);

  it("should test social recovery with permissionless", async () => {
    const receipt = await socialRecoveryPermissionlessSafe({
      bundlerUrl,
      rpcUrl,
      paymasterUrl,
      chain: sepolia,
    });
    expect(receipt.success).toBe(true);
  }, 40000);

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
