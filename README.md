# WalletConnect v2.x.x

Open protocol for connecting Wallets to Dapps - https://walletconnect.com

## Nym implications
The following entities have been directly modified:
- The `relayer` in packages/core
- The test folder in packages/sign-client
- The `universal-provider` in packages/universal-provider
- The `ethereum-provider` in packages/ethereum-provider

But many entities depend on the `relayer`, so most entities have a modified behaviour in that their inner relayer 
must be the Nym-enabled `relayer`, and as such, become Nym-enabled themselves (which matters for dependents).

Running all tests will not be possible at once because of the existence of Nym clients.
Therefore, to test Nym validity, it is necessary to go in the modified folders mentioned above and run
```
TEST_PROJECT_ID=YOUR_PROJECT_ID npm run singletest
```
which will run a subset of the tests, with no concurrency issues.
However, even running those tests require to have Nym clients running, and a service provider running on the valid address.
Most tests require 3 Nym clients on ports 1970, 1977, 1990 (ports can be modified from the tests), and the service provider running
with Nym address 
GbEM8X8FCpsX6tttTXMu9DTinBeHqNz8Xa32vuGL9BLj.Hz652DoVDfbLrbgWWrr7BEYts4ZmDG4niNNCkYPKjDbM@9Byd9VAtyYMnbVAcqdoQxJnq76XEg2dbxbiF5Aa5Jj9J
which is the one of my existing Linode. 
If the service provider is changed and gets a new Nym address, this address must currently be modified within `walletconnect-utils-nym`.

The setup instructions below must also be followed.

Dapps will typically rely on `ethereum-provider`, while wallets rely on `web3wallet`, which indirectly relies on the `relayer`.

## Setup

1. Ensure [nodejs and npm](https://nodejs.org/en/)
2. Clone the repository
3. Install all package dependencies, by running `npm install` from the root folder. If the nym packages are not published yet, the local links must be removed during this phase, and then, add them back, then run the 4th point. (messy set-up necessary by npm...)
4. If the nym packages are not published yet: `npm link nym-ws-connection nym-http-connection` (both at the same time!)

## Running checks for all packages

To ensure all packages lint, build and test correctly, we can run the following command from the root folder:

> **For tests to pass in the following command, you will need your own `TEST_PROJECT_ID` value**,
> which will be generated for you when you set up a new project on [WalletConnect Cloud](https://cloud.walletconnect.com).
> The test relay url might also be needed, but usually not, as the code includes a fallback mechanism which the tests support.

```zsh
TEST_PROJECT_ID=YOUR_PROJECT_ID npm run check
TEST_PROJECT_ID=YOUR_PROJECT_ID TEST_RELAY_URL=wss://staging.relay.walletconnect.com npm run check
```

## Command Overview

- `clean` - Removes build folders from all packages
- `lint` - Runs [eslint](https://eslint.org/) checks
- `prettier` - Runs [prettier](https://prettier.io/) checks
- `build` - Builds all packages
- `test` - Tests all packages
- `check` - Shorthand to run lint, build and test commands
- `reset` - Shorthand to run clean and check commands

## Troubleshooting

1. If you are experiencing issues with installation ensure you install `npm i -g node-gyp`
2. You will need to have xcode command line tools installed
3. If there are issues with xcode command line tools try running

```zsh
sudo xcode-select --switch /Library/Developer/CommandLineTools
sudo xcode-select --reset
```

## License

Apache 2.0
