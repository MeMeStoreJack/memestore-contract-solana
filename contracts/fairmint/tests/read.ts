import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";

import { IDL } from "../target/types/fairmint";
import { parseSecretKey } from "./utils";

const main = async () => {
  let signer = anchor.web3.Keypair.fromSecretKey(parseSecretKey("/home/ubuntu/.config/solana/id.json"));
  const umi = createUmi("https://api.devnet.solana.com").use(walletAdapterIdentity(signer));

  const programId = new PublicKey("8Ezd1v6nBKrVBvQepsjmzXE7KoistTyFGrKwXV6BoqRw");
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

  const program = new Program(IDL, programId, {
    connection,
  });

  let txid = "3ST65y6e9nAA7zEMGiqCLgoqaPZvJkgfeq2zN1a8RiX2dW1iQMWpmNyFcksRtCE3bWzDLDdRN6PtmAEafKHs9PJv";
  const tx = await connection.getTransaction(txid, {
    commitment: "confirmed",
  });
  const eventParser = new anchor.EventParser(programId, new anchor.BorshCoder(IDL));
  const events = eventParser.parseLogs(tx.meta.logMessages);

  for (let log of tx.meta.logMessages) {
    console.log(log);
  }

  let log =
    "Qcwqgd+UIbtNY07RBbVGdVbtG6vobgkEQ+9ltcjMcic75peOKvH+JhCO0JaVcs22e2LHZqUUZ34OJpP0+4AcIv0Xpbx+g8y0ACBKqdEBAADV4rVmAAAAAA==";
  const hexStr = Buffer.from(log, "base64").toString("hex");
  console.log(hexStr); // 41cc2a81df9421bb
  let prefix = hexStr.slice(0, 8); // sha256("event:FairMintEvent")的前8个字节

  for (let event of events) {
    console.log(event);
  }
};

main();
