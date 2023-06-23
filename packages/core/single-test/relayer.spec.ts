import { expect, describe, it, beforeEach, afterEach } from "vitest";
import { getDefaultLoggerOptions, pino } from "@walletconnect/logger";
import { JsonRpcProvider } from "@walletconnect/jsonrpc-provider";

import {
  Core,
  CORE_DEFAULT,
  Relayer,
  RELAYER_EVENTS,
  RELAYER_PROVIDER_EVENTS,
  RELAYER_SUBSCRIBER_SUFFIX,
  RELAYER_TRANSPORT_CUTOFF,
  SUBSCRIBER_EVENTS,
} from "../src";
import { disconnectSocket, TEST_CORE_OPTIONS, throttle } from "./../test/shared";
import { ICore, IRelayer } from "@walletconnect/types";
import Sinon from "sinon";
import { JsonRpcRequest } from "@walletconnect/jsonrpc-utils";
import { generateRandomBytes32, hashMessage } from "@walletconnect/utils";

// Careful that for this test to pass, it needs to have two Nym clients running + the SP running connected to one of the Nym Client!

describe("Relayer", () => {
  const logger = pino(getDefaultLoggerOptions({ level: CORE_DEFAULT.logger }));

  let core: ICore;
  let relayer: IRelayer;

  beforeEach(async () => {
    core = new Core(TEST_CORE_OPTIONS);
    await core.start();
    relayer = core.relayer;
  });

  afterEach(async () => {
    await disconnectSocket(core.relayer);
  });

  describe("subscribe", () => {
    // let relayer;
    // beforeEach(async () => {
    //   relayer = new Relayer({
    //     core,
    //     logger,
    //     relayUrl: TEST_CORE_OPTIONS.relayUrl,
    //     projectId: TEST_CORE_OPTIONS.projectId,
    //   });
    //   await relayer.init();
    // });
    // afterEach(async () => {
    //   await disconnectSocket(relayer);
    // });

    it("returns the id provided by calling `subscriber.subscribe` with the passed topic", async () => {
      const spy = Sinon.spy(() => "mock-id");
      relayer.subscriber.subscribe = spy;
      let id;
      await Promise.all([
        new Promise<void>(async (resolve) => {
          id = await relayer.subscribe("abc123");
          resolve();
        }),
        new Promise<void>((resolve) => {
          relayer.subscriber.events.emit(SUBSCRIBER_EVENTS.created, { topic: "abc123" });
          resolve();
        }),
      ]);
      // @ts-expect-error
      expect(spy.calledOnceWith("abc123")).to.be.true;
      expect(id).to.eq("mock-id");
    });
  });
});
