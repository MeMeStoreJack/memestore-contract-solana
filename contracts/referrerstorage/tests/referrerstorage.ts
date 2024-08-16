import { assert } from "chai";

import * as anchor from "@coral-xyz/anchor";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";
import { Keypair } from "@solana/web3.js";

import { ReferrerStorageTester } from "./referrerstorage_tester";
import { parseSecretKey } from "./utils";

describe("referrerstorage", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  let signer = anchor.web3.Keypair.fromSecretKey(parseSecretKey("/home/ubuntu/.config/solana/id.json"));
  const umi = createUmi(anchor.AnchorProvider.env().connection).use(walletAdapterIdentity(signer));

  const referer = new ReferrerStorageTester(signer, umi);
  // reftCY5g3ZW7mV6RWcCjkJSaCoq3hnnHTCiKZX89eYL
  const TestReferrer = Keypair.fromSecretKey(
    new Uint8Array([
      121, 39, 4, 243, 44, 216, 193, 216, 199, 1, 148, 231, 37, 231, 135, 219, 121, 77, 189, 234, 72, 45, 73, 109, 221,
      153, 153, 254, 248, 14, 176, 96, 12, 184, 13, 190, 207, 63, 64, 216, 184, 166, 78, 139, 121, 189, 11, 132, 53,
      234, 41, 144, 174, 4, 37, 231, 50, 142, 102, 227, 114, 223, 166, 189,
    ]),
  );

  // 8Rf2fqsSqQ6mXwEwtRRLTjj6PgwRLWDhjonsRjdZLEei
  const TestUpReferrer = Keypair.fromSecretKey(
    new Uint8Array([
      127, 165, 102, 78, 116, 221, 89, 53, 72, 90, 27, 13, 191, 151, 147, 5, 60, 106, 55, 169, 249, 92, 18, 165, 117,
      13, 20, 33, 67, 30, 229, 200, 110, 82, 191, 71, 213, 168, 205, 55, 142, 97, 23, 103, 13, 5, 142, 43, 79, 15, 198,
      0, 121, 140, 200, 9, 106, 123, 123, 103, 241, 108, 95, 87,
    ]),
  );

  it("Is initialized!", async () => {
    await referer.initFixture();
    await referer.setReferrer(TestReferrer.publicKey.toBase58());
    await referer.setReferrer(TestUpReferrer.publicKey.toBase58(), TestReferrer);
    assert.equal((await referer.getReferer(referer.user.publicKey)).toBase58(), TestReferrer.publicKey.toBase58());
    assert.equal((await referer.getReferer(TestReferrer.publicKey)).toBase58(), TestUpReferrer.publicKey.toBase58());
  });
});
