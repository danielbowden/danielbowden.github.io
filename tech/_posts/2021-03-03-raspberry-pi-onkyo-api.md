---
layout: tech_post
title: Raspberry Pi Part 2 - Onkyo mobile app API
description: Tech notes
modified: 2021-03-03
categories: tech
comments: true
image:
  thumb: tech/RaspberryPi-Part2-th.jpg
---

Now that my Raspberry Pi could communicate with my Onkyo Receiver, I wanted to build upon this and expose an API for a future iPhone app.

## Background

Following on from [Part 1](/tech/2021/02/13/raspberry-pi-onkyo-notifier) where I explained how I set up a Raspberry Pi Zero to continually monitor and notify of the Zone 2 power status of my Onkyo Receiver by flashing LEDs, I will now explain where I went from there.

Given I was already playing with Python and I would be using the excellent [onkyo-eiscp](https://github.com/miracle2k/onkyo-eiscp) wrapper again, I looked for a recommended Python framework for creating REST based services and came across [Flask](https://flask.palletsprojects.com/en/1.1.x/).

I wanted to build a simple, stateless interface into my Onkyo Receiver that would, ideally, aggregate the results of several Onkyo commands into a small number of calls.
As mentioned in my previous post, there is an existing [Onkyo Remote](https://apps.apple.com/au/app/onkyo-remote-3/id927243793) iOS app on the AppStore that is clunky, complex and difficult to use. In no way did I want to replicate this whole app as 90% of its functionality I don't even use. Instead, I wanted to offer a small subset of functionality that is specific to my setup at home and our use case, and do these few things well.

{% include image.html img="images/tech/RaspberryPi-Part2.jpg" title="Raspberry Pi Zero with Pimoroni LEDs" %}

## Creating an API
Installing Flask was simple. I created another virtual environment and installed what I needed.

```sh
$ pip install flask
$ pip install onkyo-eiscp
```

And again exported my dependencies.

```sh
$ pip freeze > requirements.txt
```

Looking in `requirements.txt` afterwards, this shows all the transitive dependencies that Flask also brings along.

Flask was really simple to get up and running, I just needed to define my first endpoint or route and from there I could continue to use the EISCP library to communicate with my receiver the same as I had done in [Part 1](/tech/2021/02/13/raspberry-pi-onkyo-notifier).

Below is my first endpoint, I've left numbered comments on key lines and will explain them below.

```python
#!/usr/bin/env python

from flask import Flask, jsonify
import eiscp

app = Flask(__name__)
app.debug = True
receiver_address = '192.168.1.50' # Reserved IP to receiver

@app.route('/onkyo/status', methods=['GET']) # 1
def get_status():
    receiver = eiscp.eISCP(receiver_address)
    main_power_result = receiver.command('main.power=query') # 2
    main_power_status = main_power_result[1]
    if isinstance(main_power_status, tuple): # main power gives standby,off
        main_power_status = main_power_status[0]
    main_volume = receiver.command('main.volume=query')[1] # 3
    main_source = receiver.command('main.source=query')[1] # 4
    if isinstance(main_source, tuple):
        main_source = ','.join(main_source)

    zone2_power_result = receiver.command('zone2.power=query') # 5
    zone2_power_status = zone2_power_result[1]
    zone2_volume = receiver.command('zone2.volume=query')[1]
    zone2_source = receiver.command('zone2.selector=query')[1]
    if isinstance(zone2_source, tuple):
        zone2_source = ','.join(zone2_source)

    receiver.disconnect()

    return jsonify( # 6
    {
      "status": {
        "main": {
            "status": main_power_status,
            "volume": volume_output(main_volume), # 7
            "source": source_output(main_source)
        },
        "zone2": {
            "status": zone2_power_status,
            "volume": volume_output(zone2_volume),
            "source": source_output(zone2_source)
        }
      }
    })
```

1. Defines my route, a HTTP GET to `/onkyo/status`. An endpoint I would use as the basis of my app for aggregating the results of several commands into an easy response.
2. After connecting to the receiver, send the first command. A query of the main zone power status
3. Query main zone volume
4. Query main zone input source
5. Repeat power, volume and source queries for zone 2 as well
6. Use jsonify to output the status as a json response
7. `volume_output` and `source_output` are just helper methods to abstract some of the ugly output from the receiver specific to my connected sources and return cleaner output for me to consume.

```python
def volume_output(volume):
    return volume if volume != 'N/A' else 0

def source_output(source):
    if source == 'cd,tv/cd':
        return 'tv'
    elif source == 'video2,cbl,sat':
        return 'appletv'
    else:
        return source
```

I can now start the application:
```sh
$ source env/bin/activate
$ ./app.py
```

And make a request to my first endpoint:
```sh
$ curl "http://localhost:8080/onkyo/status"
```

```json
{
  "status": {
    "main": {
      "source": "tv",
      "status": "on",
      "volume": 55
    },
    "zone2": {
      "source": "appletv",
      "status": "standby",
      "volume": 0
    }
  }
}
```

## Controlling power status
One of my next requirements was to be able to turn the receiver and its zones on and off. I tried to follow the REST semantics and CRUD patterns in my API design.

```python
@app.route('/onkyo/<string:zone>/power/<string:status>', methods=['PUT']) # 1
def set_power(zone, status): # 2
    if zone != 'main' and zone != 'zone2': # 3
        return 'unknown zone', 400
    if status != 'on' and status != 'standby':
        return 'unknown status', 400
    receiver = eiscp.eISCP(receiver_address)
    receiver.command(zone + '.power=' + status)
    receiver.disconnect()
    return get_status() # 4
```
1. Route PUT `/onkyo/<zone>/power/<value>`. An endpoint I can use to Update the power value of the provided zone. eg.
```
/onkyo/main/power/on
/onkyo/main/power/standby
/onkyo/zone2/power/on
/onkyo/zone2/power/standby
```
2. The `set_power` function associated with the route. It takes two parameters, `zone` and `status`, which are passed through from the URI.
3. Some basic input validation. Even though it's very likely that I'll be the only consumer ever.
4. Re-using the `get_status` function from above to return the receiver's status as the response after executing the power commands. This would have been the next logical step for an API consumer anyway so it eliminates the need to make a second API call. And because it responds with the exact same structure its less work for my eventual mobile app frontend as it can reuse the response parsing.

## Controlling volume
Wanting the ability to control the volume on each independent zone had me following a similar URI structure again.

```python
@app.route('/onkyo/<string:zone>/volume/<int:level>', methods=['PUT']) # 1
def set_volume(zone, level):
    if zone != 'main' and zone != 'zone2':
        return 'unknown zone', 400
    if level < 0: level = 0
    if level > 80: level = 80 # 2

    receiver = eiscp.eISCP(receiver_address)
    receiver.command(zone + '.volume=' + str(level))
    receiver.disconnect()

    return jsonify(
    {
        "zone": zone,
        "volume": level
    })
```

1. Route PUT `/onkyo/<zone>/volume/<level>`. An endpoint I can use to update the volume of the provided zone. eg.

```
/onkyo/main/volume/50
/onkyo/zone2/volume/60
```
2. Just protecting our ears, and my speakers, by setting a soft limit. Any value above 80 becomes 80.

```sh
$ curl -X "PUT" "http://localhost:8080/onkyo/main/volume/55"
```

```json
{
  "volume": 55,
  "zone": "main"
}
```

## Extending
Some other plans for further endpoints include changing the input source per zone, setting the same source across all zones, and maybe more once I get stuck into the app features.

For now, the Raspberry Pi has been a great learning exercise, allowing me to work with a language completely different from my day to day work and try something new. I'm looking for other ways I can put it to use including open source home automation software, [Home Assistant](https://www.home-assistant.io) and network-wide ad blocking with [Pi-hole](https://pi-hole.net).

---

For the full project see [https://github.com/danielbowden/onkyo-api](https://github.com/danielbowden/onkyo-api)
