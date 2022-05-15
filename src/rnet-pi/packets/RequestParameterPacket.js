const {SmartBuffer} = require('../../smart-buffer');
import RequestDataPacket from './RequestDataPacket';

class RequestParameterPacket extends RequestDataPacket {
  constructor(controllerID, zoneID, parameterID) {
    super();

    this.targetPath = [0x02, 0x00, zoneID, 0x00, parameterID];
  }
}

export default RequestParameterPacket;
