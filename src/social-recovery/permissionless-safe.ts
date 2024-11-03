import {
  getSetOwnableValidatorThresholdAction,
  getSocialRecoveryValidator,
  getOwnableValidator,
  getSocialRecoveryMockSignature,
  RHINESTONE_ATTESTER_ADDRESS,
  MOCK_ATTESTER_ADDRESS,
  encodeValidatorNonce,
  getAccount,
} from "@rhinestone/module-sdk";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http, encodePacked, Chain } from "viem";
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
  chain: Chain;
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

  const ownableValidator = getOwnableValidator({
    owners: [
      "0x2DC2fb2f4F11DeE1d6a2054ffCBf102D09b62bE2",
      "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    ],
    threshold: 2,
  });

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
    validators: [
      {
        address: ownableValidator.address,
        context: ownableValidator.initData,
      },
    ],
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

  const guardian1 = privateKeyToAccount(
    "0xc171c45f3d35fad832c53cade38e8d21b8d5cc93d1887e867fac626c1c0d6be7",
  ); // the key coresponding to the first guardian

  const guardian2 = privateKeyToAccount(
    "0x1a4c05be22dd9294615087ba1dba4266ae68cdc320d9164dbf3650ec0db60f67",
  ); // the key coresponding to the second guardian

  const socialRecovery = getSocialRecoveryValidator({
    threshold: 2,
    guardians: [guardian1.address, guardian2.address],
  });

  const opHash1 = await smartAccountClient.installModule(socialRecovery);

  await pimlicoClient.waitForUserOperationReceipt({
    hash: opHash1,
  });

  const recoveryAction = getSetOwnableValidatorThresholdAction({
    threshold: 1,
  });

  const nonce = await getAccountNonce(publicClient, {
    address: safeAccount.address,
    entryPointAddress: entryPoint07Address,
    key: encodeValidatorNonce({
      account: getAccount({
        address: safeAccount.address,
        type: "safe",
      }),
      validator: socialRecovery,
    }),
  });

  const userOperation = await smartAccountClient.prepareUserOperation({
    account: safeAccount,
    calls: [recoveryAction],
    nonce: nonce,
    signature: getSocialRecoveryMockSignature({
      threshold: 2,
    }),
  });

  const userOpHashToSign = getUserOperationHash({
    chainId: chain.id,
    entryPointAddress: entryPoint07Address,
    entryPointVersion: "0.7",
    userOperation,
  });

  const signature1 = await guardian1.signMessage({
    message: { raw: userOpHashToSign },
  });

  const signature2 = await guardian2.signMessage({
    message: { raw: userOpHashToSign },
  });

  userOperation.signature = encodePacked(
    ["bytes", "bytes"],
    [signature1, signature2],
  );

  const userOpHash = await smartAccountClient.sendUserOperation(userOperation);

  const receipt = await pimlicoClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  return receipt;
}
