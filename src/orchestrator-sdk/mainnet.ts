import {
  getOwnableValidator,
  getOwnableValidatorMockSignature,
  OWNABLE_VALIDATOR_ADDRESS,
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
  parseEther,
  toHex,
  zeroAddress,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  entryPoint07Address,
  getUserOperationHash,
} from "viem/account-abstraction";
import {
  BundleStatus,
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
import { verifyHash } from "viem/actions";

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
  const owner = privateKeyToAccount(process.env.MAINNET_PK! as Hex);

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
    address: "0xf93d92c98e334d32554dececc79f03e593cf0283",
    client: sourcePublicClient,
    owners: [owner],
    version: "1.4.1",
    safe4337ModuleAddress: "0x7579EE8307284F293B1927136486880611F20002",
    erc7579LaunchpadAddress: "0x7579011aB74c46090561ea277Ba79D510c6C00ff",
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

  // // fund the smart account
  // const fundingAccount = privateKeyToAccount(fundingPrivateKey);
  // const sourceWalletClient = createWalletClient({
  //   chain: sourceChain,
  //   transport: http(),
  // });
  //
  // const fundingTxHash = await sourceWalletClient.sendTransaction({
  //   account: fundingAccount,
  //   to: getTokenAddress("USDC", sourceChain.id),
  //   data: encodeFunctionData({
  //     abi: erc20Abi,
  //     functionName: "transfer",
  //     args: [sourceSafeAccount.address, 10000000n],
  //   }),
  // });
  //
  // await sourcePublicClient.waitForTransactionReceipt({
  //   hash: fundingTxHash,
  // });
  //
  // const opHash = await sourceSmartAccountClient.sendTransaction({
  //   to: zeroAddress,
  //   data: "0x11111111",
  // });
  //
  // await sourcePublicClient.waitForTransactionReceipt({
  //   hash: opHash,
  // });

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
    address: "0xf93d92c98e334d32554dececc79f03e593cf0283",
    client: targetPublicClient,
    owners: [owner],
    version: "1.4.1",
    safe4337ModuleAddress: "0x7579EE8307284F293B1927136486880611F20002",
    erc7579LaunchpadAddress: "0x7579011aB74c46090561ea277Ba79D510c6C00ff",
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
    {
      tokenAddress: getTokenAddress("ETH", targetChain.id),
      amount: parseEther("0.001"),
    },
  ];

  // create the meta intent
  const metaIntent: MetaIntent = {
    targetChainId: targetChain.id,
    tokenTransfers: tokenTransfers,
    targetAccount: targetSafeAccount.address,
    userOp: getEmptyUserOp(),
    accountAccessList: [
      {
        chainId: sourceChain.id,
        tokenAddress: getTokenAddress("USDC", sourceChain.id),
      },
      {
        chainId: sourceChain.id,
        tokenAddress: getTokenAddress("WETH", sourceChain.id),
      },
      {
        chainId: sourceChain.id,
        tokenAddress: getTokenAddress("ETH", sourceChain.id),
      },
    ],
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
      pad(OWNABLE_VALIDATOR_ADDRESS, {
        dir: "right",
        size: 24,
      }) || 0,
    ),
  });

  const usdcSlot = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }],
      [targetSafeAccount.address, 9n],
    ),
  );

  const wethSlot = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }],
      [targetSafeAccount.address, 3n],
    ),
  );

  const userOp = await targetSmartAccountClient.prepareUserOperation({
    account: targetSafeAccount,
    calls: [
      ...orderPath[0].injectedExecutions,
      {
        to: getTokenAddress("USDC", targetChain.id),
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: ["0xd8da6bf26964af9d7eed9e03e53415d37aa96045", 2n],
        }),
      },
    ],
    nonce: nonce,
    signature: getOwnableValidatorMockSignature({ threshold: 1 }),
    stateOverride: [
      {
        address: getTokenAddress("USDC", targetChain.id),
        stateDiff: [
          {
            slot: usdcSlot,
            value: pad("0xaaaa"),
          },
        ],
      },
      {
        address: getTokenAddress("WETH", targetChain.id),
        stateDiff: [
          {
            slot: wethSlot,
            value: pad(toHex(parseEther("0.01"))),
          },
        ],
      },
      // {
      //   address: targetSafeAccount.address,
      //   balance: parseEther("0.01"),
      // },
    ],
  });

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
    [OWNABLE_VALIDATOR_ADDRESS, bundleSignature],
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
        // @ts-ignore
        userOp,
      },
    ]);

  // check bundle status
  let bundleStatus = await orchestrator.getBundleStatus(
    bundleResults[0].bundleId,
  );

  // check again every 2 seconds until the status changes
  // // @ts-ignore
  while (bundleStatus.status === BundleStatus.PENDING) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    bundleStatus = await orchestrator.getBundleStatus(
      bundleResults[0].bundleId,
    );
    console.log(bundleStatus);
  }

  return bundleStatus;
}
