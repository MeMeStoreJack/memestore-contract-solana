import { BN } from "bn.js";

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
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
import dotenv from "dotenv";

dotenv.config({ path: "./.env" });

import { Bondcurve as bondcurve } from "../target/types/bondcurve";
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

const owner = Keypair.fromSecretKey(bs58.decode(process.env.OWNER_SIGNER_KEY!));
console.log(`Owner address: ${owner.publicKey.toBase58()}`);

export const END_USERS_COUNT = 10;

var globalParams = {
  feeRecipient: new anchor.web3.PublicKey("FkGiccUsUYuqC8pso3y4k29J8vkyqqcATDNunZ4UPvGu"),
  tokenTotalSupply: new anchor.BN("1000000000000000000"),
  owner: new anchor.web3.PublicKey("FkGiccUsUYuqC8pso3y4k29J8vkyqqcATDNunZ4UPvGu"),
  fees: {
    trade: {
      numerator: new anchor.BN(1),
      denominator: new anchor.BN(100),
    },
    referrer: {
      numerator: new anchor.BN(3),
      denominator: new anchor.BN(1000),
    },
    upReferrer: {
      numerator: new anchor.BN(2),
      denominator: new anchor.BN(1000),
    },
    addLiquidity: {
      numerator: new anchor.BN(1),
      denominator: new anchor.BN(100),
    },
  },
  targetAmount: new anchor.BN(4 * 10 ** 9),
  tradeA: new anchor.BN(1.2 * 10 ** 9),
  initBuyMaxPercent: new anchor.BN(100),
  // dexBot: new PublicKey("FkGiccUsUYuqC8pso3y4k29J8vkyqqcATDNunZ4UPvGu"),
  dexBot: new PublicKey("4vLqqVQg6P9i7a5MxtngEqwVUUq89Wb45swHoJ9iwQpZ"),
};

const BondCurveCommonParams = {
  initBuyValue: new anchor.BN(0),
};

const BondCurveMetadata = {
  name: "BCMEME",
  symbol: "BCMEME",
  uri: "https://bc-meme.com/1.json",
};

// 6MiTPzgjPvwTZYxsLMrfDJxcGHZhtMdKcb8FgniJqHfm
const TestMint = Keypair.fromSecretKey(
  new Uint8Array([
    63, 198, 19, 36, 17, 138, 94, 156, 76, 40, 114, 233, 196, 2, 49, 100, 176, 8, 233, 141, 150, 242, 49, 94, 72, 82,
    132, 240, 35, 96, 61, 41, 79, 152, 236, 156, 28, 244, 230, 205, 138, 199, 164, 163, 11, 171, 32, 101, 178, 127, 50,
    139, 87, 85, 172, 107, 4, 187, 162, 213, 146, 190, 13, 248,
  ]),
);

const TestFairMintKeyPair = Keypair.generate();

export class BondCurveTester {
  provider: anchor.AnchorProvider;
  program: anchor.Program<bondcurve>;
  printErrors: boolean;
  umi: Umi;
  user: Keypair;
  endUsers: Keypair[];
  bondingCurveSolArrayAfterBuy: number[];
  bondingCurveSolArrayAfterSell: number[];
  isDevnet: boolean;
  botSigner: Keypair;
  mint: PublicKey;
  mintKeypair: Keypair;

  admins: Keypair[];
  feesAccount: PublicKey;
  adminMetas: AccountMeta[];

  // pdas
  global: { publicKey: PublicKey; bump: number };
  bondingCurve: { publicKey: PublicKey; bump: number };
  associatedBondingCurve: PublicKey;
  associatedUser: PublicKey;
  associatedBot: PublicKey;
  associatedEndUsers: PublicKey[];
  referAccount: PublicKey;
  upReferAccount: PublicKey;

  wsolUserAccount: PublicKey;
  wsolBotAccount: PublicKey;
  wsolBondingCurveAccount: { publicKey: PublicKey; bump: number };

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
    this.program = anchor.workspace.Bondcurve as Program<bondcurve>;
    this.printErrors = false;

    anchor.BN.prototype.toJSON = function () {
      return this.toString(10);
    };

    console.log(`Dex bot address: ${globalParams.dexBot.toBase58()}`);

    this.endUsers = [];
    this.associatedEndUsers = [];
    this.bondingCurveSolArrayAfterBuy = [];
    this.bondingCurveSolArrayAfterSell = [];
    for (let i = 0; i < END_USERS_COUNT; i++) {
      this.endUsers.push(Keypair.generate());
    }
  }

  initFixture = async () => {
    console.log(`Initializing fixture`);

    const userBalance = await this.getSolBalance(this.user.publicKey);
    console.log(`User balance: ${userBalance}`);
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

    //important: 接收手续费账户需要先免租
    const feeRecipientBalance = await this.getSolBalance(globalParams.feeRecipient);
    console.log(`Fee recipient balance: ${feeRecipientBalance}`);
    if (feeRecipientBalance <= 0) {
      await this.confirmTx(await this.requestAirdrop(globalParams.feeRecipient));
      console.log(`Fee recipient address: ${globalParams.feeRecipient.toBase58()}`);
      console.log(`Fee recipient balance: ${await this.getSolBalance(globalParams.feeRecipient)}`);
    }

    this.mintKeypair = TestFairMintKeyPair;
    this.mint = this.mintKeypair.publicKey;
    for (let [index, endUser] of this.endUsers.entries()) {
      let endUserBalance = await this.getSolBalance(endUser.publicKey);
      if (endUserBalance <= 0) {
        await this.confirmTx(await this.requestAirdrop(endUser.publicKey));
        console.log(`End user address: ${endUser.publicKey.toBase58()}`);
        console.log(`End user balance: ${await this.getSolBalance(endUser.publicKey)}`);
      }
      console.log(`End user ${index} address: ${endUser.publicKey.toBase58()}`);
      this.associatedEndUsers.push(spl.getAssociatedTokenAddressSync(this.mint, endUser.publicKey));
    }

    // pdas
    console.log(`programId: ${this.program.programId}`);
    this.global = this.findProgramAddress("global");
    console.log(`global address: ${this.global.publicKey.toBase58()}`);
    this.bondingCurve = this.findProgramAddress("bonding-curve", [this.mint]);
    console.log(`Bonding curve address: ${this.bondingCurve.publicKey.toBase58()}`);
    let abc = this.findProgramAddress("associated-bonding-curve", [this.mint]);
    console.log(`Associated bonding curve address bump: ${abc.bump}`);
    this.associatedBondingCurve = abc.publicKey;
    console.log(`Associated bonding curve address: ${this.associatedBondingCurve.toBase58()}`);

    let associatedUser = spl.getAssociatedTokenAddressSync(this.mint, this.user.publicKey, false);
    this.associatedUser = associatedUser;
    console.log(`Associated user address: ${this.associatedUser.toBase58()}`);

    this.associatedBot = spl.getAssociatedTokenAddressSync(this.mint, this.botSigner.publicKey, false);

    this.referAccount = REFER_ACCOUNT;
    this.upReferAccount = UP_REFER_ACCOUNT;

    this.metadata = findMetadataPda(this.umi, {
      mint: publicKey(this.mint),
    });
    this.masterEdition = findMasterEditionPda(this.umi, { mint: publicKey(this.mint) });
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
    const wbcAccount = this.findProgramAddress("associated-wsol", [this.bondingCurve.publicKey]);
    this.wsolBondingCurveAccount = wbcAccount;

    this.cpmmAuthority = this.findProgramAddress(
      POOL_AUTH_SEED,
      null,
      this.isDevnet ? CPMM_PROGRAM_ID_DEV_NET : CPMM_PROGRAM_ID,
    );
    let token0: PublicKey, token1: PublicKey;

    let mintBn = new anchor.BN(this.mint.toBuffer());
    let nativeMintBn = new anchor.BN(spl.NATIVE_MINT.toBuffer());
    if (mintBn.lt(nativeMintBn)) {
      console.log("token0 is small");
      token0 = this.mint;
      token1 = spl.NATIVE_MINT;
    } else {
      console.log("token0 is large");
      token0 = spl.NATIVE_MINT;
      token1 = this.mint;
    }
    console.log(`token0: ${token0.toBase58()}, token1: ${token1.toBase58()}`);
    this.poolState = this.findProgramAddress(
      POOL_SEED,
      [this.isDevnet ? AMM_CONFIG_025_PERCENT_ID_DEV_NET : AMM_CONFIG_025_PERCENT_ID, token0, token1],
      this.isDevnet ? CPMM_PROGRAM_ID_DEV_NET : CPMM_PROGRAM_ID,
    );
    this.token0Mint = token0;
    this.token1Mint = token1;
    this.lpMint = this.findProgramAddress(
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
    // console.log("wsolAccount: ", wsolAccount);
  };

  initCpmmFixture = async (associatedUser = this.associatedUser, user: Keypair = this.user) => {
    if (this.token0Mint.toBase58() != spl.NATIVE_MINT.toBase58()) {
      console.log("creatorToken0...");
      this.creatorToken0 = associatedUser;
      console.log(`Creator token0 address: ${this.creatorToken0.toBase58()}`);
    } else {
      this.creatorToken0 = await getAssociatedTokenAddress(this.token0Mint, user.publicKey, false);
    }

    console.log("creatorToken1...");
    if (this.token1Mint.toBase58() != spl.NATIVE_MINT.toBase58()) {
      this.creatorToken1 = associatedUser;
      console.log(`Creator token1 address: ${this.creatorToken1.toBase58()}`);
    } else {
      this.creatorToken1 = await getAssociatedTokenAddress(this.token1Mint, user.publicKey, false);
    }

    console.log("creatorLpToken...");
    this.creatorLpToken = await getAssociatedTokenAddress(this.lpMint.publicKey, user.publicKey, true);
    console.log(`Creator LP token address: ${this.creatorLpToken.toBase58()}`);

    this.token0Vault = this.findProgramAddress(
      POOL_VAULT_SEED,
      [this.poolState.publicKey, this.token0Mint],
      this.isDevnet ? CPMM_PROGRAM_ID_DEV_NET : CPMM_PROGRAM_ID,
    );
    this.token1Vault = this.findProgramAddress(
      POOL_VAULT_SEED,
      [this.poolState.publicKey, this.token1Mint],
      this.isDevnet ? CPMM_PROGRAM_ID_DEV_NET : CPMM_PROGRAM_ID,
    );
    this.observationState = this.findProgramAddress(
      ORACLE_SEED,
      [this.poolState.publicKey],
      this.isDevnet ? CPMM_PROGRAM_ID_DEV_NET : CPMM_PROGRAM_ID,
    );
  };

  requestAirdrop = async (pubkey: PublicKey) => {
    if ((await this.getSolBalance(pubkey)) < 1e9 / 2 && !this.isDevnet) {
      return this.provider.connection.requestAirdrop(pubkey, 100 * 1e9);
    }
  };

  findProgramAddress = (label: string | Buffer, extra_seeds = null, programId: PublicKey = this.program.programId) => {
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
    if (this.isDevnet) {
      return;
    }
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

  initialize = async () => {
    this.global = this.findProgramAddress("global");
    return;
    try {
      await this.program.methods
        .initialize(globalParams)
        .accounts({
          global: this.global.publicKey,
          user: this.user.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([this.user])
        .rpc();

      let config = await this.program.account.globalAccount.fetch(this.global.publicKey);
      console.log("config: ", config);
    } catch (err) {
      if (this.printErrors) {
        console.log(err);
      }
      throw err;
    }
  };

  create = async () => {
    try {
      let tx = new anchor.web3.Transaction();
      const accounts = {
        user: this.user.publicKey,
        mint: this.mint,
        bondingCurve: this.bondingCurve.publicKey,
        global: this.global.publicKey,
        metadata: this.metadata[0],
        systemProgram: SystemProgram.programId,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      };
      console.log(`account: ${JSON.stringify(accounts, null, "  ")}`);
      const txid = await this.program.methods
        .create(BondCurveCommonParams.initBuyValue, BondCurveMetadata)
        .accounts(accounts)
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 250_000 })])
        .signers([this.user, this.mintKeypair])
        .rpc();
      console.log(`create txid: ${txid}`);

      let mintInfo = await spl.getMint(this.provider.connection, this.mint);
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
      let tx = new anchor.web3.Transaction();
      const accounts = {
        user: this.user.publicKey,
        mint: this.mint,
        associatedBondingCurve: this.associatedBondingCurve,
        global: this.global.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
      };
      console.log(`account: ${JSON.stringify(accounts, null, "  ")}`);
      const txid = await this.program.methods
        .create2()
        .accounts(accounts)
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 250_000 })])
        .signers([this.user])
        .rpc();
      console.log(`create2 txid: ${txid}`);
    } catch (err) {
      if (this.printErrors) {
        console.log(err);
      }
      throw err;
    }
  };

  buy = async (
    lamports: number,
    associatedUser: PublicKey = this.associatedUser,
    signer: Keypair = this.botSigner,
    user = this.user.publicKey,
  ) => {
    try {
      console.log(`buy: ${associatedUser.toBase58()}, lamports: ${lamports}, signer: ${signer.publicKey.toBase58()}`);
      let user_sol_before = await this.getSolBalance(this.user.publicKey);
      let bond_curve_sol_before = await this.getSolBalance(this.bondingCurve.publicKey);
      await this.program.methods
        .buy({
          lamports: new anchor.BN(lamports),
        })
        .accounts({
          global: this.global.publicKey,
          feeRecipient: globalParams.feeRecipient,
          mint: this.mint,
          bondingCurve: this.bondingCurve.publicKey,
          associatedBondingCurve: this.associatedBondingCurve,
          associatedUser: associatedUser,
          user: user,
          signer: signer.publicKey,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          referAccount: null, // 上级地址
          referStorage: null, //
          upReferAccount: null, // 上上级
          upReferStorage: null,
        })
        .signers([signer])
        .rpc();
      let user_sol_after = await this.getSolBalance(this.user.publicKey);
      let refer_sol_after = await this.getSolBalance(this.referAccount);
      let up_refer_sol_after = await this.getSolBalance(this.upReferAccount);
      let bond_curve_sol_after = await this.getSolBalance(this.bondingCurve.publicKey);
      let fee_account_sol_after = await this.getSolBalance(globalParams.feeRecipient);
      console.log(`Buy: Bond curve SOL balance before: ${bond_curve_sol_before}`);
      console.log(`Buy: Bond curve SOL balance after: ${bond_curve_sol_after}`);
      return bond_curve_sol_after;
    } catch (err) {
      if (this.printErrors) {
        console.log(err);
      }
      throw err;
    }
  };

  endUsersBuy = async (lamports: number) => {
    for (let [index, endUser] of this.endUsers.entries()) {
      console.log(`endUsersBuy: ${endUser.publicKey.toBase58()}, index: ${index}`);
      this.bondingCurveSolArrayAfterBuy.push(
        await this.buy(lamports, this.associatedEndUsers[index], endUser, endUser.publicKey),
      );
    }
  };

  estimateSellResult = async (tokenToSell: bigint) => {
    let config = await this.program.account.bondcurveConfig.fetch(this.bondingCurve.publicKey);
    let actualSol = await this.getSolBalance(this.bondingCurve.publicKey);
    console.log(`actualSol: ${actualSol}`);
    console.log(`sol_reserve: ${config.solReserves}`);
    console.log(`token_reserve: ${config.tokenReserves}`);
    let tokenReserve = config.tokenReserves;
    let solReserve = config.solReserves;
    let solGot = new BN(tokenToSell.toString())
      .mul(new BN(solReserve).add(new BN(globalParams.tradeA)))
      .div(new BN(tokenReserve.add(new BN(tokenToSell.toString()))));
    let trade_sol = solGot.mul(new BN(1)).div(new BN(100));
    let refer_sol = solGot.mul(new BN(3)).div(new BN(1000));
    let up_refer_sol = solGot.mul(new BN(2)).div(new BN(1000));
    let net_sol = solGot.sub(trade_sol).sub(refer_sol).sub(up_refer_sol);
    return net_sol;
  };

  endUsersSell = async () => {
    for (let [index, endUser] of this.endUsers.reverse().entries()) {
      let tokenAmountOnchain = await this.getTokenAccount(this.associatedEndUsers[END_USERS_COUNT - 1 - index]);
      console.log(`#${index}, tokenAmountOnchain: ${tokenAmountOnchain.amount}`);
      let solGot = await this.estimateSellResult(tokenAmountOnchain.amount);
      console.log(`#${END_USERS_COUNT - 1 - index}, solGot: ${solGot}`);
      let user_sol_before = await this.getSolBalance(endUser.publicKey);
      this.bondingCurveSolArrayAfterSell.push(
        await this.sell(
          Number(tokenAmountOnchain.amount),
          this.associatedEndUsers[END_USERS_COUNT - 1 - index],
          endUser,
        ),
      );
      let user_sol_after = await this.getSolBalance(endUser.publicKey);
      console.log(
        `sell #${
          END_USERS_COUNT - 1 - index
        }, user_sol_before: ${user_sol_before}, user_sol_after: ${user_sol_after}, user_got: ${
          user_sol_after - user_sol_before
        }`,
      );
    }
  };

  endUsersBuySell = async (lamports: number) => {
    for (let [index, endUser] of this.endUsers.entries()) {
      console.log(`endUsersBuySell: ${endUser.publicKey.toBase58()}, index: ${index}`);
      this.bondingCurveSolArrayAfterBuy.push(
        await this.buy(lamports, this.associatedEndUsers[index], endUser, endUser.publicKey),
      );
      let tokenAmountOnchain = await this.getTokenAccount(this.associatedEndUsers[index]);
      console.log(`#${index}, tokenAmountOnchain: ${tokenAmountOnchain.amount}`);
      this.bondingCurveSolArrayAfterSell.push(
        await this.sell(Number(tokenAmountOnchain.amount), this.associatedEndUsers[index], endUser),
      );
    }
  };

  sell = async (tokenAmount: number = null, associatedUser: PublicKey = this.associatedUser, user = this.user) => {
    try {
      console.log(`sell: ${associatedUser.toBase58()}, tokenAmount: ${tokenAmount}`);
      let user_sol_before = await this.getSolBalance(user.publicKey);
      let bond_curve_sol_before = await this.getSolBalance(this.bondingCurve.publicKey);
      let userTokenAccount = await spl.getAccount(this.provider.connection, associatedUser);
      let tokenAmountBefore = userTokenAccount.amount;
      const txid = await this.program.methods
        .sell({
          tokenAmount:
            tokenAmount == null ? new anchor.BN(userTokenAccount.amount.toString()) : new anchor.BN(tokenAmount),
        })
        .accounts({
          global: this.global.publicKey,
          feeRecipient: globalParams.feeRecipient,
          mint: this.mint,
          bondingCurve: this.bondingCurve.publicKey,
          associatedBondingCurve: this.associatedBondingCurve,
          associatedUser: associatedUser,
          user: user.publicKey,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          referAccount: null,
          referStorage: null,
          upReferAccount: null,
          upReferStorage: null,
        })
        .signers([user])
        .rpc();
      let user_sol_after = await this.getSolBalance(user.publicKey);
      let refer_sol_after = await this.getSolBalance(this.referAccount);
      let up_refer_sol_after = await this.getSolBalance(this.upReferAccount);
      let bond_curve_sol_after = await this.getSolBalance(this.bondingCurve.publicKey);
      let userTokenAccountAfter = await spl.getAccount(this.provider.connection, associatedUser);
      let tokenAmountAfter = userTokenAccountAfter.amount;
      console.log(`Bond curve SOL balance before: ${bond_curve_sol_before}`);
      console.log(`Bond curve SOL balance after: ${bond_curve_sol_after}`);
      console.log(`bond curve sol out: ${bond_curve_sol_before - bond_curve_sol_after}`);

      return bond_curve_sol_after;
    } catch (err) {
      if (this.printErrors) {
        console.log(err);
      }
      throw err;
    }
  };

  wrapSol = async (signer: Keypair = this.user) => {
    let bondingCurveConfig = await this.program.account.bondcurveConfig.fetch(this.bondingCurve.publicKey);
    console.log(`bondingCurveConfig: ${JSON.stringify(bondingCurveConfig, null, "  ")}`); // reserves: 4023865347
    let bondingCurveSolBalance = await this.getSolBalance(this.bondingCurve.publicKey);
    console.log(`bondingCurveSolBalance: ${bondingCurveSolBalance}`); // 4026056161
    let bondingCurveWsol = await this.getSolBalance(this.wsolBondingCurveAccount.publicKey);
    console.log(`bondingCurveWsol: ${JSON.stringify(bondingCurveWsol, null, "  ")}`); // amount: 0
    let accounts = {
      signer: signer.publicKey,
      bondingCurve: this.bondingCurve.publicKey,
      bondingCurveWsol: this.wsolBondingCurveAccount.publicKey,
      wsolMint: spl.NATIVE_MINT,
      tokenProgram: spl.TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    };
    console.log(`accounts: ${JSON.stringify(accounts, null, "  ")}`);

    try {
      await this.program.methods.wrapSol().accounts(accounts).signers([signer]).rpc();
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
          mint: this.mint,
          bondingCurve: this.bondingCurve.publicKey,
          bondingCurveWsol: this.wsolBondingCurveAccount.publicKey,
          associatedUser: associatedUser,
          systemProgram: SystemProgram.programId,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([signer])
        .rpc();
      const wsolBalance = await spl.getAccount(this.provider.connection, this.wsolBondingCurveAccount.publicKey);
      console.log("WSOL balance", wsolBalance);
    } catch (err) {
      if (this.printErrors) {
        console.log(err);
      }
      throw err;
    }
  };

  // https://solscan.io/tx/feVjGQeBx9Q4fGRZhyTLhPzmtmUZEoqykTTr6869dhxG769PtEiQAVDtMhjeMDtCmWArD7ujUw6h2GRCNK4MJBB?cluster=devnet
  proxyInitialize = async (
    signer: Keypair = this.user,
    associatedUser: PublicKey = this.associatedUser,
    wsolUserAccount: PublicKey = this.wsolUserAccount,
  ) => {
    try {
      const tenMinitusLater = new anchor.BN(this.getTime() + 10 * 60);

      let bondingCurveAcct = await this.provider.connection.getAccountInfo(this.bondingCurve.publicKey);
      const accounts = {
        global: this.global.publicKey,
        mint: this.mint,
        bondingCurve: this.bondingCurve.publicKey,
        bondingCurveWsol: this.wsolBondingCurveAccount.publicKey,
        userWsol: wsolUserAccount,
        wsolMint: spl.NATIVE_MINT,
        associatedBondingCurve: this.associatedBondingCurve,
        associatedUser: associatedUser,
        cpSwapProgram: this.isDevnet ? CPMM_PROGRAM_ID_DEV_NET : CPMM_PROGRAM_ID,
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
      console.log(`proxy initialize accounts: ${JSON.stringify(accounts, null, "  ")}`);
      await this.program.methods
        .proxyInitialize(tenMinitusLater)
        .accounts(accounts)
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })])
        .signers([signer])
        .rpc();
    } catch (err) {
      if (this.printErrors) {
        console.log(err);
      }
      throw err;
    }
  };

  unlock = async (user: Keypair = this.user, associatedUser = this.associatedUser) => {
    try {
      let x = await spl.getAccount(this.provider.connection, associatedUser);
      console.log(`unlock: ${associatedUser.toBase58()}, isFrozen: ${x.isFrozen}`);
      if (x.isFrozen) {
        const txid = await this.program.methods
          .unlock()
          .accounts({
            user: user.publicKey,
            mint: this.mint,
            associatedUser: associatedUser,
            bondingCurve: this.bondingCurve.publicKey,
            global: this.global.publicKey,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
          })
          .signers([user])
          .rpc();
        console.log(`unlock txid: ${txid}`);
      }
    } catch (err) {
      if (this.printErrors) {
        console.log(err);
      }
      throw err;
    }
  };

  endUsersUnlock = async () => {
    for (let [index, endUser] of this.endUsers.entries()) {
      console.log(`endUsersUnlock: ${endUser.publicKey.toBase58()}, index: ${index}`);
      await this.unlock(endUser, this.associatedEndUsers[index]);
    }
  };

  setGlobal = async () => {
    try {
      globalParams.dexBot = this.botSigner.publicKey;
      let p = await this.program.account.globalAccount.fetch(this.global.publicKey);
      console.log(`global: ${JSON.stringify(p, null, "  ")}`);
      return;
      await this.program.methods
        .setGlobal(globalParams)
        .accounts({
          global: this.global.publicKey,
          user: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();
      let config = await this.program.account.globalAccount.fetch(this.global.publicKey);
      console.log("set global config: ", config);
    } catch (err) {
      if (this.printErrors) {
        console.log(err);
      }
      throw err;
    }
  };

  printBuyDelta = (xs: number) => {
    for (let i = 0; i < xs; i++) {
      console.log(
        `delta${i + 1}-${i}: ${this.bondingCurveSolArrayAfterBuy[i + 1] - this.bondingCurveSolArrayAfterBuy[i]}`,
      );
    }
  };

  printSellDelta = (xs: number) => {
    for (let i = 0; i < xs; i++) {
      // console.log(`delta${i+1}-${i}: ${this.bondingCurveSolArrayAfterSell[i+1] - this.bondingCurveSolArrayAfterSell[i]}`);
      console.log(
        `delta${i}-${i + 1}: ${this.bondingCurveSolArrayAfterSell[i] - this.bondingCurveSolArrayAfterSell[i + 1]}`,
      );
    }
  };
}
