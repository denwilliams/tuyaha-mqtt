# tuyaha-mqtt

> NOTE: UNSTABLE TRIAL VERSION - USING API AS PER HOMEBRIDGE PLUGIN

BREAKING MQTT API CHANGE FROM PREVIOUS VERSION.

Somewhat replicates the homebridge plugin [tuya-homebridge](https://github.com/tuya/tuya-homebridge), but strips out all the accessory stuff and replaces it with a simple MQTT interface.

Very early version. Quite untested.

Also wanted to look into using https://github.com/tuya/tuya-connector-nodejs but limited documentation.

## Configuration

This uses [mqtt-usvc](https://github.com/denwilliams/mqtt-usvc) which can be configured using a YAML file, environment variables, or using Consul KV.

Example config YML:

```yml
mqtt:
  # URL to connect to MQTT server on
  uri: mqtt://user:password@192.168.1.123
  # Prefix for inbound/outbound MQTT topic
  prefix: tuya
service:
  region: "us" # cn, eu, us. choose the closest.
  countryCode: "1" # Your account country code, e.g., 1 for USA or 86 for China
  bizType: "smart_life" # tuya, smart_life, etc
  username: "youremail@example.com" # Could also be a phone number
  password: "yourpassword" # suggest creating a service account for this and not using your main account
```

## Notes

I have to disable IPv6 to use this (or the homebridge plugin). Likely has more to do with my ISP that anything else.

## Events Published (Output)

Assuming using a prefix of `tuya` any device discovered is emitted on `tuya/status/{device_id}`.

Any status change is emitted on `tuya/status/{device_id}/{status_code}`.

If the service is started all devices will have their current statuses re-emitted.

## Command Events (Input)

Assuming using a prefix of `tuya` you can change state via commands sent to `tuya/set/{device_id}/{command_code}`. with a value of the desired new state.

TBD: allow sending multiple commands in a single message.
