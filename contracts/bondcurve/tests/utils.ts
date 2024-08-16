import fs from "fs";

import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { ConfirmOptions, Connection, PublicKey, sendAndConfirmTransaction, Signer, Transaction } from "@solana/web3.js";

export async function createAssociatedTokenAccountForPDA(
  connection: Connection,
  payer: Signer,
  mint: PublicKey,
  owner: PublicKey,
  confirmOptions?: ConfirmOptions,
  programId = TOKEN_PROGRAM_ID,
  associatedTokenProgramId = ASSOCIATED_TOKEN_PROGRAM_ID,
): Promise<PublicKey> {
  const associatedToken = getAssociatedTokenAddressSync(mint, owner, true);

  const transaction = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      payer.publicKey,
      associatedToken,
      owner,
      mint,
      programId,
      associatedTokenProgramId,
    ),
  );

  await sendAndConfirmTransaction(connection, transaction, [payer], confirmOptions);

  return associatedToken;
}

export function parseSecretKey(path: string): Uint8Array {
  var secretKey = fs.readFileSync(path, {
    encoding: "utf-8",
  });
  secretKey = secretKey.substring(1, secretKey.length - 2);
  const dataList: number[] = secretKey.split(",").map(Number);
  return new Uint8Array(dataList);
}
