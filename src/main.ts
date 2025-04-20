#!/usr/bin/env node

import { create } from "mqtt-usvc";

import { TuyaClient } from "./tuya-homebridge/client";
import { Config } from "./tuya-homebridge/config";

async function startTuya(config: Config) {
  console.log("Creating client");

  const client = new TuyaClient(config);
  await client.init();

  await client.sendCommand("22110718a4e57c87aa7b", "light", false);

  return client;
}

async function main() {
  const service = await create<Partial<Config>>();
  const client = await startTuya({
    projectType: "2",

    appSchema: "smartlife",
    lang: "en",
    debug: false,

    ...service.config,
  } as Config);

  client.on("device", (e) => {
    service.send(`~/status/${e.id}`, e);
  });
  client.on("status", (e) => {
    for (const status of e.status) {
      if (!status.code) continue;

      service.send(`~/status/${e.id}/${status.code}`, status.value);
    }
  });

  service.on("message", async (topic, data) => {
    try {
      console.log("message", topic);
      if (!topic.startsWith("~/set/")) return;
      const [, , devId, command] = topic.split("/");
      console.info("SET DEVICE", devId, command, data);
      await client.sendCommand(devId, command, data);
    } catch (err) {
      console.error(
        `Unable to handle message. topic=${topic} data=${data} err=${err}`
      );
    }
  });

  service.subscribe("~/set/#");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
