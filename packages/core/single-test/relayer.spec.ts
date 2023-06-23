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

  // afterEach(async () => {
  //   await disconnectSocket(core.relayer);
  // });

  describe("subscribe", () => {
    let relayer;
    beforeEach(async () => {
      await disconnectSocket(core.relayer);
      relayer = new Relayer({
        core,
        logger,
        relayUrl: TEST_CORE_OPTIONS.relayUrl,
        projectId: TEST_CORE_OPTIONS.projectId,
      });
      await relayer.init();
    });
    afterEach(async () => {
      await disconnectSocket(relayer);
    });

    // This test do not check that the SP/Relay correctly receives the message.
    // Actually worse, the subscribe function is mocked and never executed!
    // But connection to the relay works properly through the SP!! It's just not sending the subscribe.
/*    it("returns the id provided by calling `subscriber.subscribe` with the passed topic", async () => {
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
    });*/

    // While this test do not properly check what is return as a message, my client logs the received message (currently)
    // And the relay do properly send responses through the SP, and then through the service provider.
    it("should be able to resubscribe on topic that already exists", async () => {
      const topic = generateRandomBytes32();
      const id = await relayer.subscribe(topic);
      const expectedId = hashMessage(topic + (await core.crypto.getClientId()));
      const a = await relayer.subscribe(topic);
      const b = await relayer.subscribe(topic);
      const c = await relayer.subscribe(topic);
      expect(a).to.equal(id);
      expect(a).to.equal(b);
      expect(b).to.equal(c);
      expect(a).to.equal(expectedId);
      expect(b).to.equal(expectedId);
      expect(c).to.equal(expectedId);
      expect(id).to.equal(expectedId);
    });
  });
});
