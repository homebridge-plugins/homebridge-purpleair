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
    if (this.updateFreq == undefined) this.updateFreq = 300		// default 5 minutes
    this.updateMsecs = this.updateFreq * 1000;
}

PurpleAirAccessory.prototype = {
    /**
     * Get all Air data from PurpleAir
     */
    getPurpleAirData: function (callback) {
        var self = this;
        var aqi = 0;
        var url = 'https://www.purpleair.com/json?show:' + this.purpleID;

		// Make request only every updateFreq seconds (PurpleAir actual update frequency is around 40 seconds, but we really don't need that precision here}
		var timenow = Date.now();
		// this.log("getPurpleAirData called... lastupdate: %s, now: %s, freq: %s", this.lastupdate.toString(), timenow.toString(), this.updateMsecs.toString());
        if (this.lastupdate === 0 || ((this.lastupdate + this.updateMsecs) < timenow) || this.cache === undefined) {
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
	var self = this;
         purpleAirService.setCharacteristic(Characteristic.StatusFault, 0);
		// PurpleAir outdoor sensors send data from two internal sensors, but indoor sensors only have one
		// We have to verify exterior/interior, and if exterior, whether both sensors are working or only 1
        var statsA; //  = undefined;
		var statsB;
        var newest = 0;
        var single = null;
		if (data.results != undefined) {
			if (data.results[0] != undefined) {
				// stats[0] = undefined
				if (data.results[0].Stats != undefined) statsA = JSON.parse(data.results[0].Stats);
				if (data.results[0].DEVICE_LOCATIONTYPE != 'inside') {
					// outside sensor, check for both sensors and find the one updated most recently
					if (data.results[1] != undefined) {
						//stats[1] = undefined
						if (data.results[1].Stats != undefined) statsB = JSON.parse(data.results[1].Stats);
						if (statsA.lastModified > statsB.lastModified) {		// lastModified is epoch time in milliseconds
							newest = statsA.lastModified;
						} else {
							newest = statsB.lastModified;
						}
					}
				} else {
					// indoor sensor - make sure the data is valid 
					// stats[1] = undefined;
					if ((data.results[0].A_H != true) && (data.results[0].PM2_5Value != undefined) && (data.results[0].PM2_5Value != null)) {
						single = 0;
						newest = statsA.lastModified;
					} else {
						single = -1;
					}
				}
				if (newest == this.lastupdate) { // no change
					// nothing changed, return cached value?
					if ((type != 'Cache') && (this.cache != undefined)) {
						return self.updateData(this.cache, 'Cache');
					} else {
						return 0;
					}
				}
                // Now, figure out which PM2_5Value we are using
				if (single == null) {
					if ((data.results[0].A_H == true) || (data.results[0].PM2_5Value == undefined) || (data.results[0].PM2_5Value == null)) {
						// A is bad
						if ((data.results[1].A_H == true) || (data.results[1].PM2_5Value == undefined) || (data.results[1].PM2_5Value == null)) {
							// A bad, B bad
							single = -1;
						} else {
							// A bad, B good
							single = 1;
						}
					} else {
						// Channel A is good
						if ((data.results[1].A_H == true) || (data.results[1].PM2_5Value == undefined) || (data.results[1].PM2_5Value == null)) {
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
						pm = Math.round(((statsA.v + statsB.v)/2.0));
					} else if (single == 0) {
						pm = Math.round(statsA.v);
					} else {
						pm = Math.round(statsB.v);
					}
					aqi = Math.round(self.calculateAQI(pm));
				} else {
					// No valid data - return cached value?
					if ((type != 'Cache') && (self.cache != undefined)) {
						return self.updateData( self.cache, 'Cache');
					} else {
						return 0;
					}
				}
				purpleAirService.setCharacteristic(Characteristic.PM2_5Density, pm.toString());
//				purpleAirService.setCharacteristic(Characteristic.AirQualityIndex, aqi.toString());
				// PM10 data isn't available via this PurpleAir API
				// airService.setCharacteristic(Characteristic.PM10Density, data.pm10);

                self.log.info("[%s] PurpleAir pm2_5 is %s, AQI is %s, Air Quality is %s.", type, pm.toString(), aqi.toString(), self.airQualityString(aqi));

				self.cache = data;

				if (type === 'Fetch') {
					self.lastupdate = newest;		// Use the newest sensors' time
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
		var aqi;
		var self = this;
		if (pm > 500) {
		  aqi = 500;
		} else if (pm > 350.5) {
		  aqi = self.remap(pm, 350.5, 500.5, 400, 500);
		} else if (pm > 250.5) {
		  aqi = self.remap(pm, 250.5, 350.5, 300, 400);
		} else if (pm > 150.5) {
		  aqi = self.remap(pm, 150.5, 250.5, 200, 300);
		} else if (pm > 55.5) {
		  aqi = self.remap(pm, 55.5, 150.5, 150, 200);
		} else if (pm > 35.5) {
		  aqi = self.remap(pm, 35.5, 55.5, 100, 150);
		} else if (pm > 12) {
		  aqi = self.remap(pm, 12, 35.5, 50, 100);
		} else if (pm > 0) {
		  aqi = self.remap(pm, 0, 12, 0, 50);
		} else { aqi = 0 }
		return aqi;
	},
	
    /**
     * Return Air Quality Index
     * @param aqi
     * @returns {number}
     */
    transformAQI: function (aqi) {
	// this.log("Transforming %s.", aqi.toString())
        if (aqi == undefined) {
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

    airQualityString: function(aqi) {
        if (aqi == undefined) {
            return ("Unknown"); // Error or unknown response
        } else if (aqi <= 50) {
            return ("Excellent"); // Return EXCELLENT
        } else if (aqi <= 100) {
            return ("Good"); // Return GOOD
        } else if (aqi <= 150) {
            return ("Fair"); // Return FAIR
        } else if (aqi <= 200) {
            return ("Inferior"); // Return INFERIOR
        } else if (aqi > 200) {
            return ("Poor"); // Return POOR (Homekit only goes to cat 5, so combined the last two AQI cats of Very Unhealty and Hazardous.
        }
    },

    remap: function(value, fromLow, fromHigh, toLow, toHigh) {
		var fromRange = fromHigh - fromLow;
		var toRange = toHigh - toLow;
		var scaleFactor = toRange / fromRange;

		// Re-zero the value within the from range
		var tmpValue = value - fromLow;
		// Rescale the value to the to range
		tmpValue *= scaleFactor;
		// Re-zero back to the to range
		return tmpValue + toLow;
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
            .setCharacteristic(Characteristic.Model, "JSON_API")
            .setCharacteristic(Characteristic.SerialNumber, this.purpleID);
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
//      purpleAirService.addCharacteristic(Characteristic.AirQualityIndex);
        services.push(purpleAirService);

        return services;
    }
};

