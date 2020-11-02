"use strict";
var EchonetLite = require('node-echonet-lite');
var Accessory;
var Service;
var Characteristic;
var UUIDGen;
var RateLimiter = require('limiter').RateLimiter;
var limiter = new RateLimiter(1, 500);

const GC_SWJEMA = 0x05fd;
const GC_SIMPLELIGHT = 0x0291;
const GC_AIRCON = 0x0130;
const GC_DOORBELL = 0x0008;

var EchonetDevs = function(){};
EchonetDevs.doorbell = function(className, el, accessory, address, eoj, log){
    var service = accessory.getService(Service.MotionSensor) || accessory.addService(Service.MotionSensor);
    var state = true;
    service.getCharacteristic(Characteristic.MotionDetected).on('get', function (callback) {
        el.getPropertyValue(address, eoj, 0xB1, function (err, res) {
            log('get switch state '+className);
            if(err){
                log(err);
                callback(err);
                return;
            }
            state = res['message']['data'];
            service
                .setCharacteristic(Characteristic.MotionDetected, state);
            callback(null, state);
            return;
//            if (res['message']['data'] == null || (!res['message']['data']['status'])) {
//                callback(null, 0);
//                return;
//            }else{
//                callback(null, 1);
//                return;
//            }
        });
    });
    el.el_accessories.set(address.toString() + eoj.toString(), function(res){
        log('VisitingSensor', res['message']);
        log('test', res['message']);
        for( var i in res['message']['prop']) {
            log(res['message']['prop'][i]);
            var prop = res['message']['prop'][i];
            if(prop['epc'] == 0xB1) {
                state = prop['buffer'][0] == 0x41;
            }
        };
        service.setCharacteristic(Characteristic.MotionDetected, state);
    });
/*
    // For testing, on/off every 30 seconds.
    // https://github.com/homebridge/HAP-NodeJS/blob/8c8e84efb1f2e62f4af36e2e120d4c90a6473006/src/accessories/TemperatureSensor_accessory.ts
    setInterval(function() {
        state = !state;
        service
            .setCharacteristic(Characteristic.MotionDetected, state);

    }, 30000);
*/
};

EchonetDevs.jema = function(className, el, accessory, address, eoj, log){
    var service = accessory.getService(Service.Switch) || accessory.addService(Service.Switch);
    service.getCharacteristic(Characteristic.On).on('get', function (callback) {
        el.getPropertyValue(address, eoj, 0x80, function (err, res) {
            log('get switch state '+className);
            log(res['message']['data']);
            if(err){
                    log(err);
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
        log('set switch state '+className);
        log(value)
        limiter.removeTokens(1, function() {
            el.setPropertyValue(address, eoj, 0x80, { 'status': value });
        });
        callback(null);
    });
};
EchonetDevs.simplelight = function(className, el, accessory, address, eoj, log){
    var service = accessory.getService(Service.Lightbulb) || accessory.addService(Service.Lightbulb);
    service.getCharacteristic(Characteristic.On).on('get', function (callback) {
        el.getPropertyValue(address, eoj, 0x80, function (err, res) {
            log('get simple light state '+className);
            log(res['message']['data']);
            if(err){
                log(err);
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
        log('set simple light state '+className);
        log(value)
        limiter.removeTokens(1, function() {
            el.setPropertyValue(address, eoj, 0x80, { 'status': value });
        });
        callback(null);
     });
};
EchonetDevs.aircon = function(className, el, accessory, address, eoj, log){
    el.setPropertyValue(address, eoj, 0xB1, { 'auto': false });
    var service = accessory.getService(Service.Thermostat) || accessory.addService(Service.Thermostat);
    service.getCharacteristic(Characteristic.TargetTemperature).on('get', function (callback) {
        limiter.removeTokens(1, function() {
            el.getPropertyValue(address, eoj, 0xB3, function (err, res) {
                if (err) {
                    callback(err);
                    return;
                 }
                 log("get target temperature " + className + " ", res['message']['data']);
                 if (res['message']['data'])
                     callback(null, res['message']['data']['temperature']);
                     else
                         callback(null, 20);
              });
        });
    }).on('set', function (value, callback) {
        log('set target temperature ' + className + ' ' + value);
        limiter.removeTokens(1, function() {
            el.setPropertyValue(address, eoj, 0xB3, { 'temperature': parseInt(value)});
        });
        callback(null);
    });
    service.setCharacteristic(Characteristic.TemperatureDisplayUnits, Characteristic.TemperatureDisplayUnits.CELSIUS);
    service.getCharacteristic(Characteristic.CurrentTemperature).on('get', function (callback) {
        limiter.removeTokens(1, function() {
            el.getPropertyValue(address, eoj, 0xBB, function (err, res) {
                if (err) {
                    log('Error ' + err);
                    callback(err);
                    return;
                }
                log('get current temperature ' + className, res['message']['data']);
                if (res['message']['data'])
                    callback(null, res['message']['data']['temperature']);
                else
                    callback(null, 20);
            });
        });
    });
    service.getCharacteristic(Characteristic.TargetHeatingCoolingState).on('get', function (callback) {
        limiter.removeTokens(1, function() {
            el.getPropertyValue(address, eoj, 0x80, function (err, res) {
            if (err) {
                    log(err);
                    callback(err);
                    return;
                }
                if (res['message']['data'] == null || (!res['message']['data']['status'])) {
                    log('get target heating cooling mode ' + className);

                    callback(null, 0);
                    return;
                }
                el.getPropertyValue(address, eoj, 0xB0, function (err, res) {
                    if (err) {
                        log(err);
                        callback(err);
                        return;
                    }
                    log('get target heating cooling mode ' + className);
                    log(res['message']['data']);
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
        log('set target heating cooling mode ' + className + ' ' + value);
        limiter.removeTokens(1, function() {
        el.setPropertyValue(address, eoj, 0x80, { 'status': value != 0 });
        });
        if (value == 1)
            limiter.removeTokens(1, function() {el.setPropertyValue(address, eoj, 0xB0, { 'mode': 3 });});
        else if (value == 2)
            limiter.removeTokens(1, function() {el.setPropertyValue(address, eoj, 0xB0, { 'mode': 2 });});
        else if (value == 3)
            limiter.removeTokens(1, function() {el.setPropertyValue(address, eoj, 0xB0, { 'mode': 1 });});
        callback();
    });
    service.getCharacteristic(Characteristic.CurrentHeatingCoolingState).on('get', function (callback) {
        limiter.removeTokens(1, function() {                        
            el.getPropertyValue(address, eoj, 0x80, function (err, res) {
                if (err) {
                    log(err);
                    callback(err);
                    return;
                }
                if (res['message']['data'] == null || (!res['message']['data']['status'])) {
                    callback(null, 0);
                    return;
                }
                el.getPropertyValue(address, eoj, 0xB0, function (err, res) {
                    if (err) {
                        log(err);
                        callback(err);
                        return;
                    }
                    log('get current heating cooling mode ' + className);
                    log(res['message']['data']);
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
        log('set current heating cooling mode ' + className + ' ' + value);
            
        limiter.removeTokens(1, function() {el.setPropertyValue(address, eoj, 0x80, { 'status': value != 0 });});
        if (value == 1)
            limiter.removeTokens(1, function() {el.setPropertyValue(address, eoj, 0xB0, { 'mode': 3 });});
        else if (value == 2)
            limiter.removeTokens(1, function() {el.setPropertyValue(address, eoj, 0xB0, { 'mode': 2 });});
        else if (value == 3)
            limiter.removeTokens(1, function() {el.setPropertyValue(address, eoj, 0xB0, { 'mode': 1 });});
        callback();
    });

        // Optional Characteristics
        //Characteristic.CurrentRelativeHumidity
        //Characteristic.TargetRelativeHumidity
        //Characteristic.CoolingThresholdTemperature
        //Characteristic.HeatingThresholdTemperature
};

var EchonetPlatform = /** @class */ (function () {
    // Platform constructor
    // config may be null
    // api may be null if launched from old homebridge version
    function EchonetPlatform(log, config, api) {
        var _this = this;
        this.accessories = new Map();
        this.el = new EchonetLite({ 'type': 'lan' });
        log(typeof(this.accessories));
        log("EchonetPlatform Init");
        var platform = this;
        this.log = log;
        this.config = config;
        this.api = api;
        this.el.setLang('en');
        this.el.el_accessories = new Map();
        this.api.on('didFinishLaunching', function () {
            _this.el.init(function (err) {
                if (err)
                    _this.log(err);
                else
                    _this.discovery();
            });
            _this.log('finish launching');
        });
/*
        var seoj = [14, 240, 1];
        this.el.el_accessories.set(seoj.toString(), function(res){
            log('test', res['message']);
            for( var i in res['message']['prop']) {
                log(res['message']['prop'][i]);
            };
        });
*/
        this.el.on('notify', function(res) {
            var seoj = res['message']['seoj'];
            var address = res['device']['address'];
            if(_this.el.el_accessories.has(address.toString() + seoj.toString())){
                _this.el.el_accessories.get(address.toString() + seoj.toString())(res);
            };
            if(_this.el.el_accessories.has(seoj.toString())){
                _this.el.el_accessories.get(seoj.toString())(res);
            };
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
        var codes = group_code << 8 | class_code;
        switch(codes){
            case GC_SWJEMA:
//                _this.log('JEMA ' + codes.toString(16));
                EchonetDevs.jema(className, _this.el, accessory, address, eoj, _this.log);
                break;
            case GC_SIMPLELIGHT:
//                _this.log('LIGHT ' + codes.toString(16));
                EchonetDevs.simplelight(className, _this.el, accessory, address, eoj, _this.log);
                break;
            case GC_AIRCON:
//                _this.log('AIRCON ' + codes.toString(16));
                EchonetDevs.aircon(className, _this.el, accessory, address, eoj, _this.log);
                break;
            case GC_DOORBELL:
//                _this.log('DOORBELL ' + codes.toString(16));
                EchonetDevs.doorbell(className, _this.el, accessory, address, eoj, _this.log);
                break;
            default:
                _this.log('OTHERS ' + codes.toString(16));
                break;
        }
        // Plugin can save context on accessory to help restore accessory in configureAccessory()
        // newAccessory.context.something = "Something"
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
