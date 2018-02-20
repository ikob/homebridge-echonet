import * as util from 'util'
let EchonetLite = require('node-echonet-lite')
import * as HAPNodeJS from 'hap-nodejs'

let Accessory:HAPNodeJS.Accessory;
let Service:HAPNodeJS.Service;
let Characteristic:HAPNodeJS.Characteristic;
let UUIDGen:HAPNodeJS.uuid;


export = function (homebridge: any) {
    console.log(`homebridge API version: ${homebridge.version}`);
    // Accessory must be created from PlatformAccessory Constructor
    Accessory = homebridge.platformAccessory;
    // Service and Characteristic are from hap-nodejs
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;
    // For platform plugin to be considered as dynamic platform plugin,
    // registerPlatform(pluginName, platformName, constructor, dynamic), dynamic must be true
    homebridge.registerPlatform("homebridge-echonet", "EchonetPlatform", EchonetPlatform, true);
}
interface Config {
    name: string;
    host: string;
    username: string;
    password: string;
    pollerperiod?: string;
    securitysystem?: string;
    switchglobalvariables?: string;
    thermostattimeout?: string;
    enablecoolingstatemanagemnt?: string;
}

class EchonetPlatform {
    log: (format: string, message?: any) => void;
    config: Config;
    api: any;
    accessories = new Map<String, HAPNodeJS.Accessory>();
    el = new EchonetLite({ 'type': 'lan' });
    discovery(){
        this.log('start discovery');
        this.el.startDiscovery((err:any,res:any)=>{
            if(err) this.log(err);
            else {
                const device = res['device'];
                const address = device['address'];
                let count = 0;
                for (const eoj of device['eoj']) {
                    this.el.getPropertyValue(address, eoj, 0x83, (err:any,res:any)=>{
                        if(err) this.log(err);
                        else {
                            let uid;
                            if (res['message']['data']) {
                                uid = res['message']['data']['uid'];
                            } else {
                                uid = address + ':' + count;
                                count = count + 1;
                            }
                        this.addAccessory(device, address, eoj, uid);
                        }
                    });
                }
            }
        });
        setTimeout(()=>{
            this.el.stopDiscovery();
            //this.discovery();
        },2000);
    }
    // Platform constructor
    // config may be null
    // api may be null if launched from old homebridge version
     constructor(log: (format: string, message?: any) => void, config: Config, api:any) {
        log("EchonetPlatform Init");
        const platform = this;
        this.log = log;
        this.config = config;
        this.accessories = new Map;
        this.api = api;
        this.el.setLang('ja');
        this.api.on('didFinishLaunching', () => {
            this.el.init((err:any)=>{
                if(err) this.log(err);
                else this.discovery();
            });
            this.log('finish launching')
        })
    }

    // Function invoked when homebridge tries to restore cached accessory.
    // Developer can configure accessory at here (like setup event handler).
    // Update current value.
    configureAccessory(accessory: HAPNodeJS.Accessory) {
        this.log('Configure Accessory', accessory.displayName);
        const platform = this;
        //this.setAccessory
        // Set the accessory to reachable if plugin can currently process the accessory,
        // otherwise set to false and update the reachability later by invoking 
        // accessory.updateReachability()
        accessory.updateReachability(false);
        this.accessories.set(accessory.UUID, accessory);
    }
    // Callback can be cached and invoke when necessary.
    configurationRequestHandler(context:any, request:any, callback:any) {
        this.log("Context: ", JSON.stringify(context));
        this.log("Request: ", JSON.stringify(request));
    }
    // Echonet function to show how developer can add accessory dynamically from outside event
    addAccessory(device:any, address:any, eoj:Array<number>, uid:string){
        const platform = this;
        const uuid = UUIDGen.generate(uid);


        const group_code = eoj[0];
        const class_code = eoj[1];
        const className = this.el.getClassName(group_code,class_code) || `${uid}`;
        const registered = this.accessories.has(uuid);
        let accessory = this.accessories.get(uuid) || new Accessory(className, uuid);
        accessory.updateReachability(true);
        accessory.on('identify', (paired:any, callback:any)=>{
            this.log(accessory.displayName, "Identify!!!");
            callback();
          });
        this.log(`setup accessory ${className}, ${uid}`);
        // Plugin can save context on accessory to help restore accessory in configureAccessory()
        // newAccessory.context.something = "Something"

        if (group_code == 0x02 && class_code == 0x90) {
            //一般照明
            const service = accessory.getService(Service.Lightbulb) || accessory.addService(Service.Lightbulb);
            service.getCharacteristic(Characteristic.On).on('set', (value:number, callback:any) => {
                this.log(`set on ${className} ${value}`);
                this.el.setPropertyValue(address, eoj, 0x80, { 'status': value });
                callback(null);
            }).on('get', (callback:any) => {
                this.el.getPropertyValue(address, eoj, 0x80, (err:any, res:any) => {
                    if(err){
                        callback(err);
                        return;
                    }
                    this.log(`get on ${className}: ${res['message']['data']}`)
                    if(res['message']['data'])
                        callback(null, res['message']['data']['status']);
                    else
                        callback(new Error("receive null data"))
                })
            });
            service.getCharacteristic(Characteristic.Brightness).on('get', (callback:any) => {
                this.el.getPropertyValue(address, eoj, 0xF7, (err:any, res:any) => {
                    if (err){
                        callback(err);
                        return;
                    }
                    else {
                        this.log(`get brightness ${className}: ${res['message']['data']}`);
                        let level = res['message']['data']['level'];
                        callback(null, level);
                    }
                })
            }).on('set', (value:number, callback:any) => {
                this.log(`set brightness ${className} ${value}`);
                this.el.setPropertyValue(address, eoj, 0xF7, { 'level': value });
                callback(null);
            });
        } else if(group_code == 0x01 && class_code == 0x30){
            //エアコン
            this.el.setPropertyValue(address,eoj,0xB1,{'auto':false});
            let service = accessory.getService(Service.Thermostat) || accessory.addService(Service.Thermostat);
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
            service.getCharacteristic(Characteristic.TargetTemperature).on('get', (callback:any)=>{
                this.el.getPropertyValue(address,eoj,0xB3, (err:any, res:any)=>{
                    if(err) {
                        callback(err);
                        return;
                    }
                    this.log(`get target temperature ${className} `,res['message']['data']);
                    if(res['message']['data'])
                        callback(null,res['message']['data']['temperature']);
                    else
                        callback(null,20);
                });
            }).on('set', (value:number, callback:any)=>{
                this.log('set target temperature '+className+' '+value);
                this.el.setPropertyValue(address,eoj,0xB3,{'temperature':value});
                callback(null);
            })
            service.setCharacteristic(Characteristic.TemperatureDisplayUnits,'℃')
            service.getCharacteristic(Characteristic.CurrentTemperature).on('get', (callback:any)=>{
                this.el.getPropertyValue(address,eoj,0xBB, (err:any, res:any)=>{
                    if(err){
                        callback(err);
                        return;
                    }
                    this.log('get current temperature '+className,res['message']['data']);
                    if(res['message']['data'])
                        callback(null,res['message']['data']['temperature']);
                    else
                        callback(null,20);
                });
            })
            service.getCharacteristic(Characteristic.TargetHeatingCoolingState).on('get',(callback:any)=>{
                this.el.getPropertyValue(address,eoj,0x80,(err:any,res:any)=>{
                    if(err){
                        this.log(err);
                        callback(err);
                        return;
                    }
                    if(res['message']['data']==null || (!res['message']['data']['status'])){
                        callback(null,0);
                        return;
                    }
                    this.el.getPropertyValue(address,eoj,0xB0,(err:any,res:any)=>{
                        if(err){
                            this.log(err);
                            callback(err);
                            return;
                        }
                        this.log('get target heating cooling mode '+className);
                        this.log(res['message']['data']);
                        if(res['message']['data']==null){
                            callback();
                            return;
                        }
                        let hmode=0;
                        switch(res['message']['data']['mode']){
                            case 1://自動
                                hmode = 3;
                                break;
                            case 2://冷房
                                hmode = 2;
                                break;
                            case 3://暖房
                                hmode = 1;
                                break;
                            default:
                            //case 0://その他
                            //case 4://除湿
                            //case 5://送風
                                hmode = 0;
                                break;
                        }
                        callback(null,hmode);
                    });
                });
            }).on('set', (value:number, callback:any)=>{
                this.log('set target heating cooling mode '+className+' '+value);
                this.el.setPropertyValue(address,eoj,0x80,{'status': value!=0});
                if(value==1)
                    this.el.setPropertyValue(address,eoj,0xB0,{'mode': 3});
                else if(value==2)
                    this.el.setPropertyValue(address,eoj,0xB0,{'mode': 2});
                else if(value==3)
                    this.el.setPropertyValue(address,eoj,0xB0,{'mode': 1});
                callback();
            })
            service.getCharacteristic(Characteristic.CurrentHeatingCoolingState).on('get',(callback:any)=>{
                this.el.getPropertyValue(address,eoj,0x80,(err:any,res:any)=>{
                    if(err){
                        this.log(err);
                        callback(err);
                        return;
                    }
                    if(res['message']['data']==null || (!res['message']['data']['status'])){
                        callback(null,0);
                        return;
                    }
                    this.el.getPropertyValue(address,eoj,0xB0,(err:any,res:any)=>{
                        if(err){
                            this.log(err);
                            callback(err);
                            return;
                        }
                        this.log('get current heating cooling mode '+className);
                        this.log(res['message']['data']);
                        if(res['message']['data']==null){
                            callback();
                            return;
                        }
                        let hmode=0;
                        switch(res['message']['data']['mode']){
                            case 1://自動
                                hmode = 3;
                                break;
                            case 2://冷房
                                hmode = 2;
                                break;
                            case 3://暖房
                                hmode = 1;
                                break;
                            default:
                            //case 0://その他
                            //case 4://除湿
                            //case 5://送風
                                hmode = 0;
                                break;
                        }
                        callback(null,hmode);
                    });
                });
            }).on('set', (value:number, callback:any)=>{
                this.log('set current heating cooling mode '+className+' '+value);
                this.el.setPropertyValue(address,eoj,0x80,{'status': value!=0});
                if(value==1)
                    this.el.setPropertyValue(address,eoj,0xB0,{'mode': 3});
                else if(value==2)
                    this.el.setPropertyValue(address,eoj,0xB0,{'mode': 2});
                else if(value==3)
                    this.el.setPropertyValue(address,eoj,0xB0,{'mode': 1});
                callback();
            })

            // Optional Characteristics
            //Characteristic.CurrentRelativeHumidity
            //Characteristic.TargetRelativeHumidity
            //Characteristic.CoolingThresholdTemperature
            //Characteristic.HeatingThresholdTemperature

        }
        accessory.updateReachability(true);
        if(registered)
            this.log(`${className}:${uuid} is alrady registered`);
            //this.api.unregisterPlatformAccessories("homebridge-EchonetPlatform", "EchonetPlatform", [accessory]);
        else{
            this.log(`register accessory ${className}:${uuid}`)
            this.accessories.set(uuid, accessory);
            this.api.registerPlatformAccessories("homebridge-EchonetPlatform", "EchonetPlatform", [accessory]);
        }
    }

    updateAccessoriesReachability () {
        this.log("Update Reachability");
        this.accessories.forEach(accessory=>accessory.updateReachability(false))
    }

    // Echonet function to show how developer can remove accessory dynamically from outside event
    removeAccessory () {
        this.log("Remove Accessory");
        this.api.unregisterPlatformAccessories("homebridge-EchonetPlatform", "EchonetPlatform", this.accessories.values());
    }
}