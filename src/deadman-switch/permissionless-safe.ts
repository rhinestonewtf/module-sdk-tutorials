import {
  RHINESTONE_ATTESTER_ADDRESS,
  MOCK_ATTESTER_ADDRESS,
  getDeadmanSwitch,
  getAccount,
  getClient,
  getDeadmanSwitchValidatorMockSignature,
} from "@rhinestone/module-sdk";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  createPublicClient,
  encodeAbiParameters,
  encodeFunctionData,
  Hex,
  http,
  pad,
  parseAbi,
  parseAbiParameters,
} from "viem";
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
    // safe4337ModuleAddress: "0x7579F9feedf32331C645828139aFF78d517d0001",
    // erc7579LaunchpadAddress: "0x7579011aB74c46090561ea277Ba79D510c6C00ff",
    safe4337ModuleAddress: "0x3Fdb5BC686e861480ef99A6E3FaAe03c0b9F32e2", // These are not meant to be used in production as of now.
    erc7579LaunchpadAddress: "0xEBe001b3D534B9B6E2500FB78E67a1A137f561CE",
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
    "0xc171c45f3d35fad832c53cade38e8d21b8d5cc93d1887e867fac626c1c0d6be7"
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

  const opHash1 = await smartAccountClient.installModule({
    type: deadmanSwitch.type,
    address: deadmanSwitch.module,
    context: deadmanSwitch.initData!,
  });

  await pimlicoClient.waitForUserOperationReceipt({
    hash: opHash1,
  });

  const opHash2 = await smartAccountClient.installModule({
    type: "hook",
    address: deadmanSwitch.module,
    context: encodeAbiParameters(
      parseAbiParameters(
        "uint8 hookType, bytes4 selector, bytes memory initData"
      ),
      [0, "0x00000000", "0x"]
    ),
  });

  await pimlicoClient.waitForUserOperationReceipt({
    hash: opHash2,
  });

  const config = await publicClient.readContract({
    address: deadmanSwitch.module,
    abi: parseAbi(["function config(address) external view"]),
    functionName: "config",
    args: [safeAccount.address],
  });

  console.log(config);

  // wait for 10 seconds
  await new Promise((resolve) => setTimeout(resolve, 10000));

  const nonce = await getAccountNonce(publicClient, {
    address: safeAccount.address,
    entryPointAddress: entryPoint07Address,
    key: BigInt(pad(deadmanSwitch.module, { dir: "right", size: 24 }) || 0),
  });

  const userOperation = await smartAccountClient.prepareUserOperation({
    account: safeAccount,
    calls: [
      {
        to: "0x25a4b2f363678e13a0a5db79b712de00347a593e",
        data: encodeFunctionData({
          abi: parseAbi([
            "function trustAttesters(uint8 threshold, address[] calldata attesters) external",
          ]),
          args: [1, [RHINESTONE_ATTESTER_ADDRESS]],
        }),
        value: BigInt(0),
      },
    ],
    nonce: nonce,
    signature: getDeadmanSwitchValidatorMockSignature() as Hex,
  });

  const userOpHashToSign = getUserOperationHash({
    chainId: chain.id,
    entryPointAddress: entryPoint07Address,
    entryPointVersion: "0.7",
    userOperation,
  });

  const signature = await nominee.signMessage({
    message: { raw: userOpHashToSign },
  });

  const userOpHash = await smartAccountClient.sendUserOperation({
    account: safeAccount,
    calls: [
      {
        to: "0x25a4b2f363678e13a0a5db79b712de00347a593e",
        data: encodeFunctionData({
          abi: parseAbi([
            "function trustAttesters(uint8 threshold, address[] calldata attesters) external",
          ]),
          args: [1, [RHINESTONE_ATTESTER_ADDRESS]],
        }),
        value: BigInt(0),
      },
    ],
    nonce: nonce,
    signature: signature,
  });

  const receipt = await pimlicoClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  return receipt;
}
