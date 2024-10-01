import {
  getSmartSessionsValidator,
  OWNABLE_VALIDATOR_ADDRESS,
  getSudoPolicy,
  Session,
  getSessionDigest,
  SMART_SESSIONS_ADDRESS,
  hashChainSessions,
  getClient,
  getAccount,
  getPermissionId,
  getSessionNonce,
  encodeSmartSessionSignature,
  SmartSessionMode,
  ChainSession,
} from "@rhinestone/module-sdk";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  encodeAbiParameters,
  toHex,
  toBytes,
  Address,
  Hex,
  createPublicClient,
  http,
} from "viem";
import { createSmartAccountClient } from "permissionless";
import { erc7579Actions } from "permissionless/actions/erc7579";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import {
  entryPoint07Address,
  getUserOperationHash,
} from "viem/account-abstraction";
import { toSafeSmartAccount } from "permissionless/accounts";

export default async function main({
  bundlerUrl,
  rpcUrl,
  chain,
}: {
  bundlerUrl: string;
  rpcUrl: string;
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

  const owner = privateKeyToAccount(generatePrivateKey());

  const safeAccount = await toSafeSmartAccount({
    client: publicClient,
    owners: [owner],
    version: "1.4.1",
    entryPoint: {
      address: entryPoint07Address,
      version: "0.7",
    },
    safe4337ModuleAddress: "0x3Fdb5BC686e861480ef99A6E3FaAe03c0b9F32e2", // These are not meant to be used in production as of now.
    erc7579LaunchpadAddress: "0xEBe001b3D534B9B6E2500FB78E67a1A137f561CE", // These are not meant to be used in production as of now.
  });

  const smartAccountClient = createSmartAccountClient({
    account: safeAccount,
    chain: chain,
    bundlerTransport: http(bundlerUrl),
    paymaster: pimlicoClient,
    userOperation: {
      estimateFeesPerGas: async () => {
        return (await pimlicoClient.getUserOperationGasPrice()).fast;
      },
    },
  }).extend(erc7579Actions());

  const smartSessions = getSmartSessionsValidator({
    sessions: [
      {
        sessionValidator: OWNABLE_VALIDATOR_ADDRESS,
        sessionValidatorInitData: encodeAbiParameters(
          [
            {
              type: "uint256",
            },
            {
              type: "address[]",
            },
          ],
          [BigInt(1), [privateKeyToAccount(generatePrivateKey()).address]]
        ),
        salt: toHex(toBytes("2", { size: 32 })),
        userOpPolicies: [],
        erc7739Policies: {
          allowedERC7739Content: [],
          erc1271Policies: [],
        },
        actions: [
          {
            actionTarget:
              "0xa564cB165815937967a7d018B7F34B907B52fcFd" as Address, // an address as the target of the session execution
            actionTargetSelector: "0x00000000" as Hex, // function selector to be used in the execution, in this case no function selector is used
            actionPolicies: [
              {
                policy: getSudoPolicy().address,
                initData: getSudoPolicy().initData,
              },
            ],
          },
        ],
      },
    ],
  });

  const opHash = await smartAccountClient.installModule({
    type: smartSessions.type,
    address: smartSessions.module,
    context: smartSessions.initData!,
  });

  const sessionOwner = privateKeyToAccount(generatePrivateKey());

  const session: Session = {
    sessionValidator: OWNABLE_VALIDATOR_ADDRESS,
    sessionValidatorInitData: encodeAbiParameters(
      [
        {
          type: "uint256",
        },
        {
          type: "address[]",
        },
      ],
      [BigInt(1), [sessionOwner.address]]
    ),
    salt: toHex(toBytes("41414141", { size: 32 })),
    userOpPolicies: [],
    erc7739Policies: {
      allowedERC7739Content: [],
      erc1271Policies: [],
    },
    actions: [
      {
        actionTarget: "0xa564cB165815937967a7d018B7F34B907B52fcFd" as Address, // an address as the target of the session execution
        actionTargetSelector: "0x00000000" as Hex, // function selector to be used in the execution, in this case no function selector is used
        actionPolicies: [
          {
            policy: getSudoPolicy().address,
            initData: getSudoPolicy().initData,
          },
        ],
      },
    ],
  };

  const account = getAccount({
    address: safeAccount.address,
    type: "safe",
  });

  const newClient = getClient({
    rpcUrl,
  });

  const permissionId = (await getPermissionId({
    client: newClient,
    session,
  })) as Hex;

  const sessionNonce = await getSessionNonce({
    client: newClient,
    account,
    permissionId,
  });

  const sessionDigest = await getSessionDigest({
    client: newClient,
    account,
    session,
    mode: SmartSessionMode.ENABLE,
    permissionId,
  });

  const chainDigests = [
    {
      chainId: BigInt(chain.id), // or your current chain
      sessionDigest,
    },
  ];

  const chainSessions: ChainSession[] = [
    {
      chainId: BigInt(chain.id),
      session: {
        ...session,
        account: account.address,
        smartSession: SMART_SESSIONS_ADDRESS,
        mode: 1,
        nonce: sessionNonce,
      },
    },
  ];

  const permissionEnableHash = hashChainSessions(chainSessions);

  const permissionEnableSig = await owner.signMessage({
    message: { raw: permissionEnableHash },
  });

  const userOperation = await smartAccountClient.prepareUserOperation({
    account: safeAccount,
    calls: [
      {
        to: session.actions[0].actionTarget,
        value: BigInt(0),
        data: session.actions[0].actionTargetSelector,
      },
    ],
  });

  const userOpHashToSign = getUserOperationHash({
    chainId: chain.id,
    entryPointAddress: entryPoint07Address,
    entryPointVersion: "0.7",
    userOperation,
  });

  const signature = await sessionOwner.signMessage({
    message: { raw: userOpHashToSign },
  });

  userOperation.signature = encodeSmartSessionSignature({
    mode: SmartSessionMode.ENABLE,
    permissionId,
    signature,
    enableSessionData: {
      enableSession: {
        chainDigestIndex: 0,
        hashesAndChainIds: chainDigests,
        sessionToEnable: session,
        permissionEnableSig,
      },
      validator: OWNABLE_VALIDATOR_ADDRESS,
      accountType: "safe",
    },
  });

  const userOpHash = await smartAccountClient.sendUserOperation({
    account: safeAccount,
    calls: [
      {
        to: session.actions[0].actionTarget,
        value: BigInt(0),
        data: session.actions[0].actionTargetSelector,
      },
    ],
    signature: encodeSmartSessionSignature({
      mode: SmartSessionMode.ENABLE,
      permissionId,
      signature,
      enableSessionData: {
        enableSession: {
          chainDigestIndex: 0,
          hashesAndChainIds: chainDigests,
          sessionToEnable: session,
          permissionEnableSig,
        },
        validator: OWNABLE_VALIDATOR_ADDRESS,
        accountType: "safe",
      },
    }),
  });

  const receipt = await pimlicoClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  return receipt;
}
