require 'forever'
require 'json'
require 'paho-mqtt'
require 'pp'
require 'yaml'
require 'zabbix_send'

CONFIG_FILE = "./config.yaml"
def load_config
  config = YAML.load_file(CONFIG_FILE)
  pp config
  return config
end

CONFIG = load_config
TOPIC_REGEX = Regexp.new("^#{Regexp.escape(CONFIG["MQTT"]["TOPIC"])}\\/(?<item>[^\\/]+)$")
def extract_item(message)
  item = nil
  return nil if not message or not message.topic
  m = TOPIC_REGEX.match message.topic
  return m[:item]
end

ZBX = ZabbixSend::Sender.new
def process_message(message)
  item = extract_item(message)
  if not item then
    puts "Message #{message&.topic} dropped"
    return
  end
  json = JSON.parse(message.payload)
  value = json["value"]
  value = (value ? 1 : 0) if value === true or value === false
  puts "#{item}: #{value}"
  ZBX.zabbix_send(CONFIG["ZBX"]["HOST"], CONFIG["ZBX"]["HOSTNAME"], "#{CONFIG["ZBX"]["PREFIX"]}#{item}", value)
end

def mqtt_handle
  client = PahoMqtt::Client.new({
    host: CONFIG["MQTT"]["HOST"], 
    port: CONFIG["MQTT"]["PORT"].to_i, 
    username: CONFIG["MQTT"]["USERNAME"], 
    password: CONFIG["MQTT"]["PASSWORD"], 
    client_id: CONFIG["MQTT"]["CLIENTID"],
    persistent: true, 
    reconnect_limit: 1000, 
    reconnect_delay: 5,
    keep_alive: 29, 
    ack_timeout: 120,
  })
  
  client.on_message do |message|
      process_message(message)
  end

  waiting_suback = true
  client.on_suback do
    waiting_suback = false
    puts "Subscribed"
  end

  client.connect()
  client.subscribe(["#{CONFIG["MQTT"]["TOPIC"]}/#", 2])
  while waiting_suback do
      sleep 0.1
  end
  while true do
    sleep 1
    puts "alive"
  end
end

mqtt_handle
