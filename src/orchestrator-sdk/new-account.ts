import {
  encodeModuleInstallationData,
  getAccount,
  getAccountLockerHook,
  getAccountLockerSourceExecutor,
  getAccountLockerTargetExecutor,
  getOwnableValidator,
  getOwnableValidatorMockSignature,
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
  keccak256,
  pad,
  zeroAddress,
  zeroHash,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  entryPoint07Address,
  getUserOperationHash,
  toPackedUserOperation,
} from "viem/account-abstraction";
import {
  getEmptyUserOp,
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
import { getAccountNonce } from "permissionless/actions";

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

  // // install the hook on source chain
  // const opHash = await sourceSmartAccountClient.installModule({
  //   address: getHookAddress(targetChain.id),
  //   initData: encodeAbiParameters(
  //     [
  //       { name: "hookType", type: "uint256" },
  //       { name: "hookId", type: "bytes4" },
  //       { name: "data", type: "bytes" },
  //     ],
  //     [
  //       0n,
  //       "0x00000000",
  //       encodeAbiParameters([{ name: "value", type: "bool" }], [true]),
  //     ],
  //   ),
  //   type: "hook",
  // });

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
    // paymaster: targetPimlicoClient,
    userOperation: {
      estimateFeesPerGas: async () => {
        return (await targetPimlicoClient.getUserOperationGasPrice()).fast;
      },
    },
  }).extend(erc7579Actions());

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
    userOp: getEmptyUserOp(),
  };

  const orderPath = await orchestrator.getOrderPath(
    metaIntent,
    targetSafeAccount.address,
  );

  // create the userOperation
  const nonce = await getAccountNonce(targetPublicClient, {
    address: targetSafeAccount.address,
    entryPointAddress: entryPoint07Address,
    key: BigInt(
      pad(ownableValidator.address, {
        dir: "right",
        size: 24,
      }) || 0,
    ),
  });

  const userOpActions = [
    ...orderPath[0].injectedExecutions.map((execution: any) => ({
      to: execution.to,
      value: BigInt(execution.value),
      data: execution.data || "0x",
    })),
    {
      to: getTokenAddress("USDC", targetChain.id),
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: ["0xd8da6bf26964af9d7eed9e03e53415d37aa96045", 2n],
      }),
    },
  ];

  const balanceSlot = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }],
      [targetSafeAccount.address, 9n],
    ),
  );

  const userOp = await targetSmartAccountClient.prepareUserOperation({
    account: targetSafeAccount,
    calls: userOpActions.slice(1),
    nonce: nonce,
    signature: getOwnableValidatorMockSignature({ threshold: 1 }),
    stateOverride: [
      {
        address: getTokenAddress("USDC", targetChain.id),
        stateDiff: [
          {
            slot: balanceSlot,
            value: pad("0xaaaa"),
          },
        ],
      },
    ],
  });

  // add the callback
  userOp.callData = await targetSafeAccount.encodeCalls([
    ...orderPath[0].injectedExecutions.slice(0, 1),
    ...userOpActions,
  ]);

  // manually increase gas
  userOp.verificationGasLimit += BigInt(100000);
  userOp.callGasLimit += BigInt(100000);

  // sign the userOperation
  const userOpHash = getUserOperationHash({
    userOperation: userOp,
    chainId: targetChain.id,
    entryPointAddress: entryPoint07Address,
    entryPointVersion: "0.7",
  });

  userOp.signature = await owner.signMessage({
    message: { raw: userOpHash },
  });

  // add userOperation into order bundle
  orderPath[0].orderBundle.segments[0].witness.userOpHash = userOpHash;

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
    targetSignature: packedSig, // TODO: Check what this value should be
  };

  // send the signed bundle
  const bundleResults: PostOrderBundleResult =
    await orchestrator.postSignedOrderBundle([
      {
        signedOrderBundle,
        userOp,
      },
    ]);

  console.log(bundleResults);

  // check bundle status
  const bundleStatus = await orchestrator.getBundleStatus(
    bundleResults[0].bundleId,
  );
  return bundleStatus;
}
