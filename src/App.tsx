import React, {useEffect, useState} from 'react';

import RNet from './rnet-pi/rnet';

function App() {
  const [rnetState, setRNetState] = useState('Connecting...');

  useEffect(() => {
    const rnet = new RNet('localhost:8080');
    rnet.on('error', err => {
      console.log(err);
    });
    rnet.on('connected', () => {
      setRNetState('Connected');
    });
    rnet.on('disconnected', () => {
      setRNetState('Disconnected');
    });
    return () => rnet.disconnect();
  }, []);

  return (
    <div className="App">
      <header className="App-header">{rnetState}</header>
    </div>
  );
}

export default App;
