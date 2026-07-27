/**
 * OffCKB's prefunded devnet accounts. These private keys are published in
 * offckb's own documentation and every devnet genesis funds them identically —
 * they exist so a local chain can be driven without a wallet. They are
 * worthless on testnet and mainnet, and the app refuses to use them against
 * any RPC other than the local devnet.
 *
 * Regenerate with `offckb accounts`.
 */
export type DevAccount = {
  index: number;
  label: string;
  privateKey: string;
};

export const DEV_ACCOUNTS: DevAccount[] = [
  {
    index: 0,
    label: "Account #0",
    privateKey: "0x6109170b275a09ad54877b82f7d9930f88cab5717d484fb4741ae9d1dd078cd6",
  },
  {
    index: 1,
    label: "Account #1",
    privateKey: "0x9f315d5a9618a39fdc487c7a67a8581d40b045bd7a42d83648ca80ef3b2cb4a1",
  },
  {
    index: 2,
    label: "Account #2",
    privateKey: "0x59ddda57ba06d6e9c5fa9040bdb98b4b098c2fce6520d39f51bc5e825364697a",
  },
  {
    index: 3,
    label: "Account #3",
    privateKey: "0xf4a1fc19468b51ba9d1f0f5441fa3f4d91e625b2af105e1e37cc54bf9b19c0a1",
  },
  {
    index: 4,
    label: "Account #4",
    privateKey: "0x0334ddff3b1e19af5c5fddda8dbcfb235416eaaba11cfca8acf63ad46e9f55b2",
  },
];
