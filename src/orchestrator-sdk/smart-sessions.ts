import {
  encodeSmartSessionSignature,
  encodeValidationData,
  getAccount,
  getAccountEIP712Domain,
  getOwnableValidator,
  getOwnableValidatorMockSignature,
  getPermissionId,
  getSmartSessionsValidator,
  getSudoPolicy,
  GLOBAL_CONSTANTS,
  OWNABLE_VALIDATOR_ADDRESS,
  RHINESTONE_ATTESTER_ADDRESS,
  Session,
  SMART_SESSIONS_ADDRESS,
  SmartSessionMode,
} from '@rhinestone/module-sdk';
import { createSmartAccountClient } from 'permissionless';
import { toNexusSmartAccount, toSafeSmartAccount, ToSafeSmartAccountParameters } from 'permissionless/accounts';
import {
  Address,
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
  parseAbi,
  parseEther,
  toBytes,
  toHex,
  zeroAddress,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { entryPoint07Address, getUserOperationHash } from 'viem/account-abstraction';
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
} from '@rhinestone/orchestrator-sdk';
import { erc7579Actions } from 'permissionless/actions/erc7579';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { verifyHash } from 'viem/actions';
import { getAccountNonce } from 'permissionless/actions';

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

  const sessionOwner = privateKeyToAccount(generatePrivateKey());

  const appDomainSeparator = '0x681afa780d17da29203322b473d3f210a7d621259a4e6ce9e403f5a266ff719a';
  const contentsType = 'TestMessage(string message)';

  const session: Session = {
    sessionValidator: OWNABLE_VALIDATOR_ADDRESS,
    sessionValidatorInitData: encodeValidationData({
      threshold: 1,
      owners: [sessionOwner.address],
    }),
    salt: toHex(toBytes('0', { size: 32 })),
    userOpPolicies: [getSudoPolicy()],
    erc7739Policies: {
      allowedERC7739Content: [
        {
          appDomainSeparator,
          contentName: ['TestMessage(string message)'],
        },
      ],
      erc1271Policies: [
        {
          policy: getSudoPolicy().address,
          initData: '0x',
        },
      ],
    },
    actions: [
      {
        actionTarget: GLOBAL_CONSTANTS.SMART_SESSIONS_FALLBACK_TARGET_FLAG,
        actionTargetSelector: GLOBAL_CONSTANTS.SMART_SESSIONS_FALLBACK_TARGET_SELECTOR_FLAG,
        actionPolicies: [getSudoPolicy()],
      },
    ],
    chainId: BigInt(sourceChain.id),
    permitERC4337Paymaster: true,
  };

  const smartSessions = getSmartSessionsValidator({
    sessions: [session],
    useRegistry: false,
  });

  // create the source clients
  const sourcePublicClient = createPublicClient({
    chain: sourceChain,
    transport: http(),
  });

  const factory = '0x000000c3A93d2c5E02Cb053AC675665b1c4217F9';
  const salt = keccak256('0x01');
  const initData = encodeAbiParameters(
    [{ type: 'address' }, { type: 'bytes' }],
    [
      '0x879fa30248eeb693dcCE3eA94a743622170a3658',
      encodeFunctionData({
        abi: parseAbi([
          'struct BootstrapConfig {address module;bytes initData;}',
          'function initNexus(BootstrapConfig[] calldata validators,BootstrapConfig[] calldata executors,BootstrapConfig calldata hook,BootstrapConfig[] calldata fallbacks,address registry,address[] calldata attesters,uint8 threshold) external',
        ]),
        functionName: 'initNexus',
        args: [
          [
            {
              module: ownableValidator.address,
              initData: ownableValidator.initData,
            },
            {
              module: smartSessions.address,
              initData: smartSessions.initData,
            },
          ],
          [
            {
              module: getSameChainModuleAddress(targetChain.id),
              initData: '0x',
            },
            {
              module: getTargetModuleAddress(targetChain.id),
              initData: '0x',
            },
            {
              module: getHookAddress(targetChain.id),
              initData: '0x',
            },
          ],
          {
            module: getHookAddress(targetChain.id),
            initData: encodeAbiParameters([{ name: 'value', type: 'bool' }], [true]),
          },
          [
            {
              module: getTargetModuleAddress(targetChain.id),
              initData: encodePacked(['bytes4', 'bytes1', 'bytes'], ['0x3a5be8cb', '0x00', '0x']),
            },
          ],
          '0x000000000069E2a187AEFFb852bF3cCdC95151B2',
          [
            RHINESTONE_ATTESTER_ADDRESS, // Rhinestone Attester
            '0x6D0515e8E499468DCe9583626f0cA15b887f9d03', // Mock attester for omni account
          ],
          1,
        ],
      }),
    ]
  );

  const publicClient = createPublicClient({
    chain: sourceChain,
    transport: http(),
  });
  const accountAddress = await publicClient.readContract({
    address: factory,
    abi: parseAbi(['function computeAccountAddress(bytes,bytes32) returns (address)']),
    functionName: 'computeAccountAddress',
    args: [initData, salt],
  });

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
    to: getTokenAddress('USDC', sourceChain.id),
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [accountAddress, 10000000n],
    }),
  });

  await sourcePublicClient.waitForTransactionReceipt({
    hash: fundingTxHash,
  });

  // deploy the source account
  const deploymentTxHash = await sourceWalletClient.writeContract({
    account: fundingAccount,
    address: factory,
    abi: parseAbi(['function createAccount(bytes,bytes32)']),
    functionName: 'createAccount',
    args: [initData, salt],
  });

  await sourcePublicClient.waitForTransactionReceipt({
    hash: deploymentTxHash,
  });

  // create the target clients
  const targetPublicClient = createPublicClient({
    chain: targetChain,
    transport: http(),
  });

  // deploy the target account
  const targetWalletClient = createWalletClient({
    chain: targetChain,
    transport: http(),
  });

  const targetDeploymentTxHash = await targetWalletClient.writeContract({
    account: fundingAccount,
    address: factory,
    abi: parseAbi(['function createAccount(bytes,bytes32) returns (address)']),
    functionName: 'createAccount',
    args: [initData, salt],
  });

  await targetPublicClient.waitForTransactionReceipt({
    hash: targetDeploymentTxHash,
  });

  const targetPimlicoClient = createPimlicoClient({
    transport: http(`https://api.pimlico.io/v2/${targetChain.id}/rpc?apikey=${pimlicoApiKey}`),
    entryPoint: {
      address: entryPoint07Address,
      version: '0.7',
    },
  });

  const account = await toNexusSmartAccount({
    owners: [owner],
    address: accountAddress,
    client: targetPublicClient,
    version: '1.0.0',
  });

  const targetSmartAccountClient = createSmartAccountClient({
    account: account,
    chain: targetChain,
    bundlerTransport: http(`https://api.pimlico.io/v2/${targetChain.id}/rpc?apikey=${pimlicoApiKey}`),
    paymaster: targetPimlicoClient,
    userOperation: {
      estimateFeesPerGas: async () => {
        return (await targetPimlicoClient.getUserOperationGasPrice()).fast;
      },
    },
  }).extend(erc7579Actions());

  // do a transaction to deploy the account on the target chain and install the modules
  // const deployUserOpHash = await targetSmartAccountClient.sendUserOperation({
  //   account: account,
  //   calls: [
  //     {
  //       to: getTokenAddress("USDC", targetChain.id),
  //       value: BigInt(0),
  //       data: encodeFunctionData({
  //         abi: erc20Abi,
  //         functionName: "balanceOf",
  //         args: [account.address],
  //       }),
  //     },
  //   ],
  // });
  //
  // await targetPimlicoClient.waitForUserOperationReceipt({
  //   hash: deployUserOpHash,
  // });

  // construct a token transfer
  const tokenTransfers = [
    {
      tokenAddress: getTokenAddress('WETH', targetChain.id),
      amount: parseEther('0.001'),
    },
    {
      tokenAddress: getTokenAddress('USDC', targetChain.id),
      amount: 2n,
    },
  ];

  // create the meta intent
  const metaIntent: MetaIntent = {
    targetChainId: targetChain.id,
    tokenTransfers: tokenTransfers,
    targetAccount: account.address,
    userOp: getEmptyUserOp(),
  };

  const orderPath = await orchestrator.getOrderPath(metaIntent, account.address);

  // create the userOperation
  const nonce = await getAccountNonce(targetPublicClient, {
    address: account.address,
    entryPointAddress: entryPoint07Address,
    key: BigInt(encodePacked(['bytes3', 'bytes1', 'address'], ['0x000000', '0x00', SMART_SESSIONS_ADDRESS])),
  });

  const usdcSlot = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [account.address, 9n]));

  const wethSlot = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [account.address, 3n]));

  const sessionDetails = {
    mode: SmartSessionMode.USE,
    permissionId: getPermissionId({ session }),
    signature: getOwnableValidatorMockSignature({
      threshold: 1,
    }),
  };

  const userOp = await targetSmartAccountClient.prepareUserOperation({
    account: account,
    calls: [
      ...orderPath[0].injectedExecutions,
      {
        to: getTokenAddress('USDC', targetChain.id),
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: 'transfer',
          args: ['0xd8da6bf26964af9d7eed9e03e53415d37aa96045', 2n],
        }),
      },
    ],
    nonce: nonce,
    signature: encodeSmartSessionSignature(sessionDetails),
    stateOverride: [
      {
        address: getTokenAddress('USDC', targetChain.id),
        stateDiff: [
          {
            slot: usdcSlot,
            value: pad('0xaaaa'),
          },
        ],
      },
      {
        address: getTokenAddress('WETH', targetChain.id),
        stateDiff: [
          {
            slot: wethSlot,
            value: pad(toHex(parseEther('0.01'))),
          },
        ],
      },
    ],
  });

  // sign the userOperation
  const userOpHash = getUserOperationHash({
    userOperation: userOp,
    chainId: targetChain.id,
    entryPointAddress: entryPoint07Address,
    entryPointVersion: '0.7',
  });

  sessionDetails.signature = await sessionOwner.signMessage({
    message: { raw: userOpHash },
  });

  userOp.signature = encodeSmartSessionSignature(sessionDetails);

  // add userOperation into order bundle
  orderPath[0].orderBundle.segments[0].witness.userOpHash = userOpHash;

  // sign the meta intent
  const orderBundleHash = getOrderBundleHash(orderPath[0].orderBundle);

  const isContentEnabled = await targetPublicClient.readContract({
    address: GLOBAL_CONSTANTS.SMART_SESSIONS_ADDRESS,
    abi: [
      {
        inputs: [
          { name: 'account', type: 'address' },
          { name: 'permissionId', type: 'bytes32' },
          { name: 'appDomainSeparator', type: 'bytes32' },
          { name: 'content', type: 'string' },
        ],
        name: 'isERC7739ContentEnabled',
        outputs: [{ type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
      },
    ],
    functionName: 'isERC7739ContentEnabled',
    args: [account.address, getPermissionId({ session }), appDomainSeparator, contentsType],
  });

  console.log('Is content enabled:', isContentEnabled);

  // Create hash following ERC-7739 TypedDataSign workflow
  const typedDataSignTypehash = keccak256(
    encodePacked(
      ['string'],
      [
        'TypedDataSign(TestMessage contents,string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)TestMessage(string message)',
      ]
    )
  );

  // Original struct hash
  const structHash = keccak256(encodePacked(['string'], ['Hello World']));

  let {
    name,
    version,
    chainId,
    verifyingContract,
    salt: salt_,
  } = await getAccountEIP712Domain({
    client: targetPublicClient,
    account: getAccount({
      address: account.address,
      type: 'safe',
    }),
  });

  // Final hash according to ERC-7739
  const hash = keccak256(
    encodePacked(
      ['bytes2', 'bytes32', 'bytes32'],
      [
        '0x1901',
        appDomainSeparator,
        keccak256(
          encodeAbiParameters(
            [
              { name: 'a', type: 'bytes32' },
              { name: 'b', type: 'bytes32' },
              { name: 'c', type: 'bytes32' },
              { name: 'd', type: 'bytes32' },
              { name: 'e', type: 'uint256' },
              { name: 'f', type: 'address' },
              { name: 'g', type: 'bytes32' },
            ],
            [
              typedDataSignTypehash,
              structHash,
              keccak256(encodePacked(['string'], [name])), // name
              keccak256(encodePacked(['string'], [version])), // version
              BigInt(Number(chainId)), // chainId
              verifyingContract, // verifyingContract
              salt_, // salt
            ]
          )
        ),
      ]
    )
  );

  // Sign the hash
  const signature = await sessionOwner.signMessage({
    message: { raw: hash },
  });

  // Format signature according to ERC-7739 spec
  const erc7739Signature = encodePacked(
    ['bytes', 'bytes32', 'bytes32', 'string', 'uint16'],
    [signature, appDomainSeparator, structHash, contentsType, contentsType.length]
  );

  // Pack with permissionId for smart session
  const wrappedSignature = encodePacked(['bytes32', 'bytes'], [getPermissionId({ session }), erc7739Signature]);

  const packedSig = encodePacked(['address', 'bytes'], [smartSessions.address, wrappedSignature]);

  const isValidSig = await verifyHash(targetPublicClient, {
    address: account.address,
    hash: orderBundleHash,
    signature: packedSig,
  });

  if (!isValidSig) {
    throw new Error('Invalid signature');
  }

  // const bundleSignature = await owner.signMessage({
  //   message: { raw: orderBundleHash },
  // });
  // const packedSig = encodePacked(['address', 'bytes'], [ownableValidator.address, bundleSignature]);

  const signedOrderBundle: SignedMultiChainCompact = {
    ...orderPath[0].orderBundle,
    originSignatures: Array(orderPath[0].orderBundle.segments.length).fill(packedSig),
    targetSignature: packedSig,
  };

  // send the signed bundle
  const bundleResults: PostOrderBundleResult = await orchestrator.postSignedOrderBundle([
    {
      signedOrderBundle,
      userOp,
    },
  ]);

  // check bundle status
  let bundleStatus = await orchestrator.getBundleStatus(bundleResults[0].bundleId);

  // check again every 2 seconds until the status changes
  // // @ts-ignore
  while (bundleStatus.status === BundleStatus.PENDING) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    bundleStatus = await orchestrator.getBundleStatus(bundleResults[0].bundleId);
    console.log(bundleStatus);
  }

  return bundleStatus;
}
