import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";

// import {
//   walletAdapterIdentity,
// } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { Fairmint } from "../target/types/fairmint";
import { FairMintTester } from "./fairmint_tester";
import { parseSecretKey } from "./utils";
import dotenv from "dotenv";

describe("fairmint", () => {
  dotenv.config({ path: "./.env" });
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.Fairmint as Program<Fairmint>;

  let signer = anchor.web3.Keypair.fromSecretKey(parseSecretKey("/home/ubuntu/.config/solana/id.json"));
  // 4vLqqVQg6P9i7a5MxtngEqwVUUq89Wb45swHoJ9iwQpZ
  let botSigner = anchor.web3.Keypair.fromSecretKey(bs58.decode(process.env.BOT_SIGNER_KEY!));
  const umi = createUmi(anchor.AnchorProvider.env().connection).use(mplTokenMetadata());
  let to = new anchor.web3.PublicKey("BfWPnFvRXyqd3BYqxGpvaitZDyveXWaPBp6mvM7rYcSW");

  let isDevnet = false;
  let fm = new FairMintTester(signer, botSigner, umi, isDevnet);

  it("Is initialized!", async () => {
    await fm.initFixture();
    await fm.initialize();
    await fm.create();
    await fm.create2();
    await fm.fairMint(1e9);
    await fm.fairMint(1e9);
    await fm.wrapSol(botSigner);
    await fm.syncWsol(botSigner, fm.associatedBot);
    await fm.initCpmmFixture(fm.associatedBot, fm.botSigner);
    await fm.proxyInitialize(fm.botSigner, fm.associatedBot, fm.wsolBotAccount);
    await fm.unlock();
  });
});
