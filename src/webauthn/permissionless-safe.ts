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
  getSocialRecoveryValidator,
  getWebAuthnValidator,
  getWebauthnValidatorMockSignature,
  getWebauthnValidatorSignature,
  getTrustAttestersAction,
  RHINESTONE_ATTESTER_ADDRESS,
  MOCK_ATTESTER_ADDRESS,
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
  pad,
} from "viem";
import { createSmartAccountClient } from "permissionless";
import { erc7579Actions } from "permissionless/actions/erc7579";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import {
  createPaymasterClient,
  entryPoint07Address,
  getUserOperationHash,
} from "viem/account-abstraction";
import { toSafeSmartAccount } from "permissionless/accounts";
import { getAccountNonce } from "permissionless/actions";
import { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/typescript-types";
import {
  b64ToBytes,
  base64FromUint8Array,
  findQuoteIndices,
  hexStringToUint8Array,
  parseAndNormalizeSig,
  uint8ArrayToHexString,
} from "./utils";

export default async function main({
  bundlerUrl,
  rpcUrl,
  paymasterUrl,
  chain,
}: {
  bundlerUrl: string;
  rpcUrl: string;
  paymasterUrl: string;
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

  const paymasterClient = createPaymasterClient({
    transport: http(paymasterUrl),
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
    // safe4337ModuleAddress: "0x7579F9feedf32331C645828139aFF78d517d0001",
    // erc7579LaunchpadAddress: "0x7579011aB74c46090561ea277Ba79D510c6C00ff",
    safe4337ModuleAddress: "0x3Fdb5BC686e861480ef99A6E3FaAe03c0b9F32e2", // These are not meant to be used in production as of now.
    erc7579LaunchpadAddress: "0xEBe001b3D534B9B6E2500FB78E67a1A137f561CE",
    attesters: [
      RHINESTONE_ATTESTER_ADDRESS, // Rhinestone Attester
      MOCK_ATTESTER_ADDRESS, // Mock Attester - do not use in production
    ],
    attestersThreshold: 1,
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

  const webauthn = getWebAuthnValidator({
    pubKeyX: 1,
    pubKeyY: 2,
    authenticatorId: "hello",
  });

  const opHash = await smartAccountClient.installModule({
    type: webauthn.type,
    address: webauthn.module,
    context: webauthn.initData!,
  });

  await pimlicoClient.waitForUserOperationReceipt({
    hash: opHash,
  });

  const nonce = await getAccountNonce(publicClient, {
    address: safeAccount.address,
    entryPointAddress: entryPoint07Address,
    key: BigInt(pad(webauthn.module, { dir: "right", size: 24 }) || 0),
  });

  const action = getTrustAttestersAction({
    threshold: 1,
    attesters: [RHINESTONE_ATTESTER_ADDRESS],
  });

  const calls = [
    {
      to: action.target,
      data: action.callData,
    },
  ];

  const userOperation = await smartAccountClient.prepareUserOperation({
    account: safeAccount,
    calls: calls,
    nonce,
    // signature: getWebauthnValidatorMockSignature(),
    signature:
      "0x00000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000001635bc6d0f68ff895cae8a288ecf7542a6a9cd555df784b73e1e2ea7e9104b1db15e9015d280cb19527881c625fee43fd3a405d5b0d199a8c8e6589a7381209e40000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002549960de5880e8c687434170f6476605b8fe4aeb9a28632c7995cf3ba831d97631d0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000f47b2274797065223a22776562617574686e2e676574222c226368616c6c656e6765223a22746278584e465339585f3442797231634d77714b724947422d5f3330613051685a36793775634d30424f45222c226f726967696e223a22687474703a2f2f6c6f63616c686f73743a33303030222c2263726f73734f726967696e223a66616c73652c20226f746865725f6b6579735f63616e5f62655f61646465645f68657265223a22646f206e6f7420636f6d7061726520636c69656e74446174614a534f4e20616761696e737420612074656d706c6174652e205365652068747470733a2f2f676f6f2e676c2f796162506578227d000000000000000000000000",
  });

  const userOpHashToSign = getUserOperationHash({
    chainId: chain.id,
    entryPointAddress: entryPoint07Address,
    entryPointVersion: "0.7",
    userOperation,
  });

  const formattedMessage = userOpHashToSign.startsWith("0x")
    ? userOpHashToSign.slice(2)
    : userOpHashToSign;

  const challenge = base64FromUint8Array(
    hexStringToUint8Array(formattedMessage),
    true
  );

  // prepare assertion options
  const assertionOptions: PublicKeyCredentialRequestOptionsJSON = {
    challenge,
    // allowCredentials,
    userVerification: "required",
  };

  const { startAuthentication } = await import("@simplewebauthn/browser");

  const cred = await startAuthentication(assertionOptions);

  // get authenticator data
  const { authenticatorData } = cred.response;
  const authenticatorDataHex = uint8ArrayToHexString(
    b64ToBytes(authenticatorData)
  );

  // get client data JSON
  const clientDataJSON = atob(cred.response.clientDataJSON);

  // get challenge and response type location
  const { beforeType } = findQuoteIndices(clientDataJSON);

  // get signature r,s
  const { signature } = cred.response;
  const signatureHex = uint8ArrayToHexString(b64ToBytes(signature));
  const { r, s } = parseAndNormalizeSig(signatureHex);

  const userOpHash = await smartAccountClient.sendUserOperation({
    account: safeAccount,
    calls: calls,
    nonce,
    signature: getWebauthnValidatorSignature({
      authenticatorData: authenticatorDataHex,
      clientDataJSON,
      responseTypeLocation: Number(beforeType),
      r: Number(r),
      s: Number(s),
      usePrecompiled: false,
    }),
  });

  const receipt = await pimlicoClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  return receipt;
}
