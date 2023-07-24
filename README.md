# WalletConnect v2.x.x

Open protocol for connecting Wallets to Dapps - https://walletconnect.com

## Setup

1. Ensure [nodejs and npm](https://nodejs.org/en/)
2. Clone the repository
3. Install all package dependencies, by running `npm install` from the root folder. If the nym packages are not published yet, the local links must be removed during this phase, and then, add them back, then run the 4th point. (messy set-up necessary by npm...)
4. If the nym packages are not published yet: `npm link nym-ws-connection nym-http-connection` (both at the same time!)

## Running checks for all packages

To ensure all packages lint, build and test correctly, we can run the following command from the root folder:

> **For tests to pass in the following command, you will need your own `TEST_PROJECT_ID` value**,
> which will be generated for you when you set up a new project on [WalletConnect Cloud](https://cloud.walletconnect.com).
> The test relay url might also be needed.

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
