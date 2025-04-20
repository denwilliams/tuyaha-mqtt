import axios from "axios";
import Crypto from "crypto-js";
import { v1 as uuid } from "uuid";
import { CountryUtil } from "./util/countryutil";
import { LogUtil } from "./util/logutil";

const nonce = uuid();

export class TuyaSHOpenAPI {
  private endpoint: string;
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
  private readonly assetIDArr: string[] = [];
  private readonly deviceArr: string[] = [];

  constructor(
    private readonly accessId: string,
    private readonly accessKey: string,
    private readonly username: string,
    private readonly password: string,
    private readonly countryCode: number,
    private readonly appSchema: string,
    private readonly log: LogUtil,
    private readonly lang: string = "en"
  ) {
    this.endpoint = this.countryCode
      ? new CountryUtil().getEndPointWithCountryCode(this.countryCode)
      : "https://openapi.tuyaus.com";
  }

  private async _refreshAccessTokenIfNeed(path) {
    if (
      path.startsWith("/v1.0/iot-01/associated-users/actions/authorized-login")
    ) {
      return;
    }

    if (this.tokenInfo.expire - 60 * 1000 > new Date().getTime()) {
      return;
    }

    this.tokenInfo.accessToken = "";
    const md5pwd = Crypto.MD5(this.password).toString();
    let res = await this.post(
      `/v1.0/iot-01/associated-users/actions/authorized-login`,
      {
        country_code: this.countryCode,
        username: this.username,
        password: md5pwd,
        schema: this.appSchema,
      }
    );
    let { access_token, refresh_token, uid, expire_time, platform_url } =
      res.result;
    this.endpoint = platform_url ? platform_url : this.endpoint;
    this.tokenInfo = {
      accessToken: access_token,
      refreshToken: refresh_token,
      uid: uid,
      expire: expire_time * 1000 + new Date().getTime(),
    };

    return;
  }

  //Gets the list of devices under the associated user
  async getDevices() {
    let res = await this.get(`/v1.0/iot-01/associated-users/devices`, {
      size: 100,
    });

    // todo check res.success
    // if (!res.success) {
    //   console.error(`TuyaOpenAPI getDevices error: ${JSON.stringify(res)}`);
    //   throw new Error(`TuyaOpenAPI getDevices error`);
    // }

    let tempIds: string[] = [];
    for (let i = 0; i < res.result.devices.length; i++) {
      tempIds.push(res.result.devices[i].id);
    }
    let deviceIds = this._refactoringIdsGroup(tempIds, 20);
    let devicesFunctions: { devices: string[] }[] = [];
    for (let ids of deviceIds) {
      let functions = await this.getDevicesFunctions(ids);
      devicesFunctions.push.apply(devicesFunctions, functions);
    }
    let devices: unknown[] = [];
    if (devicesFunctions) {
      for (let i = 0; i < res.result.devices.length; i++) {
        devices.push(
          Object.assign(
            {},
            res.result.devices[i],
            devicesFunctions.find(
              (j) => j.devices[0] == res.result.devices[i].id
            )
          )
        );
      }
    } else {
      devices = res.result.devices;
    }

    return devices;
  }

  private _refactoringIdsGroup(array: string[], subGroupLength: number) {
    let index = 0;
    let newArray: string[][] = [];
    while (index < array.length) {
      newArray.push(array.slice(index, (index += subGroupLength)));
    }
    return newArray;
  }

  // single device gets the instruction set
  async getDeviceFunctions(deviceID: string) {
    let res = await this.get(`/v1.0/devices/${deviceID}/functions`);
    return res.result;
  }

  // Batch access to device instruction sets
  async getDevicesFunctions(devIds: string[] = []) {
    let res = await this.get(`/v1.0/devices/functions`, {
      device_ids: devIds.join(","),
    });
    return res.result;
  }

  // Get individual device details
  async getDeviceInfo(deviceID: string) {
    let res = await this.get(`/v1.0/devices/${deviceID}`);
    return res.result;
  }

  // Batch access to device details
  async getDeviceListInfo(devIds: string[] = []) {
    if (devIds.length == 0) {
      return [];
    }
    let res = await this.get(`/v1.0/devices`, { device_ids: devIds.join(",") });
    return res.result.list;
  }

  // Gets the individual device state
  async getDeviceStatus(deviceID: string) {
    let res = await this.get(`/v1.0/devices/${deviceID}/status`);
    return res.result;
  }

  // Remove the device based on the device ID
  async removeDevice(deviceID: string) {
    let res = await this.delete(`/v1.0/devices/${deviceID}`);
    return res.result;
  }

  // sendCommand
  async sendCommand(deviceID: string, params?: unknown) {
    let res = await this.post(`/v1.0/devices/${deviceID}/commands`, params);
    return res.result;
  }

  private async request(
    method: string,
    path: string,
    params: unknown | null = null,
    body: unknown | null = null
  ) {
    try {
      await this._refreshAccessTokenIfNeed(path);
    } catch (e) {
      this.log.log(e);
      this.log.log(`Attention⚠️ ⚠️ ⚠️ ! You get an error!`);
      // this.log.log('Please confirm that the Access ID and Access Secret of the Smart Home PaaS project you are using were created after May 25, 2021.')
      // this.log.log('Please linked devices by using Tuya Smart or Smart Life app in your cloud project.')
      return;
    }

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

  async delete(path: string, params?: unknown) {
    return this.request("delete", path, params, null);
  }

  private _getSign(
    access_id: string,
    access_key: string,
    access_token: string = "",
    timestamp: number = 0,
    stringToSign: string
  ) {
    let message =
      access_id + access_token + `${timestamp}` + nonce + stringToSign;
    let hash = Crypto.HmacSHA256(message, access_key);
    let sign = hash.toString().toUpperCase();
    return sign;
  }

  private _getStringToSign(
    method: string,
    path: string,
    params?: unknown,
    body?: unknown
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

  private _getSignUrl(path: string, obj?: unknown) {
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
