import {
  RHINESTONE_ATTESTER_ADDRESS,
  MOCK_ATTESTER_ADDRESS,
  getDeadmanSwitch,
  getAccount,
  getClient,
  getDeadmanSwitchValidatorMockSignature,
  getTrustAttestersAction,
  encodeModuleInstallationData,
  encodeValidatorNonce,
} from "@rhinestone/module-sdk";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createPublicClient, Hex, http } from "viem";
import { createSmartAccountClient } from "permissionless";
import { erc7579Actions } from "permissionless/actions/erc7579";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import {
  createPaymasterClient,
  entryPoint07Address,
  getUserOperationHash,
} from "viem/account-abstraction";
import { toSafeSmartAccount } from "permissionless/accounts";
import { getAccountNonce } from "permissionless/actions";

export default async function main({
  bundlerUrl,
  rpcUrl,
  paymasterUrl,
  chain,
}: {
  bundlerUrl: string;
  rpcUrl: string;
  paymasterUrl: string;
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

  const paymasterClient = createPaymasterClient({
    transport: http(paymasterUrl),
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
    safe4337ModuleAddress: "0x7579EE8307284F293B1927136486880611F20002",
    erc7579LaunchpadAddress: "0x7579011aB74c46090561ea277Ba79D510c6C00ff",
    attesters: [
      RHINESTONE_ATTESTER_ADDRESS, // Rhinestone Attester
      MOCK_ATTESTER_ADDRESS, // Mock Attester - do not use in production
    ],
    attestersThreshold: 1,
  });

  const smartAccountClient = createSmartAccountClient({
    account: safeAccount,
    chain: chain,
    bundlerTransport: http(bundlerUrl),
    paymaster: paymasterClient,
    userOperation: {
      estimateFeesPerGas: async () => {
        return (await pimlicoClient.getUserOperationGasPrice()).fast;
      },
    },
  }).extend(erc7579Actions());

  const nominee = privateKeyToAccount(
    "0xc171c45f3d35fad832c53cade38e8d21b8d5cc93d1887e867fac626c1c0d6be7",
  );

  const account = getAccount({
    address: safeAccount.address,
    type: "safe",
  });

  const client = getClient({
    rpcUrl,
  });

  const deadmanSwitch = await getDeadmanSwitch({
    account,
    client,
    nominee: nominee.address,
    timeout: 1,
    moduleType: "validator",
  });

  const opHash1 = await smartAccountClient.installModule(deadmanSwitch);

  await pimlicoClient.waitForUserOperationReceipt({
    hash: opHash1,
  });

  const opHash2 = await smartAccountClient.installModule({
    type: "hook",
    address: deadmanSwitch.module,
    context: encodeModuleInstallationData({
      account,
      module: {
        ...deadmanSwitch,
        initData: "0x",
        type: "hook",
      },
    }),
  });

  await pimlicoClient.waitForUserOperationReceipt({
    hash: opHash2,
  });

  // wait for 10 seconds
  await new Promise((resolve) => setTimeout(resolve, 10000));

  const nonce = await getAccountNonce(publicClient, {
    address: safeAccount.address,
    entryPointAddress: entryPoint07Address,
    key: encodeValidatorNonce({ account, validator: deadmanSwitch }),
  });

  const trustAttestersAction = getTrustAttestersAction({
    threshold: 1,
    attesters: [
      RHINESTONE_ATTESTER_ADDRESS, // Rhinestone Attester
    ],
  });

  const userOperation = await smartAccountClient.prepareUserOperation({
    account: safeAccount,
    calls: [trustAttestersAction],
    nonce: nonce,
    signature: getDeadmanSwitchValidatorMockSignature() as Hex,
  });

  const userOpHashToSign = getUserOperationHash({
    chainId: chain.id,
    entryPointAddress: entryPoint07Address,
    entryPointVersion: "0.7",
    userOperation,
  });

  userOperation.signature = await nominee.signMessage({
    message: { raw: userOpHashToSign },
  });

  const userOpHash = await smartAccountClient.sendUserOperation(userOperation);

  const receipt = await pimlicoClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  return receipt;
}
