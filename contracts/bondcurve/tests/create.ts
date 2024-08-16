import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";

import { Bondcurve } from "../target/types/bondcurve";
import { BondCurveTester } from "./bondcurve_tester";
import { parseSecretKey } from "./utils";

const main = async () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.Bondcurve as Program<Bondcurve>;
  let sk = parseSecretKey("/home/ubuntu/.config/solana/id.json");
  let signer = anchor.web3.Keypair.fromSecretKey(sk);
  const umi = createUmi("https://api.devnet.solana.com").use(walletAdapterIdentity(signer)).use(mplTokenMetadata());
  let bondcurve = new BondCurveTester(signer, signer, umi);
  let config = await bondcurve.program.account.bondcurveConfig.fetch(bondcurve.bondingCurve.publicKey);
  console.log("config:", config);
};

main();
