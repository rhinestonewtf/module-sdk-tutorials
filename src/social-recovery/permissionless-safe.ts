import {
  getSetOwnableValidatorThresholdAction,
  getSocialRecoveryValidator,
  getOwnableValidator,
  getSocialRecoveryMockSignature,
  RHINESTONE_ATTESTER_ADDRESS,
  MOCK_ATTESTER_ADDRESS,
} from "@rhinestone/module-sdk";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http, encodePacked, pad } from "viem";
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
    // safe4337ModuleAddress: "0x7579F9feedf32331C645828139aFF78d517d0001",
    // erc7579LaunchpadAddress: "0x7579011aB74c46090561ea277Ba79D510c6C00ff",
    safe4337ModuleAddress: "0x3Fdb5BC686e861480ef99A6E3FaAe03c0b9F32e2", // These are not meant to be used in production as of now.
    erc7579LaunchpadAddress: "0xEBe001b3D534B9B6E2500FB78E67a1A137f561CE",
    attesters: [
      RHINESTONE_ATTESTER_ADDRESS, // Rhinestone Attester
      MOCK_ATTESTER_ADDRESS, // Mock Attester - do not use in production
    ],
    attestersThreshold: 1,
    validators: [
      {
        address: ownableValidator.module,
        context: ownableValidator.initData!,
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

  console.log("Guardian 1 address: ", guardian1.address);
  console.log("Guardian 2 address: ", guardian2.address);

  const socialRecovery = getSocialRecoveryValidator({
    threshold: 2,
    guardians: [guardian1.address, guardian2.address],
  });

  const opHash1 = await smartAccountClient.installModule({
    type: socialRecovery.type,
    address: socialRecovery.module,
    initData: socialRecovery.initData!,
  });

  await pimlicoClient.waitForUserOperationReceipt({
    hash: opHash1,
  });

  const action = getSetOwnableValidatorThresholdAction({
    threshold: 1,
  });

  const nonce = await getAccountNonce(publicClient, {
    address: safeAccount.address,
    entryPointAddress: entryPoint07Address,
    key: BigInt(pad(socialRecovery.module, { dir: "right", size: 24 })),
  });

  const userOperation = await smartAccountClient.prepareUserOperation({
    account: safeAccount,
    calls: [
      {
        to: action.target,
        data: action.callData,
        value: action.value,
      },
    ],
    nonce: nonce,
    signature: getSocialRecoveryMockSignature(),
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
