import "dotenv/config";

import { createTransferInstruction } from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  ParsedAccountData,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

// Fetches the number of decimals for a given token to accurately handle token amounts.
async function getNumberDecimals(mintAddress: PublicKey | string, connection: Connection): Promise<number> {
  if (typeof mintAddress === "string") {
    mintAddress = new PublicKey(mintAddress);
  }
  const info = await connection.getParsedAccountInfo(mintAddress);
  const decimals = (info.value?.data as ParsedAccountData).parsed.info.decimals as number;
  console.log(`Token Decimals: ${decimals}`);
  return decimals;
}

//   // Initializes a Keypair from the secret key stored in environment variables. Essential for signing transactions.
//   function initializeKeypair(): Keypair {
//     const privateKey = new Uint8Array(bs58.decode(process.env.PRIVATE_KEY!));
//     const keypair = Keypair.fromSecretKey(privateKey);
//     console.log(
//       `Initialized Keypair: Public Key - ${keypair.publicKey.toString()}`
//     );
//     return keypair;
//   }

//   // Sets up the connection to the Solana cluster, utilizing environment variables for configuration.
//   function initializeConnection(): Connection {
//     const rpcUrl = process.env.SOLANA_RPC!;
//     const connection = new Connection(rpcUrl, {
//       commitment: "confirmed",
//       wsEndpoint: process.env.SOLANA_WSS,
//     });
//     // Redacting part of the RPC URL for security/log clarity
//     console.log(`Initialized Connection to Solana RPC: ${rpcUrl.slice(0, -32)}`);
//     return connection;
//   }

// Main function orchestrates sending tokens by calling the defined functions in order.
export async function transferSpl(
  fromKeypair: Keypair,
  destinationWallet: PublicKey,
  amount: number,
  mintAddress: string | PublicKey,
  connection: Connection,
  sourceTokenAccount: PublicKey,
  destTokenAccount: PublicKey,
) {
  console.log("Starting Token Transfer Process");

  // Config priority fee and amount to transfer
  const PRIORITY_RATE = 12345; // MICRO_LAMPORTS
  const transferAmount = 0.01;

  // Instruction to set the compute unit price for priority fee
  const PRIORITY_FEE_INSTRUCTIONS = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_RATE });

  console.log("----------------------------------------");
  if (typeof mintAddress === "string") {
    mintAddress = new PublicKey(mintAddress);
  }
  const decimals = await getNumberDecimals(mintAddress, connection);

  // Creates or fetches the associated token accounts for the sender and receiver.
  // let sourceAccount = await getOrCreateAssociatedTokenAccount(
  //   connection,
  //   fromKeypair,
  //   mintAddress,
  //   fromKeypair.publicKey
  // );
  // console.log(`Source Account: ${sourceAccount.address.toString()}`);

  // let destinationAccount = await getOrCreateAssociatedTokenAccount(
  //   connection,
  //   fromKeypair,
  //   mintAddress,
  //   destinationWallet
  // );
  // console.log(`Destination Account: ${destinationAccount.address.toString()}`);
  // console.log("----------------------------------------");

  // Adjusts the transfer amount according to the token's decimals to ensure accurate transfers.
  const transferAmountInDecimals = transferAmount * Math.pow(10, decimals);

  // Prepares the transfer instructions with all necessary information.
  const transferInstruction = createTransferInstruction(
    // Those addresses are the Associated Token Accounts belonging to the sender and receiver
    sourceTokenAccount,
    destTokenAccount,
    fromKeypair.publicKey,
    transferAmountInDecimals,
  );
  console.log("Transaction instructions:", transferInstruction);
  let latestBlockhash = await connection.getLatestBlockhash("confirmed");
  console.log("Latest Blockhash: ", latestBlockhash.blockhash);

  // Compiles and signs the transaction message with the sender's Keypair.
  const messageV0 = new TransactionMessage({
    payerKey: fromKeypair.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: [PRIORITY_FEE_INSTRUCTIONS, transferInstruction],
    //   instructions: [transferInstruction],
  }).compileToV0Message();
  const versionedTransaction = new VersionedTransaction(messageV0);
  versionedTransaction.sign([fromKeypair]);
  console.log("Transaction Signed. Preparing to send...");

  // Attempts to send the transaction to the network, handling success or failure.
  try {
    const txid = await connection.sendTransaction(versionedTransaction, {
      maxRetries: 20,
    });
    console.log(`Transaction Submitted: ${txid}`);

    const confirmation = await connection.confirmTransaction(
      {
        signature: txid,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      },
      "confirmed",
    );
    if (confirmation.value.err) {
      throw new Error("🚨Transaction not confirmed.");
    }
    console.log(`Transaction Successfully Confirmed! 🎉 View on SolScan: https://solscan.io/tx/${txid}`);
  } catch (error) {
    console.error("Transaction failed", error);
  }
}

//   transferSpl();
