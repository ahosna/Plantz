// PIN definitions
const PIN_MUX_S1 = 16; // D0
const PIN_MUX_S2 = 5; // D1
const PIN_MUX_S3 = 4; // D2 - used also for DISTANCE SENSE
const PIN_MUX_NEG_EN = 15; //D8
const UART_RX = 3; // RX
const PIN_RELAY_1 = 13; // D7
const PIN_RELAY_2 = 2; // D4
const PIN_RELAY_3 = 14; // D5
const PIN_RELAY_4 = 12; // D6
const PIN_DISTANCE_TRIGGER = 0; // D3
const PIN_DISTANCE_SENSE = 4; // D2 - used also for MUX S3

// MUX definitions
//const CH_FLOATING_1 = 0;
const CH_FLOATING_1 = 0;
const CH_LOW_WATER_SENSOR = 1;
const CH_GND_1 = 2;
const CH_FLOATING_2 = 3;
const CH_MOISTURE_1 = 4; 
const CH_MOISTURE_2 = 5; 
const CH_MOISTURE_3 = 6;
const CH_MOISTURE_4 = 7;
const MUX_SELECT_WAIT_MILLIS = 5; // long enoug to acquire 2x analogRead
                                  // short enough to not discharge the sensor
const MUX_ROTATE_TIME_MILLIS = 1500; // must be longer than 3xWAIT time
const MUX_SELECT_SETTLE_MILLIS = 1;
const MUX_ENABLED_CHANNELS = [
  CH_LOW_WATER_SENSOR, CH_MOISTURE_1, CH_MOISTURE_2, CH_MOISTURE_3, CH_MOISTURE_4
];
const MUX_TOTAL_MILLIS = (
  (MUX_ENABLED_CHANNELS.length * MUX_ROTATE_TIME_MILLIS) + MUX_SELECT_WAIT_MILLIS + 100 // padding
);

// Distance measurement
const DISTANCE_WAIT_MILLIS = 20; // must be > 12ms - to measure up to 2m
const DISTANCE_TOTAL_MILLIS = 100; // should be enough for measurement + pinMode changes
const WATCH_OPTIONS = {repeat:true, edge:"both", debounce:0};
// Speed of sound
const SOUND_FACTOR = 17200; // (344 m/s / 2)(bounce) * 100cm

// DHT11
const DEFAULT_AIR_TEMP=20;
const DEFAULT_AIR_RH=50;
dht = require("DHT11").connect(UART_RX);

// Rellays
const RELAY_TEST_ON_MILLIS=500;
const RELAY_TEST_INTERVAL_MILLIS=700;  // Must be longer than RELAY_TEST_ON_MILLIS

// WIFI
// !!! REPLACE WITH YOUR HOME WIFI SSID AND PASSWORD !!!
const WIFI_NAME = "WifiSSID";
const WIFI_PASSWORD = "WifiPassword";
var wifi = require("Wifi");

var post_complete = false;
var wifi_connected = false;
var mqtt_connected = false;

// MQTT
// !!! REPLACE WIRH YOUR OWN MQTT SERVER AND CREDENTIALS !!!
const MQTT_SERVER = "127.0.0.1"; //IP of your MQTT server
const MQTT_OPTIONS = {
  client_id: getSerial(),
  port: 1883,
  host: MQTT_SERVER,
  username: "YOUR_MQTT_USER",
  password: "YOUR_MQTT_PASS",
};
// !!! REPLACE WITH YOUR OWN TOPIC !!! 
const MQTT_TOPIC = "sk/ahosna/plantz/home";
const MQTT_PUMPS_TOPIC = MQTT_TOPIC + "/pumps";
var mqtt = require("tinyMQTT").create(MQTT_SERVER, MQTT_OPTIONS); 

// Values for sensors
analog_values = new Float32Array(8);
var air_temp = DEFAULT_AIR_TEMP;
var air_rh = DEFAULT_AIR_RH;
var distance_cm = 0.0;
var pumps = [false, false, false, false];

function set_pin(pin, mode, value) {
  pinMode(pin, mode);
  if (mode=="output") { 
    digitalWrite(pin, value);
  }
}

// ==== Pumps - 1 .. 4 ====
function run_pump(pump, duration_millis) {
  // relays are active LOW!
  if (pumps[pump-1]) {
    console.log("Pump" + pump + " already running. Ignoring command!");
    return;
  }
  console.log("Pump" + pump + " will run for " + duration_millis + " ms");
  var pins = [PIN_RELAY_1, PIN_RELAY_2, PIN_RELAY_3, PIN_RELAY_4];
  digitalWrite(pins[pump-1], LOW);
  pumps[pump-1] = true;
  setTimeout(function(p) {
    digitalWrite(pins[pump-1], HIGH);
    pumps[pump-1] = false;
  }, duration_millis, pump);
}

function self_test_relays() {
  for (let i=1; i<=4; i++) {
    setTimeout(run_pump, RELAY_TEST_INTERVAL_MILLIS*i, i, RELAY_TEST_ON_MILLIS);
  }
}

// ==== ANALOG MUX ====
/** We have every other channel connected. We abstract it here, so:
* 0 -> PIN-0
* 1 -> PIN-2
* ...
* 7 -> PIN-14
*/
function select_mux_channel(channel) {
  digitalWrite(PIN_MUX_NEG_EN, HIGH);
  setTimeout(function() {
    digitalWrite([PIN_MUX_S3, PIN_MUX_S2, PIN_MUX_S1], channel);
    setTimeout(function() {
      digitalWrite(PIN_MUX_NEG_EN, LOW);
    }, MUX_SELECT_SETTLE_MILLIS);
  }, MUX_SELECT_SETTLE_MILLIS);
}

function refresh_analog_value(channel) {
  select_mux_channel(CH_GND_1); // start by selecting ground channel
  setTimeout(function() {
    var a = analogRead(); // reading gnd just to see what we got
    console.log("CH_GND_1 val=" + a);
    select_mux_channel(channel);
    setTimeout(function(){
      analog_values[channel] = analogRead();
      console.log("A" + channel + ": " + analog_values[channel]);
      digitalWrite(PIN_MUX_NEG_EN, HIGH); // leave things in high impedance
      digitalWrite([PIN_MUX_S3, PIN_MUX_S2, PIN_MUX_S1], 0); // and channel 0
    }, MUX_SELECT_WAIT_MILLIS);
  }, MUX_SELECT_WAIT_MILLIS);
  return 3 * MUX_SELECT_WAIT_MILLIS;
}

// Refresh analog readings for enabled channels
function refresh_analog_readings() {
  if (!post_complete) return;
  for (let i=0; i<MUX_ENABLED_CHANNELS.length; i++) {
    setTimeout(refresh_analog_value, i*MUX_ROTATE_TIME_MILLIS, MUX_ENABLED_CHANNELS[i]);
  }
}

// ==== Temperature/RH ====
function refresh_air_temp_and_rh() {
  if (!post_complete) return;
  dht.read(function (a) {
    if (!a.err) {
      air_temp = a.temp;
      air_rh = a.rh;
    } else {
      console.log("DHT11: Error" + (a.checsumError?" in checksum": " connecting"));
    }
  });
}


// ==== Distance sensore ====
/** 
Refresh distance shares D2 (MUX_S3) for sensing. 
Analog readings and distance can't be measured at the same time.
*/
function refresh_distance() {
  if (!post_complete) return;
  console.log("Distance mode: ON");
  set_pin(PIN_DISTANCE_SENSE, "input", LOW);
  // Watch for level changes and act on falling edge
  w = setWatch(function(obj){
    if (obj.state == false) {
      distance_cm = (obj.time - obj.lastTime) * SOUND_FACTOR;
      console.log("Distance: " + distance_cm + " cm");
    }
  }, PIN_DISTANCE_SENSE, WATCH_OPTIONS);
  
  // Trigger ping - at least 10us. We are happy with 1ms
  digitalPulse(PIN_DISTANCE_TRIGGER, HIGH, 1);
  // destroy the watch
  setTimeout(function() {
    clearWatch(w);
    set_pin(PIN_DISTANCE_SENSE, "output", LOW);
    console.log("Distance mode: OFF");
  }, DISTANCE_WAIT_MILLIS);
}


/** 
Rerfresh all sensors, return minimum time to wait before next read.
*/
function refresh_all() {
  refresh_air_temp_and_rh();
  refresh_distance();
  setTimeout(refresh_analog_readings, DISTANCE_TOTAL_MILLIS);
  return Math.max(DISTANCE_TOTAL_MILLIS, MUX_TOTAL_MILLIS);
}


// ==== Data publishing ====

/** Water low is determined by ON/OFF switch connected via external pull-up
to channel 0 - CH_LOW_WATER_SENSOR of the DEMUX.
Sensor is closed when the water is low, bringing pin down to 0.0V. When the
water is present float is up and sensor is open, letting the pull up bring
the pin value to Ucc (3.3V)
*/
function is_water_low() {
  return analog_values[CH_LOW_WATER_SENSOR]<0.1;
}

function mqtt_publish(resource, value) {
  if (mqtt_connected) {
    console.log("PUB: " + resource + ": " + value);
    mqtt.publish(
      MQTT_TOPIC + "/" + resource, 
      JSON.stringify({value: value})
    );
  }
}

function publish_data() {
  if (!post_complete) {
    return;
  }
  console.log("Moisture 1: " + analog_values[CH_MOISTURE_1]);
  mqtt_publish("m1", analog_values[CH_MOISTURE_1]);
  mqtt_publish("m2", analog_values[CH_MOISTURE_2]);
  mqtt_publish("m3", analog_values[CH_MOISTURE_3]);
  mqtt_publish("m4", analog_values[CH_MOISTURE_4]);
  mqtt_publish("airtemp", air_temp);
  mqtt_publish("airrh", air_rh);
  mqtt_publish("low_water", is_water_low());
  mqtt_publish("distance_cm", distance_cm);
  mqtt_publish("pump1", pumps[0]);
  mqtt_publish("pump2", pumps[1]);
  mqtt_publish("pump3", pumps[2]);
  mqtt_publish("pump4", pumps[3]);
}

// ==== Pump commanding ====
function process_pump_message(msg) {
  if (!post_complete) return;
  cmd = JSON.parse(msg);
  run_pump(cmd.pump, cmd.duration_millis);
}
  
// WIFI
function connect_wifi() {
  wifi.connect(WIFI_NAME, { password: WIFI_PASSWORD}, function(err) {
    if (err) {
      console.log("WIFI connect failed");
      return;
    }
  });
}

// INIT
function set_ports() {
  set_pin(PIN_MUX_S1, "output", LOW);
  set_pin(PIN_MUX_S2, "output", LOW);
  set_pin(PIN_MUX_S3, "output", LOW);
  set_pin(PIN_MUX_NEG_EN, "output", HIGH);
  set_pin(PIN_DISTANCE_TRIGGER, "output", LOW);
  
  // relays are active low - so turn them off initially
  set_pin(PIN_RELAY_1, "output", HIGH);
  set_pin(PIN_RELAY_2, "output", HIGH);
  set_pin(PIN_RELAY_3, "output", HIGH);
  set_pin(PIN_RELAY_4, "output", HIGH);
}
  
function init() {
  console.log("onInit() POST");
  set_ports();
  self_test_relays();
  connect_wifi();
  setTimeout(function() {
    console.log("POST Done.");
    setInterval(refresh_all, 18000);
    // TODO we actually want to average data for refreshed values
    setInterval(publish_data, 60000); // minute interval should be plenty
    post_complete = true;
  }, 4000);
}


E.on("init", function() {
  setTimeout(init, 1000);
});

// WIFI handlers
wifi.on("connected", function() {
  console.log("WIFI connected");
  wifi_connected = true;
  mqtt.connect();
});

wifi.on("disconnected", function() {
  wifi_connected = false;
  connect_wifi();
});

// MQTT handlers
mqtt.on("connected", function() {
  console.log("MQTT connected");
  mqtt.subscribe(MQTT_PUMPS_TOPIC);
  mqtt_connected = true;
});

mqtt.on("published", function() {
  console.log("MQTT message sent");
});

mqtt.on("disconnected", function(){
  console.log("MQTT disconnected");
  mqtt_connected=false;
  mqtt.connect();
});

mqtt.on("message", function(msg) {
  console.log("MQTT received @" + msg.topic + ": " + msg.message);
  process_pump_message(msg.message);
});



