import EventEmitter from 'events';
import {SmartBuffer} from '../smart-buffer';

import {BASS, TREBLE, LOUDNESS, BALANCE, PARTY_MODE, DO_NOT_DISTURB} from './extraZoneParam';
import HandshakePacket from './packets/HandshakePacket';
import KeypadEventPacket, {KEYS} from './packets/KeypadEventPacket';
import {build} from './packets/PacketBuilder';
import RenderedDisplayMessagePacket, {
  TYPE_SOURCE_NAME,
  TYPE_VOLUME,
} from './packets/RenderedDisplayMessagePacket';
import RNetPacket from './packets/RNetPacket';
import SetAllPowerPacket from './packets/SetAllPowerPacket';
import SetParameterPacket from './packets/SetParameterPacket';
import SetPowerPacket from './packets/SetPowerPacket';
import SetSourcePacket from './packets/SetSourcePacket';
import SetVolumePacket from './packets/SetVolumePacket';
import SourceDescriptiveTextPacket from './packets/SourceDescriptiveTextPacket';
import ZoneInfoPacket from './packets/ZoneInfoPacket';
import ZoneParameterPacket from './packets/ZoneParameterPacket';
import ZonePowerPacket from './packets/ZonePowerPacket';
import ZoneSourcePacket from './packets/ZoneSourcePacket';
import ZoneVolumePacket from './packets/ZoneVolumePacket';
import Source from './source';
import Zone from './zone';

export default class RNet extends EventEmitter {
  _device: string;
  _serialPort: WebSocket;

  _zones: Zone[][] = [];
  _sources: Source[] = [];
  _autoUpdating: boolean = false;
  _connected: boolean = false;
  _packetTimeout: NodeJS.Timer | undefined;
  _packetQueue: RNetPacket[] = [];
  _allMuted: boolean = false;
  _autoUpdateInterval: NodeJS.Timer | undefined;
  _invertNextPacket: boolean = false;
  _pendingPacket: SmartBuffer | undefined;

  constructor(device: string) {
    super();

    this._device = device;

    this.readConfiguration();
    this.writeConfiguration();

    this._serialPort = new WebSocket(`ws://${this._device}`);
    this._serialPort.binaryType = 'arraybuffer';
    this._serialPort.addEventListener('open', () => {
      this._connected = true;
      this.emit('connected');
      this.requestAllZoneInfo(true);
    });
    this._serialPort.addEventListener('error', e => {
      this.emit('error', e);
    });
    this._serialPort.addEventListener('close', () => {
      // TODO Start auto-reconnect
      this._connected = false;
      this.emit('disconnected');
    });
    this._serialPort.addEventListener('message', e => {
      console.debug('got message');
      this._handleData(e.data);
    });
  }

  disconnect() {
    this._serialPort.close();
    this._connected = false;
  }

  readConfiguration() {
    let zonesFile = localStorage.getItem('zones') || '';
    if (zonesFile.length > 0) {
      const zones = JSON.parse(zonesFile);
      for (let ctrllrID = 0; ctrllrID < zones.length; ctrllrID++) {
        if (zones[ctrllrID] != null) {
          for (let zoneID = 0; zoneID < zones[ctrllrID].length; zoneID++) {
            if (zones[ctrllrID][zoneID] != null) {
              const zoneData = zones[ctrllrID][zoneID];
              const zone = this.createZone(ctrllrID, zoneID, zoneData.name, false);
              if ('maxvol' in zoneData) {
                zone.setMaxVolume(zoneData.maxvol, false);
              }
            }
          }
        }
      }
    }
  }

  writeConfiguration() {
    this.writeZones();
  }

  writeZones() {
    const zones = [];
    for (let ctrllrID = 0; ctrllrID < this._zones.length; ctrllrID++) {
      if (this._zones[ctrllrID] == null) {
        zones[ctrllrID] = null;
      } else {
        const zonesOut: any[] = [];
        zones[ctrllrID] = zonesOut;
        for (let zoneID = 0; zoneID < this._zones[ctrllrID].length; zoneID++) {
          if (this._zones[ctrllrID][zoneID] == null) {
            zonesOut[zoneID] = null;
          } else {
            zonesOut[zoneID] = {
              name: this._zones[ctrllrID][zoneID].getName(),
            };

            if (this._zones[ctrllrID][zoneID].getMaxVolume() < 100) {
              zonesOut[zoneID].maxvol = this._zones[ctrllrID][zoneID].getMaxVolume();
            }
          }
        }
      }
    }

    localStorage.setItem('zones', JSON.stringify(zones));
  }

  createZone(ctrllrID: number, zoneID: number, name: string, writeConfig = true) {
    let zone = this._zones[ctrllrID]?.[zoneID];
    if (zone) {
      return zone;
    }
    zone = new Zone(this, ctrllrID, zoneID);
    zone.setName(name);

    if (!this._zones[ctrllrID]) {
      this._zones[ctrllrID] = [];
    }
    this._zones[ctrllrID][zoneID] = zone;

    if (writeConfig) {
      this.writeConfiguration();
    }

    zone
      .on('name', newName => {
        this.emit('zone-name', zone, newName);
        this.writeConfiguration();
      })
      .on('power', (powered, rNetTriggered) => {
        if (!rNetTriggered) {
          this.sendData(new SetPowerPacket(zone.getControllerID(), zone.getZoneID(), powered));
        }

        if (powered) {
          const source = this.getSource(zone.getSourceID());
          if (source) {
            if (source.getDescriptiveText() != null) {
              if (!source.isDescriptionFromRNet()) {
                this.sendData(
                  new SourceDescriptiveTextPacket(
                    source.getSourceID(),
                    0,
                    source.getDescriptiveText()
                  )
                );
              }
            } else if (source.getOverrideName()) {
              this.sendData(
                new SourceDescriptiveTextPacket(source.getSourceID(), 0, source.getName())
              );
            }
          }
        }

        this.emit('power', zone, powered);
      })
      .on('volume', (volume, rNetTriggered) => {
        if (!rNetTriggered) {
          this.sendData(new SetVolumePacket(zone.getControllerID(), zone.getZoneID(), volume));
        }
        this.emit('volume', zone, volume);
      })
      .on('max-volume', maxVolume => {
        this.emit('max-volume', zone, maxVolume);
      })
      .on('mute', muting => {
        this.emit('mute', zone, muting);
      })
      .on('source', (sourceID, rNetTriggered) => {
        if (!rNetTriggered) {
          this.sendData(new SetSourcePacket(zone.getControllerID(), zone.getZoneID(), sourceID));
        }

        const source = this.getSource(sourceID);
        if (source) {
          if (source.getDescriptiveText() != null) {
            if (!source.isDescriptionFromRNet()) {
              this.sendData(
                new SourceDescriptiveTextPacket(sourceID, 0, source.getDescriptiveText())
              );
            }
          } else if (source.getOverrideName()) {
            this.sendData(new SourceDescriptiveTextPacket(sourceID, 0, source.getName()));
          }
        }

        this.emit('source', zone, sourceID);
      })
      .on('parameter', (parameterID, value, rNetTriggered) => {
        if (!rNetTriggered) {
          this.sendData(
            new SetParameterPacket(zone.getControllerID(), zone.getZoneID(), parameterID, value)
          );
        }
        this.emit('parameter', zone, parameterID, value);
      });

    zone.requestInfo();

    this.emit('new-zone', zone);
    return zone;
  }

  deleteZone(ctrllrID: number, zoneID: number) {
    if (this._zones[ctrllrID] && this._zones[ctrllrID][zoneID]) {
      this._zones[ctrllrID][zoneID].removeAllListeners();

      delete this._zones[ctrllrID][zoneID];
      if (this._zones[ctrllrID].length === 0) {
        delete this._zones[ctrllrID];
      }

      this.writeConfiguration();
      this.emit('zone-deleted', ctrllrID, zoneID);
      return true;
    }
    return false;
  }

  getZone(ctrllrID: number, zoneID: number) {
    if (!this._zones[ctrllrID]) {
      return null;
    }
    return this._zones[ctrllrID][zoneID];
  }

  findZoneByName(name: string) {
    name = name.toUpperCase();
    for (let ctrllrID = 0; ctrllrID < this.getControllersSize(); ctrllrID++) {
      for (let zoneID = 0; zoneID < this.getZonesSize(ctrllrID); zoneID++) {
        const zone = this.getZone(ctrllrID, zoneID);
        if (zone && zone.getName().toUpperCase() === name) {
          return zone;
        }
      }
    }

    return false;
  }

  getControllersSize() {
    return this._zones.length;
  }

  getZonesSize(ctrllrID: number) {
    if (this._zones[ctrllrID] != null) {
      return this._zones[ctrllrID].length;
    }
    return 0;
  }

  createSource(sourceID: number, name: string, type?: number) {
    let source = this._sources[sourceID];
    if (source) {
      return source;
    }
    source = new Source(this, sourceID, name, type || Source.TYPE_GENERIC);
    this._sources[sourceID] = source;

    source
      .on('name', (name, oldName) => {
        this.emit('source-name', source, name, oldName);
      })
      .on('type', type => {
        this.emit('source-type', source, type);
      })
      .on('media-metadata', (title, artist, artworkURL) => {
        this.emit('media-metadata', source, title, artist, artworkURL);
        console.info('Source #%d (%s) is now playing %s by %s', sourceID, name, title, artist);
      })
      .on('media-playing', playing => {
        this.emit('media-playing', source, playing);
        console.info('Source #%d (%s) play state changed to %s', sourceID, name, playing);
      })
      .on('descriptive-text', (message, flashTime, rNetTriggered) => {
        if (!rNetTriggered) {
          this.sendData(new SourceDescriptiveTextPacket(sourceID, flashTime, message));
        }
        this.emit('descriptive-text', source, flashTime, message);
        console.info('Source #%d (%s) published descriptive text: %s', sourceID, name, message);
      })
      .on('control', (operation, rNetTriggered) => {
        if (!rNetTriggered && !source.networkControlled()) {
          const zones = source.getZones();
          if (zones.length > 0) {
            let key = null;
            switch (operation) {
              case Source.CONTROL_NEXT:
                key = KEYS.NEXT;
                break;
              case Source.CONTROL_PREV:
                key = KEYS.PREVIOUS;
                break;
              case Source.CONTROL_STOP:
                key = KEYS.STOP;
                break;
              case Source.CONTROL_PLAY:
                key = KEYS.PLAY;
                break;
              case Source.CONTROL_PAUSE:
                key = KEYS.PAUSE;
                break;
              case Source.CONTROL_PLUS:
                key = KEYS.PLUS;
                break;
              case Source.CONTROL_MINUS:
                key = KEYS.MINUS;
                break;
            }

            this.sendData(
              new KeypadEventPacket(zones[0].getControllerID(), zones[0].getZoneID(), key)
            );
          }
        }
      })
      .on('override-name', () => {
        this.sendData(new SourceDescriptiveTextPacket(sourceID, 0, source.getName()));
      });

    this.emit('new-source', source);
    return source;
  }

  deleteSource(sourceID: number) {
    this._sources[sourceID].removeAllListeners();
    delete this._sources[sourceID];

    let lastNonNull = -1;
    for (let i = this._sources.length - 1; i >= 0; i--) {
      if (this._sources[i]) {
        lastNonNull = i;
        break;
      }
    }
    this._sources.splice(lastNonNull + 1, this._sources.length - lastNonNull + 1);

    this.emit('source-deleted', sourceID);
  }

  getSource(sourceID: number) {
    if (this._sources[sourceID]) {
      return this._sources[sourceID];
    }
    return (this._sources[sourceID] = this.createSource(sourceID, String(sourceID)));
  }

  getSourcesSize() {
    return this._sources.length;
  }

  getSources() {
    return this._sources;
  }

  getSourcesByType(type: any) {
    const sources = [];
    for (let sourceID = 0; sourceID < this._sources.length; sourceID++) {
      if (this._sources[sourceID] != null && this._sources[sourceID].getType() == type) {
        sources.push(this._sources[sourceID]);
      }
    }
    return sources;
  }

  setAutoUpdate(enabled: boolean) {
    if (this._autoUpdating != enabled) {
      this._autoUpdating = enabled;

      console.debug(`DEBUG: RNet auto-update set to ${enabled}`);

      if (enabled) {
        this._autoUpdateInterval = setInterval(() => {
          this.requestAllZoneInfo();
        }, 30000);
      } else if (this._autoUpdateInterval) {
        clearInterval(this._autoUpdateInterval);
        this._autoUpdateInterval = undefined;
      }
    }
  }

  requestAllZoneInfo(forceAll = false) {
    for (const ctrllrID in this._zones) {
      for (const zoneID in this._zones[ctrllrID]) {
        this._zones[ctrllrID][zoneID].requestInfo();
      }
    }
  }

  setAllPower(power: any) {
    const packet = new SetAllPowerPacket(power);
    this.sendData(packet);

    setTimeout(() => {
      this.requestAllZoneInfo(true);
    }, 1000);
  }

  setAllMute(muted: boolean) {
    this._allMuted = muted;
    for (let ctrllrID = 0; ctrllrID < this.getControllersSize(); ctrllrID++) {
      for (let zoneID = 0; zoneID < this.getZonesSize(ctrllrID); zoneID++) {
        const zone = this.getZone(ctrllrID, zoneID);

        if (zone != null && zone.getPower()) {
          zone.setMute(muted);
        }
      }
    }
  }

  getAllMute() {
    return this._allMuted;
  }

  isConnected() {
    return this._connected;
  }

  sendData(
    packet:
      | SetPowerPacket
      | RNetPacket
      | SetVolumePacket
      | SetSourcePacket
      | HandshakePacket
      | KeypadEventPacket
      | SetParameterPacket,
    queueLoop = false
  ) {
    if (!this._connected) {
      return;
    }
    if (packet instanceof HandshakePacket) {
      this._packetQueue.unshift(packet);
      this._processQueue();
    } else {
      this._packetQueue.push(packet);
      this._processQueue();
    }
  }

  _processQueue() {
    if (this._packetTimeout == null) {
      const nextPacket = this._packetQueue.shift();
      if (nextPacket != null) {
        console.debug(`DEBUG: Sending packet ${nextPacket.constructor.name} to RNet.`);
        this._serialPort.send(nextPacket.getBuffer());
        this._packetTimeout = setTimeout(() => {
          this._packetTimeout = undefined;
          this._processQueue();
        }, 200);
      }
    }
  }

  _handleData(data: ArrayBuffer) {
    for (let b of Array.from(new Uint8Array(data))) {
      if (this._invertNextPacket) {
        b = ~b & 0xff;
        this._invertNextPacket = false;
      }

      if (b == 0xf0) {
        if (this._pendingPacket !== undefined) {
          console.warn('Received START_MESSAGE_BYTE before recieving a END_MESSAGE_BYTE from RNet');
          delete this._pendingPacket;
          this._pendingPacket = undefined;
        }
        this._pendingPacket = new SmartBuffer();
        this._pendingPacket.writeUInt8(b);
      } else if (b == 0xf7) {
        if (this._pendingPacket !== undefined) {
          this._pendingPacket.writeUInt8(b);
          const buffer = this._pendingPacket.toBuffer();
          this._pendingPacket = undefined;
          const packet = build(buffer);
          if (packet) {
            this._receivedRNetPacket(packet);
          } else {
            console.warn('Received unknown packet from RNet', buffer);
          }
        } else {
          console.warn('Received packet from RNet without start of new message.');
        }
      } else if (b == 0xf1) {
        if (this._pendingPacket !== undefined) {
          this._invertNextPacket = true;
        } else {
          console.warn('Received packet from RNet without start of new message.');
        }
      } else if (this._pendingPacket !== undefined) {
        this._pendingPacket.writeUInt8(b);
      } else {
        console.warn('Received packet from RNet without start of new message.');
      }
    }
  }

  _receivedRNetPacket(
    packet:
      | KeypadEventPacket
      | RenderedDisplayMessagePacket
      | ZoneInfoPacket
      | ZoneParameterPacket
      | ZonePowerPacket
      | ZoneSourcePacket
      | ZoneVolumePacket
  ) {
    console.debug(`DEBUG: Received packet ${packet.constructor.name} from RNet.`);

    if (packet.requiresHandshake()) {
      // this.sendData(new HandshakePacket(packet.sourceControllerID, 2));
    }

    if (packet instanceof ZoneInfoPacket) {
      const zone = this.getZone(packet.getControllerID(), packet.getZoneID());
      if (zone) {
        zone.setPower(packet.getPower(), true);
        zone.setSourceID(packet.getSourceID(), true);
        zone.setVolume(packet.getVolume(), true);
        zone.setParameter(BASS, packet.getBassLevel(), true);
        zone.setParameter(TREBLE, packet.getTrebleLevel(), true);
        zone.setParameter(LOUDNESS, packet.getLoudness(), true);
        zone.setParameter(BALANCE, packet.getBalance(), true);
        zone.setParameter(PARTY_MODE, packet.getPartyMode(), true);
        zone.setParameter(DO_NOT_DISTURB, packet.getDoNotDisturbMode(), true);
        this.emit('update', packet.getZoneID());
      } else {
        console.warn(
          'Received ZoneInfoPacket for unknown zone %d-%d',
          packet.getControllerID(),
          packet.getZoneID()
        );
      }
    } else if (packet instanceof ZonePowerPacket) {
      const zone = this.getZone(packet.getControllerID(), packet.getZoneID());
      if (zone) {
        zone.setPower(packet.getPower(), true);
        this.emit('update');
      } else {
        console.warn(
          'Received ZonePowerPacket for unknown zone %d-%d',
          packet.getControllerID(),
          packet.getZoneID()
        );
      }
    } else if (packet instanceof ZoneSourcePacket) {
      const zone = this.getZone(packet.getControllerID(), packet.getZoneID());
      if (zone) {
        zone.setSourceID(packet.getSourceID(), true);
        this.emit('update');
      } else {
        console.warn(
          'Received ZoneSourcePacket for unknown zone %d-%d',
          packet.getControllerID(),
          packet.getZoneID()
        );
      }
    } else if (packet instanceof ZoneVolumePacket) {
      const zone = this.getZone(packet.getControllerID(), packet.getZoneID());
      if (zone) {
        zone.setVolume(packet.getVolume(), true);
        this.emit('update');
      } else {
        console.warn(
          'Received ZoneVolumePacket for unknown zone %d-%d',
          packet.getControllerID(),
          packet.getZoneID()
        );
      }
    } else if (packet instanceof ZoneParameterPacket) {
      const zone = this.getZone(packet.getControllerID(), packet.getZoneID());
      if (zone) {
        zone.setParameter(packet.getParameterID(), packet.getValue(), true);
        this.emit('update');
      } else {
        console.warn(
          'Received ZoneParameterPacket for unknown zone %d-%d',
          packet.getControllerID(),
          packet.getZoneID()
        );
      }
    } else if (packet instanceof RenderedDisplayMessagePacket) {
      /* console.log("RenderedDisplayMessage:")
            console.log("Target: %d -> %d -> %d", packet.targetControllerID, packet.targetZoneID, packet.targetKeypadID);
            console.log("Source: %d -> %d -> %d", packet.sourceControllerID, packet.sourceZoneID, packet.sourceKeypadID)
            console.log("Render Type: %d", packet.renderType);
            console.log("Flash Time: %d", packet.flashTime);
            console.log("Value Low: %d", packet.getLowValue());
            console.log("Value High: %d", packet.getHighValue());
            console.log("Short Value: %d", packet.getShortValue()); */

      switch (packet.getRenderType()) {
        case TYPE_SOURCE_NAME:
          this.getZone(packet.targetControllerID, packet.targetZoneID)?.setSourceID(
            packet.getHighValue(),
            true
          );
          this.emit('update');
          break;
        case TYPE_VOLUME:
          this.getZone(packet.targetControllerID, packet.targetZoneID)?.setVolume(
            packet.getLowValue() * 2,
            true
          );
          this.emit('update');
          break;
      }
    } else if (packet instanceof KeypadEventPacket) {
      const zone = this.getZone(packet.sourceControllerID, packet.sourceZoneID);
      if (zone != null) {
        const source = this.getSource(zone.getSourceID());
        switch (packet.getKey()) {
          case KEYS.POWER:
            zone.setPower(!zone.getPower(), true);
            return;
        }

        if (source != null) {
          switch (packet.getKey()) {
            case KEYS.NEXT:
              source.control(Source.CONTROL_NEXT, true);
              break;
            case KEYS.PREVIOUS:
              source.control(Source.CONTROL_PREV, true);
              break;
            case KEYS.PLUS:
              source.control(Source.CONTROL_PLUS, true);
              break;
            case KEYS.MINUS:
              source.control(Source.CONTROL_MINUS, true);
              break;
            case KEYS.STOP:
              source.control(Source.CONTROL_STOP, true);
              break;
            case KEYS.PAUSE:
              source.control(Source.CONTROL_PAUSE, true);
              break;
            case KEYS.PLAY:
              source.control(Source.CONTROL_PLAY, true);
              break;
          }
        }
        this.emit('update');
      } else {
        console.warn(
          'Received keypad event from unknown Zone (%d-%d)',
          packet.sourceControllerID,
          packet.sourceZoneID
        );
      }
    }
  }
}
