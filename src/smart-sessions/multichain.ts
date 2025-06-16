import {
  getSmartSessionsValidator,
  OWNABLE_VALIDATOR_ADDRESS,
  getSudoPolicy,
  Session,
  getAccount,
  encodeSmartSessionSignature,
  getOwnableValidatorMockSignature,
  RHINESTONE_ATTESTER_ADDRESS,
  MOCK_ATTESTER_ADDRESS,
  encodeValidatorNonce,
  getOwnableValidator,
  encodeValidationData,
  getEnableSessionDetails,
  SmartSessionMode,
  getPermissionId,
  GLOBAL_CONSTANTS,
} from "@rhinestone/module-sdk";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  toHex,
  Address,
  Hex,
  createPublicClient,
  http,
  Chain,
  toBytes,
  encodeFunctionData,
  erc20Abi,
  parseEther,
  createTestClient,
  keccak256,
  encodeAbiParameters,
  zeroAddress,
} from "viem";
import { createSmartAccountClient } from "permissionless";
import { erc7579Actions } from "permissionless/actions/erc7579";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import {
  entryPoint07Address,
  getUserOperationHash,
  createPaymasterClient,
} from "viem/account-abstraction";
import { toSafeSmartAccount } from "permissionless/accounts";
import { getAccountNonce } from "permissionless/actions";
import { foundry } from "viem/chains";

export default async function main({ chains }: { chains: Chain[] }) {
  const publicClient1 = createPublicClient({
    transport: http("https://gateway.tenderly.co/public/sepolia"),
    chain: chains[0],
  });

  const publicClient2 = createPublicClient({
    transport: http(chains[1].rpcUrls.default.http[0]),
    chain: chains[1],
  });

  const pimlicoClient1 = createPimlicoClient({
    transport: http(
      `https://api.pimlico.io/v2/${chains[0].id}/rpc?apikey=${process.env.PIMLICO_API_KEY}`,
    ),
    entryPoint: {
      address: entryPoint07Address,
      version: "0.7",
    },
  });

  const paymasterClient1 = createPaymasterClient({
    transport: http(
      `https://api.pimlico.io/v2/${chains[0].id}/rpc?apikey=${process.env.PIMLICO_API_KEY}`,
    ),
  });

  const pimlicoClient2 = createPimlicoClient({
    transport: http(
      `https://api.pimlico.io/v2/${chains[1].id}/rpc?apikey=${process.env.PIMLICO_API_KEY}`,
    ),
    entryPoint: {
      address: entryPoint07Address,
      version: "0.7",
    },
  });

  const paymasterClient2 = createPaymasterClient({
    transport: http(
      `https://api.pimlico.io/v2/${chains[1].id}/rpc?apikey=${process.env.PIMLICO_API_KEY}`,
    ),
  });

  const owner = privateKeyToAccount(generatePrivateKey());

  const ownableValidator = getOwnableValidator({
    owners: [owner.address],
    threshold: 1,
  });

  const smartSessions = getSmartSessionsValidator({
    sessions: [],
  });

  const safeAccount = await toSafeSmartAccount({
    client: publicClient1,
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
      {
        address: smartSessions.address,
        context: smartSessions.initData,
      },
    ],
  });

  const safeAccount2 = await toSafeSmartAccount({
    client: publicClient2,
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
      {
        address: smartSessions.address,
        context: smartSessions.initData,
      },
    ],
  });

  // const testClient = createTestClient({
  //   chain: foundry,
  //   mode: "anvil",
  //   transport: http(),
  // });
  //
  // await testClient.setBalance({
  //   address: safeAccount.address,
  //   value: parseEther("1"),
  // });
  //
  // const usdcSlot = keccak256(
  //   encodeAbiParameters(
  //     [{ type: "address" }, { type: "uint256" }],
  //     [safeAccount.address, 9n],
  //   ),
  // );
  //
  // await testClient.setStorageAt({
  //   address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  //   index: usdcSlot,
  //   value: "0x0000000000009000000000000000009000000000000000000000000000000069",
  // });
  //
  // await testClient.setCode({
  //   address: "0x000000000060f6e853447881951574CDd0663530",
  //   bytecode: "0x",
  // });

  const smartAccountClient = createSmartAccountClient({
    account: safeAccount,
    chain: chains[0],
    bundlerTransport: http(
      `https://api.pimlico.io/v2/${chains[0].id}/rpc?apikey=${process.env.PIMLICO_API_KEY}`,
    ),
    paymaster: paymasterClient1,
    userOperation: {
      estimateFeesPerGas: async () => {
        return (await pimlicoClient1.getUserOperationGasPrice()).fast;
      },
    },
  }).extend(erc7579Actions());

  const smartAccountClient2 = createSmartAccountClient({
    account: safeAccount2,
    chain: chains[1],
    bundlerTransport: http(
      `https://api.pimlico.io/v2/${chains[1].id}/rpc?apikey=${process.env.PIMLICO_API_KEY}`,
    ),
    paymaster: paymasterClient2,
    userOperation: {
      estimateFeesPerGas: async () => {
        return (await pimlicoClient2.getUserOperationGasPrice()).fast;
      },
    },
  }).extend(erc7579Actions());

  const sessionOwner = privateKeyToAccount(generatePrivateKey());

  const session1: Session = {
    sessionValidator: OWNABLE_VALIDATOR_ADDRESS,
    sessionValidatorInitData: encodeValidationData({
      threshold: 1,
      owners: [sessionOwner.address],
    }),
    salt: toHex(toBytes("0", { size: 32 })),
    userOpPolicies: [getSudoPolicy()],
    erc7739Policies: {
      allowedERC7739Content: [],
      erc1271Policies: [],
    },
    actions: [
      {
        actionTarget: GLOBAL_CONSTANTS.SMART_SESSIONS_FALLBACK_TARGET_FLAG,
        actionTargetSelector:
          GLOBAL_CONSTANTS.SMART_SESSIONS_FALLBACK_TARGET_SELECTOR_FLAG,
        actionPolicies: [getSudoPolicy()],
      },
    ],
    chainId: BigInt(chains[0].id),
    permitERC4337Paymaster: true,
  };

  const session2: Session = {
    sessionValidator: OWNABLE_VALIDATOR_ADDRESS,
    sessionValidatorInitData: encodeValidationData({
      threshold: 1,
      owners: [sessionOwner.address],
    }),
    salt: toHex(toBytes("0", { size: 32 })),
    userOpPolicies: [getSudoPolicy()],
    erc7739Policies: {
      allowedERC7739Content: [],
      erc1271Policies: [],
    },
    actions: [
      {
        actionTarget: GLOBAL_CONSTANTS.SMART_SESSIONS_FALLBACK_TARGET_FLAG,
        actionTargetSelector:
          GLOBAL_CONSTANTS.SMART_SESSIONS_FALLBACK_TARGET_SELECTOR_FLAG,
        actionPolicies: [getSudoPolicy()],
      },
    ],
    chainId: BigInt(chains[1].id),
    permitERC4337Paymaster: true,
  };

  const sessionDetailsArgs = {
    sessions: [session1, session2],
    account: getAccount({
      address: safeAccount.address,
      type: "safe",
    }),
    clients: [publicClient1, publicClient2],
    permitGenericPolicy: true,
  };

  const sessionDetails = await getEnableSessionDetails(sessionDetailsArgs);

  sessionDetails.signature = getOwnableValidatorMockSignature({
    threshold: 1,
  });

  sessionDetails.enableSessionData.enableSession.permissionEnableSig =
    await owner.signMessage({
      message: {
        raw: sessionDetails.permissionEnableHash,
      },
    });

  const nonce = await getAccountNonce(publicClient1, {
    address: safeAccount.address,
    entryPointAddress: entryPoint07Address,
    key: encodeValidatorNonce({
      account: getAccount({
        address: safeAccount.address,
        type: "safe",
      }),
      validator: smartSessions,
    }),
  });

  const userOp1 = await smartAccountClient.sendUserOperation({
    calls: [
      {
        to: zeroAddress,
        data: "0x",
      },
    ],
  });

  await pimlicoClient1.waitForUserOperationReceipt({ hash: userOp1 });

  const userOperation = await smartAccountClient.prepareUserOperation({
    account: safeAccount,
    calls: [
      {
        to: "0xa564cB165815937967a7d018B7F34B907B52fcFd",
        data: "0x00000000",
      },
    ],
    nonce,
    signature: encodeSmartSessionSignature(sessionDetails),
  });

  const userOpHashToSign = getUserOperationHash({
    chainId: chains[0].id,
    entryPointAddress: entryPoint07Address,
    entryPointVersion: "0.7",
    userOperation,
  });

  sessionDetails.signature = await sessionOwner.signMessage({
    message: { raw: userOpHashToSign },
  });

  userOperation.signature = encodeSmartSessionSignature(sessionDetails);

  const userOpHash = await smartAccountClient.sendUserOperation(userOperation);

  const receipt = await pimlicoClient1.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  console.log("Receipt 1:", receipt);

  const sessionDetails2 = await getEnableSessionDetails({
    ...sessionDetailsArgs,
    sessionIndex: 1,
  });

  sessionDetails2.signature = getOwnableValidatorMockSignature({
    threshold: 1,
  });

  console.log(sessionDetails.permissionEnableHash);
  console.log(sessionDetails2.permissionEnableHash);

  sessionDetails2.enableSessionData.enableSession.permissionEnableSig =
    await owner.signMessage({
      message: {
        raw: sessionDetails2.permissionEnableHash,
      },
    });

  const nonce2 = await getAccountNonce(publicClient1, {
    address: safeAccount2.address,
    entryPointAddress: entryPoint07Address,
    key: encodeValidatorNonce({
      account: getAccount({
        address: safeAccount.address,
        type: "safe",
      }),
      validator: smartSessions,
    }),
  });

  const userOperation2 = await smartAccountClient2.prepareUserOperation({
    account: safeAccount2,
    calls: [
      {
        to: "0xa564cB165815937967a7d018B7F34B907B52fcFd",
        data: "0x00000000",
      },
    ],
    nonce: nonce2,
    signature: encodeSmartSessionSignature(sessionDetails2),
  });

  const userOpHashToSign2 = getUserOperationHash({
    chainId: chains[1].id,
    entryPointAddress: entryPoint07Address,
    entryPointVersion: "0.7",
    userOperation: userOperation2,
  });

  sessionDetails2.signature = await sessionOwner.signMessage({
    message: { raw: userOpHashToSign2 },
  });

  userOperation.signature = encodeSmartSessionSignature(sessionDetails2);

  const userOpHash2 =
    await smartAccountClient.sendUserOperation(userOperation2);

  const receipt2 = await pimlicoClient1.waitForUserOperationReceipt({
    hash: userOpHash2,
  });

  console.log("Receipt 2:", receipt2);

  return receipt;
}
