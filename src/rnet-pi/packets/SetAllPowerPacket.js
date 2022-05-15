import EventPacket from './EventPacket';

export default class SetAllPowerPacket extends EventPacket {
  constructor(power) {
    super();

    this.targetPath = [0x02, 0x00];
    this.targetControllerID = 0x7e;
    this.eventID = 0xdd;
    this.eventData = 0x00;
    this.eventTimestamp = (power === true ? 1 : 0) << 8;
    this.eventPriority = 1;
  }
}
