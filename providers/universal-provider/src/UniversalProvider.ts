import SignClient, { PROPOSAL_EXPIRY_MESSAGE } from "@walletconnect/sign-client";
import { SessionTypes } from "@walletconnect/types";
import { getSdkError, isValidArray, parseNamespaceKey } from "@walletconnect/utils";
import { getDefaultLoggerOptions, Logger, pino } from "@walletconnect/logger";
import {
  getAccountsFromSession,
  getChainsFromApprovedSession,
  mergeRequiredOptionalNamespaces,
  parseCaip10Account,
  populateNamespacesChains,
  setGlobal,
} from "./utils";
import PolkadotProvider from "./providers/polkadot";
import Eip155Provider from "./providers/eip155";
import SolanaProvider from "./providers/solana";
import CosmosProvider from "./providers/cosmos";
import CardanoProvider from "./providers/cardano";
import ElrondProvider from "./providers/elrond";
import MultiversXProvider from "./providers/multiversx";

import {
  IUniversalProvider,
  IProvider,
  RpcProviderMap,
  ConnectParams,
  RequestArguments,
  UniversalProviderOpts,
  NamespaceConfig,
  PairingsCleanupOpts,
  ProviderAccounts,
} from "./types";

import { RELAY_URL, LOGGER, STORAGE, PROVIDER_EVENTS } from "./constants";
import EventEmitter from "events";

import WebSocket from "ws";

export class UniversalProvider implements IUniversalProvider {
  public client!: SignClient;
  public namespaces?: NamespaceConfig;
  public optionalNamespaces?: NamespaceConfig;
  public sessionProperties?: Record<string, string>;
  public events: EventEmitter = new EventEmitter();
  public rpcProviders: RpcProviderMap = {};
  public session?: SessionTypes.Struct;
  public providerOpts: UniversalProviderOpts;
  public logger: Logger;
  public uri: string | undefined;
  public nymClientPort?: string;
  public nymClientPortForHTTP?: string;

  private sharedMixnetWebsocketConnection: WebSocket | any;

  private shouldAbortPairingAttempt = false;
  private maxPairingAttempts = 10;
  private disableProviderPing = false;

  static async init(opts: UniversalProviderOpts) {
    const provider = new UniversalProvider(opts);
    await provider.initialize();
    return provider;
  }

  constructor(opts: UniversalProviderOpts) {
    this.providerOpts = opts;
    this.logger =
      typeof opts?.logger !== "undefined" && typeof opts?.logger !== "string"
        ? opts.logger
        : pino(getDefaultLoggerOptions({ level: opts?.logger || LOGGER }));
    this.disableProviderPing = opts?.disableProviderPing || false;
    this.nymClientPort = opts?.nymClientPort || "1977";
    this.nymClientPortForHTTP = opts?.nymClientPortForHTTP || "1990";
  }

  public async request<T = unknown>(
    args: RequestArguments,
    chain?: string | undefined,
  ): Promise<T> {
    const [namespace, chainId] = this.validateChain(chain);

    if (!this.session) {
      throw new Error("Please call connect() before request()");
    }

    return await this.getProvider(namespace).request({
      request: {
        ...args,
      },
      chainId: `${namespace}:${chainId}`,
      topic: this.session.topic,
    });
  }

  public sendAsync(
    args: RequestArguments,
    callback: (error: Error | null, response: any) => void,
    chain?: string | undefined,
  ): void {
    this.request(args, chain)
      .then((response) => callback(null, response))
      .catch((error) => callback(error, undefined));
  }

  public async enable(): Promise<ProviderAccounts> {
    if (!this.client) {
      throw new Error("Sign Client not initialized");
    }
    if (!this.session) {
      await this.connect({
        namespaces: this.namespaces,
        optionalNamespaces: this.optionalNamespaces,
        sessionProperties: this.sessionProperties,
      });
    }
    const accounts = await this.requestAccounts();
    return accounts as ProviderAccounts;
  }

  public async disconnect(): Promise<void> {
    if (!this.session) {
      throw new Error("Please call connect() before enable()");
    }
    await this.client.disconnect({
      topic: this.session?.topic,
      reason: getSdkError("USER_DISCONNECTED"),
    });
    await this.cleanup();
  }

  public async connect(opts: ConnectParams): Promise<SessionTypes.Struct | undefined> {
    if (!this.client) {
      throw new Error("Sign Client not initialized");
    }
    this.setNamespaces(opts);
    await this.cleanupPendingPairings();
    if (opts.skipPairing) return;

    console.log("UNIVERSALPROVIDER CONNECTING");

    return await this.pair(opts.pairingTopic);
  }

  public on(event: any, listener: any): void {
    this.events.on(event, listener);
  }

  public once(event: string, listener: any): void {
    this.events.once(event, listener);
  }

  public removeListener(event: string, listener: any): void {
    this.events.removeListener(event, listener);
  }

  public off(event: string, listener: any): void {
    this.events.off(event, listener);
  }

  get isWalletConnect() {
    return true;
  }

  public async pair(pairingTopic: string | undefined): Promise<SessionTypes.Struct> {
     this.shouldAbortPairingAttempt = false;
    let pairingAttempts = 0;
    do {
      console.log("UNIVERSALPROVIDER pairingAttemps = " + pairingAttempts);

      if (this.shouldAbortPairingAttempt) {
        throw new Error("Pairing aborted");
      }

      if (pairingAttempts >= this.maxPairingAttempts) {
        throw new Error("Max auto pairing attempts reached");
      }

      console.log("UNIVERSALPROVIDER AWAIT CLIENT CONNECT");

      const { uri, approval } = await this.client.connect({
        pairingTopic,
        requiredNamespaces: this.namespaces,
        optionalNamespaces: this.optionalNamespaces,
        sessionProperties: this.sessionProperties,
        nymClientPort: this.nymClientPort,
      });

      console.log("UNIVERSALPROVIDER CLIENT CONNECTED");

      if (uri) {
        this.uri = uri;
        this.events.emit("display_uri", uri);
      }

      await approval()
        .then((session) => {
          this.session = session;
          // assign namespaces from session if not already defined
          if (!this.namespaces) {
            this.namespaces = populateNamespacesChains(session.namespaces) as NamespaceConfig;
            this.persist("namespaces", this.namespaces);
          }
        })
        .catch((error) => {
          if (error.message !== PROPOSAL_EXPIRY_MESSAGE) {
            throw error;
          }
          pairingAttempts++;
        });
    } while (!this.session);

    this.onConnect();
    return this.session;
  }

  public setDefaultChain(chain: string, rpcUrl?: string | undefined) {
    try {
      // ignore without active session
      if (!this.session) return;
      const [namespace, chainId] = this.validateChain(chain);
      this.getProvider(namespace).setDefaultChain(chainId, rpcUrl);
    } catch (error) {
      // ignore the error if the fx is used prematurely before namespaces are set
      if (!/Please call connect/.test((error as Error).message)) throw error;
    }
  }

  public async cleanupPendingPairings(opts: PairingsCleanupOpts = {}): Promise<void> {
    this.logger.info("Cleaning up inactive pairings...");
    const inactivePairings = this.client.pairing.getAll();

    if (!isValidArray(inactivePairings)) return;

    for (const pairing of inactivePairings) {
      if (opts.deletePairings) {
        this.client.core.expirer.set(pairing.topic, 0);
      } else {
        await this.client.core.relayer.subscriber.unsubscribe(pairing.topic);
      }
    }

    this.logger.info(`Inactive pairings cleared: ${inactivePairings.length}`);
  }

  public abortPairingAttempt() {
    this.shouldAbortPairingAttempt = true;
  }

  // ---------- Private ----------------------------------------------- //

  private async checkStorage() {
    this.namespaces = await this.getFromStore("namespaces");
    this.optionalNamespaces = (await this.getFromStore("optionalNamespaces")) || {};
    if (this.client.session.length) {
      const lastKeyIndex = this.client.session.keys.length - 1;
      this.session = this.client.session.get(this.client.session.keys[lastKeyIndex]);
      this.createProviders();
    }
  }

  private async initialize() {
    this.logger.trace(`Initialized`);
    await this.connectToMixnet();
    await this.createClient();
    await this.checkStorage();
    this.registerEventListeners();
  }

  private async connectToMixnet(): Promise<WebSocket> {
    const port = this.nymClientPortForHTTP;
    const localClientUrl = "ws://127.0.0.1:" + port;

    // Set up and handle websocket connection to our desktop client.
    this.sharedMixnetWebsocketConnection = await this.connectWebsocket(localClientUrl).then(function (c) {
      return c;
    }).catch((err) => {
      console.log("Websocket connection error on the universalProvider. Is the client running with <pre>--connection-type WebSocket</pre> on port " + port + "?");
      console.log(err);
      return new Promise((_, reject) => {
        reject(err.error);
      });
    });

    return new Promise((resolve, reject) => {
      if (!this.sharedMixnetWebsocketConnection) {
        const err = new Error("Oh no! Could not create client");
        console.error(err);
        reject(err);
      } else {
        resolve(this.sharedMixnetWebsocketConnection);
      }
    });
  }

  // Function that connects our application to the mixnet Websocket. We want to call this when registering.
  private connectWebsocket(url: string): Promise<WebSocket> {
    return new Promise(function (resolve, reject) {
      const server = new WebSocket(url);
      console.log("universalProvider connecting to Mixnet Websocket (Nym Client)...");
      server.onopen = function () {
        resolve(server);
      };
      server.onerror = function (err: any) {
        reject(err);
      };
    });
  }

  private async createClient() {
    this.client =
      this.providerOpts.client ||
      (await SignClient.init({
        logger: this.providerOpts.logger || LOGGER,
        relayUrl: this.providerOpts.relayUrl || RELAY_URL,
        projectId: this.providerOpts.projectId,
        metadata: this.providerOpts.metadata, // fetch metadata automatically if not provided?
        storageOptions: this.providerOpts.storageOptions,
        name: this.providerOpts.name,
        nymClientPort: this.nymClientPort,
      }));

    this.logger.trace(`SignClient Initialized`);
  }

  private createProviders(): void {
    if (!this.client) {
      throw new Error("Sign Client not initialized");
    }

    if (!this.session) {
      throw new Error("Session not initialized. Please call connect() before enable()");
    }

    const providersToCreate = [
      ...new Set(
        Object.keys(this.session.namespaces).map((namespace) => parseNamespaceKey(namespace)),
      ),
    ];

    setGlobal("client", this.client);
    setGlobal("events", this.events);
    setGlobal("disableProviderPing", this.disableProviderPing);

    providersToCreate.forEach((namespace) => {
      if (!this.session) return;
      const accounts = getAccountsFromSession(namespace, this.session);
      const approvedChains = getChainsFromApprovedSession(accounts);
      const mergedNamespaces = mergeRequiredOptionalNamespaces(
        this.namespaces,
        this.optionalNamespaces,
      );
      const combinedNamespace = {
        ...mergedNamespaces[namespace],
        accounts,
        chains: approvedChains,
      };
      switch (namespace) {
        case "eip155":
          this.rpcProviders[namespace] = new Eip155Provider({
            namespace: combinedNamespace,
            sharedMixnetWebsocketConnection: this.sharedMixnetWebsocketConnection,
          });
          break;
        case "solana":
          this.rpcProviders[namespace] = new SolanaProvider({
            namespace: combinedNamespace,
            sharedMixnetWebsocketConnection: this.sharedMixnetWebsocketConnection,
          });
          break;
        case "cosmos":
          this.rpcProviders[namespace] = new CosmosProvider({
            namespace: combinedNamespace,
            sharedMixnetWebsocketConnection: this.sharedMixnetWebsocketConnection,
          });
          break;
        case "polkadot":
          this.rpcProviders[namespace] = new PolkadotProvider({
            namespace: combinedNamespace,
            sharedMixnetWebsocketConnection: this.sharedMixnetWebsocketConnection,
          });
          break;
        case "cip34":
          this.rpcProviders[namespace] = new CardanoProvider({
            namespace: combinedNamespace,
            sharedMixnetWebsocketConnection: this.sharedMixnetWebsocketConnection,
          });
          break;
        case "elrond":
          this.rpcProviders[namespace] = new ElrondProvider({
            namespace: combinedNamespace,
            sharedMixnetWebsocketConnection: this.sharedMixnetWebsocketConnection,
          });
          break;
        case "multiversx":
          this.rpcProviders[namespace] = new MultiversXProvider({
            namespace: combinedNamespace,
            sharedMixnetWebsocketConnection: this.sharedMixnetWebsocketConnection,
          });
          break;
      }
    });
  }

  private registerEventListeners(): void {
    if (typeof this.client === "undefined") {
      throw new Error("Sign Client is not initialized");
    }

    this.client.on("session_ping", (args) => {
      this.events.emit("session_ping", args);
    });

    this.client.on("session_event", (args) => {
      const { params } = args;
      const { event } = params;
      if (event.name === "accountsChanged") {
        const accounts = event.data;
        if (accounts && isValidArray(accounts))
          this.events.emit("accountsChanged", accounts.map(parseCaip10Account));
      } else if (event.name === "chainChanged") {
        this.onChainChanged(params.chainId);
      } else {
        this.events.emit(event.name, event.data);
      }

      this.events.emit("session_event", args);
    });

    this.client.on("session_update", ({ topic, params }) => {
      const { namespaces } = params;
      const _session = this.client?.session.get(topic);
      this.session = { ..._session, namespaces } as SessionTypes.Struct;
      this.onSessionUpdate();
      this.events.emit("session_update", { topic, params });
    });

    this.client.on("session_delete", async (payload) => {
      await this.cleanup();
      this.events.emit("session_delete", payload);
      this.events.emit("disconnect", {
        ...getSdkError("USER_DISCONNECTED"),
        data: payload.topic,
      });
    });

    this.on(PROVIDER_EVENTS.DEFAULT_CHAIN_CHANGED, (caip2ChainId: string) => {
      this.onChainChanged(caip2ChainId, true);
    });
  }

  private getProvider(namespace: string): IProvider {
    if (!this.rpcProviders[namespace]) {
      throw new Error(`Provider not found: ${namespace}`);
    }
    return this.rpcProviders[namespace];
  }

  private onSessionUpdate(): void {
    Object.keys(this.rpcProviders).forEach((namespace: string) => {
      this.getProvider(namespace).updateNamespace(
        this.session?.namespaces[namespace] as SessionTypes.BaseNamespace,
      );
    });
  }

  private setNamespaces(params: ConnectParams): void {
    const { namespaces, optionalNamespaces, sessionProperties } = params;

    if (namespaces && Object.keys(namespaces).length) {
      this.namespaces = namespaces;
    }
    if (optionalNamespaces && Object.keys(optionalNamespaces).length) {
      this.optionalNamespaces = optionalNamespaces;
    }
    this.sessionProperties = sessionProperties;
    this.persist("namespaces", namespaces);
    this.persist("optionalNamespaces", optionalNamespaces);
  }

  private validateChain(chain?: string): [string, string] {
    const [namespace, chainId] = chain?.split(":") || ["", ""];
    if (!this.namespaces || !Object.keys(this.namespaces).length) return [namespace, chainId];
    // validate namespace
    if (namespace) {
      if (
        // some namespaces might be defined with inline chainId e.g. eip155:1
        // and we need to parse them
        !Object.keys(this.namespaces || {})
          .map((key) => parseNamespaceKey(key))
          .includes(namespace)
      ) {
        throw new Error(
          `Namespace '${namespace}' is not configured. Please call connect() first with namespace config.`,
        );
      }
    }
    if (namespace && chainId) {
      return [namespace, chainId];
    }
    const defaultNamespace = parseNamespaceKey(Object.keys(this.namespaces)[0]);
    const defaultChain = this.rpcProviders[defaultNamespace].getDefaultChain();
    return [defaultNamespace, defaultChain];
  }

  private async requestAccounts(): Promise<string[]> {
    const [namespace] = this.validateChain();
    return await this.getProvider(namespace).requestAccounts();
  }

  private onChainChanged(caip2Chain: string, internal = false): void {
    if (!this.namespaces) return;

    const [namespace, chainId] = this.validateChain(caip2Chain);

    if (!internal) {
      this.getProvider(namespace).setDefaultChain(chainId);
    }

    (this.namespaces[namespace] ?? this.namespaces[`${namespace}:${chainId}`]).defaultChain =
      chainId;
    this.persist("namespaces", this.namespaces);
    this.events.emit("chainChanged", chainId);
  }

  private onConnect() {
    this.createProviders();
    this.events.emit("connect", { session: this.session });
  }

  private async cleanup() {
    this.session = undefined;
    this.namespaces = undefined;
    this.optionalNamespaces = undefined;
    this.sessionProperties = undefined;
    this.sharedMixnetWebsocketConnection.close();
    this.persist("namespaces", undefined);
    this.persist("optionalNamespaces", undefined);
    this.persist("sessionProperties", undefined);
    await this.cleanupPendingPairings({ deletePairings: true });
  }

  private persist(key: string, data: unknown) {
    this.client.core.storage.setItem(`${STORAGE}/${key}`, data);
  }

  private async getFromStore(key: string) {
    return await this.client.core.storage.getItem(`${STORAGE}/${key}`);
  }
}
export default UniversalProvider;
