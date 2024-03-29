import DataPacket from './DataPacket';
import ExtraZoneParam from '../extraZoneParam';

class ZoneParameterPacket extends DataPacket {
  requiresHandshake() {
    return true;
  }

  getControllerID() {
    return this.sourceControllerID;
  }

  getZoneID() {
    return this.sourcePath[2];
  }

  getParameterID() {
    return this.sourcePath[4];
  }

  getValue() {
    const byte = this.data.readUInt8(0);

    switch (this.getParameterID()) {
      case ExtraZoneParam.BASS:
      case ExtraZoneParam.TREBLE:
      case ExtraZoneParam.BALANCE:
        return byte - 10;
      case ExtraZoneParam.TURN_ON_VOLUME:
        return byte * 2;
      case ExtraZoneParam.BACKGROUND_COLOR:
      case ExtraZoneParam.PARTY_MODE:
        return byte;
      default:
        return byte == 0x01;
    }
  }
}

ZoneParameterPacket.fromPacket = function (dataPacket) {
  if (dataPacket instanceof DataPacket) {
    const zoneParameterPacket = new ZoneParameterPacket();
    dataPacket.copyToPacket(zoneParameterPacket);
    return zoneParameterPacket;
  }
  throw new TypeError('Cannot create ZoneParameterPacket with anything other than a DataPacket');
};

export default ZoneParameterPacket;
