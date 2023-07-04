# @walletconnect/core

Core for WalletConnect Protocol

## License

Apache 2.0


## Tests

A note about the nym-integration: the nym-client only accepts one connection at the time.
To avoid spinning hundreds of nym-client, or making all the tests sequential with proper termination,
The test which should be run is singletest with `TEST_PROJECT_ID=YOUR_PROJECT_ID TEST_RELAY_URL=wss://staging.relay.walletconnect.com npm run singletest`.
This test is relatively global. Now before running this test, it is important to
1) run two nym-clients, one for the user (port 1977), one for the service-provider  (port 1978)
2) Ensure that the service provider nym address matches what is hardcoded in walletconnect-utils-nym
3) Build walletconnect-utils-nym (npm run build)
4) Run and connect the service provider to one of the nym-client `node walletconnect-utils-nym/jsonrpc/nym-run-SP/dist/src/run-nym-wc-SP.js`
5) `npm link` in walletconnect-utils-nym and `npm link nym-ws-connection`in this repo.

For the singletest of EthereumProvider (yes, it's another package, but their readme is already busy)
Similar, but run one more nym-client for the user (port 1970), so that the walletClient also can connect to a nym Client
Also, to test, but it might be needed to run more npm link to create local updated versions of local packages, as this monorepo imports internal packages.