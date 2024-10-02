import {
  getSmartSessionsValidator,
  OWNABLE_VALIDATOR_ADDRESS,
  getSudoPolicy,
  Session,
  getSessionDigest,
  SMART_SESSIONS_ADDRESS,
  hashChainSessions,
  getClient,
  getAccount,
  getPermissionId,
  getSessionNonce,
  encodeSmartSessionSignature,
  SmartSessionMode,
  ChainSession,
  getSocialRecoveryValidator,
} from "@rhinestone/module-sdk";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  encodeAbiParameters,
  toHex,
  toBytes,
  Address,
  Hex,
  createPublicClient,
  http,
} from "viem";
import { createSmartAccountClient } from "permissionless";
import { erc7579Actions } from "permissionless/actions/erc7579";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import {
  entryPoint07Address,
  getUserOperationHash,
} from "viem/account-abstraction";
import { toSafeSmartAccount } from "permissionless/accounts";

export default async function main({
  bundlerUrl,
  rpcUrl,
  chain,
}: {
  bundlerUrl: string;
  rpcUrl: string;
  chain: any;
}) {
  const publicClient = createPublicClient({
    transport: http(rpcUrl),
    chain: chain,
  });

  const pimlicoClient = createPimlicoClient({
    transport: http(bundlerUrl),
    entryPoint: {
      address: entryPoint07Address,
      version: "0.7",
    },
  });

  const owner = privateKeyToAccount(generatePrivateKey());

  const safeAccount = await toSafeSmartAccount({
    client: publicClient,
    owners: [owner],
    version: "1.4.1",
    entryPoint: {
      address: entryPoint07Address,
      version: "0.7",
    },
    safe4337ModuleAddress: "0x7579F9feedf32331C645828139aFF78d517d0001",
    erc7579LaunchpadAddress: "0x7579011aB74c46090561ea277Ba79D510c6C00ff",
    attesters: [
      "0x000000333034E9f539ce08819E12c1b8Cb29084d", // Rhinestone Attester
      "0xA4C777199658a41688E9488c4EcbD7a2925Cc23A", // Mock Attester - do not use in production
    ],
    attestersThreshold: 1,
  });

  const smartAccountClient = createSmartAccountClient({
    account: safeAccount,
    chain: chain,
    bundlerTransport: http(bundlerUrl),
    paymaster: pimlicoClient,
    userOperation: {
      estimateFeesPerGas: async () => {
        return (await pimlicoClient.getUserOperationGasPrice()).fast;
      },
    },
  }).extend(erc7579Actions());

  //   const receipt = await pimlicoClient.waitForUserOperationReceipt({
  //     hash: userOpHash,
  //   });

  //   return receipt;
}
