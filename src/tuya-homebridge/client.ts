import EventEmitter from "node:events";
import { setTimeout } from "node:timers/promises";
import { TuyaOpenAPI } from "./tuyaopenapi";
import { TuyaSHOpenAPI } from "./tuyashopenapi";
import { TuyaOpenMQ } from "./tuyamqttapi";
import { LogUtil } from "./util/logutil";
import { CountryUtil } from "./util/countryutil";

import { Config, ProjectTypeCustom } from "./config";

type DeviceStatus = {
  code: string;
  value: boolean | string | number;
};

type DeviceFunction = {
  code: string;
  desc: string;
  name: string;
  type: "Boolean" | "Enum" | "String";
  /** Describes permitted values, JSON encoded */
  values: string;
};

type Device = {
  active_time: number; // ts
  biz_type: 18;
  category:
    | "wg2"
    | "fs"
    | "fskg"
    | "dj"
    | "dd"
    | "fwd"
    | "tgq"
    | "xdd"
    | "dc"
    | "tgkg"
    | "cz"
    | "pc"
    | "kg"
    | "tdq"
    | "cl"
    | "mcs"
    | "rqbj"
    | "jwbj";
  create_time: number; // ts
  icon: string; // "smart/icon/ay1545813662186VvWHx/d84a49cf8f3278ab414846ba504568df.png";
  id: string;
  ip: string; // "1.2.3.4";
  lat: string; //"-37.1234";
  local_key: string;
  lon: string; // "144.9876";
  model: "QT-GW-Z";
  name: string;
  Gateway;
  online: false;
  owner_id: string; // "1234";
  product_id: string;
  product_name: string;
  status: DeviceStatus[];
  sub: boolean;
  time_zone: string; // "+10:00";
  uid: string;
  update_time: number; // ts
  uuid: string;
  devices: string[];
  functions: DeviceFunction[];
};

function getDeviceCategoryName(deviceCategory: string) {
  switch (deviceCategory) {
    case "kj":
      return "AirPurifier";
    case "dj":
    case "dd":
    case "fwd":
    case "tgq":
    case "xdd":
    case "dc":
    case "tgkg":
      return "Light";
    case "cz":
    case "pc":
      return "Outlet";
    case "kg":
    case "tdq":
      return "Switch";
    case "fs":
    case "fskg":
      return "Fan";
    case "ywbj":
      return "SmokeSensor";
    case "qn":
      return "Heater";
    case "ckmkzq":
      return "GarageDoor";
    case "cl":
      return "WindowCovering";
    case "mcs":
      return "ContactSensor";
    case "rqbj":
    case "jwbj":
      return "LeakSensor";
    default:
      return "Unknown";
  }
}

export class TuyaClient extends EventEmitter {
  private tuyaOpenApi?: TuyaOpenAPI | TuyaSHOpenAPI;
  private tuyaOpenMQ?: TuyaOpenMQ;
  private readonly log: LogUtil;
  private readonly accessories: Map<string, unknown> = new Map();
  private readonly deviceAccessories: Map<string, unknown> = new Map();
  private readonly devices: Map<string, Device> = new Map();

  constructor(private config: Config) {
    super();
    this.log = new LogUtil(config.debug);
  }

  async init() {
    const config = this.config;
    let devices: Device[] = [];
    let api: TuyaOpenAPI | TuyaSHOpenAPI;

    if (config.projectType == ProjectTypeCustom) {
      const endpoint = new CountryUtil().getEndPointWithCountryCode(
        config.countryCode
      );
      api = new TuyaOpenAPI(
        endpoint,
        config.accessId,
        config.accessKey,
        this.log
      );
      this.tuyaOpenApi = api;
      //login before everything start
      await api.login(config.username, config.password);
      //init Mqtt service and register some Listener
      try {
        devices = (await api.getDeviceList()) as Device[];
      } catch (e) {
        // this.log.log(JSON.stringify(e.message));
        this.log.log(
          "Failed to get device information. Please check if the config.json is correct."
        );
        throw e;
      }
    } else {
      // console.log("config", config);
      api = new TuyaSHOpenAPI(
        config.accessId,
        config.accessKey,
        config.username,
        config.password,
        config.countryCode,
        config.appSchema,
        this.log
      );
      this.tuyaOpenApi = api;

      try {
        devices = (await api.getDevices()) as Device[];
      } catch (e) {
        // this.log.log(JSON.stringify(e.message));
        this.log.log(
          "Failed to get device information. Please check if the config.json is correct."
        );
        throw e;
      }
    }

    // console.log("devices", devices);

    for (const device of devices) {
      // console.log("Device", device);
      this.addAccessory(device);
    }

    const type = config.projectType == "1" ? "2.0" : "1.0";
    let mq = new TuyaOpenMQ(api, type, this.log);
    console.log("mq", mq);
    this.tuyaOpenMQ = mq;
    this.tuyaOpenMQ.start();
    this.tuyaOpenMQ.addMessageListener(this.onMQTTMessage.bind(this));
    await setTimeout(100);
  }

  addAccessory(device: Device) {
    this.devices[device.id] = device;

    this.emitDeviceFound(device);
    this.log.log(
      `Adding: ${device.name || "unnamed"} (${device.category} / ${device.id})`
    );
  }

  private emitDeviceFound(device: Device) {
    this.emit("device", {
      id: device.id,
      online: device.online,
      name: device.name,
      category: device.category,
      categoryName: getDeviceCategoryName(device.category),
      functions: device.functions,
    });
    this.emitDeviceStatus(device.id, device.status);
  }

  //Handle device deletion, addition, status update
  private async onMQTTMessage(message) {
    if (message.bizCode) {
      if (message.bizCode == "delete") {
        this.devices.delete(message.devId);
      } else if (message.bizCode == "bindUser") {
        let deviceInfo = await this.tuyaOpenApi!.getDeviceInfo(
          message.bizData.devId
        );
        let functions = await this.tuyaOpenApi!.getDeviceFunctions(
          message.bizData.devId
        );
        let device = Object.assign(deviceInfo, functions);
        this.addAccessory(device);
      }
    } else {
      this.emitDeviceStatus(message.devId, message.status);
    }
  }

  private async emitDeviceStatus(deviceId: string, status: DeviceStatus[]) {
    this.emit("status", { deviceId, status });
  }

  async sendCommand(deviceId: string, code: string, value: unknown) {
    await this.tuyaOpenApi!.sendCommand(deviceId, {
      commands: [{ code: code, value: value }],
    });
  }
}
