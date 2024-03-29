import DataPacket from './DataPacket';

class ZoneSourcePacket extends DataPacket {
  requiresHandshake() {
    return true;
  }

  getControllerID() {
    return this.sourceControllerID;
  }

  getZoneID() {
    return this.sourcePath[2];
  }

  getSourceID() {
    return this.data.readUInt8(0);
  }
}

ZoneSourcePacket.fromPacket = function (dataPacket) {
  if (dataPacket instanceof DataPacket) {
    const zoneSourcePacket = new ZoneSourcePacket();
    dataPacket.copyToPacket(zoneSourcePacket);
    return zoneSourcePacket;
  }
  throw new TypeError('Cannot create ZoneSourcePacket with anything other than a DataPacket');
};

export default ZoneSourcePacket;
