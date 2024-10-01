import { sepolia } from "viem/chains";
import smartSessionsPermissionlessSafe from "../src/smart-sessions/permissionless-safe";
import deadmanSwitchPermissionlessSafe from "../src/deadman-switch/permissionless-safe";
import socialRecoveryPermissionlessSafe from "../src/social-recovery/permissionless-safe";

const bundlerUrl = "http://localhost:4337";
const rpcUrl = "http://localhost:8545";

describe("Test erc7579 reference implementation", () => {
  it("should test smart sessions with permissionless", async () => {
    smartSessionsPermissionlessSafe({
      bundlerUrl,
      rpcUrl,
      chain: sepolia,
    });
  }, 20000);
  it("should test deadman switch with permissionless", async () => {
    deadmanSwitchPermissionlessSafe({
      bundlerUrl,
      rpcUrl,
      chain: sepolia,
    });
  }, 20000);
  it("should test social recovery with permissionless", async () => {
    socialRecoveryPermissionlessSafe({
      bundlerUrl,
      rpcUrl,
      chain: sepolia,
    });
  }, 20000);
});
