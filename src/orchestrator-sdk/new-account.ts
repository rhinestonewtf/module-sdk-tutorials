import {
  ACCOUNT_LOCKER_SOURCE_EXECUTOR,
  ACCOUNT_LOCKER_TARGET_EXECUTOR,
  getAccountLockerHook,
  getOwnableValidator,
  getOwnableValidatorMockSignature,
  RHINESTONE_ATTESTER_ADDRESS,
} from "@rhinestone/module-sdk";
import { createSmartAccountClient } from "permissionless";
import { toSafeSmartAccount } from "permissionless/accounts";
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
  getOrchestrator,
  getOrderBundleHash,
  getTokenAddress,
  MetaIntent,
  ORCHESTRATOR_URL,
  SignedOrderBundle,
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

  const sourceSafeAccount = await toSafeSmartAccount({
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
      "0x8a310b9085faF5d9464D84C3d9a7BE3b28c94531", // Mock attester for omni account
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
        address: "0xE1058634834E01038CadbaE8208BFfF81B1Ede51",
        context: "0x",
      },
      {
        address: "0xA90F831363708B32a3f1502165253E0210cf680d",
        context: "0x",
      },
    ],
  });

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

  // create a new user on orchestrator
  const userId = await orchestrator.createUserAccount(
    sourceSafeAccount.address,
    [sourceChain.id, targetChain.id],
  );

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

  // install the hook on source chain
  const opHash = await sourceSmartAccountClient.installModule({
    address: "0x29BDcBc36e344061393f8AB58D2D6AABaedeAaAE",
    initData: encodeAbiParameters(
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
    type: "hook",
  });

  await sourcePimlicoClient.waitForUserOperationReceipt({
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
    client: targetPublicClient,
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
      "0x8a310b9085faF5d9464D84C3d9a7BE3b28c94531", // Mock attester for omni account
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
        address: "0xE1058634834E01038CadbaE8208BFfF81B1Ede51",
        context: "0x",
      },
      {
        address: "0xA90F831363708B32a3f1502165253E0210cf680d",
        context: "0x",
      },
    ],
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
    targetExecutions: [],
    userOp: {
      sender: zeroAddress,
      nonce: 0n,
      initCode: "0x",
      callData: "0x",
      accountGasLimits: zeroHash,
      preVerificationGas: 0n,
      gasFees: zeroHash,
      paymasterAndData: "0x",
      signature: "0x",
    },
  };

  const orderPath = await fetch(
    `${ORCHESTRATOR_URL}/users/${userId}/bundles/path`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": orchestratorApiKey,
      },
      body: JSON.stringify(metaIntent),
    },
  ).then((res) => res.json());

  console.log(orderPath);

  const { orderBundle, injectedExecutions } = orderPath;

  console.log(orderBundle, injectedExecutions);

  // const { orderBundle, injectedExecutions } = await orchestrator.getOrderPath(
  //   metaIntent,
  //   userId,
  // );

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

  // get the state override
  const balanceSlot = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }],
      [targetSafeAccount.address, 9n],
    ),
  );

  const userOpActions = [
    ...injectedExecutions.slice(1),
    {
      to: getTokenAddress("USDC", targetChain.id),
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: ["0xd8da6bf26964af9d7eed9e03e53415d37aa96045", 2n],
      }),
    },
  ];

  console.log(userOpActions);

  const userOp = await targetSmartAccountClient.prepareUserOperation({
    account: targetSafeAccount,
    calls: userOpActions,
    nonce: nonce,
    signature: getOwnableValidatorMockSignature({ threshold: 1 }),
    stateOverride: [
      {
        address: getTokenAddress("USDC", targetChain.id),
        stateDiff: [
          {
            slot: balanceSlot,
            value: pad("0xa"),
          },
        ],
      },
    ],
  });

  console.log([
    // callback action is always the first action in injectedExecutions
    ...(injectedExecutions?.[0] ? [injectedExecutions[0]] : []),
    ...userOpActions,
  ]);

  const injectedExecutionsMapped = [
    // callback action is always the first action in injectedExecutions
    ...(injectedExecutions?.[0] ? [injectedExecutions[0]] : []),
  ].map((action) => ({
    to: action.target,
    value: BigInt(Number(action.value)),
    data: action.callData || "0x",
  }));

  // add the callback
  userOp.callData = await targetSafeAccount.encodeCalls([
    ...injectedExecutionsMapped,
    ...userOpActions,
  ]);

  // manually increase gas
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

  // add userOperation into metaintent
  metaIntent.userOp = toPackedUserOperation(userOp);

  // sign the meta intent
  const orderBundleHash = await getOrderBundleHash(orderBundle);

  const bundleSignature = await owner.signMessage({
    message: { raw: orderBundleHash },
  });
  const packedSig = encodePacked(
    ["address", "bytes"],
    [ownableValidator.address, bundleSignature],
  );

  const signedOrderBundle: SignedOrderBundle = {
    ...orderBundle,
    acrossTransfers: orderBundle.acrossTransfers.map((transfer: any) => ({
      ...transfer,
      userSignature: packedSig,
    })),
    targetExecutionSignature:
      orderBundle.userOp.sender !== zeroAddress ? "0x" : packedSig,
    userOp: orderBundle.userOp,
  };

  // send the signed bundle
  const bundleId = await orchestrator.postSignedOrderBundle(
    signedOrderBundle,
    userId,
  );

  // check bundle status
  const bundleStatus = await orchestrator.getBundleStatus(userId, bundleId);
  return bundleStatus;
}
