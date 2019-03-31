"use strict";
var EchonetLite = require('node-echonet-lite');
var Accessory;
var Service;
var Characteristic;
var UUIDGen;
var RateLimiter = require('limiter').RateLimiter;
var limiter = new RateLimiter(1, 500);

var EchonetPlatform = /** @class */ (function () {
    // Platform constructor
    // config may be null
    // api may be null if launched from old homebridge version
    function EchonetPlatform(log, config, api) {
        var _this = this;
        this.accessories = new Map();
        this.el = new EchonetLite({ 'type': 'lan' });
        log("EchonetPlatform Init");
        var platform = this;
        this.log = log;
        this.config = config;
        this.api = api;
        this.el.setLang('en');
        this.api.on('didFinishLaunching', function () {
            _this.el.init(function (err) {
                if (err)
                    _this.log(err);
                else
                    _this.discovery();
            });
            _this.log('finish launching');
        });
    }
    EchonetPlatform.prototype.discovery = function () {
        var _this = this;
        this.log('start discovery');
        this.el.startDiscovery(function (err, res) {
            if (err)
                _this.log(err);
            else {
                var device_1 = res['device'];
                var address_1 = device_1['address'];
                var count_1 = 0;
                var _loop_1 = function (eoj) {
                    _this.el.getPropertyValue(address_1, eoj, 0x83, function (err, res) {
                        if (err)
                            _this.log(err);
                        else {
                            var uid = void 0;
                            var vendor = void 0;
                            if (res['message']['data']) {
                                uid = res['message']['data']['uid'];
                                vendor = res['message']['data']['name'];
                            }
                            else {
                                uid = address_1 + ':' + count_1;
                                count_1 = count_1 + 1;
                                vendor = "Unknown"
                            }
                            _this.addAccessory(device_1, address_1, eoj, uid, vendor);
                        }
                    });
                };
                for (var _i = 0, _a = device_1['eoj']; _i < _a.length; _i++) {
                    var eoj = _a[_i];
                    _loop_1(eoj);
                }
            }
        });
        setTimeout(function () {
            _this.el.stopDiscovery();
            //this.discovery();
        }, 2000);
    };
    // Function invoked when homebridge tries to restore cached accessory.
    // Developer can configure accessory at here (like setup event handler).
    // Update current value.
    EchonetPlatform.prototype.configureAccessory = function (accessory) {
        this.log('Configure Accessory', accessory.displayName);
        var platform = this;
        //this.setAccessory
        // Set the accessory to reachable if plugin can currently process the accessory,
        // otherwise set to false and update the reachability later by invoking 
        // accessory.updateReachability()
        accessory.updateReachability(false);
        this.accessories.set(accessory.UUID, accessory);
    };
    // Callback can be cached and invoke when necessary.
    EchonetPlatform.prototype.configurationRequestHandler = function (context, request, callback) {
        this.log("Context: ", JSON.stringify(context));
        this.log("Request: ", JSON.stringify(request));
    };
    // Echonet function to show how developer can add accessory dynamically from outside event
    EchonetPlatform.prototype.addAccessory = function (device, address, eoj, uid, vendor) {
        var _this = this;
        var platform = this;
        var uuid = UUIDGen.generate(uid);
        var group_code = eoj[0];
        var class_code = eoj[1];
        var className = this.el.getClassName(group_code, class_code) || "" + uid;
        var registered = this.accessories.has(uuid);
        
        var accessory = this.accessories.get(uuid) || new Accessory(className, uuid);

        accessory.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Manufacturer, vendor)
			.setCharacteristic(Characteristic.Model, "Unknown")
			.setCharacteristic(Characteristic.SerialNumber, address);
        
        
        accessory.updateReachability(true);
        accessory.on('identify', function (paired, callback) {
            _this.log(accessory.displayName, "Identify!!!");
            callback();
        });
        this.log("setup accessory " + className + ", " + uid);
        // Plugin can save context on accessory to help restore accessory in configureAccessory()
        // newAccessory.context.something = "Something"
	    if (group_code == 0x02 && class_code == 0x91) {
		var service = accessory.getService(Service.Lightbulb) || accessory.addService(Service.Lightbulb);
		service.getCharacteristic(Characteristic.On).on('get', function (callback) {
		    _this.el.getPropertyValue(address, eoj, 0x80, function (err, res) {
                        _this.log('get simple light state '+className);
                        _this.log(res['message']['data'])
			if(err){
				_this.log(err);
				callback(err);
				return;
			}
			if (res['message']['data'] == null || (!res['message']['data']['status'])) {
			    callback(null, 0);
			    return;
			}else{
			    callback(null, 1);
			    return;
			}
		    });
		}).on('set', function( value, callback) {
                        _this.log('set simple light state '+className);
                        _this.log(value)
			limiter.removeTokens(1, function() {
			    _this.el.setPropertyValue(address, eoj, 0x80, { 'status': value });
			});
			callback(null);
                });
	    }
	    else if (group_code == 0x01 && class_code == 0x30) {
            //エアコン
            this.el.setPropertyValue(address, eoj, 0xB1, { 'auto': false });
            var service = accessory.getService(Service.Thermostat) || accessory.addService(Service.Thermostat);
            /*
                        service.getCharacteristic(Characteristic.On).on('set', (value:number, callback:any) => {
                this.log('set on '+className+' '+value);
                this.el.setPropertyValue(address, eoj, 0x80, { 'status': value });
                callback(null);
            }).on('get', (callback:any) => {
                this.el.getPropertyValue(address, eoj, 0x80, (err:any, res:any) => {
                    this.log('get on '+className);
                    this.log(res['message']['data'])
                    if(res['message']['data'])
                        callback(null, res['message']['data']['status']);
                })
            });
            */
            service.getCharacteristic(Characteristic.TargetTemperature).on('get', function (callback) {
            limiter.removeTokens(1, function() {
                  _this.el.getPropertyValue(address, eoj, 0xB3, function (err, res) {
                    if (err) {
                        callback(err);
                        return;
                    }
                    _this.log("get target temperature " + className + " ", res['message']['data']);
                    if (res['message']['data'])
                        callback(null, res['message']['data']['temperature']);
                    else
                        callback(null, 20);
                });
			});
            

            }).on('set', function (value, callback) {
                _this.log('set target temperature ' + className + ' ' + value);
                limiter.removeTokens(1, function() {
                	_this.el.setPropertyValue(address, eoj, 0xB3, { 'temperature': value });
                });
                callback(null);
            });
            service.setCharacteristic(Characteristic.TemperatureDisplayUnits, Characteristic.TemperatureDisplayUnits.CELSIUS);
            service.getCharacteristic(Characteristic.CurrentTemperature).on('get', function (callback) {
              	limiter.removeTokens(1, function() {
                _this.el.getPropertyValue(address, eoj, 0xBB, function (err, res) {
                    if (err) {
                      _this.log('Error ' + err);
                        callback(err);
                        return;
                    }
                    _this.log('get current temperature ' + className, res['message']['data']);
                    if (res['message']['data'])
                        callback(null, res['message']['data']['temperature']);
                    else
                        callback(null, 20);
                });
                });
                
            });
            service.getCharacteristic(Characteristic.TargetHeatingCoolingState).on('get', function (callback) {
            limiter.removeTokens(1, function() {
                _this.el.getPropertyValue(address, eoj, 0x80, function (err, res) {
                    if (err) {
                        _this.log(err);
                        callback(err);
                        return;
                    }
                    if (res['message']['data'] == null || (!res['message']['data']['status'])) {
                        _this.log('get target heating cooling mode ' + className);

                        callback(null, 0);
                        return;
                    }
                    _this.el.getPropertyValue(address, eoj, 0xB0, function (err, res) {
                        if (err) {
                            _this.log(err);
                            callback(err);
                            return;
                        }
                        _this.log('get target heating cooling mode ' + className);
                        _this.log(res['message']['data']);
                        if (res['message']['data'] == null) {
                            callback();
                            return;
                        }
                        var hmode = 0;
                        switch (res['message']['data']['mode']) {
                            case 1: //Auto
                                hmode = 3;
                                break;
                            case 2: //Cooling
                                hmode = 2;
                                break;
                            case 3: //Heating
                                hmode = 1;
                                break;
                            default:
                                //case 0://Other
                                //case 4://Dehumidify
                                //case 5://Blast
                                hmode = 0;
                                break;
                        }
                        callback(null, hmode);
                    });
                });
                });
            }).on('set', function (value, callback) {
                _this.log('set target heating cooling mode ' + className + ' ' + value);
                limiter.removeTokens(1, function() {
                	_this.el.setPropertyValue(address, eoj, 0x80, { 'status': value != 0 });
                });
                if (value == 1)
                	limiter.removeTokens(1, function() {_this.el.setPropertyValue(address, eoj, 0xB0, { 'mode': 3 });});
                else if (value == 2)
                    limiter.removeTokens(1, function() {_this.el.setPropertyValue(address, eoj, 0xB0, { 'mode': 2 });});
                else if (value == 3)
                    limiter.removeTokens(1, function() {_this.el.setPropertyValue(address, eoj, 0xB0, { 'mode': 1 });});
                callback();
                
            });
            service.getCharacteristic(Characteristic.CurrentHeatingCoolingState).on('get', function (callback) {
				limiter.removeTokens(1, function() {                        
                _this.el.getPropertyValue(address, eoj, 0x80, function (err, res) {
                    if (err) {
                        _this.log(err);
                        callback(err);
                        return;
                    }
                    if (res['message']['data'] == null || (!res['message']['data']['status'])) {
                        callback(null, 0);
                        return;
                    }
                    _this.el.getPropertyValue(address, eoj, 0xB0, function (err, res) {
                        if (err) {
                            _this.log(err);
                            callback(err);
                            return;
                        }
                        _this.log('get current heating cooling mode ' + className);
                        _this.log(res['message']['data']);
                        if (res['message']['data'] == null) {
                            callback();
                            return;
                        }
                        var hmode = 0;
                        switch (res['message']['data']['mode']) {
                            case 1: //Auto
                                hmode = 3;
                                break;
                            case 2: //Cooling
                                hmode = 2;
                                break;
                            case 3: //Heating
                                hmode = 1;
                                break;
                            default:
                                //case 0://Other
                                //case 4://Dehumidification
                                //case 5://Blast
                                hmode = 0;
                                break;
                        }
                        callback(null, hmode);
                    });
                });
                });
            }).on('set', function (value, callback) {
                _this.log('set current heating cooling mode ' + className + ' ' + value);
                
                limiter.removeTokens(1, function() {_this.el.setPropertyValue(address, eoj, 0x80, { 'status': value != 0 });});
                if (value == 1)
                    limiter.removeTokens(1, function() {_this.el.setPropertyValue(address, eoj, 0xB0, { 'mode': 3 });});
                else if (value == 2)
                    limiter.removeTokens(1, function() {_this.el.setPropertyValue(address, eoj, 0xB0, { 'mode': 2 });});
                else if (value == 3)
                    limiter.removeTokens(1, function() {_this.el.setPropertyValue(address, eoj, 0xB0, { 'mode': 1 });});
                callback();
                });

            // Optional Characteristics
            //Characteristic.CurrentRelativeHumidity
            //Characteristic.TargetRelativeHumidity
            //Characteristic.CoolingThresholdTemperature
            //Characteristic.HeatingThresholdTemperature
        }
        accessory.updateReachability(true);
        if (registered)
            this.log(className + ":" + uuid + " is already registered");
        //this.api.unregisterPlatformAccessories("homebridge-EchonetPlatform", "EchonetPlatform", [accessory]);
        else {
            this.log("register accessory " + className + ":" + uuid);
            this.accessories.set(uuid, accessory);
            this.api.registerPlatformAccessories("homebridge-EchonetPlatform", "EchonetPlatform", [accessory]);
        }
    };
    EchonetPlatform.prototype.updateAccessoriesReachability = function () {
        this.log("Update Reachability");
        this.accessories.forEach(function (accessory) { return accessory.updateReachability(false); });
    };
    // Echonet function to show how developer can remove accessory dynamically from outside event
    EchonetPlatform.prototype.removeAccessory = function () {
        this.log("Remove Accessory");
        this.api.unregisterPlatformAccessories("homebridge-EchonetPlatform", "EchonetPlatform", this.accessories.values());
    };
    return EchonetPlatform;
}());
module.exports = function (homebridge) {
    console.log("homebridge API version: " + homebridge.version);
    // Accessory must be created from PlatformAccessory Constructor
    Accessory = homebridge.platformAccessory;
    // Service and Characteristic are from hap-nodejs
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;
    // For platform plugin to be considered as dynamic platform plugin,
    // registerPlatform(pluginName, platformName, constructor, dynamic), dynamic must be true
    homebridge.registerPlatform("homebridge-echonet", "EchonetPlatform", EchonetPlatform, true);
};
