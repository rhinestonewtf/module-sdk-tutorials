import {
  getOwnableValidator,
  RHINESTONE_ATTESTER_ADDRESS,
} from "@rhinestone/module-sdk";
import { createSmartAccountClient } from "permissionless";
import {
  toSafeSmartAccount,
  ToSafeSmartAccountParameters,
} from "permissionless/accounts";
import {
  Chain,
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  erc20Abi,
  Hex,
  http,
  zeroAddress,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { entryPoint07Address } from "viem/account-abstraction";
import {
  getHookAddress,
  getOrchestrator,
  getOrderBundleHash,
  getSameChainModuleAddress,
  getTargetModuleAddress,
  getTokenAddress,
  MetaIntent,
  PostOrderBundleResult,
  SignedMultiChainCompact,
} from "@rhinestone/orchestrator-sdk";
import { erc7579Actions } from "permissionless/actions/erc7579";
import { createPimlicoClient } from "permissionless/clients/pimlico";

export default async function main({
  sourceChain,
  targetChain,
  orchestratorApiKey,
  pimlicoApiKey,
  fundingPrivateKey,
}: {
  sourceChain: Chain;
  targetChain: Chain;
  orchestratorApiKey: string;
  pimlicoApiKey: string;
  fundingPrivateKey: Hex;
}) {
  // create a new smart account
  const owner = privateKeyToAccount(generatePrivateKey());

  const ownableValidator = getOwnableValidator({
    owners: [owner.address],
    threshold: 1,
  });

  // create the source clients
  const sourcePublicClient = createPublicClient({
    chain: sourceChain,
    transport: http(),
  });

  const sourcePimlicoClient = createPimlicoClient({
    transport: http(
      `https://api.pimlico.io/v2/${sourceChain.id}/rpc?apikey=${pimlicoApiKey}`,
    ),
    entryPoint: {
      address: entryPoint07Address,
      version: "0.7",
    },
  });

  const smartAccountConfig: ToSafeSmartAccountParameters<
    "0.7",
    "0x7579011aB74c46090561ea277Ba79D510c6C00ff"
  > = {
    client: sourcePublicClient,
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
      "0x6D0515e8E499468DCe9583626f0cA15b887f9d03", // Mock attester for omni account
    ],
    attestersThreshold: 1,
    validators: [
      {
        address: ownableValidator.address,
        context: ownableValidator.initData,
      },
    ],
    executors: [
      {
        address: getSameChainModuleAddress(targetChain.id),
        context: "0x",
      },
      {
        address: getTargetModuleAddress(targetChain.id),
        context: "0x",
      },
      {
        address: getHookAddress(targetChain.id),
        context: "0x",
      },
    ],
    hooks: [
      {
        address: getHookAddress(targetChain.id),
        context: encodeAbiParameters(
          [
            { name: "hookType", type: "uint256" },
            { name: "hookId", type: "bytes4" },
            { name: "data", type: "bytes" },
          ],
          [
            0n,
            "0x00000000",
            encodeAbiParameters([{ name: "value", type: "bool" }], [true]),
          ],
        ),
      },
    ],
    fallbacks: [
      {
        address: getTargetModuleAddress(targetChain.id),
        context: encodeAbiParameters(
          [
            { name: "selector", type: "bytes4" },
            { name: "flags", type: "bytes1" },
            { name: "data", type: "bytes" },
          ],
          ["0x3a5be8cb", "0x00", "0x"],
        ),
      },
    ],
  };

  const sourceSafeAccount = await toSafeSmartAccount(smartAccountConfig);

  const sourceSmartAccountClient = createSmartAccountClient({
    account: sourceSafeAccount,
    chain: sourceChain,
    bundlerTransport: http(
      `https://api.pimlico.io/v2/${sourceChain.id}/rpc?apikey=${pimlicoApiKey}`,
    ),
    paymaster: sourcePimlicoClient,
    userOperation: {
      estimateFeesPerGas: async () => {
        return (await sourcePimlicoClient.getUserOperationGasPrice()).fast;
      },
    },
  }).extend(erc7579Actions());

  // create the orchestrator client
  const orchestrator = getOrchestrator(orchestratorApiKey);

  // fund the smart account
  const fundingAccount = privateKeyToAccount(fundingPrivateKey);
  const sourceWalletClient = createWalletClient({
    chain: sourceChain,
    transport: http(),
  });

  const fundingTxHash = await sourceWalletClient.sendTransaction({
    account: fundingAccount,
    to: getTokenAddress("USDC", sourceChain.id),
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [sourceSafeAccount.address, 2n],
    }),
  });

  await sourcePublicClient.waitForTransactionReceipt({
    hash: fundingTxHash,
  });

  // deploy the source account
  const opHash = await sourceSmartAccountClient.sendTransaction({
    to: zeroAddress,
    data: "0x11111111",
  });

  await sourcePublicClient.waitForTransactionReceipt({
    hash: opHash,
  });

  // create the target clients
  const targetPublicClient = createPublicClient({
    chain: targetChain,
    transport: http(),
  });

  const targetPimlicoClient = createPimlicoClient({
    transport: http(
      `https://api.pimlico.io/v2/${targetChain.id}/rpc?apikey=${pimlicoApiKey}`,
    ),
    entryPoint: {
      address: entryPoint07Address,
      version: "0.7",
    },
  });

  const targetSafeAccount = await toSafeSmartAccount({
    ...smartAccountConfig,
    client: targetPublicClient,
  });

  const targetSmartAccountClient = createSmartAccountClient({
    account: targetSafeAccount,
    chain: targetChain,
    bundlerTransport: http(
      `https://api.pimlico.io/v2/${targetChain.id}/rpc?apikey=${pimlicoApiKey}`,
    ),
    paymaster: targetPimlicoClient,
    userOperation: {
      estimateFeesPerGas: async () => {
        return (await targetPimlicoClient.getUserOperationGasPrice()).fast;
      },
    },
  }).extend(erc7579Actions());

  // do a transaction to deploy the account on the target chain and install the modules
  const deployUserOpHash = await targetSmartAccountClient.sendUserOperation({
    account: targetSafeAccount,
    calls: [
      {
        to: getTokenAddress("USDC", targetChain.id),
        value: BigInt(0),
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [targetSafeAccount.address],
        }),
      },
    ],
  });

  await targetPimlicoClient.waitForUserOperationReceipt({
    hash: deployUserOpHash,
  });

  // construct a token transfer
  const tokenTransfers = [
    {
      tokenAddress: getTokenAddress("USDC", targetChain.id),
      amount: 2n,
    },
  ];

  // create the meta intent
  const metaIntent: MetaIntent = {
    targetChainId: targetChain.id,
    tokenTransfers: tokenTransfers,
    targetAccount: targetSafeAccount.address,
    targetExecutions: [
      {
        to: getTokenAddress("USDC", targetChain.id),
        value: 0n,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: ["0xd8da6bf26964af9d7eed9e03e53415d37aa96045", 1n],
        }),
      },
    ],
  };

  const orderPath = await orchestrator.getOrderPath(
    metaIntent,
    targetSafeAccount.address,
  );

  orderPath[0].orderBundle.segments[0].witness.execs = [
    ...orderPath[0].injectedExecutions,
    ...metaIntent.targetExecutions,
  ];

  // sign the meta intent
  const orderBundleHash = getOrderBundleHash(orderPath[0].orderBundle);

  const bundleSignature = await owner.signMessage({
    message: { raw: orderBundleHash },
  });
  const packedSig = encodePacked(
    ["address", "bytes"],
    [ownableValidator.address, bundleSignature],
  );

  const signedOrderBundle: SignedMultiChainCompact = {
    ...orderPath[0].orderBundle,
    originSignatures: Array(orderPath[0].orderBundle.segments.length).fill(
      packedSig,
    ),
    targetSignature: packedSig,
  };

  // send the signed bundle
  const bundleResults: PostOrderBundleResult =
    await orchestrator.postSignedOrderBundle([
      {
        signedOrderBundle,
      },
    ]);

  // check bundle status
  const bundleStatus = await orchestrator.getBundleStatus(
    bundleResults[0].bundleId,
  );

  return bundleStatus;
}
