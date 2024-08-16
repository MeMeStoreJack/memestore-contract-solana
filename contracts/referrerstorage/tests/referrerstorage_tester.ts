import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Umi } from "@metaplex-foundation/umi";
import { Keypair, PublicKey, sendAndConfirmTransaction, SystemProgram } from "@solana/web3.js";

import { Referrerstorage } from "../target/types/referrerstorage";

export class ReferrerStorageTester {
  provider: anchor.AnchorProvider;
  program: anchor.Program<Referrerstorage>;
  printErrors: boolean;
  umi: Umi;
  user: Keypair;

  // pdas
  userPDA: { publicKey: PublicKey; bump: number };
  refererPDA: { publicKey: PublicKey; bump: number };
  constructor(signer: Keypair, umi: Umi) {
    this.user = signer;
    this.umi = umi;
    this.provider = anchor.AnchorProvider.env();
    anchor.setProvider(this.provider);
    this.program = anchor.workspace.Referrerstorage as Program<Referrerstorage>;
    this.printErrors = false;

    anchor.BN.prototype.toJSON = function () {
      return this.toString(10);
    };
  }

  initFixture = async () => {
    console.log(`Initializing fixture`);

    const userBalance = await this.getSolBalance(this.user.publicKey);
    console.log(`User balance: ${userBalance}`);
    console.log(`User address: ${this.user.publicKey.toBase58()}`);
    if (userBalance <= 0) {
      await this.requestAirdrop(this.user.publicKey);
      console.log("Airdrop requested");
      console.log(`User address: ${this.user.publicKey.toBase58()}`);
      console.log(`User balance: ${await this.getSolBalance(this.user.publicKey)}`);
    }
  };

  requestAirdrop = async (pubkey: PublicKey) => {
    if ((await this.getSolBalance(pubkey)) <= 0) {
      try {
        return await this.confirmTx(await this.provider.connection.requestAirdrop(pubkey, 1 * 1e9));
      } catch (e) {
        console.log("error requesting airdrop: ", e);
      }
    }
  };

  findProgramAddress = async (
    label: string | Buffer,
    extra_seeds = null,
    programId: PublicKey = this.program.programId,
  ) => {
    let seeds: Buffer[];
    if (typeof label === "string") {
      seeds = [Buffer.from(anchor.utils.bytes.utf8.encode(label))];
    } else if (label instanceof Buffer) {
      seeds = [label];
    }
    if (extra_seeds) {
      for (let extra_seed of extra_seeds) {
        if (typeof extra_seed === "string") {
          seeds.push(Buffer.from(anchor.utils.bytes.utf8.encode(extra_seed)));
        } else {
          seeds.push(extra_seed.toBuffer());
        }
      }
    }
    let res = PublicKey.findProgramAddressSync(seeds, programId);
    return { publicKey: res[0], bump: res[1] };
  };

  confirmTx = async (txSignature: anchor.web3.TransactionSignature) => {
    const latestBlockHash = await this.provider.connection.getLatestBlockhash();

    let strategy = {
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: txSignature,
    };
    await this.provider.connection.confirmTransaction(txSignature, "processed");
  };

  confirmAndLogTx = async (txSignature: anchor.web3.TransactionSignature) => {
    await this.confirmTx(txSignature);
    let tx = await this.provider.connection.getTransaction(txSignature, {
      commitment: "confirmed",
    });
    console.log(tx);
  };

  getSolBalance = async (pubkey: PublicKey) => {
    return this.provider.connection
      .getBalance(pubkey)
      .then((balance) => balance)
      .catch(() => 0);
  };

  transferSol = async (toPubkey: string, lamports: number | bigint) => {
    let tx = new anchor.web3.Transaction();
    let toPub = new PublicKey(toPubkey);
    tx.add(
      SystemProgram.transfer({
        fromPubkey: this.user.publicKey,
        toPubkey: toPub,
        lamports,
      }),
    );
    let txid = await sendAndConfirmTransaction(this.provider.connection, tx, [this.user]);
    console.log(`transferSol txid: ${txid}`);
  };

  setReferrer = async (referrer: string, user: Keypair = this.user) => {
    let userPDA = await this.findProgramAddress("referrer", [user.publicKey]);
    await this.requestAirdrop(user.publicKey);
    let refer = new PublicKey(referrer).toBytes();
    console.log(Buffer.from(refer).toString("hex"));
    let tx = await this.program.methods
      .setReferrer(new PublicKey(referrer))
      .accounts({
        user: user.publicKey,
        storage: userPDA.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();
    console.log(`setReferrer txid: ${tx}`);
  };

  getReferer = async (user: PublicKey) => {
    let { publicKey: userPDA } = await this.findProgramAddress("referrer", [user]);
    console.log(`User PDA: ${userPDA.toBase58()}`);
    let { owner, referrer } = await this.program.account.myStorage.fetch(userPDA);
    return referrer;
  };
}
