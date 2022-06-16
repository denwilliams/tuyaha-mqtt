#!/usr/bin/env node
"use strict";

const mqttusvc = require("mqtt-usvc");
const deepEqual = require("deep-equal");

const { Client } = require("./client");

async function main() {
  const service = await mqttusvc.create();

  const client = new Client(service.config);

  const state = {};

  async function poll() {
    const devices = await client.getDevices();
    devices.forEach((device) => {
      if (state[device.id] && deepEqual(state[device.id].data, device.data)) {
        return;
      }
      state[device.id] = device;
      service.send(`~/status/${device.id}`, {
        name: device.name,
        type: device.ha_type,
        ...device.data,
      });
    });
  }

  setInterval(() => {
    poll();
  }, 30000);

  service.on("message", async (topic, data) => {
    try {
      console.log("message", topic);
      if (!topic.startsWith("~/set/")) return;
      const [, , devId] = topic.split("/");
      console.info("SET DEVICE", devId, data);

      const commands = Array.isArray(data) ? data : [data];

      for (let cmd of commands) {
        console.log("SET STATE", devId, cmd);
        await client.setState(devId, cmd);
      }
      await poll();
    } catch (err) {
      console.error(
        `Unable to handle message. topic=${topic} data=${data} err=${err}`
      );
    }
  });

  service.subscribe("~/set/#");

  poll();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
