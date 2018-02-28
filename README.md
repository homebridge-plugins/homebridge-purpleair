# Homebridge-airly
[![NPM Version](https://img.shields.io/npm/v/homebridge-airly.svg)](https://www.npmjs.com/package/homebridge-airly)

**Homebridge plugin that is showing information about air quality from Airly API.**

Project is based on [homebridge-weather](https://github.com/werthdavid/homebridge-weather) and [homebridge-arinow](https://github.com/ToddGreenfield/homebridge-airnow).

Currently **Airly** is supporting only Polish localizations.

## Instalation
1. Install Homebridge using: `(sudo) npm install -g --unsafe-perm homebridge`.
1. Install this plugin using: `(sudo) npm install -g homebridge-airly`.
1. Get **API Key** from Airly. Login here <https://developer.airly.eu/login> and generate it.
1. Find out your coordinates (latitude and longitude). Based on that information Airly will show measurements from nearest sensor. You can use this page <https://www.latlong.net/>.
1. Update your configuration file like the example below.

This plugin is returning data such as: AQI (Air Quality Index), PM2.5, PM10.

## Configuration
Example config.json

```json
"accessories": [
    {
          "accessory": "Air",
          "apikey": "YOUR_API_KEY",
          "latitude": "YOUR_LATITUDE",
          "longitude": "YOUR_LONGITUDE",
          "name": "Airly Air Quality"
    }
]
```

## Config file
Fields:
- `accessory` must be "Air' (required).
- `apikey` API key from Airly Developers (required).
- `latitude` String with your latitude e.g. `"52.229676"` (required).
- `longitude` String with your longitude e.g. `"21.012229"` (required).
- `name` Is the name of accessory (required).