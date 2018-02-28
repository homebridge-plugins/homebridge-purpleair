"use strict";

var Service, Characteristic;
var airService;
var request = require('request');

module.exports = function (homebridge) {

    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory("homebridge-airly", "Air", AirAccessory);

};


/**
 * Air Accessory
 */
function AirAccessory(log, config) {
    this.log = log;

    // Name and API key from airly
    this.name = config['name'];
    this.apikey = config['apikey'];

    // Latitude and longitude
    this.latitude = config['latitude'];
    this.longitude = config['longitude'];


    if (!this.latitude) throw new Error("Airly - you must provide a config value for 'latitude'.");
    if (!this.longitude) throw new Error("Airly - you must provide a config value for 'longitude'.");


    this.lastupdate = 0;
    this.cache = undefined;

    this.log.info("Airly is working");
}


AirAccessory.prototype = {

    getAir: function (callback) {
        this.getAirData(function (a) {
            callback(null, a);
        });
    },

    /**
     * Get all Air data from airly
     */
    getAirData: function (callback) {
        var self = this;
        var aqi = 0;
        var url = 'https://airapi.airly.eu/v1/nearestSensor/measurements?latitude=' + this.latitude + '&longitude=' + this.longitude;


        // Make request only every two minutes
        if (this.lastupdate === 0 || this.lastupdate + 120 < (new Date().getTime() / 1000) || this.cache === undefined) {

            request({
                url: url,
                json: true,
                headers: {
                    'apikey': self.apikey
                }
            }, function (err, response, data) {

                // If no errors
                if (!err && response.statusCode === 200) {

                    aqi = self.updateData(data, 'Fetch');
                    callback(self.transformAQI(aqi));

                    // If error
                } else {
                    self.airService.setCharacteristic(Characteristic.StatusFault, 0);
                    self.log.error("Airly Network or Unknown Error.");
                    callback(err);
                }

            });

        // Return cached data
        } else {
            aqi = self.updateData(self.cache, 'Cache');
            callback(self.transformAQI(aqi));
        }
    },


    /**
     * Update data
     */
    updateData: function (data, type) {

        this.airService.setCharacteristic(Characteristic.StatusFault, 1);

        this.airService.setCharacteristic(Characteristic.PM2_5Density, parseFloat(data.pm25));
        this.airService.setCharacteristic(Characteristic.PM10Density, parseFloat(data.pm10));

        var aqi = data.airQualityIndex;
        this.log.info("[%s] Airly air quality is: %s.", type, aqi.toString());

        this.cache = data;

        if (type === 'Fetch')
            this.lastupdate = new Date().getTime() / 1000;

        return aqi;
    },


    /**
     * Return Air Quality Index
     * @param aqi
     * @returns {number}
     */
    transformAQI: function (aqi) {
        if (!aqi) {
            return (0); // Error or unknown response
        } else if (aqi <= 25) {
            return (1); // Return EXCELLENT
        } else if (aqi > 25 && aqi <= 50) {
            return (2); // Return GOOD
        } else if (aqi > 50 && aqi <= 75) {
            return (3); // Return FAIR
        } else if (aqi > 75 && aqi <= 100) {
            return (4); // Return INFERIOR
        } else if (aqi > 100) {
            return (5); // Return POOR (Homekit only goes to cat 5, so combined the last two AQI cats of Very Unhealty and Hazardous.
        } else {
            return (0); // Error or unknown response.
        }
    },

    identify: function (callback) {
        this.log("Identify requested!");
        callback(); // success
    },


    getServices: function () {
        var services = [];
        var informationService = new Service.AccessoryInformation();

        informationService
            .setCharacteristic(Characteristic.Manufacturer, "Airly")
            .setCharacteristic(Characteristic.Model, "API")
            .setCharacteristic(Characteristic.SerialNumber, "123-456");
        services.push(informationService);


        this.airService = new Service.AirQualitySensor(this.name);

        this.airService
            .getCharacteristic(Characteristic.AirQuality)
            .on('get', this.getAir.bind(this));

        this.airService.addCharacteristic(Characteristic.StatusFault);
        this.airService.addCharacteristic(Characteristic.PM2_5Density);
        this.airService.addCharacteristic(Characteristic.PM10Density);
        services.push(this.airService);

        return services;
    }
};

