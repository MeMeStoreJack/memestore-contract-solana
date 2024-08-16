import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";

import { IDL } from "../target/types/bondcurve";
import { parseSecretKey } from "./utils";

const main = async () => {
  let signer = anchor.web3.Keypair.fromSecretKey(parseSecretKey("/home/ubuntu/.config/solana/id.json"));
  const programId = new PublicKey("7yx8TskMu1CD9pfxJGH3AEwEP7SGhNyt8nwiEvgus5zQ");
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

  const program = new Program(IDL, programId, {
    connection,
  });

  let globaldata = await program.account.globalAccount.fetch("6bxz2uYa5Ev1FGP7wHF9651FXDHJ3hCKUd2wGHpxgU6t");
  console.log(globaldata);
  const eventParser = new anchor.EventParser(programId, new anchor.BorshCoder(IDL));
  // const events = eventParser.parseLogs(tx.meta.logMessages);
  const events = eventParser.parseLogs([
    "Z/RSHyz1d3dPmOycHPTmzYrHpKMLqyBlsn8yi1dVrGsEu6LVkr4N+N54dQ3yHPHaMCtGlMgdTKjy4igE/2wM2cQUMXRmmmh8gJaYAAAAAAAW3x7ip+wcAAEAAAAAAAAA2xldEybbC/gHwNpAPo7cZr8h6woY8PYJqFl/qiT9w44wdQAAAAAAANsZXRMm2wv4B8DaQD6O3Ga/IesKGPD2CahZf6ok/cOOIE4AAAAAAACghgEAAAAAAJBMlgAAAAAA2sm5ZgAAAAA=",
  ]);
  console.log(events);
};

main();
