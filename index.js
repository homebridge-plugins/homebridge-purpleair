"use strict";

var Service, Characteristic;
var purpleAirService;
var request = require('request');

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory("homebridge-purpleair", "PurpleAir", PurpleAirAccessory);
};


/**
 * PurpleAir Accessory
 */
function PurpleAirAccessory(log, config) {
    this.log = log;

    // Name and API key from PurpleAir
    this.name = config['name'];
    this.purpleID = config['purpleID'];
    this.updateFreq = config['updateFreq'];
    this.lastupdate = 0;
    this.cache = undefined;
    this.log.info("PurpleAir is working");
}

PurpleAirAccessory.prototype = {
    /**
     * Get all Air data from PurpleAir
     */
    getPurpleAirData: function (callback) {
        var self = this;
        var aqi = 0;
        var url = 'https://www.purpleair.com/json?show:' + this.purpleID;
		if (this.updateFreq == undefined) this.updateFreq = 300			// default 5 minutes

	// Make request only every updateFreq seconds (PurpleAir actual update frequency is around 40 seconds, but we really don't need that precision here}
        if (this.lastupdate === 0 || (this.lastupdate + this.updateFreq < (new Date().getTime() / 1000)) || this.cache === undefined) {
            request({
                url: url,
                json: true,
            }, function (err, response, data) {
                // If no errors
                if (!err && (response.statusCode === 200)) {
                    aqi = self.updateData(data, 'Fetch');
                    callback(null, self.transformAQI(aqi));
                // If error
                } else {
                    purpleAirService.setCharacteristic(Characteristic.StatusFault, 1);
                    self.log.error("PurpleAir Network or Unknown Error.");
                    callback(err);
                };
            });

        // Return cached data
        } else {
            aqi = self.updateData(self.cache, 'Cache');
            callback(null, self.transformAQI(aqi));
        };
    },

    /**
     * Update data
     */
    updateData: function (data, type) {
         purpleAirService.setCharacteristic(Characteristic.StatusFault, 0);
		
		// PurpleAir outdoor sensors send data from two internal sensors, but indoor sensors only have one
		// We have to verify exterior/interior, and if exterior, whether both sensors are working or only 1
        var stats = {:};
        var newest = 0;
        var single = null;
		if (data.results != undefined) {
			if (data.results[0] != undefined) {
				if (data.results[0].Stats != undefined) stats[0] = JSON.parse(data.results[0].Stats);
				if (data.results[0].DEVICE_LOCATIONTYPE != 'inside') {
					// outside sensor, check for both sensors and find the one updated most recently
					if (data.results[1] != undefined) {
						if (data.results[1].Stats != undefined) stats[1] = JSON.parse(data.results[1].Stats);
						if (stats[0].lastModified > stats[1].lastModified) {		// lastModified is epoch time in seconds
							newest = stats[0].lastModified;
						} else {
							newest = stats[1].lastModified;
						}
					}
				} else {
					// indoor sensor - make sure the data is valid 
					stats[1] = {:};
					if ((data.results[0].A_H != true) && (data.results[0].PM2_5Value != undefined) && (data.results[0].PM2_5Value != null)) {
						single = 0;
						newest = stats[0].lastModified;
					} else {
						single = -1;
					}
				}
				if (newest == this.lastupdate) { // no change
					// nothing changed, return cached value?
					if ((type != 'Cache') && (self.cache != undefined)) {
						return self.updateData( self.cache, 'Cache');
					} else {
						return 0;
					}
				}
                // Now, figure out which PM2_5Value we are using
				if (single == null) {
					if ((data.results[0].A_H == true) || (data.results[0].PM2_5Value == undefined) && (data.results[0].PM2_5Value == null)) {
						// A is bad
						if ((data.results[1].A_H == true) || (data.results[1].PM2_5Value == undefined) && (data.results[1].PM2_5Value == null)) {
							// A bad, B bad
							single = -1;
						} else {
							// A bad, B good
							single = 1;
						}
					} else {
						// Channel A is good
						if ((response.results[1].A_H == true) || (data.results[1].PM2_5Value == undefined) && (data.results[1].PM2_5Value == null)) {
							// A good, B bad
							single = 0;
						} else {
							// A good, B good
							single = 2;
						}
					}
				}
				
				var pm
				var aqi
				var aqiCode
				if (single >= 0) {
					if (single == 2) {
						pm = Math.round(((stats[0].v + stats[1].v)/2.0),2);
					} else {
						pm = Math.round(stats[single].v,2);
					}
					aqi = Math.round(self.calculateAQI(pm),0);
				} else {
					// No valid data - return cached value?
					if ((type != 'Cache') && (self.cache != undefined)) {
						return self.updateData( self.cache, 'Cache');
					} else {
						return 0;
					}
				}
				
				this.pm25 = pm;
				purpleAirService.setCharacteristic(Characteristic.PM2_5Density, pm)
;				// PM10 data isn't available via this PurpleAir API
				// airService.setCharacteristic(Characteristic.PM10Density, data.pm10);

                this.log.info("[%s] PurpleAir pm2_5 is: %s, AQI is: %s.", type, pm.toString(), aqi.toString());

				this.cache = data;

				if (type === 'Fetch') {
					this.lastupdate = newest;		// Use the newest sensors' time
				}
				return aqi;
			}
		}
		// No valid data - return cached value?
		if ((type != 'Cache') && (self.cache != undefined)) {
			return self.updateData( self.cache, 'Cache');
		} else {
			return 0;
		}
    },

	calculateAQI: function(pm) {
		var aqi
		if (pm > 500) {
		  aqi = 500;
		} else if (pm > 350.5) {
		  aqi = remap(pm, 350.5, 500.5, 400, 500);
		} else if (pm > 250.5) {
		  aqi = remap(pm, 250.5, 350.5, 300, 400);
		} else if (pm > 150.5) {
		  aqi = remap(pm, 150.5, 250.5, 200, 300);
		} else if (pm > 55.5) {
		  aqi = remap(pm, 55.5, 150.5, 150, 200);
		} else if (pm > 35.5) {
		  aqi = remap(pm, 35.5, 55.5, 100, 150);
		} else if (pm > 12) {
		  aqi = remap(pm, 12, 35.5, 50, 100);
		} else if (pm > 0) {
		  aqi = remap(pm, 0, 12, 0, 50);
		} else { aqi = 0 }
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
        } else if (aqi <= 50) {
            return (1); // Return EXCELLENT
        } else if (aqi <= 100) {
            return (2); // Return GOOD
        } else if (aqi <= 150) {
            return (3); // Return FAIR
        } else if (aqi <= 200) {
            return (4); // Return INFERIOR
        } else if (aqi > 200) {
            return (5); // Return POOR (Homekit only goes to cat 5, so combined the last two AQI cats of Very Unhealty and Hazardous.
        }
    },

    identify: function (callback) {
        this.log("Identify requested!");
        callback(); // success
    },

    getServices: function () {
        var services = [];

        /**
         * Informations
         */
        var informationService = new Service.AccessoryInformation();
        informationService
            .setCharacteristic(Characteristic.Manufacturer, "PurpleAir")
            .setCharacteristic(Characteristic.Model, "API")
            .setCharacteristic(Characteristic.SerialNumber, purpleID);
        services.push(informationService);

        /**
         * PurpleAirService
         */
        purpleAirService = new Service.AirQualitySensor(this.name);

        purpleAirService
            .getCharacteristic(Characteristic.AirQuality)
            .on('get', this.getPurpleAirData.bind(this));

        purpleAirService.addCharacteristic(Characteristic.StatusFault);
        purpleAirService.addCharacteristic(Characteristic.PM2_5Density);
        // purpleAirService.addCharacteristic(Characteristic.PM10Density);
        services.push(purpleAirService);

        return services;
    }
};
