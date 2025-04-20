import axios from "axios";
import Crypto from "crypto-js";
import { v1 as uuid } from "uuid";

import { LogUtil } from "./util/logutil";

const nonce = uuid();

export class TuyaOpenAPI {
  // private assetIDArr: string[] = [];
  // private deviceArr: string[] = [];
  public tokenInfo: {
    accessToken: string;
    refreshToken: string;
    uid: string;
    expire: number;
  } = {
    accessToken: "",
    refreshToken: "",
    uid: "",
    expire: 0,
  };

  constructor(
    private endpoint: string,
    private accessId: string,
    private accessKey: string,
    private log: LogUtil,
    private lang: string = "en"
  ) {}

  private async _refreshAccessTokenIfNeed(path: string) {
    if (this.isLogin() == false) {
      return;
    }

    if (path.startsWith("/v1.0/token")) {
      return;
    }

    if (this.tokenInfo.expire - 60 * 1000 > new Date().getTime()) {
      return;
    }

    this.tokenInfo.accessToken = "";
    let res = await this.get(`/v1.0/token/${this.tokenInfo.refreshToken}`);
    let { access_token, refresh_token, uid, expire } = res.result;
    this.tokenInfo = {
      accessToken: access_token,
      refreshToken: refresh_token,
      uid: uid,
      expire: expire * 1000 + new Date().getTime(),
    };

    return;
  }

  async login(username: string, password: string) {
    let res = await this.post("/v1.0/iot-03/users/login", {
      username: username,
      password: Crypto.SHA256(password).toString().toLowerCase(),
    });
    let { access_token, refresh_token, uid, expire } = res.result;

    this.tokenInfo = {
      accessToken: access_token,
      refreshToken: refresh_token,
      uid: uid,
      expire: expire + new Date().getTime(),
    };

    return res.result;
  }

  isLogin(): boolean {
    return this.tokenInfo && (this.tokenInfo.accessToken as any).count > 0;
  }

  //Get all devices
  async getDeviceList() {
    let assets = await this.getAssets();

    var deviceDataArr: { device_id: string }[] = [];
    var deviceIdArr: string[] = [];
    for (const asset of assets) {
      let res = await this.getDeviceIDList(asset.asset_id);
      deviceDataArr = deviceDataArr.concat(res);
    }

    for (const deviceData of deviceDataArr) {
      deviceIdArr.push(deviceData.device_id);
    }

    let devicesInfoArr = await this.getDeviceListInfo(deviceIdArr);
    let devicesStatusArr = await this.getDeviceListStatus(deviceIdArr);

    let devices: unknown[] = [];
    for (let i = 0; i < devicesInfoArr.length; i++) {
      let functions = await this.getDeviceFunctions(devicesInfoArr[i].id);
      devices.push(
        Object.assign(
          {},
          devicesInfoArr[i],
          functions,
          devicesStatusArr.find((j) => j.id == devicesInfoArr[i].id)
        )
      );
    }
    return devices;
  }

  // Gets a list of human-actionable assets
  private async getAssets() {
    let res = await this.get("/v1.0/iot-03/users/assets", {
      parent_asset_id: null,
      page_no: 0,
      page_size: 100,
    });
    return res.result.assets;
  }

  // Query the list of device IDs under the asset
  async getDeviceIDList(assetID: string) {
    let res = await this.get(`/v1.0/iot-02/assets/${assetID}/devices`);
    return res.result.list;
  }

  // Gets the device instruction set
  async getDeviceFunctions(deviceID: string) {
    let res = await this.get(`/v1.0/iot-03/devices/${deviceID}/functions`);
    return res.result;
  }

  // Get individual device information
  async getDeviceInfo(deviceID: string) {
    let res = await this.get(`/v1.0/iot-03/devices/${deviceID}`);
    return res.result;
  }

  // Batch access to device information
  async getDeviceListInfo(devIds: string[] = []) {
    if (devIds.length == 0) {
      return [];
    }
    let res = await this.get(`/v1.0/iot-03/devices`, {
      device_ids: devIds.join(","),
    });
    return res.result.list;
  }

  // Gets the individual device state
  async getDeviceStatus(deviceID) {
    let res = await this.get(`/v1.0/iot-03/devices/${deviceID}/status`);
    return res.result;
  }

  // Batch access to device status
  async getDeviceListStatus(devIds: string[] = []) {
    if (devIds.length == 0) {
      return [];
    }
    let res = await this.get(`/v1.0/iot-03/devices/status`, {
      device_ids: devIds.join(","),
    });
    return res.result;
  }

  async sendCommand(deviceID: string, params: unknown) {
    let res = await this.post(
      `/v1.0/iot-03/devices/${deviceID}/commands`,
      params
    );
    return res.result;
  }

  private async request(
    method: string,
    path: string,
    params: unknown | null = null,
    body: unknown | null = null
  ) {
    await this._refreshAccessTokenIfNeed(path);

    let now = new Date().getTime();
    let access_token = this.tokenInfo.accessToken || "";
    let stringToSign = this._getStringToSign(method, path, params, body);
    let headers = {
      t: `${now}`,
      client_id: this.accessId,
      nonce: nonce,
      "Signature-Headers": "client_id",
      sign: this._getSign(
        this.accessId,
        this.accessKey,
        access_token,
        now,
        stringToSign
      ),
      sign_method: "HMAC-SHA256",
      access_token: access_token,
      lang: this.lang,
      dev_lang: "javascript",
      dev_channel: "homebridge",
      devVersion: "1.5.0",
    };
    this.log.log(
      `TuyaOpenAPI request: method = ${method}, endpoint = ${
        this.endpoint
      }, path = ${path}, params = ${JSON.stringify(
        params
      )}, body = ${JSON.stringify(body)}, headers = ${JSON.stringify(headers)}`
    );

    let res = await axios({
      baseURL: this.endpoint,
      url: path,
      method: method,
      headers: headers,
      params: params,
      data: body,
    });

    this.log.log(
      `TuyaOpenAPI response: ${JSON.stringify(res.data)} path = ${path}`
    );
    return res.data;
  }

  async get(path: string, params?: unknown) {
    return this.request("get", path, params, null);
  }

  async post(path: string, params?: unknown) {
    return this.request("post", path, null, params);
  }

  private _getSign(
    access_id: string,
    access_key: string,
    access_token: string = "",
    timestamp: number = 0,
    stringToSign: string
  ): string {
    let message =
      access_id + access_token + `${timestamp}` + nonce + stringToSign;
    let hash = Crypto.HmacSHA256(message, access_key);
    let sign = hash.toString().toUpperCase();
    return sign;
  }

  private _getStringToSign(
    method: string,
    path: string,
    params: unknown,
    body: unknown
  ) {
    let httpMethod = method.toUpperCase();
    let bodyStream;
    if (body) {
      bodyStream = JSON.stringify(body);
    } else {
      bodyStream = "";
    }

    let contentSHA256 = Crypto.SHA256(bodyStream);
    let headers = "client_id" + ":" + this.accessId + "\n";
    let url = this._getSignUrl(path, params);
    let result =
      httpMethod + "\n" + contentSHA256 + "\n" + headers + "\n" + url;
    return result;
  }

  private _getSignUrl(path: string, obj: unknown) {
    if (!obj) {
      return path;
    } else {
      var i,
        url = "";
      for (i in obj) url += "&" + i + "=" + obj[i];
      return path + "?" + url.substr(1);
    }
  }
}
