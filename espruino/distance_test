// PIN definitions
const PIN_MUX_S1 = 16; // D0
const PIN_MUX_S2 = 5; // D1
const PIN_MUX_S3 = 4; // D2 - use also for DISTANCE SENSE
const PIN_MUX_NEG_EN = 15; //D8
const UART_RX = 3; // RX
const PIN_RELAY_1 = 13; // D7
const PIN_RELAY_2 = 2; // D4
const PIN_RELAY_3 = 14; // D5
const PIN_RELAY_4 = 12; // D6
const PIN_ADC = A0; // ADC
const PIN_DISTANCE_TRIGGER = 0; // D3
const PIN_DISTANCE_SENSE = 4; // D2 - used also for MUX S3


// MUX definitions
const CH_LOW_WATER_SENSOR = 1;
const CH_MOISTURE_1 = 4;
const CH_MOISTURE_2 = 5;
const CH_MOISTURE_3 = 6;
const CH_MOISTURE_4 = 7;
const MUX_SELECT_WAIT_MILLIS = 100;
const MUX_ROTATE_TIME_MILLIS = 200;

// Distance measurement
const DISTANCE_WAIT_MILLIS = 20; // must be > 12ms - 2m
const WATCH_OPTIONS = {repeat:true, edge:"both", debounce:0};
// Speed of sound
const SOUND_FACTOR = 17200;  // (344 m/s / 2)(bounce) * 100cm

var distance_cm = 0.0;

function set_pin(pin, mode, value) {
  pinMode(pin, mode);
  if (mode=="output") { 
    digitalWrite(pin, value);
  }
}

function getDistance(){
  set_pin(PIN_DISTANCE_SENSE, "input", LOW);
  // Watch for level changes and act on falling edge
  w = setWatch(function(obj){
    if (obj.state == false) {
      distance_cm = (obj.time - obj.lastTime) * SOUND_FACTOR;
      console.log("distance: " + distance_cm + " cm");
    }
  }, PIN_DISTANCE_SENSE, WATCH_OPTIONS);
    // destroy the watch
    setTimeout(function() {
      clearWatch(w);
      set_pin(PIN_DISTANCE_SENSE, "output", LOW);
    }, DISTANCE_WAIT_MILLIS);

    digitalWrite(PIN_DISTANCE_TRIGGER, HIGH);
    // Trigger ping - at least 10us. We are happy with 1ms
    setTimeout(function() {
      digitalWrite(PIN_DISTANCE_TRIGGER, LOW);
    }, 1);
}

// INIT
function init() {
  console.log("onInit()");
  set_pin(PIN_ADC, "input", LOW);
  set_pin(PIN_MUX_S1, "output", LOW);
  set_pin(PIN_MUX_S2, "output", LOW);
  set_pin(PIN_MUX_S3, "output", LOW);
  set_pin(PIN_MUX_NEG_EN, "output", HIGH);
  set_pin(PIN_DISTANCE_TRIGGER, "output", LOW);
  
  set_pin(PIN_RELAY_1, "output", HIGH);
  set_pin(PIN_RELAY_2, "output", HIGH);
  set_pin(PIN_RELAY_3, "output", HIGH);
  set_pin(PIN_RELAY_4, "output", HIGH);
}

E.on("init", init);

