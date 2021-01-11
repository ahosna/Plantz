Download firmware at:
http://www.espruino.com/Download
Get 4MB combined version - ending with esp8266_4mb_combined_4096.bin

git clone esptool from: https://github.com/espressif/esptool.git

Run on MAC:
```
pip3.7 install --user -e .
python3.7 ./esptool.py --port /dev/tty.usbserial-14240 --baud 115200 write_flash --flash_freq 80m --flash_mode qio --flash_size 4MB-c1 0x0000 ~/code/GITRep/POCs/Espruino/espruino_2v06_esp8266_4mb_combined_4096.bin
```

Test sketch:
```
var  on = false;
setInterval(function() {
  on = !on;
  D2.write(on);
}, 500);
```

Docs here: https://www.espruino.com/EspruinoESP8266#pinout

Sensor  Min(dry air)    Max(wet soil)
M1      0.83            0.41
M2      0.83            0.39
M3      0.83            0.38
M4      0.83            0.39
