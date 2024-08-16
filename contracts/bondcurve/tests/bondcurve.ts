import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";

import { Bondcurve } from "../target/types/bondcurve";
import { BondCurveTester, END_USERS_COUNT } from "./bondcurve_tester";
import { parseSecretKey } from "./utils";
import dotenv from "dotenv";

describe("bondcurve", () => {
  dotenv.config({ path: "./.env" });

  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.Bondcurve as Program<Bondcurve>;

  let signer = anchor.web3.Keypair.fromSecretKey(parseSecretKey("/home/ubuntu/.config/solana/id.json"));
  // 4vLqqVQg6P9i7a5MxtngEqwVUUq89Wb45swHoJ9iwQpZ
  console.log("bot key: ", process.env.BOT_SIGNER_KEY!);
  let botSigner = anchor.web3.Keypair.fromSecretKey(bs58.decode(process.env.BOT_SIGNER_KEY!));

  const umi = createUmi(anchor.AnchorProvider.env().connection).use(mplTokenMetadata());

  let isDevnet = true;
  let bondcurve = new BondCurveTester(botSigner, botSigner, umi, isDevnet);

  it("Is initialized!", async () => {
    // await bondcurve.initFixture();
    // await bondcurve.initialize();
    // await bondcurve.setGlobal();
    // await bondcurve.create();
    // await bondcurve.create2();
    // await bondcurve.buy(0.01e9);
    // await bondcurve.endUsersBuy(0.01e9);
    // await bondcurve.sell(null);
    // await bondcurve.endUsersSell();
    // await bondcurve.buy(4.2e9);
    // await bondcurve.setGlobal();
    // await bondcurve.wrapSol(botSigner);
    // await bondcurve.syncWsol(botSigner, bondcurve.associatedBot);
    // await bondcurve.initCpmmFixture(bondcurve.associatedBot, bondcurve.botSigner);
    // await bondcurve.proxyInitialize(bondcurve.botSigner, bondcurve.associatedBot, bondcurve.wsolBotAccount);
    // await bondcurve.unlock();
    // await bondcurve.endUsersUnlock();
  });
});
