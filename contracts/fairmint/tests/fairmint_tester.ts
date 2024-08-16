import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { findMasterEditionPda, findMetadataPda } from "@metaplex-foundation/mpl-token-metadata";
import { Pda, publicKey, Umi } from "@metaplex-foundation/umi";
import * as spl from "@solana/spl-token";
import { getAssociatedTokenAddress, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import {
  AccountMeta,
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
} from "@solana/web3.js";

import { Fairmint } from "../target/types/fairmint";
import { ORACLE_SEED, POOL_AUTH_SEED, POOL_LPMINT_SEED, POOL_SEED, POOL_VAULT_SEED } from "./cpmm";

const NUM_TOKENS = 2;
const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const LAMPORTS_PER_SOL = 10 ** 9;

const REFER_ACCOUNT = new PublicKey("CtQYLQMtL7azqRj5qRPxgumzDQ9mL44HWrv3iWm4T6Jg");
const UP_REFER_ACCOUNT = new PublicKey("BfWPnFvRXyqd3BYqxGpvaitZDyveXWaPBp6mvM7rYcSW");
const CPMM_PROGRAM_ID = new PublicKey("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C");
const CPMM_PROGRAM_ID_DEV_NET = new PublicKey("CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW");
const AMM_CONFIG_025_PERCENT_ID = new PublicKey("D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2");
const AMM_CONFIG_025_PERCENT_ID_DEV_NET = new PublicKey("9zSzfkYy6awexsHvmggeH36pfVUdDGyCcwmjT3AQPBj6");

const user = new Keypair();

const TestFairMintKeyPair = Keypair.fromSecretKey(
  new Uint8Array([
    84, 64, 38, 221, 87, 115, 203, 28, 218, 188, 38, 54, 241, 165, 91, 30, 121, 54, 238, 16, 132, 21, 180, 213, 26, 202,
    165, 72, 252, 152, 245, 100, 10, 145, 99, 139, 42, 74, 4, 157, 116, 6, 184, 110, 123, 132, 96, 23, 145, 46, 184, 69,
    45, 222, 123, 46, 94, 240, 105, 241, 94, 164, 240, 182,
  ]),
);

var globalParams = {
  feeRecipient: new anchor.web3.PublicKey("FkGiccUsUYuqC8pso3y4k29J8vkyqqcATDNunZ4UPvGu"),
  owner: new anchor.web3.PublicKey("FkGiccUsUYuqC8pso3y4k29J8vkyqqcATDNunZ4UPvGu"),
  dexBot: new anchor.web3.PublicKey("4vLqqVQg6P9i7a5MxtngEqwVUUq89Wb45swHoJ9iwQpZ"),
};

const FairMintCommonParams = {
  mintSupply: new anchor.BN("2000000000"),
  mintPrice: new anchor.BN("1000000000"),
  singleMintMin: new anchor.BN("1000000000"),
  singleMintMax: new anchor.BN("2000000000"),
  mintMax: new anchor.BN("2000000000"),
};

const FairMintMetadata = {
  name: "FMMEME222",
  symbol: "FMMEME222",
  uri: "https://fm-meme.com/1.json",
};

export class FairMintTester {
  provider: anchor.AnchorProvider;
  program: anchor.Program<Fairmint>;
  printErrors: boolean;
  isDevnet: boolean;
  umi: Umi;
  user: Keypair;
  botSigner: Keypair;
  mint: Keypair;

  admins: Keypair[];
  feesAccount: PublicKey;
  adminMetas: AccountMeta[];

  // pdas
  global: { publicKey: PublicKey; bump: number };
  fairMintPDA: { publicKey: PublicKey; bump: number };
  associateFairMint: PublicKey;
  associatedUser: PublicKey;
  associatedBot: PublicKey;
  referAccount: PublicKey;
  upReferAccount: PublicKey;

  wsolUserAccount: PublicKey;
  wsolBotAccount: PublicKey;
  wsolFairMintAccount: { publicKey: PublicKey; bump: number };

  metadata: Pda;
  masterEdition: Pda;

  cpmmAuthority: { publicKey: PublicKey; bump: number };
  poolState: { publicKey: PublicKey; bump: number };
  token0Mint: PublicKey;
  token1Mint: PublicKey;
  lpMint: { publicKey: PublicKey; bump: number };
  creatorToken0: PublicKey;
  creatorToken1: PublicKey;
  creatorLpToken: PublicKey;
  token0Vault: { publicKey: PublicKey; bump: number };
  token1Vault: { publicKey: PublicKey; bump: number };
  observationState: { publicKey: PublicKey; bump: number };

  constructor(signer: Keypair, botSigner: Keypair, umi: Umi, isDevnet = true) {
    this.isDevnet = isDevnet;
    this.user = signer;
    this.botSigner = botSigner;
    this.umi = umi;
    this.provider = anchor.AnchorProvider.env();
    anchor.setProvider(this.provider);
    this.program = anchor.workspace.Fairmint as Program<Fairmint>;
    this.printErrors = false;

    anchor.BN.prototype.toJSON = function () {
      return this.toString(10);
    };

    // globalParams.dexBot = this.user.publicKey;
  }

  initFixture = async () => {
    console.log(`Initializing fixture`);

    let userBalance = await this.getSolBalance(this.user.publicKey);
    if (userBalance <= 0) {
      await this.confirmTx(await this.requestAirdrop(this.user.publicKey));
      console.log("Airdrop requested");
      console.log(`User address: ${this.user.publicKey.toBase58()}`);
      console.log(`User balance: ${await this.getSolBalance(this.user.publicKey)}`);

      await this.confirmTx(await this.requestAirdrop(REFER_ACCOUNT));
      await this.confirmTx(await this.requestAirdrop(UP_REFER_ACCOUNT));
      console.log(`Refer account balance: ${await this.getSolBalance(REFER_ACCOUNT)}`);
      console.log(`Up refer account balance: ${await this.getSolBalance(UP_REFER_ACCOUNT)}`);
    }

    let backendBalance = await this.getSolBalance(this.botSigner.publicKey);
    if (backendBalance <= 0) {
      await this.confirmTx(await this.requestAirdrop(this.botSigner.publicKey));
      console.log(`Backend signer balance: ${await this.getSolBalance(this.botSigner.publicKey)}`);
    }

    // this.mint = Keypair.generate();
    this.mint = TestFairMintKeyPair;
    console.log(`Mint address: ${this.mint.publicKey.toBase58()}`);

    // pdas
    console.log(`programId: ${this.program.programId}`);

    this.global = await this.findProgramAddress("global");
    this.fairMintPDA = await this.findProgramAddress("fair-mint", [this.mint.publicKey]);
    let abc = await this.findProgramAddress("associated-fair-mint", [this.mint.publicKey]);
    let associatedUser = await getAssociatedTokenAddress(this.mint.publicKey, this.user.publicKey, false);

    console.log(`global address: ${this.global.publicKey.toBase58()}`);
    console.log(`fair mint address: ${this.fairMintPDA.publicKey.toBase58()}`);
    console.log(`Associated fair mint address bump: ${abc.bump}`);
    this.associateFairMint = abc.publicKey;
    console.log(`Associated fair mint address: ${this.associateFairMint.toBase58()}`);

    this.associatedUser = associatedUser;
    // console.log(`Associated user address bump: ${associatedUser.bump}`);
    console.log(`Associated user address: ${this.associatedUser.toBase58()}`);

    this.associatedBot = await getAssociatedTokenAddress(this.mint.publicKey, this.botSigner.publicKey, false);

    this.referAccount = REFER_ACCOUNT;
    this.upReferAccount = UP_REFER_ACCOUNT;

    this.metadata = findMetadataPda(this.umi, {
      mint: publicKey(this.mint.publicKey),
    });
    // console.log(`Metadata address: ${this.metadata[0]}`);
    this.masterEdition = findMasterEditionPda(this.umi, { mint: publicKey(this.mint.publicKey) });
    // console.log(`Master edition address: ${this.masterEdition[0]}`);

    // this.wsolUserAccount = spl.getAssociatedTokenAddressSync(spl.NATIVE_MINT, this.user.publicKey, false);
    this.wsolUserAccount = (
      await getOrCreateAssociatedTokenAccount(
        this.provider.connection,
        this.user,
        spl.NATIVE_MINT,
        this.user.publicKey,
        false,
      )
    ).address;
    this.wsolBotAccount = (
      await getOrCreateAssociatedTokenAccount(
        this.provider.connection,
        this.botSigner,
        spl.NATIVE_MINT,
        this.botSigner.publicKey,
        false,
      )
    ).address;
    const wbcAccount = await this.findProgramAddress("associated-wsol", [this.fairMintPDA.publicKey]);
    this.wsolFairMintAccount = wbcAccount;

    this.cpmmAuthority = await this.findProgramAddress(
      POOL_AUTH_SEED,
      null,
      this.isDevnet ? CPMM_PROGRAM_ID_DEV_NET : CPMM_PROGRAM_ID,
    );
    let token0: PublicKey, token1: PublicKey;

    let mintBn = new anchor.BN(this.mint.publicKey.toBuffer());
    let nativeMintBn = new anchor.BN(spl.NATIVE_MINT.toBuffer());
    if (mintBn.lt(nativeMintBn)) {
      console.log("token0 is small");
      token0 = this.mint.publicKey;
      token1 = spl.NATIVE_MINT;
    } else {
      console.log("token0 is large");
      token0 = spl.NATIVE_MINT;
      token1 = this.mint.publicKey;
    }
    console.log(`token0: ${token0.toBase58()}, token1: ${token1.toBase58()}`);
    this.poolState = await this.findProgramAddress(
      POOL_SEED,
      [this.isDevnet ? AMM_CONFIG_025_PERCENT_ID_DEV_NET : AMM_CONFIG_025_PERCENT_ID, token0, token1],
      this.isDevnet ? CPMM_PROGRAM_ID_DEV_NET : CPMM_PROGRAM_ID,
    );
    this.token0Mint = token0;
    this.token1Mint = token1;
    this.lpMint = await this.findProgramAddress(
      POOL_LPMINT_SEED,
      [this.poolState.publicKey],
      this.isDevnet ? CPMM_PROGRAM_ID_DEV_NET : CPMM_PROGRAM_ID,
    );
    console.log(`LP mint address: ${this.lpMint.publicKey.toBase58()}`);
  };

  createWsolAccount = async (toPubkey: PublicKey, lamports: number | bigint) => {
    let tx = new anchor.web3.Transaction();
    tx.add(
      SystemProgram.transfer({
        fromPubkey: this.user.publicKey,
        toPubkey,
        lamports,
      }),
      spl.createSyncNativeInstruction(toPubkey),
    );
    let txid = await sendAndConfirmTransaction(this.provider.connection, tx, [this.user]);
    console.log(`createWsolAccount txid: ${txid}`);
    let wsolAccount = await this.provider.connection.getAccountInfo(toPubkey);
  };

  initCpmmFixture = async (associatedUser = this.associatedUser, user: Keypair = this.user) => {
    if (this.token0Mint.toBase58() != spl.NATIVE_MINT.toBase58()) {
      console.log("creatorToken0...");
      this.creatorToken0 = associatedUser;
      console.log(`Creator token0 address: ${this.creatorToken0.toBase58()}`);
    } else {
      this.creatorToken0 = await getAssociatedTokenAddress(this.token0Mint, user.publicKey, false);
    }

    console.log("----token0Mint: ", this.token0Mint);
    console.log("----token1MInt: ", this.token1Mint);
    console.log("creatorToken1...");
    if (this.token1Mint.toBase58() != spl.NATIVE_MINT.toBase58()) {
      this.creatorToken1 = associatedUser;
      console.log(`Creator token1 address: ${this.creatorToken1.toBase58()}`);
    } else {
      console.log("token1Mint: ", this.token1Mint);
      this.creatorToken1 = await getAssociatedTokenAddress(this.token1Mint, user.publicKey, false);
      const wsolAccount = await this.provider.connection.getAccountInfo(this.creatorToken1);
      console.log("wsolAccount: ", wsolAccount);
    }

    console.log("creatorLpToken...");
    this.creatorLpToken = await getAssociatedTokenAddress(this.lpMint.publicKey, user.publicKey, true);
    console.log(`Creator LP token address: ${this.creatorLpToken.toBase58()}`);

    this.token0Vault = await this.findProgramAddress(
      POOL_VAULT_SEED,
      [this.poolState.publicKey, this.token0Mint],
      this.isDevnet ? CPMM_PROGRAM_ID_DEV_NET : CPMM_PROGRAM_ID,
    );
    this.token1Vault = await this.findProgramAddress(
      POOL_VAULT_SEED,
      [this.poolState.publicKey, this.token1Mint],
      this.isDevnet ? CPMM_PROGRAM_ID_DEV_NET : CPMM_PROGRAM_ID,
    );
    this.observationState = await this.findProgramAddress(
      ORACLE_SEED,
      [this.poolState.publicKey],
      this.isDevnet ? CPMM_PROGRAM_ID_DEV_NET : CPMM_PROGRAM_ID,
    );
  };

  requestAirdrop = async (pubkey: PublicKey) => {
    if ((await this.getSolBalance(pubkey)) < 1e9 / 2) {
      return this.provider.connection.requestAirdrop(pubkey, 100 * 1e9);
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
    let res = await PublicKey.findProgramAddress(seeds, programId);
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

  getBalance = async (pubkey: PublicKey) => {
    return spl
      .getAccount(this.provider.connection, pubkey)
      .then((account) => Number(account.amount))
      .catch(() => 0);
  };

  getSolBalance = async (pubkey: PublicKey) => {
    return this.provider.connection
      .getBalance(pubkey)
      .then((balance) => balance)
      .catch(() => 0);
  };

  getExtraSolBalance = async (pubkey: PublicKey) => {
    let balance = await this.provider.connection
      .getBalance(pubkey)
      .then((balance) => balance)
      .catch(() => 0);
    let accountInfo = await this.provider.connection.getAccountInfo(pubkey);
    let dataSize = accountInfo ? accountInfo.data.length : 0;
    let minBalance = await this.provider.connection.getMinimumBalanceForRentExemption(dataSize);
    return balance > minBalance ? balance - minBalance : 0;
  };

  getTokenAccount = async (pubkey: PublicKey) => {
    return spl.getAccount(this.provider.connection, pubkey);
  };

  getTime() {
    const now = new Date();
    const utcMilllisecondsSinceEpoch = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
    return utcMilllisecondsSinceEpoch / 1000;
  }

  toTokenAmount(uiAmount: number, decimals: number) {
    return new anchor.BN(uiAmount * 10 ** decimals);
  }

  toUiAmount(token_amount: number, decimals: number) {
    return token_amount / 10 ** decimals;
  }

  ///////
  // instructions

  initialize = async () => {
    // await this.initFixture();
    this.global = await this.findProgramAddress("global");
    // console.log(`global address: ${this.global.publicKey.toBase58()}`);
    // this.user = Keypair.generate();

    // await this.confirmTx(await this.requestAirdrop(this.user.publicKey));
    // console.log("Airdrop requested");
    // console.log(`pubkey: ${this.user.publicKey.toBase58()}`);
    // console.log(`User balance: ${await this.getSolBalance(this.user.publicKey)}`);
    try {
      await this.program.methods
        .initialize(globalParams.feeRecipient, globalParams.owner, globalParams.dexBot)
        .accounts({
          global: this.global.publicKey,
          user: this.user.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([this.user])
        .rpc();

      const globalData = await this.program.account.fairMintGlobalAccount.fetch(this.global.publicKey);
      console.log("globalData", globalData);
    } catch (err) {
      if (this.printErrors) {
        console.log(err);
      }
      throw err;
    }
  };

  create = async () => {
    try {
      let accounts = {
        user: this.user.publicKey,
        mint: this.mint.publicKey,
        fairMint: this.fairMintPDA.publicKey,
        global: this.global.publicKey,
        metadata: this.metadata[0],
        systemProgram: SystemProgram.programId,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID.toBase58(),
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      };
      console.log(`create accounts: ${JSON.stringify(accounts, null, 2)}`);
      let tx = new anchor.web3.Transaction();
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 250_000 }));
      const createIx = await this.program.methods
        .create(FairMintCommonParams, FairMintMetadata)
        .accounts(accounts)
        .instruction();
      tx.add(createIx);
      const txid = await sendAndConfirmTransaction(this.provider.connection, tx, [this.user, this.mint]);
      console.log(`creator txid: ${txid}`);

      let mintInfo = await spl.getMint(this.provider.connection, this.mint.publicKey);
      console.log("mintInfo", mintInfo);
    } catch (err) {
      if (this.printErrors) {
        console.log(err);
      }
      throw err;
    }
  };

  create2 = async () => {
    try {
      let accounts = {
        user: this.user.publicKey,
        mint: this.mint.publicKey,
        associatedFairMint: this.associateFairMint,
        global: this.global.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
      };
      console.log(`create2 accounts: ${JSON.stringify(accounts, null, 2)}`);
      let tx = new anchor.web3.Transaction();
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 250_000 }));
      const createIx = await this.program.methods.create2().accounts(accounts).instruction();
      tx.add(createIx);
      const txid = await sendAndConfirmTransaction(this.provider.connection, tx, [this.user]);
      console.log(`create2 txid: ${txid}`);

      let mintInfo = await spl.getMint(this.provider.connection, this.mint.publicKey);
      console.log("mintInfo", mintInfo);
    } catch (err) {
      if (this.printErrors) {
        console.log(err);
      }
      throw err;
    }
  };

  fairMint = async (amount: number) => {
    try {
      let user_sol_before = await this.getSolBalance(this.user.publicKey);
      let bond_curve_sol_before = await this.getSolBalance(this.fairMintPDA.publicKey);
      let accounts = {
        global: this.global.publicKey,
        feeRecipient: globalParams.feeRecipient, // FkGiccUsUYuqC8pso3y4k29J8vkyqqcATDNunZ4UPvGu
        mint: this.mint.publicKey,
        fairMint: this.fairMintPDA.publicKey,
        associatedFairMint: this.associateFairMint,
        associatedUser: this.associatedUser,
        user: this.user.publicKey,
        systemProgram: SystemProgram.programId,
        associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      };
      console.log(`accounts: ${JSON.stringify(accounts, null, 2)}`);
      await this.program.methods
        .fairMint({
          amount: new anchor.BN(amount),
        })
        .accounts(accounts)
        .signers([this.user])
        .rpc();
      let user_sol_after = await this.getSolBalance(this.user.publicKey);
      let refer_sol_after = await this.getSolBalance(this.referAccount);
      let up_refer_sol_after = await this.getSolBalance(this.upReferAccount);
      let bond_curve_sol_after = await this.getSolBalance(this.fairMintPDA.publicKey);
      let fee_account_sol_after = await this.getSolBalance(globalParams.feeRecipient);
      // console.log(`User SOL balance before: ${user_sol_before/1e9}`);
      // console.log(`User SOL balance after: ${user_sol_after/1e9}`);
      // console.log(`Refer SOL balance after: ${refer_sol_after/1e9}`);
      // console.log(`Up refer SOL balance after: ${up_refer_sol_after/1e9}`);
      // console.log(`Bond curve SOL balance before: ${bond_curve_sol_before/1e9}`);
      // console.log(`Bond curve SOL balance after: ${bond_curve_sol_after/1e9}`);
      // console.log(`Fee account SOL balance after: ${fee_account_sol_after/1e9}`);

      let abcAccount = await spl.getAccount(this.provider.connection, this.associateFairMint);
      // console.log("abcAccount", abcAccount);
      let userTokenAccount = await spl.getAccount(this.provider.connection, this.associatedUser);
      // console.log("userTokenAccount", userTokenAccount);
    } catch (err) {
      if (this.printErrors) {
        console.log(err);
      }
      throw err;
    }
  };

  wrapSol = async (signer: Keypair = this.user) => {
    try {
      await this.program.methods
        .wrapSol()
        .accounts({
          signer: signer.publicKey,
          fairMint: this.fairMintPDA.publicKey,
          fairMintWsol: this.wsolFairMintAccount.publicKey,
          wsolMint: spl.NATIVE_MINT,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([signer])
        .rpc();
    } catch (err) {
      if (this.printErrors) {
        console.log(err);
      }
      throw err;
    }
  };

  syncWsol = async (signer: Keypair = this.user, associatedUser: PublicKey = this.associatedUser) => {
    try {
      await this.program.methods
        .syncWsol()
        .accounts({
          user: signer.publicKey,
          mint: this.mint.publicKey,
          fairMint: this.fairMintPDA.publicKey,
          fairMintWsol: this.wsolFairMintAccount.publicKey,
          associatedUser: associatedUser,
          systemProgram: SystemProgram.programId,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
        })
        .signers([signer])
        .rpc();
      const wsolBalance = await spl.getAccount(this.provider.connection, this.wsolFairMintAccount.publicKey);
      // console.log("WSOL balance", wsolBalance);
    } catch (err) {
      if (this.printErrors) {
        console.log(err);
      }
      throw err;
    }
  };

  proxyInitialize = async (
    signer: Keypair = this.user,
    associatedUser: PublicKey = this.associatedUser,
    wsolUserAccount: PublicKey = this.wsolUserAccount,
  ) => {
    try {
      const tenMinitusLater = new anchor.BN(this.getTime() + 10 * 60);

      let bondingCurveAcct = await this.provider.connection.getAccountInfo(this.fairMintPDA.publicKey);
      let accounts = {
        global: this.global.publicKey,
        mint: this.mint.publicKey,
        fairMint: this.fairMintPDA.publicKey,
        fairMintWsol: this.wsolFairMintAccount.publicKey,
        userWsol: wsolUserAccount,
        wsolMint: spl.NATIVE_MINT,
        associatedFairMint: this.associateFairMint,
        associatedUser: associatedUser,
        cpSwapProgram: this.isDevnet
          ? new PublicKey("CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW")
          : new PublicKey("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C"),
        creator: signer.publicKey,
        ammConfig: this.isDevnet ? AMM_CONFIG_025_PERCENT_ID_DEV_NET : AMM_CONFIG_025_PERCENT_ID,
        authority: this.cpmmAuthority.publicKey,
        poolState: this.poolState.publicKey,
        token0Mint: this.token0Mint,
        token1Mint: this.token1Mint,
        lpMint: this.lpMint.publicKey,
        creatorToken0: this.creatorToken0,
        creatorToken1: this.creatorToken1,
        creatorLpToken: this.creatorLpToken,
        token0Vault: this.token0Vault.publicKey,
        token1Vault: this.token1Vault.publicKey,
        createPoolFee: this.isDevnet
          ? new PublicKey("G11FKBRaAkHAKuLCgLM6K6NUc9rTjPAznRCjZifrTQe2")
          : new PublicKey("DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8"),
        observationState: this.observationState.publicKey,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      };
      console.log(`proxyInitialize accounts: ${JSON.stringify(accounts, null, 2)}`);
      // return;

      // https://solscan.io/tx/41XoiUhFM27ywCFUbKkb26BEhidvMoiUwuQ8JUrtQYSPxkA2sqWUPy8tmjMPCpNRa8E46qsiFaasLz7NxnyCQvaL?cluster=devnet
      const txid = await this.program.methods
        .proxyInitialize(tenMinitusLater)
        .accounts(accounts)
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })])
        .signers([signer])
        .rpc();
      console.log(`proxyInitialize txid: ${txid}`);
    } catch (err) {
      if (this.printErrors) {
        console.log(err);
      }
      throw err;
    }
  };

  unlock = async (associatedUser: PublicKey = this.associatedUser) => {
    try {
      let x = await spl.getAccount(this.provider.connection, associatedUser);
      console.log(`unlock: ${associatedUser.toBase58()}, isFrozen: ${x.isFrozen}`);
      if (x.isFrozen) {
        await this.program.methods
          .unlock()
          .accounts({
            user: this.user.publicKey,
            mint: this.mint.publicKey,
            associatedUser: this.associatedUser,
            fairMint: this.fairMintPDA.publicKey,
            global: this.global.publicKey,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
          })
          .signers([this.user])
          .rpc();
      }
    } catch (err) {
      if (this.printErrors) {
        console.log(err);
      }
      throw err;
    }
  };
}
