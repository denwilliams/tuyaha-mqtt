import mqtt, { MqttClient } from "mqtt";
import { v1 as uuid } from "uuid";
import Crypto from "crypto";
import CryptoJS from "crypto-js";

import { LogUtil } from "./util/logutil";
import { TuyaOpenAPI } from "./tuyaopenapi";
import { TuyaSHOpenAPI } from "./tuyashopenapi";

const LINK_ID = uuid();
const GCM_TAG_LENGTH = 16;
// var debuglog;

export class TuyaOpenMQ {
  private running: boolean = false;
  private client: MqttClient | null = null;
  private message_listeners: Set<Function> = new Set();
  private deviceTopic: string = "";

  constructor(
    private api: TuyaOpenAPI | TuyaSHOpenAPI,
    private type: string,
    private log: LogUtil
  ) {}

  start() {
    this.running = true;
    this._loopStart();
  }

  stop() {
    this.running = false;
    if (this.client) {
      this.client.end();
    }
  }

  private async _loopStart() {
    while (this.running) {
      let res = await this._getMQConfig("mqtt");
      if (res.success == false) {
        this.stop();
        break;
      }

      let mqConfig = res.result;
      let {
        url,
        client_id,
        username,
        password,
        expire_time,
        source_topic,
        sink_topic,
      } = mqConfig;
      this.deviceTopic = source_topic.device;
      this.log.log(`TuyaOpenMQ connecting: ${url}`);
      let client = mqtt.connect(url, {
        clientId: client_id,
        username: username,
        password: password,
      });

      client.on("connect", this._onConnect.bind(this));
      client.on("error", this._onError.bind(this));
      client.on("end", this._onEnd.bind(this));
      client.on("message", (topic, payload, packet) =>
        this._onMessage(client, mqConfig, topic, payload)
      );
      client.subscribe(this.deviceTopic);

      if (this.client) {
        this.client.end();
      }
      this.client = client;

      // reconnect every 2 hours required
      await new Promise((r) => setTimeout(r, (expire_time - 60) * 1000));
    }
  }

  async _getMQConfig(linkType: string) {
    let res = await this.api.post("/v1.0/iot-03/open-hub/access-config", {
      uid: this.api.tokenInfo.uid,
      link_id: LINK_ID,
      link_type: linkType,
      topics: "device",
      msg_encrypted_version: this.type,
    });
    return res;
  }

  _onConnect() {
    this.log.log("TuyaOpenMQ connected");
  }

  _onError(err) {
    this.log.log("TuyaOpenMQ error:", err);
  }

  _onEnd() {
    this.log.log("TuyaOpenMQ end");
  }

  _onMessage(client, mqConfig, topic, payload) {
    let message = JSON.parse(payload.toString());
    message.data = JSON.parse(
      this.type == "2.0"
        ? this._decodeMQMessage(message.data, mqConfig.password, message.t)
        : this._decodeMQMessage_1_0(message.data, mqConfig.password)
    );
    this.log.log(
      `TuyaOpenMQ onMessage: topic = ${topic}, message = ${JSON.stringify(
        message
      )}`
    );
    this.message_listeners.forEach((listener) => {
      if (this.deviceTopic == topic) {
        listener(message.data);
      }
    });
  }

  // 1.0
  _decodeMQMessage_1_0(b64msg, password) {
    password = password.substring(8, 24);
    let msg = CryptoJS.AES.decrypt(b64msg, CryptoJS.enc.Utf8.parse(password), {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    }).toString(CryptoJS.enc.Utf8);
    return msg;
  }

  _decodeMQMessage(data, password, t) {
    // Base64 decoding generates Buffers
    var tmpbuffer = Buffer.from(data, "base64");
    var key = password.substring(8, 24).toString("utf8");
    //get iv_length & iv_buffer
    var iv_length = tmpbuffer.readUIntBE(0, 4);
    var iv_buffer = tmpbuffer.slice(4, iv_length + 4);
    //Removes the IV bits of the head and 16 bits of the tail tags
    var data_buffer = tmpbuffer.slice(
      iv_length + 4,
      tmpbuffer.length - GCM_TAG_LENGTH
    );
    var cipher = Crypto.createDecipheriv("aes-128-gcm", key, iv_buffer);
    //setAuthTag buffer
    cipher.setAuthTag(
      tmpbuffer.slice(tmpbuffer.length - GCM_TAG_LENGTH, tmpbuffer.length)
    );
    //setAAD buffer
    const buf = Buffer.allocUnsafe(6);
    buf.writeUIntBE(t, 0, 6);
    cipher.setAAD(buf);

    var msg = cipher.update(data_buffer);
    return msg.toString("utf8");
  }

  addMessageListener(listener) {
    this.message_listeners.add(listener);
  }

  removeMessageListener(listener) {
    this.message_listeners.delete(listener);
  }
}
