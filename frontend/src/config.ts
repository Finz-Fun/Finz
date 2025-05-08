import { clusterApiUrl, Connection, PublicKey } from '@solana/web3.js';
export const RPC_URL = (process.env.SOLANA_ENVIRONMENT === 'mainnet') ? process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com';

export const connection = new Connection(RPC_URL, 'confirmed');
export const PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID as string);

import { Raydium, TxVersion, parseTokenAccountResp } from '@raydium-io/raydium-sdk-v2'

// export const connection = new Connection('<YOUR_RPC_URL>') //<YOUR_RPC_URL>

export const txVersion = TxVersion.LEGACY // or TxVersion.LEGACY
const cluster = process.env.SOLANA_ENVIRONMENT === 'mainnet' ? 'mainnet' : 'devnet' // 'mainnet' | 'devnet'

let raydium: Raydium | undefined
export const initSdk = async (params?: { loadToken?: boolean }) => {

  console.log(connection.rpcEndpoint)
  if (raydium) return raydium
  if (connection.rpcEndpoint === clusterApiUrl('mainnet-beta')){    
    console.warn('using free rpc node might cause unexpected error, strongly suggest uses paid rpc node')
  }
  console.log(`connect to rpc ${connection.rpcEndpoint} in ${cluster}`)
  raydium = await Raydium.load({
    owner: new PublicKey('B1VPbPkEasD3YsUKM3F8fhy9N4NiP4k3b9WzUy7EyWbb'),
    connection,
    cluster,
    disableFeatureCheck: true,
    disableLoadToken: !params?.loadToken,
    blockhashCommitment: 'confirmed',
    // urlConfigs: {
    //   BASE_HOST: '<API_HOST>', // api url configs, currently api doesn't support devnet
    // },
  })

  /**
   * By default: sdk will automatically fetch token account data when need it or any sol balace changed.
   * if you want to handle token account by yourself, set token account data after init sdk
   * code below shows how to do it.
   * note: after call raydium.account.updateTokenAccount, raydium will not automatically fetch token account
   */

  /*  
  raydium.account.updateTokenAccount(await fetchTokenAccountData())
  connection.onAccountChange(owner.publicKey, async () => {
    raydium!.account.updateTokenAccount(await fetchTokenAccountData())
  })
  */

  return raydium
}



export const grpcUrl = '<YOUR_GRPC_URL>'
export const grpcToken = '<YOUR_GRPC_TOKEN>'



