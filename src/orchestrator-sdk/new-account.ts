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
  encodeAbiParameters,
  encodePacked,
  http,
  keccak256,
  pad,
  zeroAddress,
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
  SignedOrderBundle,
} from "@rhinestone/orchestrator-sdk";
import { erc7579Actions } from "permissionless/actions/erc7579";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { getAccountNonce } from "permissionless/actions/public/getAccountNonce";

export default async function main({
  sourceChain,
  targetChain,
  orchestratorApiKey,
  pimlicoApiKey,
}: {
  sourceChain: Chain;
  targetChain: Chain;
  orchestratorApiKey: string;
  pimlicoApiKey: string;
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

  const safeAccount = await toSafeSmartAccount({
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
        address: ACCOUNT_LOCKER_SOURCE_EXECUTOR,
        context: "0x",
      },
      {
        address: ACCOUNT_LOCKER_TARGET_EXECUTOR,
        context: "0x",
      },
    ],
  });

  const sourceSmartAccountClient = createSmartAccountClient({
    account: safeAccount,
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
  const userId = await orchestrator.createUserAccount(safeAccount.address, [
    8453,
  ]);

  // fund the smart account
  // todo

  // install the hook on source chain
  const opHash = await sourceSmartAccountClient.installModule(
    getAccountLockerHook({
      isOmniMode: true,
    }),
  );

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

  // construct a token transfer
  const tokenTransfers = [
    {
      tokenAddress: getTokenAddress("USDC", targetChain.id),
      amount: 10n,
    },
  ];

  // create the userOperation
  const nonce = await getAccountNonce(targetPublicClient, {
    address: safeAccount.address,
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
      [safeAccount.address, 9n],
    ),
  );

  const userOp = await targetPimlicoClient.prepareUserOperation({
    account: safeAccount,
    calls: [],
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

  // manually increase gas
  userOp.callGasLimit += BigInt(100000);

  // sign the userOperation
  const userOpHash = getUserOperationHash({
    userOperation: userOp,
    chainId: chain.id,
    entryPointAddress: entryPoint07Address,
    entryPointVersion: "0.7",
  });
  userOp.signature = await owner.signMessage({
    message: { raw: userOpHash },
  });

  // create the meta intent
  const metaIntent: MetaIntent = {
    targetChainId: 8453, // Base
    tokenTransfers: tokenTransfers,
    targetAccount: safeAccount.address,
    targetExecutions: [],
    userOp: toPackedUserOperation(userOp),
  };

  const { orderBundle, injectedExecutions } = await orchestrator.getOrderPath(
    metaIntent,
    userId,
  );

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
    acrossTransfers: orderBundle.acrossTransfers.map((transfer) => ({
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
