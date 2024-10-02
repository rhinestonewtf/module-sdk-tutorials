import { foundry, sepolia } from "viem/chains";
import { ensureBundlerIsReady, ensurePaymasterIsReady } from "./healthCheck";
import smartSessionsPermissionlessSafe from "../src/smart-sessions/permissionless-safe";
import deadmanSwitchPermissionlessSafe from "../src/deadman-switch/permissionless-safe";
import socialRecoveryPermissionlessSafe from "../src/social-recovery/permissionless-safe";
import webauthnPermissionlessSafe from "../src/webauthn/permissionless-safe";
import { createTestClient, http } from "viem";

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

    const testClient = createTestClient({
      chain: foundry,
      mode: "anvil",
      transport: http(rpcUrl),
    });

    // await testClient.setCode({
    //   address: "0x000000000069E2a187AEFFb852bF3cCdC95151B2",
    //   bytecode: "0x00",
    // });
  }, 2000);

  // it("should test smart sessions with permissionless", async () => {
  //   const receipt = await smartSessionsPermissionlessSafe({
  //     bundlerUrl,
  //     rpcUrl,
  //     paymasterUrl,
  //     chain: sepolia,
  //   });
  // }, 20000);

  it("should test deadman switch with permissionless", async () => {
    const receipt = await deadmanSwitchPermissionlessSafe({
      bundlerUrl,
      rpcUrl,
      paymasterUrl,
      chain: sepolia,
    });
  }, 20000);

  it("should test social recovery with permissionless", async () => {
    const receipt = await socialRecoveryPermissionlessSafe({
      bundlerUrl,
      rpcUrl,
      paymasterUrl,
      chain: sepolia,
    });
  }, 20000);

  it("should test webauhtn with permissionless", async () => {
    const receipt = await webauthnPermissionlessSafe({
      bundlerUrl,
      rpcUrl,
      paymasterUrl,
      chain: sepolia,
    });
  }, 20000);
});
