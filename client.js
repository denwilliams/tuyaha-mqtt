const got = require("got");

class Client {
  constructor({
    username,
    password,
    region = "us",
    countryCode = "1",
    bizType = "smart_life",
    credentials = null,
  }) {
    this.username = username;
    this.password = password;
    this.region = region;
    this.bizType = bizType;
    this.countryCode = countryCode;
    this.baseUrl = `https://px1.tuya${region}.com`;
    this.from = "tuya";
    this.credentials = credentials;
  }

  async login() {
    console.log("Logging in");
    const body = await got
      .post(this.baseUrl + "/homeassistant/auth.do", {
        form: {
          userName: this.username,
          password: this.password,
          countryCode: this.countryCode,
          bizType: this.bizType,
          from: this.from,
        },
      })
      .json();

    if (body.responseStatus && body.responseStatus === "error") {
      throw new Error(body.errorMsg);
    }
    console.log(body);

    return body;
  }

  async getDevices() {
    const response = await this.skill({
      name: "Discovery",
      namespace: "discovery",
      payloadVersion: 1,
    });
    return response.payload.devices;
  }

  async setState(devId, { command = "turnOnOff", value = 0 }) {
    const header = {
      name: command,
      namespace: "control",
    };
    const payload = {
      devId,
      value,
    };

    return this.skill(header, payload);
  }

  async skill(_header = {}, _payload = {}) {
    if (!this.credentials) {
      this.credentials = await this.login();
    }

    const header = {
      ..._header,
      payloadVersion: 1,
    };
    const payload = { ..._payload, accessToken: this.credentials.access_token };
    const data = { header: header, payload: payload };

    const response = await got
      .post(this.baseUrl + "/homeassistant/skill", {
        json: data,
      })
      .json();

    // console.log(response);

    return response;
  }
}

exports.Client = Client;
