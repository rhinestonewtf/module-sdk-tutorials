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

  const ownableValidator = getOwnableValidator({
    owners: [owner.address],
    threshold: 1,
  });

  const safeAccount = await toSafeSmartAccount({
    client: publicClient,
    owners: [owner],
    version: "1.4.1",
    entryPoint: {
      address: entryPoint07Address,
      version: "0.7",
    },
    // safe4337ModuleAddress: "0x7579F9feedf32331C645828139aFF78d517d0001",
    // erc7579LaunchpadAddress: "0x7579011aB74c46090561ea277Ba79D510c6C00ff",
    safe4337ModuleAddress: "0x3Fdb5BC686e861480ef99A6E3FaAe03c0b9F32e2", // These are not meant to be used in production as of now.
    erc7579LaunchpadAddress: "0xEBe001b3D534B9B6E2500FB78E67a1A137f561CE",
    attesters: [
      RHINESTONE_ATTESTER_ADDRESS, // Rhinestone Attester
      MOCK_ATTESTER_ADDRESS, // Mock Attester - do not use in production
    ],
    attestersThreshold: 1,
    validators: [
      {
        address: ownableValidator.address,
        context: ownableValidator.initData,
      },
    ],
  });

  const smartAccountClient = createSmartAccountClient({
    account: safeAccount,
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
    account: safeAccount,
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

  const smartSessions = getSmartSessionsValidator({});

  const opHash = await smartAccountClient.installModule(smartSessions);

  await pimlicoClient.waitForUserOperationReceipt({
    hash: opHash,
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

  const account = getAccount({
    address: safeAccount.address,
    type: "safe",
  });

  const client = getClient({
    rpcUrl,
  });

  const sessionDetails = await getEnableSessionDetails({
    sessions: [session],
    account,
    clients: [client],
  });

  sessionDetails.enableSessionData.enableSession.permissionEnableSig =
    await owner.signMessage({
      message: { raw: sessionDetails.permissionEnableHash },
    });

  const nonce = await getAccountNonce(publicClient, {
    address: safeAccount.address,
    entryPointAddress: entryPoint07Address,
    key: encodeValidatorNonce({
      account,
      validator: smartSessions,
    }),
  });

  sessionDetails.signature = getOwnableValidatorMockSignature({
    threshold: 1,
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

  userOperation.signature = encodeSmartSessionSignature(sessionDetails);

  const userOpHash = await smartAccountClient.sendUserOperation(userOperation);

  const receipt = await pimlicoClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  return receipt;
}
