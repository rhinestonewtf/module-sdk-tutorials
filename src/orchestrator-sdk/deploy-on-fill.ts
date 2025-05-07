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
  Address,
  Chain,
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  erc20Abi,
  getAddress,
  getContractAddress,
  Hex,
  http,
  keccak256,
  parseAbi,
  slice,
  zeroAddress,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { entryPoint07Address } from "viem/account-abstraction";
import {
  BundleStatus,
  getHookAddress,
  getOrchestrator,
  getOrderBundleHash,
  getSameChainModuleAddress,
  getTargetModuleAddress,
  getTokenAddress,
  MetaIntent,
  PostOrderBundleResult,
  SignedMultiChainCompact,
} from "@rhinestone/sdk/orchestrator";
import { erc7579Actions } from "permissionless/actions/erc7579";
import { createPimlicoClient } from "permissionless/clients/pimlico";

export default async function main({
  sourceChain,
  targetChain,
  orchestratorApiKey,
  fundingPrivateKey,
}: {
  sourceChain: Chain;
  targetChain: Chain;
  orchestratorApiKey: string;
  fundingPrivateKey: Hex;
}) {
  // create a new smart account
  const owner = privateKeyToAccount(process.env.MAINNET_PK! as Hex);

  console.log(owner.address);

  const ownableValidator = getOwnableValidator({
    owners: [owner.address],
    threshold: 1,
  });

  // create the source clients
  const sourcePublicClient = createPublicClient({
    chain: sourceChain,
    transport: http(),
  });

  const initializer = encodeFunctionData({
    abi: parseAbi([
      "function setup(address[] calldata _owners,uint256 _threshold,address to,bytes calldata data,address fallbackHandler,address paymentToken,uint256 payment, address paymentReceiver) external",
    ]),
    functionName: "setup",
    args: [
      [owner.address],
      BigInt(1),
      "0x7579011aB74c46090561ea277Ba79D510c6C00ff",
      encodeFunctionData({
        abi: parseAbi([
          "struct ModuleInit {address module;bytes initData;}",
          "function addSafe7579(address safe7579,ModuleInit[] calldata validators,ModuleInit[] calldata executors,ModuleInit[] calldata fallbacks, ModuleInit[] calldata hooks,address[] calldata attesters,uint8 threshold) external",
        ]),
        functionName: "addSafe7579",
        args: [
          "0x7579EE8307284F293B1927136486880611F20002",
          [
            {
              module: ownableValidator.address,
              initData: ownableValidator.initData,
            },
          ],
          [
            {
              module: getSameChainModuleAddress(),
              initData: "0x",
            },
            {
              module: getTargetModuleAddress(),
              initData: "0x",
            },
            {
              module: getHookAddress(),
              initData: "0x",
            },
          ],
          [
            {
              module: getTargetModuleAddress(),
              initData: encodeAbiParameters(
                [
                  { name: "selector", type: "bytes4" },
                  { name: "flags", type: "bytes1" },
                  { name: "data", type: "bytes" },
                ],
                ["0x3a5be8cb", "0x00", "0x"],
              ),
            },
          ],
          [
            {
              module: getHookAddress(),
              initData: encodeAbiParameters(
                [
                  { name: "hookType", type: "uint256" },
                  { name: "hookId", type: "bytes4" },
                  { name: "data", type: "bytes" },
                ],
                [
                  0n,
                  "0x00000000",
                  encodeAbiParameters(
                    [{ name: "value", type: "bool" }],
                    [true],
                  ),
                ],
              ),
            },
          ],
          [
            RHINESTONE_ATTESTER_ADDRESS, // Rhinestone Attester
            "0x6D0515e8E499468DCe9583626f0cA15b887f9d03", // Mock attester for omni account
          ],
          1,
        ],
      }),
      "0x7579EE8307284F293B1927136486880611F20002",
      zeroAddress,
      BigInt(0),
      zeroAddress,
    ],
  });

  const proxyFactory: Address = "0x4e1dcf7ad4e460cfd30791ccc4f9c8a4f820ec67";
  const saltNonce = 234n;
  const factoryData = encodeFunctionData({
    abi: parseAbi([
      "function createProxyWithNonce(address singleton,bytes calldata initializer,uint256 saltNonce) external payable returns (address)",
    ]),
    functionName: "createProxyWithNonce",
    args: [
      "0x29fcb43b46531bca003ddc8fcb67ffe91900c762",
      initializer,
      saltNonce,
    ],
  });

  console.log(proxyFactory);
  console.log(factoryData);

  // calculate safe address
  // const salt = keccak256(
  //   encodePacked(
  //     ["bytes32", "uint256"],
  //     [
  //       "0x1856e0ee08399d74e0ea0b03adca210aeade6f748969ac023cdcb4dd62dcaf5f",
  //       saltNonce,
  //     ],
  //   ),
  // );
  // const safeAccountAddress = getContractAddress({
  //   bytecode:
  //     "0x608060405234801561001057600080fd5b506040516101e63803806101e68339818101604052602081101561003357600080fd5b8101908080519060200190929190505050600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1614156100ca576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260228152602001806101c46022913960400191505060405180910390fd5b806000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505060ab806101196000396000f3fe608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e0000000000000000000000000000000000000000000000000000000060003514156050578060005260206000f35b3660008037600080366000845af43d6000803e60008114156070573d6000fd5b3d6000f3fea264697066735822122003d1488ee65e08fa41e58e888a9865554c535f2c77126a82cb4c0f917f31441364736f6c63430007060033496e76616c69642073696e676c65746f6e20616464726573732070726f766964656429fcb43b46531bca003ddc8fcb67ffe91900c762",
  //   from: proxyFactory,
  //   opcode: "CREATE2",
  //   salt,
  // });

  const publicClient = createPublicClient({
    chain: sourceChain,
    transport: http(),
  });
  const result = await publicClient.call({
    to: proxyFactory,
    data: factoryData,
  });
  const safeAccountAddress = getAddress(slice(result.data!, 12, 32));

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
      args: [safeAccountAddress, 200000n],
    }),
  });

  await sourcePublicClient.waitForTransactionReceipt({
    hash: fundingTxHash,
  });

  // deploy the source account
  const deploymentTxHash = await sourceWalletClient.sendTransaction({
    account: fundingAccount,
    to: proxyFactory,
    data: factoryData,
  });

  await sourcePublicClient.waitForTransactionReceipt({
    hash: deploymentTxHash,
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
    targetAccount: safeAccountAddress,
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
    safeAccountAddress,
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

  const initCode = encodePacked(
    ["address", "bytes"],
    [proxyFactory, factoryData],
  );

  // send the signed bundle
  const bundleResults: PostOrderBundleResult =
    await orchestrator.postSignedOrderBundle([
      {
        signedOrderBundle,
        initCode,
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
