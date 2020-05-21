# tuyaha-mqtt

Interacts with Tuya Cloud using the Home Assistant API, publishes state changes over MQTT and allows control of device state by sending MQTT messages.

The Home Assistant API is undocumented, limited functionality, and doesn't support all devices. Seems likely this API might disappear at some stage.

Unfortunately there aren't any nice alternatives at the moment, they all require hacks to get running.

> NOTE: this is still works-in-progress. May be unstable and not fully tested.

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
  password: "yourpassword"
  # If you supply credentials it will use these, else it will log in
  credentials:
    access_token: longaccesstokenfrompastlogin
```

## Events Published (Output)

Assuming using a prefix of `tuya` any state change for a detected device is emitted on `tuya/status/{device_id}`.

If the service is started all devices will have their status re-emitted.

Examples:

```

```

## Control Events (Input)

Assuming using a prefix of `tuya` you can change state via commands sent to `tuya/set/{device_id}`.

You can send either a single command (object) or multiple (array). You can see the known commands in the [Python library used for Home Assistant](https://github.com/PaulAnnekov/tuyaha/tree/master/tuyaha/devices). Examples are turnOnOff brightnessSet colorSet startStop windSpeedSet modeSet temperatureSet.

### Examples:

Turn something on:

```json
{ "command": "turnOnOff", "value": 1 }
```

Turn something off:

```json
{ "command": "turnOnOff", "value": 0 }
```

Set brightness of a light. Comments seem to indicate this is 0-255, but the ones I own seem to work between 0-100.
This doesn't seem to match the returned brightness from my lights. I get a value 0-1000, and not even linear

```json
{ "command": "brightnessSet", "value": 50 }
```

Turn on and set brightness to 50:

```json
[
  { "command": "turnOnOff", "value": 1 },
  { "command": "brightnessSet", "value": 50 }
]
```
