import {
  getSmartSessionsValidator,
  OWNABLE_VALIDATOR_ADDRESS,
  getSudoPolicy,
  Session,
  getClient,
  getAccount,
  encodeSmartSessionSignature,
  getOwnableValidatorMockSignature,
  RHINESTONE_ATTESTER_ADDRESS,
  MOCK_ATTESTER_ADDRESS,
  getTrustAttestersAction,
  encodeValidatorNonce,
  getOwnableValidator,
  encodeValidationData,
  getEnableSessionDetails,
  encodeModuleInstallationData,
  DEADMAN_SWITCH_ADDRESS,
  encode1271Hash,
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
  zeroAddress,
  pad,
  encodePacked,
  encodeFunctionData,
  parseAbi,
  encodeAbiParameters,
} from "viem";
import { createSmartAccountClient } from "permissionless";
import { erc7579Actions } from "permissionless/actions/erc7579";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import {
  entryPoint07Address,
  getUserOperationHash,
  createPaymasterClient,
} from "viem/account-abstraction";
import { toEcdsaKernelSmartAccount } from "permissionless/accounts";
import { getAccountNonce } from "permissionless/actions";
import { LibZip } from "solady";

const encodeEnableSessionSignatureAbi = [
  {
    components: [
      {
        type: "uint8",
        name: "chainDigestIndex",
      },
      {
        type: "tuple[]",
        components: [
          {
            internalType: "uint64",
            name: "chainId",
            type: "uint64",
          },
          {
            internalType: "bytes32",
            name: "sessionDigest",
            type: "bytes32",
          },
        ],
        name: "hashesAndChainIds",
      },
      {
        components: [
          {
            internalType: "contract ISessionValidator",
            name: "sessionValidator",
            type: "address",
          },
          {
            internalType: "bytes",
            name: "sessionValidatorInitData",
            type: "bytes",
          },
          { internalType: "bytes32", name: "salt", type: "bytes32" },
          {
            components: [
              { internalType: "address", name: "policy", type: "address" },
              { internalType: "bytes", name: "initData", type: "bytes" },
            ],
            internalType: "struct PolicyData[]",
            name: "userOpPolicies",
            type: "tuple[]",
          },
          {
            components: [
              {
                internalType: "string[]",
                name: "allowedERC7739Content",
                type: "string[]",
              },
              {
                components: [
                  {
                    internalType: "address",
                    name: "policy",
                    type: "address",
                  },
                  {
                    internalType: "bytes",
                    name: "initData",
                    type: "bytes",
                  },
                ],
                internalType: "struct PolicyData[]",
                name: "erc1271Policies",
                type: "tuple[]",
              },
            ],
            internalType: "struct ERC7739Data",
            name: "erc7739Policies",
            type: "tuple",
          },
          {
            components: [
              {
                internalType: "bytes4",
                name: "actionTargetSelector",
                type: "bytes4",
              },
              {
                internalType: "address",
                name: "actionTarget",
                type: "address",
              },
              {
                components: [
                  {
                    internalType: "address",
                    name: "policy",
                    type: "address",
                  },
                  {
                    internalType: "bytes",
                    name: "initData",
                    type: "bytes",
                  },
                ],
                internalType: "struct PolicyData[]",
                name: "actionPolicies",
                type: "tuple[]",
              },
            ],
            internalType: "struct ActionData[]",
            name: "actions",
            type: "tuple[]",
          },
        ],
        internalType: "struct Session",
        name: "sessionToEnable",
        type: "tuple",
      },
      {
        type: "bytes",
        name: "permissionEnableSig",
      },
    ],
    internalType: "struct EnableSession",
    name: "enableSession",
    type: "tuple",
  },
  { type: "bytes" },
];

export default async function main({
  bundlerUrl,
  rpcUrl,
  paymasterUrl,
  chain,
}: {
  bundlerUrl: string;
  rpcUrl: string;
  paymasterUrl: string;
  chain: Chain;
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

  const kernelAccount = await toEcdsaKernelSmartAccount({
    client: publicClient,
    entryPoint: {
      address: entryPoint07Address,
      version: "0.7",
    },
    owners: [owner],
    version: "0.3.1",
  });

  const smartAccountClient = createSmartAccountClient({
    account: kernelAccount,
    chain: chain,
    bundlerTransport: http(bundlerUrl),
    paymaster: paymasterClient,
    userOperation: {
      estimateFeesPerGas: async () => {
        return (await pimlicoClient.getUserOperationGasPrice()).fast;
      },
    },
  }).extend(erc7579Actions());

  const trustAttestersAction = getTrustAttestersAction({
    threshold: 1,
    attesters: [
      RHINESTONE_ATTESTER_ADDRESS, // Rhinestone Attester
      MOCK_ATTESTER_ADDRESS, // Mock Attester - do not use in production
    ],
  });

  const userOpHash1 = await smartAccountClient.sendUserOperation({
    account: kernelAccount,
    calls: [
      {
        to: trustAttestersAction.target,
        value: BigInt(0),
        data: trustAttestersAction.callData,
      },
    ],
  });

  await pimlicoClient.waitForUserOperationReceipt({
    hash: userOpHash1,
  });

  const account = getAccount({
    address: kernelAccount.address,
    type: "kernel",
  });

  const ownableValidator = getOwnableValidator({
    owners: [owner.address],
    threshold: 1,
    hook: zeroAddress,
  });

  ownableValidator.initData = encodeModuleInstallationData({
    module: ownableValidator,
    account,
  });

  const opHash = await smartAccountClient.installModule(ownableValidator);

  await pimlicoClient.waitForUserOperationReceipt({
    hash: opHash,
  });

  const smartSessions = getSmartSessionsValidator({
    sessions: [],
    hook: zeroAddress,
  });

  smartSessions.initData = encodeModuleInstallationData({
    module: smartSessions,
    account,
  });

  const opHash2 = await smartAccountClient.installModule(smartSessions);

  await pimlicoClient.waitForUserOperationReceipt({
    hash: opHash2,
  });

  const opHash4 = await smartAccountClient.sendUserOperation({
    account: kernelAccount,
    calls: [
      {
        to: kernelAccount.address,
        value: BigInt(0),
        data: encodeFunctionData({
          abi: parseAbi([
            "function changeRootValidator(bytes21,address,bytes,bytes)",
          ]),
          functionName: "changeRootValidator",
          args: [
            "0x012483DA3A338895199E5e538530213157e931Bf06",
            zeroAddress,
            "0x",
            "0x",
          ],
        }),
      },
    ],
  });

  await pimlicoClient.waitForUserOperationReceipt({
    hash: opHash4,
  });

  const sessionOwner = privateKeyToAccount(generatePrivateKey());

  const session: Session = {
    sessionValidator: OWNABLE_VALIDATOR_ADDRESS,
    sessionValidatorInitData: encodeValidationData({
      threshold: 1,
      owners: [sessionOwner.address],
    }),
    salt: toHex(toBytes("0", { size: 32 })),
    userOpPolicies: [],
    erc7739Policies: {
      allowedERC7739Content: [],
      erc1271Policies: [],
    },
    actions: [
      {
        actionTarget: "0xa564cB165815937967a7d018B7F34B907B52fcFd" as Address, // an address as the target of the session execution
        actionTargetSelector: "0x00000000" as Hex, // function selector to be used in the execution, in this case no function selector is used
        actionPolicies: [getSudoPolicy()],
      },
    ],
    chainId: BigInt(chain.id),
  };

  const sessionDetails = await getEnableSessionDetails({
    sessions: [session],
    account,
    clients: [publicClient],
  });

  const hashToSign = encode1271Hash({
    account,
    chainId: chain.id,
    validator: ownableValidator.address,
    hash: sessionDetails.permissionEnableHash,
  });

  sessionDetails.enableSessionData.enableSession.permissionEnableSig =
    await owner.signMessage({
      message: { raw: hashToSign },
    });

  const nonce = await getAccountNonce(publicClient, {
    address: kernelAccount.address,
    entryPointAddress: entryPoint07Address,
    key: BigInt(
      pad(
        encodePacked(
          ["bytes1", "bytes1", "address"],
          ["0x00", "0x01", smartSessions.address],
        ),
        {
          dir: "right",
          size: 24,
        },
      ),
    ),
    //   key: encodeValidatorNonce({
    //     account,
    //     validator: smartSessions,
    //   }),
  });

  sessionDetails.signature = getOwnableValidatorMockSignature({
    threshold: 1,
  });

  const userOperation = await smartAccountClient.prepareUserOperation({
    account: kernelAccount,
    calls: [
      {
        to: session.actions[0].actionTarget,
        value: BigInt(0),
        data: session.actions[0].actionTargetSelector,
      },
    ],
    nonce,
    signature: encodeSmartSessionSignature(sessionDetails),
  });

  const userOpHashToSign = getUserOperationHash({
    chainId: chain.id,
    entryPointAddress: entryPoint07Address,
    entryPointVersion: "0.7",
    userOperation,
  });

  sessionDetails.signature = await sessionOwner.signMessage({
    message: { raw: userOpHashToSign },
  });

  // userOperation.signature = encodeSmartSessionSignature(sessionDetails);
  //
  userOperation.signature = encodePacked(
    ["bytes1", "bytes"],
    [
      sessionDetails.mode,
      LibZip.flzCompress(
        encodeAbiParameters(encodeEnableSessionSignatureAbi, [
          {
            chainDigestIndex:
              sessionDetails.enableSessionData.enableSession.chainDigestIndex,
            hashesAndChainIds:
              sessionDetails.enableSessionData.enableSession.hashesAndChainIds,
            sessionToEnable:
              sessionDetails.enableSessionData.enableSession.sessionToEnable,
            permissionEnableSig: encodePacked(
              ["bytes1", "bytes"],
              [
                "0x00",
                // sessionDetails.enableSessionData.validator,
                sessionDetails.enableSessionData.enableSession
                  .permissionEnableSig,
              ],
            ),
            //   permissionEnableSig: formatPermissionEnableSig({
            //     signature:
            //       sessionDetails.enableSessionData.enableSession
            //         .permissionEnableSig,
            //     validator: sessionDetails.enableSessionData.validator,
            //     accountType: sessionDetails.enableSessionData.accountType,
            //   }),
          },
          sessionDetails.signature,
        ]),
      ) as Hex,
    ],
  );

  const userOpHash = await smartAccountClient.sendUserOperation(userOperation);

  const receipt = await pimlicoClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  return receipt;
}
