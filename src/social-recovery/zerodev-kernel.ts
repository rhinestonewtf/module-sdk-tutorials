import {
  getSetOwnableValidatorThresholdAction,
  getSocialRecoveryValidator,
  getOwnableValidator,
  getSocialRecoveryMockSignature,
  encodeValidatorNonce,
  getAccount,
} from "@rhinestone/module-sdk";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http, encodePacked, Chain } from "viem";
import { erc7579Actions } from "permissionless/actions/erc7579";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import {
  createPaymasterClient,
  entryPoint07Address,
  getUserOperationHash,
} from "viem/account-abstraction";
import { getAccountNonce } from "permissionless/actions";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { KERNEL_V3_1 } from "@zerodev/sdk/constants";
import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
} from "@zerodev/sdk";

type ENTRYPOINT_ADDRESS_V07_TYPE = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

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

  // const paymasterClient = createPaymasterClient({
  //   transport: http(paymasterUrl),
  // });

  const owner = privateKeyToAccount(generatePrivateKey());

  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: owner,
    entryPoint: entryPoint07Address as ENTRYPOINT_ADDRESS_V07_TYPE,
    kernelVersion: KERNEL_V3_1,
  });

  const kernelAccount = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
    },
    entryPoint: entryPoint07Address as ENTRYPOINT_ADDRESS_V07_TYPE,
    kernelVersion: KERNEL_V3_1,
  });
  // const ownableValidator = getOwnableValidator({
  //   owners: [
  //     "0x2DC2fb2f4F11DeE1d6a2054ffCBf102D09b62bE2",
  //     "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  //   ],
  //   threshold: 2,
  // });
  //
  const smartAccountClient = createKernelAccountClient({
    account: kernelAccount,
    chain,
    entryPoint: entryPoint07Address,
    bundlerTransport: http(bundlerUrl),
    middleware: {
      sponsorUserOperation: async ({ userOperation }) => {
        const zerodevPaymaster = createZeroDevPaymasterClient({
          chain,
          entryPoint: entryPoint07Address,
          transport: http(paymasterUrl),
        });
        return zerodevPaymaster.sponsorUserOperation({
          userOperation,
          entryPoint: entryPoint07Address,
        });
      },
    },
  });

  const guardian1 = privateKeyToAccount(
    "0xc171c45f3d35fad832c53cade38e8d21b8d5cc93d1887e867fac626c1c0d6be7",
  ); // the key coresponding to the first guardian

  const guardian2 = privateKeyToAccount(
    "0x1a4c05be22dd9294615087ba1dba4266ae68cdc320d9164dbf3650ec0db60f67",
  ); // the key coresponding to the second guardian

  const socialRecovery = getSocialRecoveryValidator({
    threshold: 2,
    guardians: [guardian1.address, guardian2.address],
  });

  const opHash1 = await smartAccountClient.installModule(socialRecovery);

  await pimlicoClient.waitForUserOperationReceipt({
    hash: opHash1,
  });

  const recoveryAction = getSetOwnableValidatorThresholdAction({
    threshold: 1,
  });

  const nonce = await getAccountNonce(publicClient, {
    address: kernelAccount.address,
    entryPointAddress: entryPoint07Address,
    key: encodeValidatorNonce({
      account: getAccount({
        address: kernelAccount.address,
        type: "safe",
      }),
      validator: socialRecovery,
    }),
  });

  const userOperation = await smartAccountClient.prepareUserOperation({
    account: kernelAccount,
    calls: [recoveryAction],
    nonce: nonce,
    signature: getSocialRecoveryMockSignature({
      threshold: 2,
    }),
  });

  const userOpHashToSign = getUserOperationHash({
    chainId: chain.id,
    entryPointAddress: entryPoint07Address,
    entryPointVersion: "0.7",
    userOperation,
  });

  const signature1 = await guardian1.signMessage({
    message: { raw: userOpHashToSign },
  });

  const signature2 = await guardian2.signMessage({
    message: { raw: userOpHashToSign },
  });

  userOperation.signature = encodePacked(
    ["bytes", "bytes"],
    [signature1, signature2],
  );

  const userOpHash = await smartAccountClient.sendUserOperation(userOperation);

  const receipt = await pimlicoClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  return receipt;
}
